import { Router } from "express";
import IPDAdmission from "../models/IPDAdmission.js";
import Patient from "../models/Patient.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

async function nextAdmissionId(tenantId: string): Promise<string> {
  const count = await IPDAdmission.countDocuments({ tenantId });
  return `ADM-${String(count + 1).padStart(4, "0")}`;
}

// ── GET /api/ipd — list admissions (active by default) ────────────────────────
router.get("/", async (req: AuthRequest, res) => {
  try {
    const { status, patientId, ward } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId };
    if (status)    query.status    = status;
    if (patientId) query.patientId = patientId;
    if (ward)      query.ward      = ward;
    if (!status)   query.status    = "Active";  // default to active

    const admissions = await IPDAdmission.find(query)
      .select("-rounds")  // skip rounds in list for performance
      .sort({ admissionDate: -1 });
    res.json({ admissions, total: admissions.length });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/ipd/beds — bed occupancy map ─────────────────────────────────────
router.get("/beds", async (req: AuthRequest, res) => {
  try {
    const active = await IPDAdmission.find({
      tenantId: req.user!.tenantId,
      status: "Active",
    }).select("ward bedNumber patientName patientId admissionDate provisionalDiagnosis admittingDoctor");

    const wardMap: Record<string, any[]> = {};
    active.forEach((a) => {
      if (!wardMap[a.ward]) wardMap[a.ward] = [];
      wardMap[a.ward].push({
        _id:         a._id,
        admissionId: a.admissionId,
        bedNumber:   a.bedNumber,
        patientName: a.patientName,
        patientId:   a.patientId,
        since:       a.admissionDate,
        diagnosis:   a.provisionalDiagnosis,
        doctor:      a.admittingDoctor,
      });
    });
    res.json(wardMap);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/ipd/:id — full admission with rounds ─────────────────────────────
router.get("/:id", async (req: AuthRequest, res) => {
  try {
    const admission = await IPDAdmission.findOne({
      _id: req.params.id,
      tenantId: req.user!.tenantId,
    });
    if (!admission) return res.status(404).json({ error: "Admission not found" });
    res.json(admission);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/ipd — admit patient ─────────────────────────────────────────────
router.post("/", requireRole("admin", "doctor", "nurse", "receptionist"), async (req: AuthRequest, res) => {
  try {
    const {
      patientId, patientName, patientAge, patientGender, patientPhone,
      appointmentId, admittingDoctor, admittingDoctorId,
      department, ward, bedNumber, provisionalDiagnosis,
    } = req.body;

    if (!patientId || !patientName || !admittingDoctor || !ward || !bedNumber || !provisionalDiagnosis) {
      return res.status(400).json({ error: "patientId, patientName, admittingDoctor, ward, bedNumber, provisionalDiagnosis required" });
    }

    // Check patient not already admitted
    const alreadyAdmitted = await IPDAdmission.findOne({
      tenantId: req.user!.tenantId,
      patientId,
      status: "Active",
    });
    if (alreadyAdmitted) {
      return res.status(409).json({
        error: `${patientName} is already admitted (${alreadyAdmitted.admissionId}) in ${alreadyAdmitted.ward} — Bed ${alreadyAdmitted.bedNumber}. Discharge first or transfer the patient.`,
      });
    }

    // Check bed not already occupied
    const occupied = await IPDAdmission.findOne({
      tenantId: req.user!.tenantId,
      ward,
      bedNumber,
      status: "Active",
    });
    if (occupied) return res.status(409).json({ error: `Bed ${bedNumber} in ${ward} is already occupied by ${occupied.patientName}` });

    const admissionId = await nextAdmissionId(req.user!.tenantId);

    const admission = await IPDAdmission.create({
      tenantId:          req.user!.tenantId,
      admissionId,
      patientId, patientName,
      patientAge:        patientAge || 0,
      patientGender:     patientGender || "",
      patientPhone:      patientPhone || "",
      appointmentId:     appointmentId || "",
      admittingDoctor,
      admittingDoctorId: admittingDoctorId || "",
      department:        department || "",
      ward,
      bedNumber,
      provisionalDiagnosis,
    });

    // Update patient status to IPD
    await Patient.findByIdAndUpdate(patientId, { status: "IPD" }).catch(() => {});

    res.status(201).json(admission);
  } catch (err: any) {
    if (err.code === 11000) return res.status(409).json({ error: "Admission ID conflict — retry" });
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/ipd/:id/rounds — add nursing round ──────────────────────────────
router.post("/:id/rounds", requireRole("admin", "doctor", "nurse"), async (req: AuthRequest, res) => {
  try {
    const { bp, pulse, temp, spo2, weight, notes } = req.body;
    const admission = await IPDAdmission.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId, status: "Active" },
      {
        $push: {
          rounds: {
            roundedAt: new Date(),
            nurse:     req.user!.name,
            bp:        bp     || "",
            pulse:     pulse  || 0,
            temp:      temp   || 0,
            spo2:      spo2   || 0,
            weight:    weight || undefined,
            notes:     notes  || "",
          },
        },
      },
      { new: true }
    );
    if (!admission) return res.status(404).json({ error: "Active admission not found" });
    const lastRound = admission.rounds[admission.rounds.length - 1];
    res.status(201).json(lastRound);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/ipd/:id/transfer — move patient to a different ward/bed ────────
router.post("/:id/transfer", requireRole("admin", "doctor", "nurse"), async (req: AuthRequest, res) => {
  try {
    const { ward, bedNumber, reason } = req.body;
    if (!ward || !bedNumber) return res.status(400).json({ error: "ward and bedNumber are required" });

    // Check target bed not occupied by someone else
    const occupied = await IPDAdmission.findOne({
      tenantId: req.user!.tenantId,
      ward,
      bedNumber,
      status: "Active",
      _id: { $ne: req.params.id },
    });
    if (occupied) return res.status(409).json({ error: `Bed ${bedNumber} in ${ward} is already occupied by ${occupied.patientName}` });

    const admission = await IPDAdmission.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId, status: "Active" },
      {
        $set: { ward, bedNumber },
        $push: {
          rounds: {
            roundedAt: new Date(),
            nurse: req.user!.name,
            bp: "", pulse: 0, temp: 0, spo2: 0,
            notes: `Transferred to ${ward} — Bed ${bedNumber}${reason ? ": " + reason : ""}`,
          },
        },
      },
      { new: true }
    );
    if (!admission) return res.status(404).json({ error: "Active admission not found" });
    res.json(admission);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/ipd/:id — update provisional diagnosis / ward / bed ───────────────
router.put("/:id", requireRole("admin", "doctor", "nurse"), async (req: AuthRequest, res) => {
  try {
    const allowed = ["provisionalDiagnosis","ward","bedNumber","department","admittingDoctor"];
    const update: any = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    const admission = await IPDAdmission.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { $set: update },
      { new: true }
    );
    if (!admission) return res.status(404).json({ error: "Admission not found" });
    res.json(admission);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/ipd/:id/discharge — discharge patient ───────────────────────────
router.post("/:id/discharge", requireRole("admin", "doctor"), async (req: AuthRequest, res) => {
  try {
    const { finalDiagnosis, treatment, medications, followUp, condition, notes } = req.body;
    if (!finalDiagnosis || !condition) {
      return res.status(400).json({ error: "finalDiagnosis and condition are required" });
    }

    const admission = await IPDAdmission.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId, status: "Active" },
      {
        $set: {
          status:       "Discharged",
          dischargeDate: new Date(),
          discharge: {
            finalDiagnosis, treatment: treatment || "",
            medications:   medications || "",
            followUp:      followUp    || "",
            condition,
            notes:         notes       || "",
            dischargedBy:  req.user!.name,
          },
        },
      },
      { new: true }
    );
    if (!admission) return res.status(404).json({ error: "Active admission not found" });

    // Update patient status back to OPD
    await Patient.findByIdAndUpdate(admission.patientId, { status: "Discharged" }).catch(() => {});

    res.json(admission);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
