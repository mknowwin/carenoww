import ReferralMaster, { REFERRAL_MASTER_KINDS, ReferralMasterKind } from "../models/ReferralMaster.js";
import ReferralDoctor from "../models/ReferralDoctor.js";
import Appointment from "../models/Appointment.js";
import { AppError } from "../lib/AppError.js";

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function assertKind(kind?: string): ReferralMasterKind {
  if (!REFERRAL_MASTER_KINDS.includes(kind as ReferralMasterKind)) throw AppError.badRequest("Invalid kind");
  return kind as ReferralMasterKind;
}

export async function searchReferralMasters(tenantId: string, kind?: string, search?: string) {
  const filter: any = { tenantId, kind: assertKind(kind) };
  if (search?.trim()) {
    filter.name = { $regex: escapeRegex(search.trim()), $options: "i" };
  }
  return ReferralMaster.find(filter).sort({ name: 1 }).limit(10).lean();
}

export async function listReferralMasters(tenantId: string, kind?: string) {
  return ReferralMaster.find({ tenantId, kind: assertKind(kind) }).sort({ name: 1 }).lean();
}

export async function createReferralMaster(tenantId: string, body: Record<string, any>) {
  const kind = assertKind(body.kind);
  const name = String(body.name ?? "").trim();
  if (!name) throw AppError.badRequest("Name is required");

  const existing = await ReferralMaster.findOne({
    tenantId,
    kind,
    name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
  });
  if (existing) return { master: existing, created: false };

  const master = await ReferralMaster.create({ tenantId, kind, name });
  return { master, created: true };
}

export async function updateReferralMaster(tenantId: string, id: string, body: Record<string, any>) {
  const name = String(body.name ?? "").trim();
  if (!name) throw AppError.badRequest("Name is required");

  const master = await ReferralMaster.findOne({ _id: id, tenantId });
  if (!master) throw AppError.notFound("Referral entry not found");

  const clash = await ReferralMaster.exists({
    tenantId,
    kind: master.kind,
    _id: { $ne: master._id },
    name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
  });
  if (clash) throw AppError.conflict(`"${name}" already exists`);

  master.name = name;
  await master.save();
  return master;
}

export async function deleteReferralMaster(tenantId: string, id: string) {
  const master = await ReferralMaster.findOne({ _id: id, tenantId });
  if (!master) throw AppError.notFound("Referral entry not found");
  await assertUnused(tenantId, master.kind, master.name);
  await master.deleteOne();
  return { _id: master._id };
}

// Appointments store referral names as free text, so usage is matched by name
// (trimmed, case-insensitive) on the field that kind is captured in.
// Cancelled visits count too — the name is still on record.
export async function countAppointmentUsage(tenantId: string, kind: ReferralMasterKind | "Doctor", name: string) {
  const match = { $regex: `^\\s*${escapeRegex(name.trim())}\\s*$`, $options: "i" };
  const filter: any = { tenantId };
  if (kind === "Doctor") filter.referringDoctor = match;
  else if (kind === "Area") filter.area = match;
  else { filter.referralSource = kind; filter.referralDetail = match; }
  return Appointment.countDocuments(filter);
}

export async function assertUnused(tenantId: string, kind: ReferralMasterKind | "Doctor", name: string) {
  const used = await countAppointmentUsage(tenantId, kind, name);
  if (used > 0) throw AppError.conflict(`"${name}" is used in ${used} appointment(s) and cannot be deleted`);
}

// Lower-cased name → master spelling, so reports show "Anna Nagar" however the
// visit was typed. kind "Doctor" reads the ReferralDoctor master instead.
export async function canonicalNames(tenantId: string, kind: ReferralMasterKind | "Doctor") {
  const docs: { name: string }[] = kind === "Doctor"
    ? await ReferralDoctor.find({ tenantId }).select("name").lean()
    : await ReferralMaster.find({ tenantId, kind }).select("name").lean();
  return new Map(docs.map((d) => [d.name.trim().toLowerCase(), d.name.trim()]));
}
