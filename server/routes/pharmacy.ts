import { Router } from "express";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as pharmacyOrderService from "../services/pharmacyOrderService.js";
import * as drugInventoryService from "../services/drugInventoryService.js";
import * as drugBatchService from "../services/drugBatchService.js";
import * as grnService from "../services/grnService.js";
import * as stockAdjustmentService from "../services/stockAdjustmentService.js";

const router = Router();
router.use(authMiddleware);

// ── Pharmacy Orders ───────────────────────────────────────────────────────────

// GET /api/pharmacy/orders
router.get("/orders", requireRole("admin", "doctor", "pharmacist", "pharmacy_admin", "nurse"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await pharmacyOrderService.listOrders(req.user!.tenantId, req.query as Record<string, string>);
  res.json({ success: true, data });
}));

// POST /api/pharmacy/orders — create order (digital auto-order OR manual counter/paper-Rx).
// status: "Dispensed" with items triggers the same atomic FEFO stock-check/deduct/auto-bill
// path as PUT /orders/:id below, rejecting (409) on insufficient stock.
router.post("/orders", requireRole("admin", "doctor", "pharmacist", "pharmacy_admin", "nurse", "receptionist"), asyncHandler(async (req: AuthRequest, res) => {
  const order = await pharmacyOrderService.createOrder(req.user!.tenantId, req.user!.name, req.body);
  res.status(201).json({ success: true, data: order });
}));

// PUT /api/pharmacy/orders/:id — update status / dispense; dispensing checks and deducts
// FEFO stock and auto-bills atomically, rejecting (409) on insufficient stock
router.put("/orders/:id", requireRole("admin", "pharmacist", "pharmacy_admin", "nurse"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await pharmacyOrderService.updateOrder(req.user!.tenantId, req.user!.name, req.params.id, req.body);
  res.json({ success: true, data });
}));

// ── Drug Inventory ────────────────────────────────────────────────────────────

// GET /api/pharmacy/inventory
router.get("/inventory", requireRole("admin", "pharmacist", "pharmacy_admin", "nurse", "doctor"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await drugInventoryService.listDrugs(req.user!.tenantId, req.query as Record<string, string>);
  res.json({ success: true, data });
}));

// POST /api/pharmacy/inventory
router.post("/inventory", requireRole("admin", "pharmacist", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const drug = await drugInventoryService.createDrug(req.user!.tenantId, req.user!.name, req.body);
  res.status(201).json({ success: true, data: drug });
}));

// PUT /api/pharmacy/inventory/:id
router.put("/inventory/:id", requireRole("admin", "pharmacist", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const drug = await drugInventoryService.updateDrug(req.user!.tenantId, req.user!.name, req.params.id, req.body);
  res.json({ success: true, data: drug });
}));

// DELETE /api/pharmacy/inventory/:id — soft-deactivate
router.delete("/inventory/:id", requireRole("admin", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await drugInventoryService.deactivateDrug(req.user!.tenantId, req.user!.name, req.params.id);
  res.json({ success: true, data });
}));

// POST /api/pharmacy/inventory/:id/reactivate
router.post("/inventory/:id/reactivate", requireRole("admin", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const drug = await drugInventoryService.reactivateDrug(req.user!.tenantId, req.user!.name, req.params.id);
  res.json({ success: true, data: drug });
}));

// GET /api/pharmacy/inventory/:id/history — merged GRN + Adjustment + Edit timeline for one drug
router.get("/inventory/:id/history", requireRole("admin", "pharmacist", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await drugInventoryService.getDrugHistory(req.user!.tenantId, req.params.id);
  res.json({ success: true, data });
}));

// ── Drug Batches ──────────────────────────────────────────────────────────────

// GET /api/pharmacy/batches?drugId=xxx
router.get("/batches", requireRole("admin", "pharmacist", "pharmacy_admin", "nurse", "doctor"), asyncHandler(async (req: AuthRequest, res) => {
  const { drugId } = req.query as Record<string, string>;
  const data = await drugBatchService.listBatches(req.user!.tenantId, drugId);
  res.json({ success: true, data });
}));

// GET /api/pharmacy/batches/expiry-report — cross-drug expiry query (registered before /batches to avoid route collision)
router.get("/batches/expiry-report", requireRole("admin", "pharmacist", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const { expiryWithin, includeExpired } = req.query as Record<string, string>;
  const data = await drugBatchService.getExpiryReport(req.user!.tenantId, expiryWithin, includeExpired);
  res.json({ success: true, data });
}));

// PUT /api/pharmacy/batches/:id — edit batch metadata (batch no, dates, prices, status)
router.put("/batches/:id", requireRole("admin", "pharmacist", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await drugBatchService.updateBatch(req.user!.tenantId, req.user!.name, req.params.id, req.body);
  res.json({ success: true, data });
}));

// ── GRN (Goods Receipt Note) ──────────────────────────────────────────────────

// GET /api/pharmacy/grn
router.get("/grn", requireRole("admin", "pharmacist", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await grnService.listGRNs(req.user!.tenantId, req.query as Record<string, string>);
  res.json({ success: true, data });
}));

// POST /api/pharmacy/grn — create GRN, create DrugBatch docs, update inventory
router.post("/grn", requireRole("admin", "pharmacist", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const grn = await grnService.createGRN(req.user!.tenantId, req.user!.name, req.body);
  res.status(201).json({ success: true, data: grn });
}));

// PUT /api/pharmacy/grn/:id — update GRN (Draft → Received triggers batch creation)
router.put("/grn/:id", requireRole("admin", "pharmacist", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const grn = await grnService.updateGRN(req.user!.tenantId, req.user!.name, req.params.id, req.body);
  res.json({ success: true, data: grn });
}));

// DELETE /api/pharmacy/grn/:id — cancel a GRN, reversing its stock impact if it was Received
router.delete("/grn/:id", requireRole("admin", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await grnService.cancelGRN(req.user!.tenantId, req.user!.name, req.params.id);
  res.json({ success: true, data });
}));

// GET /api/pharmacy/grn/:id
router.get("/grn/:id", requireRole("admin", "pharmacist", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const grn = await grnService.getGRN(req.user!.tenantId, req.params.id);
  res.json({ success: true, data: grn });
}));

// ── Stock Adjustments ─────────────────────────────────────────────────────────

// GET /api/pharmacy/adjustments
router.get("/adjustments", requireRole("admin", "pharmacist", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await stockAdjustmentService.listAdjustments(req.user!.tenantId, req.query as Record<string, string>);
  res.json({ success: true, data });
}));

// POST /api/pharmacy/adjustments
router.post("/adjustments", requireRole("admin", "pharmacist", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const adjustment = await stockAdjustmentService.createAdjustment(req.user!.tenantId, req.user!.name, req.body);
  res.status(201).json({ success: true, data: adjustment });
}));

export default router;
