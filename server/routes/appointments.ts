import { Router } from "express";
import Appointment from "../models/Appointment.js";
import User from "../models/User.js";
import ServiceRateMaster from "../models/ServiceRateMaster.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { createOrAppendBill } from "../lib/autoBilling.js";
import { getNextId } from "../lib/counter.js";

const router = Router();
router.use(authMiddleware);

// Token prefix per department
const DEPT_PREFIX: Record<string, string> = {
  Cardiology:        "C",
  Orthopedics:       "OR",
  Neurology:         "N",
  Obstetrics:        "OB",
  "Obs/Gyn":         "OB",
  Nephrology:        "NP",
  Oncology:          "ON",
  Emergency:         "ER",
  General:           "G",
  "General Medicine":"GM",
  "General Surgery": "GS",
  Dermatology:       "D",
  Pediatrics:        "P",
  ENT:               "ENT",
  Ophthalmology:     "EYE",
  Psychiatry:        "PSY",
  Dental:            "DEN",
  Gynecology:        "GYN",
  Urology:           "UR",
  Gastroenterology:  "GAS",
  Pulmonology:       "PUL",
  Endocrinology:     "END",
  Rheumatology:      "RHE",
  "Front Desk":      "FD",
  Administration:    "ADM",
  Laboratory:        "LAB",
  Pharmacy:          "PH",
  Radiology:         "RAD",
};

async function nextAptId(tenantId: string): Promise<string> {
  return getNextId(tenantId, "apt", "APT-");
}

async function generateToken(
  tenantId: string,
  doctor: string,
  department: string,
  date: string
): Promise<{ token: string; tokenNumber: number }> {
  const count = await Appointment.countDocuments({
    tenantId,
    doctor,
    date,
    status: { $nin: ["Cancelled"] },
  });
  const tokenNumber = count + 1;
  const prefix = DEPT_PREFIX[department] ?? department.slice(0, 2).toUpperCase();
  const token = `${prefix}-${String(tokenNumber).padStart(3, "0")}`;
  return { token, tokenNumber };
}

