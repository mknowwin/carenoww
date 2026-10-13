import ReferralMaster, { REFERRAL_MASTER_KINDS, ReferralMasterKind } from "../models/ReferralMaster.js";
import ReferralDoctor from "../models/ReferralDoctor.js";
import { AppError } from "../lib/AppError.js";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

// Lower-cased name → master spelling, so reports show "Anna Nagar" however the
// visit was typed. kind "Doctor" reads the ReferralDoctor master instead.
export async function canonicalNames(tenantId: string, kind: ReferralMasterKind | "Doctor") {
  const docs: { name: string }[] = kind === "Doctor"
    ? await ReferralDoctor.find({ tenantId }).select("name").lean()
    : await ReferralMaster.find({ tenantId, kind }).select("name").lean();
  return new Map(docs.map((d) => [d.name.trim().toLowerCase(), d.name.trim()]));
}
