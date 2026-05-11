import { Router } from "express";
import Patient from "../models/Patient.js";
import Appointment from "../models/Appointment.js";
import BillingRecord from "../models/BillingRecord.js";
import BedOccupancy from "../models/BedOccupancy.js";
import DrugInventory from "../models/DrugInventory.js";
import LabOrder from "../models/LabOrder.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

// GET /api/dashboard/metrics
router.get("/metrics", async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const today = new Date().toISOString().split("T")[0];

    const [
      totalPatients,
      opdToday,
      ipdCurrent,
      icuCurrent,
      appointmentsToday,
      pendingClaims,
      criticalAlerts,
    ] = await Promise.all([
      Patient.countDocuments({ tenantId, isActive: true }),
      Patient.countDocuments({ tenantId, status: "OPD", isActive: true }),
      Patient.countDocuments({ tenantId, status: "IPD", isActive: true }),
      Patient.countDocuments({ tenantId, status: "ICU", isActive: true }),
      Appointment.countDocuments({ tenantId, date: today }),
      BillingRecord.countDocuments({ tenantId, status: "Pending" }),
      Patient.countDocuments({ tenantId, riskLevel: "Critical", isActive: true }),
    ]);

    // Revenue: sum of paid amounts
    const revenueAgg = await BillingRecord.aggregate([
      { $match: { tenantId } },
      { $group: { _id: null, total: { $sum: "$paid" } } },
    ]);

    // Bed occupancy rate
    const beds = await BedOccupancy.find({ tenantId });
    const totalBeds = beds.reduce((s, b) => s + b.total, 0);
    const occupiedBeds = beds.reduce((s, b) => s + b.occupied, 0);
    const bedOccupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    res.json({
      totalPatients,
      opdToday,
      ipdCurrent,
      icuCurrent,
      appointmentsToday,
      pendingClaims,
      criticalAlerts,
      bedOccupancyRate,
      revenueToday: 0, // Would require time-based billing tracking
      revenueMonth: revenueAgg[0]?.total || 0,
      surgeriesThisWeek: 0,
      avgLOS: 4.2,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/dashboard/bed-occupancy
router.get("/bed-occupancy", async (req: AuthRequest, res) => {
  try {
    const beds = await BedOccupancy.find({ tenantId: req.user!.tenantId });
    res.json(beds);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/dashboard/bed-occupancy/:ward
router.put("/bed-occupancy/:ward", async (req: AuthRequest, res) => {
  try {
    const { total, occupied } = req.body;
    const available = total - occupied;
    const bed = await BedOccupancy.findOneAndUpdate(
      { tenantId: req.user!.tenantId, ward: req.params.ward },
      { total, occupied, available },
      { new: true, upsert: true }
    );
    res.json(bed);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/dashboard/ai-alerts
router.get("/ai-alerts", async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const alerts: any[] = [];

    // Critical patients
    const criticalPatients = await Patient.find({ tenantId, riskLevel: "Critical", isActive: true }).limit(2);
    criticalPatients.forEach((p) => {
      alerts.push({
        id: `alert-${p._id}`,
        type: "critical",
        module: p.status,
        patient: `${p.name} (${p.uhid})`,
        message: `Critical patient alert: ${p.diagnosis}`,
        time: "Now",
        action: "Review Now",
      });
    });

    // Drug critical stock
    const criticalDrugs = await DrugInventory.find({ tenantId, status: "Critical" }).limit(2);
    criticalDrugs.forEach((d) => {
      alerts.push({
        id: `drug-${d._id}`,
        type: "warning",
        module: "Pharmacy",
        patient: null,
        message: `Stock-out alert: ${d.name} below critical threshold (${d.stock} ${d.unit})`,
        time: "Now",
        action: "Order Now",
      });
    });

    // Pending lab STAT orders
    const statOrders = await LabOrder.find({ tenantId, priority: "STAT", status: { $in: ["Pending", "Processing"] } }).limit(2);
    statOrders.forEach((o) => {
      alerts.push({
        id: `lab-${o._id}`,
        type: "warning",
        module: "Lab",
        patient: `${o.patientName} (${o.patientId})`,
        message: `STAT order pending: ${o.test} — awaiting results`,
        time: "Now",
        action: "Check Lab",
      });
    });

    res.json(alerts);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/dashboard/revenue-trend
router.get("/revenue-trend", async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    // Last 7 months aggregated from billing
    const now = new Date();
    const months = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: d.toLocaleString("default", { month: "short" }) });
    }
    // Return placeholder trend (real aggregation would use $month/$year operators)
    const trend = months.map((m) => ({ month: m.label, opd: 0, ipd: 0, pharmacy: 0 }));
    res.json(trend);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/dashboard/dept-volume
router.get("/dept-volume", async (req: AuthRequest, res) => {
  try {
    const deptVolume = await Patient.aggregate([
      { $match: { tenantId: req.user!.tenantId, isActive: true } },
      { $group: { _id: "$department", patients: { $sum: 1 } } },
      { $project: { _id: 0, name: "$_id", patients: 1 } },
      { $sort: { patients: -1 } },
      { $limit: 8 },
    ]);
    res.json(deptVolume);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
