import { Router } from "express";
import mongoose from "mongoose";
import PharmacyOrder from "../models/PharmacyOrder.js";
import DrugInventory from "../models/DrugInventory.js";
import DrugBatch from "../models/DrugBatch.js";
import GRN from "../models/GRN.js";
import StockAdjustment from "../models/StockAdjustment.js";
import InventoryAuditLog from "../models/InventoryAuditLog.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { getNextId } from "../lib/counter.js";
import { createOrAppendBill } from "../lib/autoBilling.js";
import { fefoDeduct, syncDrugStock } from "../lib/fefo.js";

const router = Router();
router.use(authMiddleware);

// ── Pharmacy Orders ───────────────────────────────────────────────────────────

// GET /api/pharmacy/orders
router.get("/orders", requireRole("admin", "doctor", "pharmacist", "pharmacy_admin", "nurse"), async (req: AuthRequest, res) => {
  try {
    const { status, patientId, rxSource, page = "1", limit = "50" } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId };
    if (status)    query.status    = status;
    if (patientId) query.patientId = patientId;
    if (rxSource)  query.rxSource  = rxSource;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      PharmacyOrder.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      PharmacyOrder.countDocuments(query),
    ]);
    res.json({ orders, total });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/pharmacy/orders — create order (digital auto-order OR manual counter/paper-Rx)
// When status is "Dispensed" at creation (OTC), FEFO deduction happens immediately.
router.post("/orders", requireRole("admin", "doctor", "pharmacist", "pharmacy_admin", "nurse", "receptionist"), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const {
      patientId, patientName, drug, qty, unit,
      items, type, doctor, time, prescriptionId,
      rxSource = "Digital", paperRxNote = "", notes,
      status: reqStatus,
    } = req.body;

    if (!patientId || !patientName) {
      return res.status(400).json({ error: "patientId and patientName are required" });
    }
    if (!type) return res.status(400).json({ error: "type (OPD/IPD/ICU) is required" });

    // Build legacy drug summary from items if drug not explicitly provided
    const drugSummary = drug || (Array.isArray(items) && items.length
      ? items.map((it: any) => it.drugName).join(", ")
      : "");
    const totalQty = qty ?? (Array.isArray(items) ? items.reduce((s: number, it: any) => s + (it.quantity || 1), 0) : 0);

    const rxId = await getNextId(tenantId, "rx", "RX-");

    const orderData: any = {
      tenantId,
      rxId,
      patientId,
      patientName,
      drug: drugSummary,
      qty: totalQty,
      unit: unit || "units",
      items: items || [],
      type,
      rxSource,
      paperRxNote,
      doctor: doctor || "",
      time: time || new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      prescriptionId: prescriptionId || undefined,
      notes: notes || "",
      status: reqStatus || "Pending",
    };

    // If immediately dispensing (OTC counter sale), run FEFO and mark metadata
    if (reqStatus === "Dispensed" && Array.isArray(items) && items.length > 0 && process.env.PHARMACY_DEDUCT_ON_DISPENSE === "true") {
      for (const item of items) {
        if (!item.drugId) continue;
        try {
          const used = await fefoDeduct(tenantId, item.drugId, item.quantity);
          if (used.length > 0) {
            item.batchId    = used[0].batchId;
            item.batchNo    = used[0].batchNo;
            // Override with actual batch MRP so billing reflects the correct price
            item.mrpPerUnit  = used[0].mrpPerUnit;
            item.totalAmount = item.quantity * used[0].mrpPerUnit;
          }
          await syncDrugStock(tenantId, item.drugId);
        } catch (err: any) {
          if (err.insufficientStock) {
            return res.status(422).json({
              error: "Insufficient stock",
              drug: item.drugName,
              required: item.quantity,
              available: err.available,
            });
          }
          throw err;
        }
      }
      orderData.dispensedBy = req.user!.name;
      orderData.dispensedAt = new Date();
    }

    const order = await PharmacyOrder.create(orderData);
    res.status(201).json(order);
  } catch (err: any) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/pharmacy/orders/:id — update status / dispense with FEFO stock deduction
