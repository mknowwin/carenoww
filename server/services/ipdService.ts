import IPDAdmission from "../models/IPDAdmission.js";
import Patient from "../models/Patient.js";
import { getNextId } from "../lib/counter.js";
import { AppError } from "../lib/AppError.js";

async function nextAdmissionId(tenantId: string): Promise<string> {
  return getNextId(tenantId, "admission", "ADM-");
}

export interface IPDListFilters {
  status?: string;
  patientId?: string;
  ward?: string;
}

export async function listAdmissions(tenantId: string, filters: IPDListFilters) {
  const { status, patientId, ward } = filters;
  const query: any = { tenantId };
  if (status)    query.status    = status;
  if (patientId) query.patientId = patientId;
  if (ward)      query.ward      = ward;
  if (!status)   query.status    = "Active";  // default to active

  const admissions = await IPDAdmission.find(query)
    .select("-rounds")  // skip rounds in list for performance
    .sort({ admissionDate: -1 });
  return { admissions, total: admissions.length };
}

export async function getBedMap(tenantId: string) {
  const active = await IPDAdmission.find({
    tenantId,
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
  return wardMap;
}

export async function getAdmission(tenantId: string, id: string) {
  const admission = await IPDAdmission.findOne({ _id: id, tenantId });
  if (!admission) throw AppError.notFound("Admission not found");
  return admission;
}

export async function admitPatient(tenantId: string, body: Record<string, any>) {
  const {
    patientId, patientName, patientAge, patientGender, patientPhone,
    appointmentId, admittingDoctor, admittingDoctorId,
    department, ward, bedNumber, provisionalDiagnosis,
  } = body;

  if (!patientId || !patientName || !admittingDoctor || !ward || !bedNumber || !provisionalDiagnosis) {
    throw AppError.badRequest("patientId, patientName, admittingDoctor, ward, bedNumber, provisionalDiagnosis required");
  }

  // Check patient not already admitted
  const alreadyAdmitted = await IPDAdmission.findOne({ tenantId, patientId, status: "Active" });
  if (alreadyAdmitted) {
    throw AppError.conflict(
      `${patientName} is already admitted (${alreadyAdmitted.admissionId}) in ${alreadyAdmitted.ward} — Bed ${alreadyAdmitted.bedNumber}. Discharge first or transfer the patient.`
    );
  }

  // Check bed not already occupied
  const occupied = await IPDAdmission.findOne({ tenantId, ward, bedNumber, status: "Active" });
  if (occupied) throw AppError.conflict(`Bed ${bedNumber} in ${ward} is already occupied by ${occupied.patientName}`);

  const admissionId = await nextAdmissionId(tenantId);

  let admission;
  try {
    admission = await IPDAdmission.create({
      tenantId,
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
  } catch (err: any) {
    if (err.code === 11000) throw AppError.conflict("Admission ID conflict — retry");
    throw err;
  }

  // Update patient status to IPD
  await Patient.findByIdAndUpdate(patientId, { status: "IPD" }).catch(() => {});

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

export async function transferPatient(tenantId: string, nurseName: string, id: string, body: Record<string, any>) {
  const { ward, bedNumber, reason } = body;
  if (!ward || !bedNumber) throw AppError.badRequest("ward and bedNumber are required");

  // Check target bed not occupied by someone else
  const occupied = await IPDAdmission.findOne({
    tenantId,
    ward,
    bedNumber,
    status: "Active",
    _id: { $ne: id },
  });
  if (occupied) throw AppError.conflict(`Bed ${bedNumber} in ${ward} is already occupied by ${occupied.patientName}`);

  const admission = await IPDAdmission.findOneAndUpdate(
    { _id: id, tenantId, status: "Active" },
    {
      $set: { ward, bedNumber },
      $push: {
        rounds: {
          roundedAt: new Date(),
          nurse: nurseName,
          bp: "", pulse: 0, temp: 0, spo2: 0,
          notes: `Transferred to ${ward} — Bed ${bedNumber}${reason ? ": " + reason : ""}`,
        },
      },
    },
    { new: true }
  );
  if (!admission) throw AppError.notFound("Active admission not found");
  return admission;
}

export async function updateAdmission(tenantId: string, id: string, body: Record<string, any>) {
  const allowed = ["provisionalDiagnosis", "ward", "bedNumber", "department", "admittingDoctor"];
  const update: any = {};
  allowed.forEach((k) => { if (body[k] !== undefined) update[k] = body[k]; });

  const admission = await IPDAdmission.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: update },
    { new: true }
  );
  if (!admission) throw AppError.notFound("Admission not found");
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

  // Update patient status back to OPD
  await Patient.findByIdAndUpdate(admission.patientId, { status: "Discharged" }).catch(() => {});

  return admission;
}
