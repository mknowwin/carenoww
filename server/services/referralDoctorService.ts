import ReferralDoctor from "../models/ReferralDoctor.js";
import { AppError } from "../lib/AppError.js";
import { escapeRegex, assertUnused } from "./referralMasterService.js";

export async function searchReferralDoctors(tenantId: string, search?: string) {
  const filter: any = { tenantId };
  if (search?.trim()) {
    filter.name = { $regex: escapeRegex(search.trim()), $options: "i" };
  }
  return ReferralDoctor.find(filter).sort({ name: 1 }).limit(10).lean();
}

export async function listReferralDoctors(tenantId: string) {
  return ReferralDoctor.find({ tenantId }).sort({ name: 1 }).lean();
}

export async function createReferralDoctor(tenantId: string, body: Record<string, any>) {
  const { name, specialization, phone, hospital } = body;
  if (!name?.trim()) throw AppError.badRequest("Name is required");

  const existing = await ReferralDoctor.findOne({
    tenantId,
    name: { $regex: `^${escapeRegex(name.trim())}$`, $options: "i" },
  });
  if (existing) return { doctor: existing, created: false };

  const doctor = await ReferralDoctor.create({
    tenantId,
    name: name.trim(),
    specialization: specialization?.trim() ?? "",
    phone: phone?.trim() ?? "",
    hospital: hospital?.trim() ?? "",
  });
  return { doctor, created: true };
}

export async function updateReferralDoctor(tenantId: string, id: string, body: Record<string, any>) {
  const name = String(body.name ?? "").trim();
  if (!name) throw AppError.badRequest("Name is required");

  const doctor = await ReferralDoctor.findOne({ _id: id, tenantId });
  if (!doctor) throw AppError.notFound("Referral doctor not found");

  const clash = await ReferralDoctor.exists({
    tenantId,
    _id: { $ne: doctor._id },
    name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
  });
  if (clash) throw AppError.conflict(`"${name}" already exists`);

  doctor.name = name;
  for (const f of ["specialization", "phone", "hospital"] as const) {
    if (body[f] !== undefined) doctor[f] = String(body[f] ?? "").trim();
  }
  await doctor.save();
  return doctor;
}

export async function deleteReferralDoctor(tenantId: string, id: string) {
  const doctor = await ReferralDoctor.findOne({ _id: id, tenantId });
  if (!doctor) throw AppError.notFound("Referral doctor not found");
  await assertUnused(tenantId, "Doctor", doctor.name);
  await doctor.deleteOne();
  return { _id: doctor._id };
}