router.put("/orders/:id", requireRole("admin", "pharmacist", "pharmacy_admin", "nurse"), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const order = await PharmacyOrder.findOne({ _id: req.params.id, tenantId });
    if (!order) return res.status(404).json({ error: "Order not found" });

    const allowed = ["status", "dispensedBy", "dispensedAt", "notes", "items"];
    const update: any = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    // FEFO stock deduction on dispense
    if (update.status === "Dispensed" && order.status !== "Dispensed") {
      const itemsToDispense = update.items?.length ? update.items : order.items;

      if (itemsToDispense.length > 0 && process.env.PHARMACY_DEDUCT_ON_DISPENSE === "true") {
        for (const item of itemsToDispense) {
          if (!item.drugId) continue;
          try {
            const used = await fefoDeduct(tenantId, item.drugId.toString(), item.quantity);
            if (used.length > 0) {
              item.batchId    = used[0].batchId;
              item.batchNo    = used[0].batchNo;
              // Override with actual batch MRP so billing reflects the correct price
              item.mrpPerUnit  = used[0].mrpPerUnit;
              item.totalAmount = item.quantity * used[0].mrpPerUnit;
            }
            await syncDrugStock(tenantId, item.drugId.toString());
          } catch (err: any) {
            if (err.insufficientStock) {
              return res.status(422).json({
                error: "Insufficient stock",
                drug: item.drugName,
                required: item.quantity,
                available: err.available,
              });
            }
            throw err;
          }
        }
        if (itemsToDispense !== order.items) update.items = itemsToDispense;
      }

      update.dispensedBy = update.dispensedBy || req.user!.name;
      update.dispensedAt = update.dispensedAt || new Date();
    }

    const updated = await PharmacyOrder.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: update },
      { new: true }
    );

    // Auto-bill on dispense
    let autoBill: { billId: string } | undefined;
    if (update.status === "Dispensed" && order.status !== "Dispensed" && updated) {
      try {
        const dispensedItems: any[] = update.items?.length ? update.items : order.items;
        const billItems = dispensedItems
          .filter((it: any) => it.drugId || it.drugName)
          .map((it: any) => ({
            description: it.drugName || "Drug",
            category:    "Pharmacy" as const,
            quantity:    it.quantity || 1,
            unitPrice:   it.mrpPerUnit ?? 0,
            total:       (it.quantity || 1) * (it.mrpPerUnit ?? 0),
          }));

        if (billItems.length > 0) {
          const bill = await createOrAppendBill({
            tenantId,
            patientId:   order.patientId,
            patientName: order.patientName,
            items:       billItems,
            type:        "Pharmacy",
            createdBy:   req.user!.name,
          });
          autoBill = { billId: (bill as any).billId };
        }
      } catch (billErr) {
        console.error("Auto-billing failed for pharmacy dispense:", billErr);
      }
    }

    res.json({ ...(updated?.toObject() ?? {}), autoBill });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Drug Inventory ────────────────────────────────────────────────────────────

