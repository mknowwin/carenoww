import { Router } from "express";
import Patient from "../models/Patient.js";
import Appointment from "../models/Appointment.js";
import BillingRecord from "../models/BillingRecord.js";
import IPDAdmission from "../models/IPDAdmission.js";
import DrugInventory from "../models/DrugInventory.js";
import LabOrder from "../models/LabOrder.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";

const WARD_CAPACITY: Record<string, number> = {
  "General Ward": 80,
  "ICU":          20,
  "Private Ward": 30,
  "Semi-Private": 20,
  "Obs/Gyn":      15,
  "Pediatric":    20,
};

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
      Appointment.countDocuments({ tenantId, date: today, status: { $in: ["Confirmed", "Waiting", "In Consult"] } }),
      IPDAdmission.countDocuments({ tenantId, status: "Active" }),
      IPDAdmission.countDocuments({ tenantId, status: "Active", ward: "ICU" }),
      Appointment.countDocuments({ tenantId, date: today }),
      BillingRecord.countDocuments({ tenantId, status: { $in: ["Pending", "Partial"] } }),
      Patient.countDocuments({ tenantId, riskLevel: "Critical", isActive: true }),
    ]);

    // Revenue: sum of paid amounts
    const revenueAgg = await BillingRecord.aggregate([
      { $match: { tenantId } },
      { $group: { _id: null, total: { $sum: "$paid" } } },
    ]);

    // Bed occupancy rate from live IPD admissions
    const activeAdmissions = await IPDAdmission.find({ tenantId, status: "Active" });
    const totalBeds    = Object.values(WARD_CAPACITY).reduce((s, n) => s + n, 0);
    const occupiedBeds = activeAdmissions.length;
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

// GET /api/dashboard/bed-occupancy — derived from live IPD admissions
router.get("/bed-occupancy", async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const active = await IPDAdmission.find({ tenantId, status: "Active" });
    const wardCounts: Record<string, number> = {};
    active.forEach((a) => { wardCounts[a.ward] = (wardCounts[a.ward] || 0) + 1; });

    const result = Object.entries(WARD_CAPACITY).map(([ward, total]) => ({
      ward,
      total,
      occupied:  wardCounts[ward] || 0,
      available: total - (wardCounts[ward] || 0),
    }));
    res.json(result);
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

// GET /api/dashboard/revenue-trend — real billing aggregation by month
router.get("/revenue-trend", async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const now = new Date();
    const monthDefs = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthDefs.push({
        year:  d.getFullYear(),
        month: d.getMonth() + 1,
        label: d.toLocaleString("default", { month: "short" }),
        start: new Date(d.getFullYear(), d.getMonth(), 1),
        end:   new Date(d.getFullYear(), d.getMonth() + 1, 1),
      });
    }

    const trend = await Promise.all(monthDefs.map(async (m) => {
      const [opdRes, ipdRes, pharmRes, allRes] = await Promise.all([
        BillingRecord.aggregate([
          { $match: { tenantId, type: "OPD", createdAt: { $gte: m.start, $lt: m.end } } },
          { $group: { _id: null, total: { $sum: "$paid" } } },
        ]),
        BillingRecord.aggregate([
          { $match: { tenantId, type: "IPD", createdAt: { $gte: m.start, $lt: m.end } } },
          { $group: { _id: null, total: { $sum: "$paid" } } },
        ]),
        BillingRecord.aggregate([
          { $match: { tenantId, type: "Pharmacy", createdAt: { $gte: m.start, $lt: m.end } } },
          { $group: { _id: null, total: { $sum: "$paid" } } },
        ]),
        BillingRecord.aggregate([
          { $match: { tenantId, createdAt: { $gte: m.start, $lt: m.end } } },
          { $group: { _id: null, total: { $sum: "$paid" } } },
        ]),
      ]);
      const opd      = opdRes[0]?.total   || 0;
      const ipd      = ipdRes[0]?.total   || 0;
      const pharmacy = pharmRes[0]?.total  || 0;
      const total    = allRes[0]?.total    || 0;
      // Remaining goes to ipd bucket (Lab/Procedures etc.)
      return { month: m.label, opd, ipd: ipd || Math.max(0, total - opd - pharmacy), pharmacy };
    }));

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
