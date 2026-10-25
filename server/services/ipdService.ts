import mongoose from "mongoose";
import IPDAdmission from "../models/IPDAdmission.js";
import Patient from "../models/Patient.js";
import { getNextId } from "../lib/counter.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../lib/logger.js";
import { todayInTz, startOfDayUtc, endOfDayUtc } from "../lib/dateUtils.js";

async function nextAdmissionId(tenantId: string): Promise<string> {
  return getNextId(tenantId, "admission", "ADM-");
}

// ── Identity helpers ──────────────────────────────────────────────────────────
// IPD keys patients by UHID ("UHID-001"), like appointments, prescriptions,
// labs and bills. Callers may still send a Mongo _id, a full UHID or the bare
// number ("1" / "001"), so resolve to the Patient record first.

export function normalizeUhid(raw: string): string {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(?:uhid-?)?(\d+)$/i);
  return m ? `UHID-${m[1].padStart(3, "0")}` : s;
}

async function resolvePatient(tenantId: string, raw: string) {
  const query = mongoose.Types.ObjectId.isValid(raw) && !/^\d+$/.test(raw)
    ? { _id: raw, tenantId }
    : { uhid: normalizeUhid(raw), tenantId };
  const patient = await Patient.findOne(query);
  if (!patient) throw AppError.notFound("Patient not found");
  return patient;
}