// GET /api/pharmacy/inventory
router.get("/inventory", requireRole("admin", "pharmacist", "pharmacy_admin", "nurse", "doctor"), async (req: AuthRequest, res) => {
  try {
    const { search, status, statusIn, includeInactive } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId };
    // $ne: false (not === true) so drugs created before the isActive field existed still show up
    if (includeInactive !== "true") query.isActive = { $ne: false };
    if (search) query.name = { $regex: search, $options: "i" };
    if (statusIn) query.status = { $in: statusIn.split(",") };
    else if (status) query.status = status;
    const inventory = await DrugInventory.find(query).sort({ name: 1 });
    res.json(inventory);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/pharmacy/inventory
router.post("/inventory", requireRole("admin", "pharmacist", "pharmacy_admin"), async (req: AuthRequest, res) => {
  try {
    const drug = await DrugInventory.create({ ...req.body, tenantId: req.user!.tenantId });
    await InventoryAuditLog.create({
      tenantId: req.user!.tenantId,
      drugId: drug._id,
      action: "Created",
      performedBy: req.user!.name,
    });
    res.status(201).json(drug);
  } catch (err: any) {
    if (err.code === 11000) return res.status(409).json({ error: "Drug already exists in inventory" });
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/pharmacy/inventory/:id
router.put("/inventory/:id", requireRole("admin", "pharmacist", "pharmacy_admin"), async (req: AuthRequest, res) => {
  try {
    const current = await DrugInventory.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!current) return res.status(404).json({ error: "Drug not found" });

    const updates = { ...req.body };

    if (current.isBatchTracked && updates.stock !== undefined && Number(updates.stock) !== current.stock) {
      return res.status(400).json({
        error: "Stock for batch-tracked drugs is derived from batch quantities and cannot be edited directly. Use Stock Adjustment or GRN instead.",
      });
    }

    // Only recompute status from stock if not batch-tracked (batch-tracked drugs use syncDrugStock)
    if (!current.isBatchTracked) {
      const stock        = updates.stock        ?? current.stock;
      const reorderLevel = updates.reorderLevel ?? current.reorderLevel;
      const ratio = reorderLevel > 0 ? stock / reorderLevel : 2;
      updates.status = ratio <= 0.5 ? "Critical" : ratio <= 1 ? "Low" : "OK";
    }

    const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];
    for (const key of Object.keys(req.body)) {
      const oldValue = (current as any)[key];
      const newValue = updates[key];
      if (oldValue === undefined) continue;
      if (String(oldValue) !== String(newValue)) changes.push({ field: key, oldValue, newValue });
    }

    const drug = await DrugInventory.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { $set: updates },
      { new: true }
    );

    if (changes.length > 0) {
      await InventoryAuditLog.create({
        tenantId: req.user!.tenantId,
        drugId: current._id,
        action: "Updated",
        changes,
        performedBy: req.user!.name,
      });
    }

    res.json(drug);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/pharmacy/inventory/:id — soft-deactivate
router.delete("/inventory/:id", requireRole("admin", "pharmacy_admin"), async (req: AuthRequest, res) => {
  try {
    const drug = await DrugInventory.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { $set: { isActive: false } },
      { new: true }
    );
    if (!drug) return res.status(404).json({ error: "Drug not found" });
    await InventoryAuditLog.create({
      tenantId: req.user!.tenantId,
      drugId: drug._id,
      action: "Deactivated",
      performedBy: req.user!.name,
    });
    res.json({ message: "Drug deactivated" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/pharmacy/inventory/:id/reactivate
router.post("/inventory/:id/reactivate", requireRole("admin", "pharmacy_admin"), async (req: AuthRequest, res) => {
  try {
    const drug = await DrugInventory.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { $set: { isActive: true } },
      { new: true }
    );
    if (!drug) return res.status(404).json({ error: "Drug not found" });
    await InventoryAuditLog.create({
      tenantId: req.user!.tenantId,
      drugId: drug._id,
      action: "Reactivated",
      performedBy: req.user!.name,
    });
    res.json(drug);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/pharmacy/inventory/:id/history — merged GRN + Adjustment + Edit timeline for one drug
router.get("/inventory/:id/history", requireRole("admin", "pharmacist", "pharmacy_admin"), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const drugId = req.params.id;

    const [adjustments, auditLogs, grns] = await Promise.all([
      StockAdjustment.find({ tenantId, drugId }).sort({ createdAt: -1 }),
      InventoryAuditLog.find({ tenantId, drugId }).sort({ createdAt: -1 }),
      GRN.find({ tenantId, "items.drugId": drugId }).sort({ createdAt: -1 }),
    ]);

    const grnEntries = grns.flatMap((grn) =>
      grn.items
        .filter((it) => it.drugId.toString() === drugId)
        .map((it) => ({
          type: "GRN" as const,
          date: grn.receivedDate || grn.createdAt,
          grnId: grn.grnId,
          grnStatus: grn.status,
          receivedBy: grn.receivedBy,
          batchNo: it.batchNo,
          quantityReceived: it.quantityReceived,
          purchasePricePerUnit: it.purchasePricePerUnit,
          mrpPerUnit: it.mrpPerUnit,
        }))
    );

    const adjustmentEntries = adjustments.map((a) => ({
      type: "Adjustment" as const,
      date: a.createdAt,
      adjustmentId: a.adjustmentId,
      adjustmentType: a.adjustmentType,
      quantityBefore: a.quantityBefore,
      quantityAdjusted: a.quantityAdjusted,
      quantityAfter: a.quantityAfter,
      reason: a.reason,
      adjustedBy: a.adjustedBy,
    }));

    const editEntries = auditLogs.map((l) => ({
      type: "Edit" as const,
      date: l.createdAt,
      action: l.action,
      changes: l.changes,
      performedBy: l.performedBy,
      notes: l.notes,
    }));

    const history = [...grnEntries, ...adjustmentEntries, ...editEntries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    res.json({ history });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Drug Batches ──────────────────────────────────────────────────────────────

// GET /api/pharmacy/batches?drugId=xxx
router.get("/batches", requireRole("admin", "pharmacist", "pharmacy_admin", "nurse", "doctor"), async (req: AuthRequest, res) => {
  try {
    const { drugId } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId };
    if (drugId) query.drugId = drugId;
    const batches = await DrugBatch.find(query).sort({ expiryDate: 1 });
    res.json(batches);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/pharmacy/batches/expiry-report — cross-drug expiry query (registered before /batches to avoid route collision)
router.get("/batches/expiry-report", requireRole("admin", "pharmacist", "pharmacy_admin"), async (req: AuthRequest, res) => {
  try {
    const { expiryWithin = "90", includeExpired = "true" } = req.query as Record<string, string>;

    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(now.getDate() + parseInt(expiryWithin));

    const dateQuery =
      includeExpired === "false"
        ? { $gte: now, $lte: cutoff }
        : { $lte: cutoff };

    const batches = await DrugBatch.aggregate([
      { $match: { tenantId: req.user!.tenantId, expiryDate: dateQuery } },
      {
        $lookup: {
          from: "druginventories",
          localField: "drugId",
          foreignField: "_id",
          as: "drug",
        },
      },
      { $unwind: { path: "$drug", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          batchNo:           1,
          expiryDate:        1,
          quantityRemaining: 1,
          mrpPerUnit:        1,
          status:            1,
          supplierName:      1,
          drugName:          "$drug.name",
          drugCategory:      "$drug.category",
          drugUnit:          "$drug.unit",
        },
      },
      { $sort: { expiryDate: 1 } },
    ]);

    res.json(batches);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GRN (Goods Receipt Note) ──────────────────────────────────────────────────

// GET /api/pharmacy/grn
router.get("/grn", requireRole("admin", "pharmacist", "pharmacy_admin"), async (req: AuthRequest, res) => {
  try {
    const { status, page = "1", limit = "50" } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId };
    if (status) query.status = status;
    else query.status = { $nin: ["Cancelled"] };
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [grns, total] = await Promise.all([
      GRN.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      GRN.countDocuments(query),
    ]);
    res.json({ grns, total });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/pharmacy/grn — create GRN, create DrugBatch docs, update inventory
router.post("/grn", requireRole("admin", "pharmacist", "pharmacy_admin"), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { supplierName, invoiceNo, invoiceDate, receivedDate, items, notes, status = "Received" } = req.body;

    if (!supplierName || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "supplierName and items[] are required" });
    }

    const grnId = await getNextId(tenantId, "grn", "GRN-");
    const totalValue = items.reduce((s: number, it: any) => s + (it.totalCost || 0), 0);

    const grn = await GRN.create({
      tenantId,
      grnId,
      supplierName,
      invoiceNo: invoiceNo || "",
      invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
      receivedDate: receivedDate ? new Date(receivedDate) : new Date(),
      receivedBy: req.user!.name,
      items,
      totalValue,
      status,
      notes: notes || "",
    });

    // Create DrugBatch records and update inventory for each item
    if (status === "Received") {
      for (const item of items) {
        if (!item.drugId || !item.batchNo || !item.expiryDate || !item.quantityReceived) continue;

        await DrugBatch.create({
          tenantId,
          drugId: item.drugId,
          batchNo: item.batchNo,
          supplierName,
          expiryDate: new Date(item.expiryDate),
          quantityReceived: item.quantityReceived,
          quantityRemaining: item.quantityReceived,
          purchasePricePerUnit: item.purchasePricePerUnit || 0,
          mrpPerUnit: item.mrpPerUnit || 0,
          grnId: grn._id,
          status: "Active",
        });

        // Mark drug as batch-tracked and sync stock
        await DrugInventory.findByIdAndUpdate(item.drugId, { $set: { isBatchTracked: true } });
        await syncDrugStock(tenantId, item.drugId);
      }
    }

    res.status(201).json(grn);
  } catch (err: any) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    if (err.code === 11000) return res.status(409).json({ error: "Batch number already exists" });
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/pharmacy/grn/:id — update GRN (Draft → Received triggers batch creation)
router.put("/grn/:id", requireRole("admin", "pharmacist", "pharmacy_admin"), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const grn = await GRN.findOne({ _id: req.params.id, tenantId });
    if (!grn) return res.status(404).json({ error: "GRN not found" });

    const wasReceived = grn.status === "Received";
    const becomeReceived = req.body.status === "Received" && !wasReceived;

    const updated = await GRN.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: req.body },
      { new: true }
    );

    // If transitioning Draft → Received, create batches now
    if (becomeReceived && updated) {
      for (const item of updated.items) {
        if (!item.drugId || !item.batchNo || !item.quantityReceived) continue;
        await DrugBatch.create({
          tenantId,
          drugId: item.drugId,
          batchNo: item.batchNo,
          supplierName: updated.supplierName,
          expiryDate: item.expiryDate,
          quantityReceived: item.quantityReceived,
          quantityRemaining: item.quantityReceived,
          purchasePricePerUnit: item.purchasePricePerUnit || 0,
          mrpPerUnit: item.mrpPerUnit || 0,
          grnId: updated._id,
          status: "Active",
        });
        await DrugInventory.findByIdAndUpdate(item.drugId, { $set: { isBatchTracked: true } });
        await syncDrugStock(tenantId, item.drugId.toString());
      }
    }

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/pharmacy/grn/:id — cancel a GRN, reversing its stock impact if it was Received
router.delete("/grn/:id", requireRole("admin", "pharmacy_admin"), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const grn = await GRN.findOne({ _id: req.params.id, tenantId });
    if (!grn) return res.status(404).json({ error: "GRN not found" });
    if (grn.status === "Cancelled") return res.status(409).json({ error: "GRN is already cancelled" });

    if (grn.status === "Received") {
      // Locate the batch each item created, and refuse if any has already been (partially) dispensed/adjusted
      const batches = await Promise.all(
        grn.items.map((item) => DrugBatch.findOne({ tenantId, grnId: grn._id, drugId: item.drugId, batchNo: item.batchNo }))
      );

      for (let i = 0; i < grn.items.length; i++) {
        const item = grn.items[i];
        const batch = batches[i];
        if (batch && batch.quantityRemaining < item.quantityReceived) {
          return res.status(409).json({
            error: `Cannot cancel: stock from batch ${item.batchNo} has already been dispensed. Use a Stock Adjustment to correct instead.`,
          });
        }
      }

      const affectedDrugIds = new Set<string>();
      for (let i = 0; i < grn.items.length; i++) {
        const batch = batches[i];
        if (!batch) continue;
        await DrugBatch.findByIdAndUpdate(batch._id, { $set: { quantityRemaining: 0, status: "Cancelled" } });
        affectedDrugIds.add(grn.items[i].drugId.toString());
      }

      for (const drugId of affectedDrugIds) {
        const before = (await DrugInventory.findById(drugId))?.stock ?? 0;
        await syncDrugStock(tenantId, drugId);
        const after = (await DrugInventory.findById(drugId))?.stock ?? 0;
        await InventoryAuditLog.create({
          tenantId,
          drugId,
          action: "Updated",
          changes: [{ field: "stock", oldValue: before, newValue: after }],
          performedBy: req.user!.name,
          notes: `Reversed by GRN ${grn.grnId} cancellation`,
        });
      }
    }

    grn.status = "Cancelled";
    await grn.save();

    res.json({ message: "GRN cancelled" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/pharmacy/grn/:id
router.get("/grn/:id", requireRole("admin", "pharmacist", "pharmacy_admin"), async (req: AuthRequest, res) => {
  try {
    const grn = await GRN.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!grn) return res.status(404).json({ error: "GRN not found" });
    res.json(grn);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Stock Adjustments ─────────────────────────────────────────────────────────

// GET /api/pharmacy/adjustments
router.get("/adjustments", requireRole("admin", "pharmacist", "pharmacy_admin"), async (req: AuthRequest, res) => {
  try {
    const { drugId, page = "1", limit = "50" } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId };
    if (drugId) query.drugId = drugId;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [adjustments, total] = await Promise.all([
      StockAdjustment.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      StockAdjustment.countDocuments(query),
    ]);
    res.json({ adjustments, total });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/pharmacy/adjustments
router.post("/adjustments", requireRole("admin", "pharmacist", "pharmacy_admin"), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { drugId, batchId, adjustmentType, quantityAdjusted, reason } = req.body;

    if (!drugId || !adjustmentType || quantityAdjusted === undefined || !reason) {
      return res.status(400).json({ error: "drugId, adjustmentType, quantityAdjusted, and reason are required" });
    }

    const drug = await DrugInventory.findOne({ _id: drugId, tenantId });
    if (!drug) return res.status(404).json({ error: "Drug not found" });

    const quantityBefore = drug.stock;
    const quantityAfter  = Math.max(0, quantityBefore + Number(quantityAdjusted));

    const adjustmentId = await getNextId(tenantId, "adj", "ADJ-");

    const adjustment = await StockAdjustment.create({
      tenantId,
      adjustmentId,
      drugId,
      drugName: drug.name,
      batchId: batchId || undefined,
      adjustmentType,
      quantityBefore,
      quantityAdjusted: Number(quantityAdjusted),
      quantityAfter,
      reason,
      adjustedBy: req.user!.name,
    });

    // Apply the adjustment to the batch if specified, or directly to inventory
    if (batchId) {
      const batch = await DrugBatch.findOne({ _id: batchId, tenantId });
      if (batch) {
        const newBatchQty = Math.max(0, batch.quantityRemaining + Number(quantityAdjusted));
        await DrugBatch.findByIdAndUpdate(batchId, {
          $set: {
            quantityRemaining: newBatchQty,
            status: newBatchQty === 0 ? "Exhausted" : "Active",
          },
        });
      }
      await syncDrugStock(tenantId, drugId);
    } else {
      const reorderLevel = drug.reorderLevel > 0 ? drug.reorderLevel : 1;
      const ratio = quantityAfter / reorderLevel;
      const status = ratio <= 0.5 ? "Critical" : ratio <= 1 ? "Low" : "OK";
      await DrugInventory.findByIdAndUpdate(drugId, { $set: { stock: quantityAfter, status } });
    }

    res.status(201).json(adjustment);
  } catch (err: any) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
