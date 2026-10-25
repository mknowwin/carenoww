import mongoose from "mongoose";
import IPDAdmission from "../models/IPDAdmission.js";
import Patient from "../models/Patient.js";
import { getNextId } from "../lib/counter.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../lib/logger.js";
import { todayInTz, startOfDayUtc, endOfDayUtc } from "../lib/dateUtils.js";
import { normalizeBed, bedKeyForId, resolveBedForAdmission, markVacated, icuWardIds } from "./wardService.js";
import { syncBedCharges, outstandingBalance } from "./ipdBillingService.js";

// Bed charges must never block a clinical action; failures are logged for finance
async function syncBedChargesSafe(tenantId: string, id: string, tz: string, userName: string, until?: Date) {
  try {
    await syncBedCharges(tenantId, id, tz, userName, until);
  } catch (err: any) {
    logger.error({ module: "ipd", message: "Bed charge sync failed", tenantId, admission: id, error: err?.message });
  }
}

export { normalizeBed };

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

// Legacy occupancy key for admissions made before the ward & bed master
// (still used by migrate-ipd-phase1); new admissions use bedKeyForId.
export function bedKeyFor(ward: string, bed: string): string {
  return `${String(ward ?? "").trim().toUpperCase()}|${normalizeBed(bed)}`;
}

function statusForWardType(type: string): "IPD" | "ICU" {
  return type === "ICU" ? "ICU" : "IPD";
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

// Backdating window for clinical times entered late (admission, discharge, death)
const BACKDATE_DAYS = 7;

// Optional clinical time: defaults to now; must not be in the future or older than
// BACKDATE_DAYS (and, when given, not before `notBefore`)
function clinicalTime(raw: unknown, label: string, notBefore?: Date): Date {
  if (raw === undefined || raw === null || raw === "") return new Date();
  const t = new Date(String(raw));
  if (isNaN(t.getTime())) throw AppError.badRequest(`Invalid ${label}`);
  const now = Date.now();
  if (t.getTime() > now + 5 * 60000) throw AppError.badRequest(`${label} cannot be in the future`);
  if (t.getTime() < now - BACKDATE_DAYS * 86400000) throw AppError.badRequest(`${label} can be at most ${BACKDATE_DAYS} days ago`);
  if (notBefore && t < notBefore) throw AppError.badRequest(`${label} cannot be before admission`);
  return t;
}

export async function listAdmissions(tenantId: string, filters: IPDListFilters, tz = "Asia/Kolkata") {
  const { status = "Active", patientId, ward, from, to, limit } = filters;
  // status=all → every admission (patient history); otherwise one status
  const query: any = status === "all" ? { tenantId } : { tenantId, status };
  if (patientId) query.patientId = normalizeUhid(patientId);
  if (ward)      query.ward      = ward;

  const discharged = status === "Discharged";
  if (discharged && (from || to)) {
    query.dischargeDate = {};
    if (from) query.dischargeDate.$gte = startOfDayUtc(from, tz);
    if (to)   query.dischargeDate.$lte = endOfDayUtc(to, tz);
  }

  // Active admissions are a bounded set (beds); discharged ones grow forever.
  const max = Math.min(parseInt(limit || "") || (discharged || status === "all" ? 50 : 500), 500);

  // Lists skip notes for size; the last round drives "due for round" on the IPD list
  const admissions = await IPDAdmission.find(query)
    .select({ progressNotes: 0, rounds: { $slice: -1 } })
    .sort(discharged ? { dischargeDate: -1 } : { admissionDate: -1 })
    .limit(max);
  return { admissions, total: admissions.length };
}

// Active ICU admissions: in an ICU-type ward, or legacy rows named "ICU"
export async function icuFilter(tenantId: string) {
  const ids = await icuWardIds(tenantId);
  return { tenantId, status: "Active", $or: [{ wardId: { $in: ids } }, { wardId: { $in: ["", null] }, ward: "ICU" }] };
}

export async function getStats(tenantId: string, tz: string) {
  const today = todayInTz(tz);
  const [active, icu, dischargedToday] = await Promise.all([
    IPDAdmission.countDocuments({ tenantId, status: "Active" }),
    IPDAdmission.countDocuments(await icuFilter(tenantId)),
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
    department, bedId, provisionalDiagnosis, admissionDate: rawAdmissionDate,
  } = body;

  if (!rawPatientId || !admittingDoctor || !bedId || !provisionalDiagnosis) {
    throw AppError.badRequest("patientId, admittingDoctor, bedId, provisionalDiagnosis required");
  }

  // Demographics come from the Patient record, not the client
  const patient = await resolvePatient(tenantId, String(rawPatientId));
  const uhid = patient.uhid;
  const admissionDate = clinicalTime(rawAdmissionDate, "Admission time");

  // Friendly pre-checks; the unique indexes are the real guard against races
  const alreadyAdmitted = await IPDAdmission.findOne({ tenantId, patientId: uhid, status: "Active" });
  if (alreadyAdmitted) {
    throw AppError.conflict(
      `${patient.name} is already admitted (${alreadyAdmitted.admissionId}) in ${alreadyAdmitted.ward} — Bed ${alreadyAdmitted.bedNumber}. Discharge first or transfer the patient.`
    );
  }
  const { bed, ward } = await resolveBedForAdmission(tenantId, String(bedId));
  const bedNumber = bed.number;

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
      ward:              ward.name,
      wardId:            String(ward._id),
      bedNumber,
      bedId:             String(bed._id),
      bedKey:            bedKeyForId(String(bed._id)),
      provisionalDiagnosis,
      admissionDate,
    });
  } catch (err: any) {
    throw duplicateError(err, ward.name, bedNumber, patient.name) ?? err;
  }
  if (Date.now() - admissionDate.getTime() > 3600000) {
    logger.info({ module: "ipd", message: "Admission entered with an earlier admission time", tenantId, admissionId, admissionDate });
  }

  await setPatientStatus(tenantId, uhid, { status: statusForWardType(ward.type), admittedOn: admission.admissionDate });

  return admission;
}