// ── GET /api/appointments ─────────────────────────────────────────────────────
router.get("/", async (req: AuthRequest, res) => {
  try {
    const { date, status, type, doctor, patientId, page = "1", limit = "50" } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId };
    if (date)      query.date      = date;
    if (status)    query.status    = status;
    if (type)      query.type      = type;
    if (doctor)    query.doctor    = doctor;
    if (patientId) query.patientId = patientId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [appointments, total] = await Promise.all([
      Appointment.find(query)
        .sort({ date: -1, tokenNumber: 1, time: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Appointment.countDocuments(query),
    ]);
    res.json({ appointments, total });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/appointments/queue — ordered queue for a doctor ─────────────────
// Returns In Consult first, then Waiting, then Confirmed — sorted by tokenNumber
router.get("/queue", async (req: AuthRequest, res) => {
  try {
    const { doctor, date } = req.query as Record<string, string>;
    const query: any = {
      tenantId: req.user!.tenantId,
      status: { $in: ["Confirmed", "Waiting", "In Consult"] },
    };
    if (doctor) query.doctor = doctor;
    if (date)   query.date   = date;

    const raw = await Appointment.find(query).sort({ tokenNumber: 1 });

    // Stable status order: In Consult → Waiting → Confirmed
    const ORDER: Record<string, number> = { "In Consult": 0, "Waiting": 1, "Confirmed": 2 };
    const queue = raw.sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));

    res.json(queue);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/appointments/slots — available time slots for a doctor on a date ─
router.get("/slots", async (req: AuthRequest, res) => {
  try {
    const { doctor, date } = req.query as Record<string, string>;
    if (!doctor || !date) return res.status(400).json({ error: "doctor and date required" });

    const booked = await Appointment.find({
      tenantId: req.user!.tenantId,
      doctor,
      date,
      status: { $nin: ["Cancelled"] },
    }).select("time");

    const bookedTimes = new Set(booked.map((a) => a.time));

    // Generate slots from 09:00 to 17:00 every 15 min
    const slots: { time: string; available: boolean }[] = [];
    for (let h = 9; h < 17; h++) {
      for (let m = 0; m < 60; m += 15) {
        const ampm = h < 12 ? "AM" : "PM";
        const displayH = h > 12 ? h - 12 : h;
        const time = `${String(displayH).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
        slots.push({ time, available: !bookedTimes.has(time) });
      }
    }
    res.json(slots);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/appointments ────────────────────────────────────────────────────
router.post("/", requireRole("admin", "doctor", "receptionist"), async (req: AuthRequest, res) => {
  try {
    const aptId = await nextAptId(req.user!.tenantId);
    const { token: _t, tokenNumber: _tn, ...body } = req.body;

    const { token, tokenNumber } = await generateToken(
      req.user!.tenantId,
      body.doctor,
      body.department,
      body.date
    );

    const appointment = await Appointment.create({
      ...body,
      tenantId: req.user!.tenantId,
      aptId,
      token,
      tokenNumber,
    });
    res.status(201).json(appointment);
  } catch (err: any) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/appointments/:id ─────────────────────────────────────────────────
router.get("/:id", async (req: AuthRequest, res) => {
  try {
    const appt = await Appointment.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!appt) return res.status(404).json({ error: "Appointment not found" });
    res.json(appt);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/appointments/:id ─────────────────────────────────────────────────
router.put("/:id", requireRole("admin", "doctor", "receptionist", "nurse"), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { token: _t, tokenNumber: _tn, ...updates } = req.body;

    const before = await Appointment.findOne({ _id: req.params.id, tenantId });
    if (!before) return res.status(404).json({ error: "Appointment not found" });

    // Merge vitals: preserve nurse-entered values for any field the caller left empty.
    // Use the already-fetched `before` doc so we can merge in one round-trip.
    if (updates.vitals && typeof updates.vitals === "object") {
      const existing: Record<string, string> = (before.vitals as any)?.toObject
        ? (before.vitals as any).toObject()
        : { ...(before.vitals ?? {}) };
      const incoming = updates.vitals as Record<string, string>;
      const merged: Record<string, string> = { ...existing };
      for (const [k, v] of Object.entries(incoming)) {
        if (v !== "" && v != null) merged[k] = v;
      }
      updates.vitals = merged;
    }

    const appt = await Appointment.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!appt) return res.status(404).json({ error: "Appointment not found" });

    // Auto-bill on first transition to Completed
    let autoBill: { billId: string } | undefined;
    if (updates.status === "Completed" && before.status !== "Completed") {
      try {
        let consultingFee = 0;
        if (appt.doctorId) {
          const docUser = await User.findOne({ _id: appt.doctorId, tenantId });
          consultingFee = docUser?.consultingFee ?? 0;
        }

        const billItems: Array<{ description: string; category: "Consultation" | "Diagnosis"; quantity: number; unitPrice: number; total: number }> = [
          {
            description: `Consultation – ${appt.doctor}`,
            category:    "Consultation",
            quantity:    1,
            unitPrice:   consultingFee,
            total:       consultingFee,
          },
        ];

        // Look up diagnosis charge if a diagnosis was provided in this update
        const diagnosis: string | undefined = updates.diagnosis ?? (appt as any).diagnosis;
        if (diagnosis) {
          const diagRate = await ServiceRateMaster.findOne({
            tenantId,
            category: "Diagnosis",
            name:     { $regex: diagnosis, $options: "i" },
            isActive: true,
          });
          if (diagRate && diagRate.defaultRate > 0) {
            billItems.push({
              description: diagnosis,
              category:    "Diagnosis",
              quantity:    1,
              unitPrice:   diagRate.defaultRate,
              total:       diagRate.defaultRate,
            });
          }
        }

        const bill = await createOrAppendBill({
          tenantId,
          patientId:     appt.patientId,
          patientName:   appt.patientName,
          appointmentId: appt._id.toString(),
          items:         billItems,
          type:          (appt as any).type === "IPD" ? "IPD" : "OPD",
          createdBy:     req.user!.name,
        });
        autoBill = { billId: (bill as any).billId };
      } catch (billErr) {
        console.error("Auto-billing failed for appointment:", billErr);
      }
    }

    res.json({ ...appt.toObject(), autoBill });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/appointments/:id/checkin — receptionist checks patient in ───────
router.post("/:id/checkin", requireRole("admin", "receptionist", "nurse"), async (req: AuthRequest, res) => {
  try {
    const appt = await Appointment.findOneAndUpdate(
      {
        _id: req.params.id,
        tenantId: req.user!.tenantId,
        status: { $in: ["Scheduled", "Confirmed"] },
      },
      { $set: { status: "Waiting", checkedInAt: new Date() } },
      { new: true }
    );
    if (!appt) return res.status(404).json({ error: "Appointment not found or already checked in" });
    res.json(appt);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/appointments/:id/call — doctor calls patient into room ──────────
router.post("/:id/call", requireRole("admin", "doctor", "nurse"), async (req: AuthRequest, res) => {
  try {
    const target = await Appointment.findOne({
      _id: req.params.id,
      tenantId: req.user!.tenantId,
    });
    if (!target) return res.status(404).json({ error: "Appointment not found" });

    // Complete any existing In Consult appointment for same doctor
    await Appointment.updateMany(
      {
        tenantId: req.user!.tenantId,
        doctor: target.doctor,
        status: "In Consult",
        _id: { $ne: req.params.id },
      },
      { $set: { status: "Completed" } }
    );

    const appt = await Appointment.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId, status: "Waiting" },
      { $set: { status: "In Consult", calledAt: new Date() } },
      { new: true }
    );
    if (!appt) return res.status(400).json({ error: "Patient must be in Waiting status to be called" });
    res.json(appt);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/appointments/:id — cancel ─────────────────────────────────────
router.delete("/:id", requireRole("admin", "receptionist"), async (req: AuthRequest, res) => {
  try {
    const appt = await Appointment.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { status: "Cancelled" },
      { new: true }
    );
    if (!appt) return res.status(404).json({ error: "Appointment not found" });
    res.json({ message: "Appointment cancelled" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
