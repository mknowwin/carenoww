import ReferralDoctor from "../models/ReferralDoctor.js";
import { AppError } from "../lib/AppError.js";

export async function searchReferralDoctors(tenantId: string, search?: string) {
  const filter: any = { tenantId };
  if (search?.trim()) {
    filter.name = { $regex: search.trim(), $options: "i" };
  }
  return ReferralDoctor.find(filter).sort({ name: 1 }).limit(10).lean();
}

export async function createReferralDoctor(tenantId: string, body: Record<string, any>) {
  const { name, specialization, phone, hospital } = body;
  if (!name?.trim()) throw AppError.badRequest("Name is required");

  const existing = await ReferralDoctor.findOne({
    tenantId,
    name: { $regex: `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
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