export async function addRound(tenantId: string, nurseName: string, id: string, body: Record<string, any>) {
  const { bp, pulse, temp, spo2, weight, respRate, intake, output, notes } = body;
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
          respRate:  respRate || undefined,
          intake:    intake   || undefined,
          output:    output   || undefined,
          notes:     notes  || "",
        },
      },
    },
    { new: true }
  );
  if (!admission) throw AppError.notFound("Active admission not found");
  return admission.rounds[admission.rounds.length - 1];
}

// Doctor's progress note (SOAP) on an active admission
export async function addProgressNote(tenantId: string, user: { name: string; id: string }, id: string, body: Record<string, any>) {
  const note = {
    subjective: String(body.subjective ?? "").trim(),
    objective:  String(body.objective  ?? "").trim(),
    assessment: String(body.assessment ?? "").trim(),
    plan:       String(body.plan       ?? "").trim(),
  };
  if (!note.subjective && !note.objective && !note.assessment && !note.plan) {
    throw AppError.badRequest("Write at least one section of the note");
  }
  const admission = await IPDAdmission.findOneAndUpdate(
    { _id: id, tenantId, status: "Active" },
    { $push: { progressNotes: { ...note, at: new Date(), doctor: user.name, doctorId: user.id || "" } } },
    { new: true }
  );
  if (!admission) throw AppError.notFound("Active admission not found");
  return admission.progressNotes[admission.progressNotes.length - 1];
}

