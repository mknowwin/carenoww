import Patient from "../models/Patient.js";
import Counter from "../models/Counter.js";
import { AppError } from "../lib/AppError.js";

export interface PatientListFilters {
  status?: string;
  riskLevel?: string;
  search?: string;
  page?: string;
  limit?: string;
}

// Prevents regex special chars in search input from being interpreted as regex operators
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Atomic UHID generation — race-safe via MongoDB $inc counter.
// On first call for a tenant, seeds the counter from the current max UHID
// so existing patient records stay consistent.
async function nextUHID(tenantId: string): Promise<string> {
  // Seed counter if it doesn't exist yet (handles existing data migration).
  // $setOnInsert is a no-op when the document already exists, so concurrent
  // first-time calls are safe — only one write wins, the other is ignored.
  const existing = await Counter.findOne({ tenantId, name: "patient" });
  if (!existing) {
    const last = await Patient.findOne({ tenantId }).sort({ createdAt: -1 });
    const seed = last ? (parseInt(last.uhid.replace(/\D/g, ""), 10) || 0) : 0;
    await Counter.findOneAndUpdate(
      { tenantId, name: "patient" },
      { $setOnInsert: { seq: seed } },
      { upsert: true }
    );
  }

  // Atomically increment — this is the only line that must be race-safe,
  // and MongoDB guarantees $inc on a single document is atomic.
  const counter = await Counter.findOneAndUpdate(
    { tenantId, name: "patient" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return `UHID-${String(counter!.seq).padStart(3, "0")}`;
}

export async function listPatients(tenantId: string, filters: PatientListFilters) {
  const { status, riskLevel, search, page = "1", limit = "50" } = filters;
  const query: any = { tenantId, isActive: true };
  if (status) query.status = status;
  if (riskLevel) query.riskLevel = riskLevel;
  if (search) {
    const escaped = escapeRegex(search);
    if (/^\d+$/.test(search)) {
      // All digits → phone prefix search (avoids text-index conflict in $or)
      query.phone = { $regex: `${escaped}`, $options: "i" };
    } else {
      query.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { uhid: { $regex: escaped, $options: "i" } },
      ];
    }
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [patients, total] = await Promise.all([
    Patient.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Patient.countDocuments(query),
  ]);
  return { patients, total, page: parseInt(page), limit: parseInt(limit) };
}

export async function createPatient(tenantId: string, body: Record<string, unknown>) {
  const uhid = await nextUHID(tenantId);
  return Patient.create({ ...body, tenantId, uhid });
}

export async function getPatient(tenantId: string, id: string) {
  const patient = await Patient.findOne({ _id: id, tenantId });
  if (!patient) throw AppError.notFound("Patient not found");
  return patient;
}

export async function updatePatient(tenantId: string, id: string, body: Record<string, unknown>) {
  const patient = await Patient.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: body },
    { new: true, runValidators: true }
  );
  if (!patient) throw AppError.notFound("Patient not found");
  return patient;
}

export async function deactivatePatient(tenantId: string, id: string) {
  const patient = await Patient.findOneAndUpdate(
    { _id: id, tenantId },
    { isActive: false },
    { new: true }
  );
  if (!patient) throw AppError.notFound("Patient not found");
  return { message: "Patient removed" };
}