// Bed numbers are typed by staff — "gw-05", "GW-05 " and "GW -05" are the same bed.
export function normalizeBed(bed: string): string {
  return String(bed ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function bedKeyFor(ward: string, bed: string): string {
  return `${String(ward ?? "").trim().toUpperCase()}|${normalizeBed(bed)}`;
}

function statusForWard(ward: string): "IPD" | "ICU" {
  return ward.trim().toUpperCase() === "ICU" ? "ICU" : "IPD";
}

async function setPatientStatus(tenantId: string, uhid: string, update: Record<string, unknown>) {
  try {
    const res = await Patient.updateOne({ tenantId, uhid }, { $set: update });
    if (res.matchedCount === 0) {
      logger.warn({ module: "ipd", message: "Patient status not updated — UHID not found", tenantId, uhid });
    }
  } catch (err: any) {
    // The admission change has already been saved; a stale status label must not undo it.
    logger.error({ module: "ipd", message: "Patient status update failed", tenantId, uhid, error: err?.message });
  }
}

// Unique-index violations from the partial indexes on IPDAdmission
function duplicateError(err: any, ward: string, bed: string, patientName: string): AppError | null {
  if (err?.code !== 11000) return null;
  const keys = Object.keys(err.keyPattern ?? {});
  if (keys.includes("bedKey"))      return AppError.conflict(`Bed ${bed} in ${ward} was just taken by another admission`);
  if (keys.includes("patientId"))   return AppError.conflict(`${patientName} already has an active admission`);
  return AppError.conflict("Admission ID conflict — retry");
}

// ── Queries ───────────────────────────────────────────────────────────────────

export interface IPDListFilters {
  status?: string;
  patientId?: string;
  ward?: string;
  from?: string;   // YYYY-MM-DD (tenant tz) — discharge date range, Discharged only
  to?: string;
  limit?: string;
}

export async function listAdmissions(tenantId: string, filters: IPDListFilters, tz = "Asia/Kolkata") {
  const { status = "Active", patientId, ward, from, to, limit } = filters;
  const query: any = { tenantId, status };
  if (patientId) query.patientId = normalizeUhid(patientId);
  if (ward)      query.ward      = ward;

  const discharged = status === "Discharged";
  if (discharged && (from || to)) {
    query.dischargeDate = {};
    if (from) query.dischargeDate.$gte = startOfDayUtc(from, tz);
    if (to)   query.dischargeDate.$lte = endOfDayUtc(to, tz);
  }

  // Active admissions are a bounded set (beds); discharged ones grow forever.
  const max = Math.min(parseInt(limit || "") || (discharged ? 50 : 500), 500);

  const admissions = await IPDAdmission.find(query)
    .select("-rounds")  // skip rounds in list for performance
    .sort(discharged ? { dischargeDate: -1 } : { admissionDate: -1 })
    .limit(max);
  return { admissions, total: admissions.length };
}

export async function getStats(tenantId: string, tz: string) {
  const today = todayInTz(tz);
  const [active, icu, dischargedToday] = await Promise.all([
    IPDAdmission.countDocuments({ tenantId, status: "Active" }),
    IPDAdmission.countDocuments({ tenantId, status: "Active", ward: "ICU" }),
    IPDAdmission.countDocuments({
      tenantId, status: "Discharged",
      dischargeDate: { $gte: startOfDayUtc(today, tz), $lte: endOfDayUtc(today, tz) },
    }),
  ]);
  return { active, icu, dischargedToday };
}

// Active admission per UHID — drives the "Currently admitted" badge elsewhere in the app
export async function activeByPatient(tenantId: string, ids: string[]) {
  const uhids = [...new Set(ids.map(normalizeUhid).filter(Boolean))].slice(0, 200);
  if (uhids.length === 0) return {};
  const rows = await IPDAdmission.find({ tenantId, status: "Active", patientId: { $in: uhids } })
    .select("patientId admissionId ward bedNumber admissionDate")
    .lean();
  const map: Record<string, { _id: string; admissionId: string; ward: string; bedNumber: string; admissionDate: Date }> = {};
  for (const r of rows) {
    map[r.patientId] = { _id: String(r._id), admissionId: r.admissionId, ward: r.ward, bedNumber: r.bedNumber, admissionDate: r.admissionDate };
  }
  return map;
}

export async function getBedMap(tenantId: string) {
  const active = await IPDAdmission.find({
    tenantId,
    status: "Active",
  }).select("ward bedNumber patientName patientId admissionDate provisionalDiagnosis admittingDoctor admissionId");

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
  return wardMap;
}

export async function getAdmission(tenantId: string, id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw AppError.notFound("Admission not found");
  const admission = await IPDAdmission.findOne({ _id: id, tenantId });
  if (!admission) throw AppError.notFound("Admission not found");
  return admission;
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function admitPatient(tenantId: string, body: Record<string, any>) {
  const {
    patientId: rawPatientId, appointmentId, admittingDoctor, admittingDoctorId,
    department, ward, bedNumber: rawBed, provisionalDiagnosis,
  } = body;

  if (!rawPatientId || !admittingDoctor || !ward || !rawBed || !provisionalDiagnosis) {
    throw AppError.badRequest("patientId, admittingDoctor, ward, bedNumber, provisionalDiagnosis required");
  }

  // Demographics come from the Patient record, not the client
  const patient = await resolvePatient(tenantId, String(rawPatientId));
  const uhid = patient.uhid;
  const bedNumber = normalizeBed(rawBed);
  const bedKey = bedKeyFor(ward, bedNumber);

  // Friendly pre-checks; the unique indexes are the real guard against races
  const alreadyAdmitted = await IPDAdmission.findOne({ tenantId, patientId: uhid, status: "Active" });
  if (alreadyAdmitted) {
    throw AppError.conflict(
      `${patient.name} is already admitted (${alreadyAdmitted.admissionId}) in ${alreadyAdmitted.ward} — Bed ${alreadyAdmitted.bedNumber}. Discharge first or transfer the patient.`
    );
  }
  const occupied = await IPDAdmission.findOne({ tenantId, bedKey, status: "Active" });
  if (occupied) throw AppError.conflict(`Bed ${bedNumber} in ${ward} is already occupied by ${occupied.patientName}`);

  const admissionId = await nextAdmissionId(tenantId);

  let admission;
  try {
    admission = await IPDAdmission.create({
      tenantId,
      admissionId,
      patientId:         uhid,
      patientName:       patient.name,
      patientAge:        patient.age || 0,
      patientGender:     patient.gender || "",
      patientPhone:      patient.phone || "",
      appointmentId:     appointmentId || "",
      admittingDoctor,
      admittingDoctorId: admittingDoctorId || "",
      department:        department || patient.department || "",
      ward,
      bedNumber,
      bedKey,
      provisionalDiagnosis,
    });
  } catch (err: any) {
    throw duplicateError(err, ward, bedNumber, patient.name) ?? err;
  }

  await setPatientStatus(tenantId, uhid, { status: statusForWard(ward), admittedOn: admission.admissionDate });

  return admission;
}

export async function addRound(tenantId: string, nurseName: string, id: string, body: Record<string, any>) {
  const { bp, pulse, temp, spo2, weight, notes } = body;
  const admission = await IPDAdmission.findOneAndUpdate(
    { _id: id, tenantId, status: "Active" },
    {
      $push: {
        rounds: {
          roundedAt: new Date(),
          nurse:     nurseName,
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
  if (!admission) throw AppError.notFound("Active admission not found");
  return admission.rounds[admission.rounds.length - 1];
}

export async function transferPatient(tenantId: string, userName: string, id: string, body: Record<string, any>) {
  const { ward, bedNumber: rawBed, reason } = body;
  if (!ward || !rawBed) throw AppError.badRequest("ward and bedNumber are required");

  const current = await IPDAdmission.findOne({ _id: id, tenantId, status: "Active" });
  if (!current) throw AppError.notFound("Active admission not found");

  const bedNumber = normalizeBed(rawBed);
  const bedKey = bedKeyFor(ward, bedNumber);
  if (bedKey === current.bedKey) throw AppError.badRequest("Patient is already in that bed");

  const occupied = await IPDAdmission.findOne({ tenantId, bedKey, status: "Active", _id: { $ne: id } });
  if (occupied) throw AppError.conflict(`Bed ${bedNumber} in ${ward} is already occupied by ${occupied.patientName}`);

  let admission;
  try {
    admission = await IPDAdmission.findOneAndUpdate(
      { _id: id, tenantId, status: "Active" },
      {
        $set: { ward, bedNumber, bedKey },
        $push: {
          transfers: {
            at:       new Date(),
            fromWard: current.ward,
            fromBed:  current.bedNumber,
            toWard:   ward,
            toBed:    bedNumber,
            reason:   reason || "",
            by:       userName,
          },
        },
      },
      { new: true }
    );
  } catch (err: any) {
    throw duplicateError(err, ward, bedNumber, current.patientName) ?? err;
  }
  if (!admission) throw AppError.notFound("Active admission not found");

  if (statusForWard(ward) !== statusForWard(current.ward)) {
    await setPatientStatus(tenantId, admission.patientId, { status: statusForWard(ward) });
  }
  return admission;
}

// Ward/bed changes go through transferPatient so occupancy is checked and history kept
export async function updateAdmission(tenantId: string, id: string, body: Record<string, any>) {
  const allowed = ["provisionalDiagnosis", "department", "admittingDoctor", "admittingDoctorId"];
  const update: any = {};
  allowed.forEach((k) => { if (body[k] !== undefined) update[k] = typeof body[k] === "string" ? body[k].trim() : body[k]; });

  if (Object.keys(update).length === 0) throw AppError.badRequest("Nothing to update");
  if (update.provisionalDiagnosis === "") throw AppError.badRequest("Provisional diagnosis cannot be empty");
  if (update.admittingDoctor === "")      throw AppError.badRequest("Admitting doctor cannot be empty");

  const admission = await IPDAdmission.findOneAndUpdate(
    { _id: id, tenantId, status: "Active" },
    { $set: update },
    { new: true }
  );
  if (!admission) throw AppError.notFound("Active admission not found");
  return admission;
}

export async function dischargePatient(tenantId: string, dischargedBy: string, id: string, body: Record<string, any>) {
  const { finalDiagnosis, treatment, medications, followUp, condition, notes } = body;
  if (!finalDiagnosis || !condition) {
    throw AppError.badRequest("finalDiagnosis and condition are required");
  }

  const admission = await IPDAdmission.findOneAndUpdate(
    { _id: id, tenantId, status: "Active" },
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
          dischargedBy,
        },
      },
    },
    { new: true }
  );
  if (!admission) throw AppError.notFound("Active admission not found");

  // Back to outpatient follow-up; "Discharged" is kept only for patients who expired
  await setPatientStatus(tenantId, admission.patientId, { status: condition === "Expired" ? "Discharged" : "OPD" });

  return admission;
}