export async function transferPatient(tenantId: string, userName: string, id: string, body: Record<string, any>, tz = "Asia/Kolkata") {
  const { bedId, reason } = body;
  if (!bedId) throw AppError.badRequest("bedId is required");

  const current = await IPDAdmission.findOne({ _id: id, tenantId, status: "Active" });
  if (!current) throw AppError.notFound("Active admission not found");
  if (String(bedId) === current.bedId) throw AppError.badRequest("Patient is already in that bed");

  const { bed, ward } = await resolveBedForAdmission(tenantId, String(bedId), id);
  const bedNumber = bed.number;
  const fromIcu = current.wardId ? (await icuWardIds(tenantId)).includes(current.wardId) : current.ward === "ICU";

  let admission;
  try {
    admission = await IPDAdmission.findOneAndUpdate(
      { _id: id, tenantId, status: "Active" },
      {
        $set: { ward: ward.name, wardId: String(ward._id), bedNumber, bedId: String(bed._id), bedKey: bedKeyForId(String(bed._id)) },
        $push: {
          transfers: {
            at:       new Date(),
            fromWard: current.ward,
            fromBed:  current.bedNumber,
            toWard:   ward.name,
            toBed:    bedNumber,
            fromWardId: current.wardId || "",
            fromBedId:  current.bedId || "",
            toWardId:   String(ward._id),
            toBedId:    String(bed._id),
            reason:   reason || "",
            by:       userName,
          },
        },
      },
      { new: true }
    );
  } catch (err: any) {
    throw duplicateError(err, ward.name, bedNumber, current.patientName) ?? err;
  }
  if (!admission) throw AppError.notFound("Active admission not found");

  await markVacated(tenantId, current.bedId);
  await syncBedChargesSafe(tenantId, id, tz, userName);
  if ((ward.type === "ICU") !== fromIcu) {
    await setPatientStatus(tenantId, admission.patientId, { status: statusForWardType(ward.type) });
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

export async function dischargePatient(
  tenantId: string, dischargedBy: string, id: string, body: Record<string, any>,
  opts: { role?: string; tz?: string } = {},
) {
  const { finalDiagnosis, treatment, medications, followUp, condition, notes, dischargeDate: rawDischargeDate, deathAt: rawDeathAt, lamaReason, allowBalance, balanceNote } = body;
  const tz = opts.tz ?? "Asia/Kolkata";
  if (!finalDiagnosis || !condition) {
    throw AppError.badRequest("finalDiagnosis and condition are required");
  }

  const current = await IPDAdmission.findOne({ _id: id, tenantId, status: "Active" }).select("admissionDate");
  if (!current) throw AppError.notFound("Active admission not found");

  const dischargeDate = clinicalTime(rawDischargeDate, "Discharge time", current.admissionDate);
  const extra: Record<string, unknown> = {};
  if (condition === "Expired") {
    if (!rawDeathAt) throw AppError.badRequest("Time of death is required when the patient has expired");
    extra.deathAt = clinicalTime(rawDeathAt, "Time of death", current.admissionDate);
  }
  if (condition === "LAMA") {
    if (!String(lamaReason ?? "").trim()) throw AppError.badRequest("Reason / consent note is required for LAMA");
    extra.lamaReason = String(lamaReason).trim();
  }

  // Bed charges through the discharge time, then the unpaid-balance check.
  // Expired / LAMA are never held for payment; otherwise an admin may discharge
  // with a balance by giving a reason.
  await syncBedChargesSafe(tenantId, id, tz, dischargedBy, dischargeDate);
  const balance = await outstandingBalance(tenantId, id);
  if (balance > 0) {
    extra.balanceAtDischarge = balance;
    if (condition !== "Expired" && condition !== "LAMA") {
      if (!allowBalance) {
        throw AppError.conflict(`Unpaid IPD balance of ₹${balance.toLocaleString("en-IN")}`, { reason: "UNPAID_BALANCE", balance });
      }
      if (opts.role !== "admin") throw AppError.forbidden("Only an admin can discharge with an unpaid balance");
      if (!String(balanceNote ?? "").trim()) throw AppError.badRequest("Give a reason for discharging with a balance");
      extra.balanceNote = String(balanceNote).trim();
    }
  }

  const admission = await IPDAdmission.findOneAndUpdate(
    { _id: id, tenantId, status: "Active" },
    {
      $set: {
        status:       "Discharged",
        dischargeDate,
        dischargeRecordedAt: new Date(),
        discharge: {
          finalDiagnosis, treatment: treatment || "",
          medications:   medications || "",
          followUp:      followUp    || "",
          condition,
          notes:         notes       || "",
          dischargedBy,
          ...extra,
        },
      },
    },
    { new: true }
  );
  if (!admission) throw AppError.notFound("Active admission not found");

  await markVacated(tenantId, admission.bedId);

  // Back to outpatient follow-up; "Discharged" is kept only for patients who expired
  await setPatientStatus(tenantId, admission.patientId, { status: condition === "Expired" ? "Discharged" : "OPD" });

  return admission;
}
