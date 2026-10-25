import mongoose from "mongoose";
import Ward, { WARD_TYPES, WardType } from "../models/Ward.js";
import Bed, { BED_STATUSES, BedStatus } from "../models/Bed.js";
import IPDAdmission from "../models/IPDAdmission.js";
import ServiceRateMaster from "../models/ServiceRateMaster.js";
import { AppError } from "../lib/AppError.js";

// Bed numbers are typed by staff — "gw-05", "GW-05 " and "GW -05" are the same bed.
export function normalizeBed(bed: string): string {
  return String(bed ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export const bedKeyForId = (bedId: string) => `BED:${bedId}`;

const isObjectId = (id: string) => mongoose.Types.ObjectId.isValid(id);

// Daily charges linked to a ward: existing, active rates of this tenant, no duplicates
async function cleanDailyRateIds(tenantId: string, raw: unknown): Promise<string[]> {
  if (!Array.isArray(raw)) throw AppError.badRequest("dailyRateIds must be a list");
  const ids = [...new Set(raw.map(String).filter(Boolean))];
  if (ids.some((id) => !isObjectId(id))) throw AppError.badRequest("Invalid rate id");
  if (ids.length === 0) return [];
  const found = await ServiceRateMaster.countDocuments({ tenantId, _id: { $in: ids }, isActive: true });
  if (found !== ids.length) throw AppError.badRequest("One or more daily charges were not found");
  return ids;
}

function assertType(type?: string): WardType {
  if (type === undefined || type === "") return "General";
  if (!WARD_TYPES.includes(type as WardType)) throw AppError.badRequest("Invalid ward type");
  return type as WardType;
}

// ── Overview ──────────────────────────────────────────────────────────────────

export interface BedView {
  _id: string;
  number: string;
  status: BedStatus;
  active: boolean;
  occupant: null | {
    admissionDbId: string;
    admissionId: string;
    patientId: string;
    patientName: string;
    since: Date;
    diagnosis: string;
    doctor: string;
  };
}

// Wards with their beds and live occupancy (from Active admissions).
// includeInactive → Settings view; otherwise only active wards/beds.
export async function listWards(tenantId: string, includeInactive = false) {
  const wardFilter: any = { tenantId };
  const bedFilter: any = { tenantId };
  if (!includeInactive) { wardFilter.active = true; bedFilter.active = true; }

  const [wards, beds, active] = await Promise.all([
    Ward.find(wardFilter).sort({ sortOrder: 1, name: 1 }).lean(),
    Bed.find(bedFilter).lean(),
    IPDAdmission.find({ tenantId, status: "Active", bedId: { $gt: "" } })
      .select("bedId admissionId patientId patientName admissionDate provisionalDiagnosis admittingDoctor")
      .lean(),
  ]);

  const occupantByBed = new Map(active.map((a) => [a.bedId, a]));
  const bedsByWard = new Map<string, BedView[]>();
  for (const b of beds) {
    const a = occupantByBed.get(String(b._id));
    const view: BedView = {
      _id: String(b._id), number: b.number, status: b.status, active: b.active,
      occupant: a ? {
        admissionDbId: String(a._id), admissionId: a.admissionId, patientId: a.patientId, patientName: a.patientName,
        since: a.admissionDate, diagnosis: a.provisionalDiagnosis, doctor: a.admittingDoctor,
      } : null,
    };
    const key = String(b.wardId);
    if (!bedsByWard.has(key)) bedsByWard.set(key, []);
    bedsByWard.get(key)!.push(view);
  }

  return wards.map((w) => {
    const wardBeds = (bedsByWard.get(String(w._id)) ?? [])
      .sort((x, y) => x.number.localeCompare(y.number, undefined, { numeric: true }));
    const live = wardBeds.filter((b) => b.active);
    const occupied = live.filter((b) => b.occupant).length;
    return {
      _id: String(w._id), name: w.name, code: w.code, type: w.type, dailyRateIds: w.dailyRateIds ?? [],
      active: w.active, sortOrder: w.sortOrder,
      beds: wardBeds,
      counts: {
        total:       live.length,
        occupied,
        available:   live.filter((b) => !b.occupant && b.status === "Available").length,
        cleaning:    live.filter((b) => !b.occupant && b.status === "Cleaning").length,
        maintenance: live.filter((b) => !b.occupant && b.status === "Maintenance").length,
      },
    };
  });
}

// Totals across active wards — dashboard occupancy
export async function bedTotals(tenantId: string) {
  const wards = await listWards(tenantId);
  return wards.reduce((t, w) => ({ total: t.total + w.counts.total, occupied: t.occupied + w.counts.occupied }), { total: 0, occupied: 0 });
}

export async function icuWardIds(tenantId: string): Promise<string[]> {
  const rows = await Ward.find({ tenantId, type: "ICU" }).select("_id").lean();
  return rows.map((r) => String(r._id));
}

// Resolve a bed for admit/transfer: must be active, in an active ward, ready and free
export async function resolveBedForAdmission(tenantId: string, bedId: string, ignoreAdmissionId?: string) {
  if (!bedId || !isObjectId(bedId)) throw AppError.badRequest("Select a bed");
  const bed = await Bed.findOne({ _id: bedId, tenantId });
  if (!bed || !bed.active) throw AppError.notFound("Bed not found");
  const ward = await Ward.findOne({ _id: bed.wardId, tenantId });
  if (!ward || !ward.active) throw AppError.badRequest("That bed's ward is inactive");
  if (bed.status !== "Available") throw AppError.conflict(`Bed ${bed.number} is marked ${bed.status} — mark it ready first`);

  const occupied = await IPDAdmission.findOne({
    tenantId, status: "Active", bedKey: bedKeyForId(String(bed._id)),
    ...(ignoreAdmissionId ? { _id: { $ne: ignoreAdmissionId } } : {}),
  }).select("patientName");
  if (occupied) throw AppError.conflict(`Bed ${bed.number} in ${ward.name} is already occupied by ${occupied.patientName}`);

  return { bed, ward };
}

// Vacated bed (discharge / transfer out) waits for housekeeping
export async function markVacated(tenantId: string, bedId?: string) {
  if (!bedId || !isObjectId(bedId)) return;
  await Bed.updateOne({ _id: bedId, tenantId, status: "Available" }, { $set: { status: "Cleaning" } });
}

// ── Ward CRUD (admin) ─────────────────────────────────────────────────────────

async function assertUniqueName(tenantId: string, name: string, exceptId?: string) {
  const clash = await Ward.findOne({ tenantId, name, ...(exceptId ? { _id: { $ne: exceptId } } : {}) })
    .collation({ locale: "en", strength: 2 });
  if (clash) throw AppError.conflict(`Ward "${name}" already exists`);
}

export async function createWard(tenantId: string, body: Record<string, any>) {
  const name = String(body.name ?? "").trim();
  if (!name) throw AppError.badRequest("Ward name is required");
  await assertUniqueName(tenantId, name);
  const count = await Ward.countDocuments({ tenantId });
  return Ward.create({
    tenantId, name,
    code: String(body.code ?? "").trim(),
    type: assertType(body.type),
    dailyRateIds: body.dailyRateIds === undefined ? [] : await cleanDailyRateIds(tenantId, body.dailyRateIds),
    sortOrder: count,
  });
}

export async function updateWard(tenantId: string, id: string, body: Record<string, any>) {
  if (!isObjectId(id)) throw AppError.notFound("Ward not found");
  const ward = await Ward.findOne({ _id: id, tenantId });
  if (!ward) throw AppError.notFound("Ward not found");

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw AppError.badRequest("Ward name is required");
    if (name !== ward.name) {
      await assertUniqueName(tenantId, name, id);
      // Current inpatients show the new name; discharged stays keep the old one
      await IPDAdmission.updateMany({ tenantId, status: "Active", wardId: id }, { $set: { ward: name } });
      ward.name = name;
    }
  }
  if (body.code !== undefined)      ward.code = String(body.code).trim();
  if (body.type !== undefined)      ward.type = assertType(body.type);
  if (body.dailyRateIds !== undefined) ward.dailyRateIds = await cleanDailyRateIds(tenantId, body.dailyRateIds);
  if (body.sortOrder !== undefined) ward.sortOrder = Number(body.sortOrder) || 0;
  if (body.active !== undefined) {
    if (!body.active && await IPDAdmission.exists({ tenantId, status: "Active", wardId: id })) {
      throw AppError.conflict("Ward has admitted patients — transfer or discharge them first");
    }
    ward.active = !!body.active;
  }
  await ward.save();
  return ward;
}

// Hard delete only for wards never used by an admission; otherwise deactivate
export async function deleteWard(tenantId: string, id: string) {
  if (!isObjectId(id)) throw AppError.notFound("Ward not found");
  const ward = await Ward.findOne({ _id: id, tenantId });
  if (!ward) throw AppError.notFound("Ward not found");
  if (await IPDAdmission.exists({ tenantId, $or: [{ wardId: id }, { "transfers.fromWardId": id }, { "transfers.toWardId": id }] })) {
    throw AppError.conflict("Ward has admission history — deactivate it instead");
  }
  await Bed.deleteMany({ tenantId, wardId: ward._id });
  await ward.deleteOne();
  return { deleted: true };
}

// ── Beds ──────────────────────────────────────────────────────────────────────

// body: { numbers: ["GW-01", ...] } or { prefix: "GW-", from: 1, to: 20, pad: 2 }
export async function addBeds(tenantId: string, wardId: string, body: Record<string, any>) {
  if (!isObjectId(wardId)) throw AppError.notFound("Ward not found");
  const ward = await Ward.findOne({ _id: wardId, tenantId });
  if (!ward) throw AppError.notFound("Ward not found");

  let numbers: string[] = [];
  if (Array.isArray(body.numbers)) {
    numbers = body.numbers.map((n: unknown) => normalizeBed(String(n)));
  } else {
    const from = parseInt(body.from), to = parseInt(body.to);
    const pad = Math.min(Math.max(parseInt(body.pad) || 0, 0), 4);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to < from) throw AppError.badRequest("Invalid bed range");
    if (to - from >= 200) throw AppError.badRequest("Add at most 200 beds at a time");
    const prefix = String(body.prefix ?? "");
    for (let i = from; i <= to; i++) numbers.push(normalizeBed(`${prefix}${String(i).padStart(pad, "0")}`));
  }
  numbers = [...new Set(numbers.filter(Boolean))];
  if (numbers.length === 0) throw AppError.badRequest("No bed numbers given");
  if (numbers.length > 200) throw AppError.badRequest("Add at most 200 beds at a time");

  const existing = new Set((await Bed.find({ tenantId, wardId, number: { $in: numbers } }).select("number").lean()).map((b) => b.number));
  const toCreate = numbers.filter((n) => !existing.has(n));
  if (toCreate.length) {
    await Bed.insertMany(toCreate.map((number) => ({ tenantId, wardId: ward._id, number })), { ordered: false });
  }
  return { added: toCreate.length, skipped: numbers.length - toCreate.length };
}

export async function updateBed(tenantId: string, bedId: string, body: Record<string, any>) {
  if (!isObjectId(bedId)) throw AppError.notFound("Bed not found");
  const bed = await Bed.findOne({ _id: bedId, tenantId });
  if (!bed) throw AppError.notFound("Bed not found");
  const occupied = await IPDAdmission.exists({ tenantId, status: "Active", bedKey: bedKeyForId(bedId) });

  if (body.number !== undefined) {
    const number = normalizeBed(body.number);
    if (!number) throw AppError.badRequest("Bed number is required");
    if (number !== bed.number) {
      if (await Bed.exists({ tenantId, wardId: bed.wardId, number, _id: { $ne: bed._id } })) {
        throw AppError.conflict(`Bed ${number} already exists in this ward`);
      }
      if (occupied) await IPDAdmission.updateOne({ tenantId, status: "Active", bedKey: bedKeyForId(bedId) }, { $set: { bedNumber: number } });
      bed.number = number;
    }
  }
  if (body.active !== undefined) {
    if (!body.active && occupied) throw AppError.conflict("Bed is occupied — transfer or discharge the patient first");
    bed.active = !!body.active;
  }
  await bed.save();
  return bed;
}

// Housekeeping status — nurses/doctors mark beds ready, cleaning or under maintenance
export async function setBedStatus(tenantId: string, bedId: string, status: string) {
  if (!BED_STATUSES.includes(status as BedStatus)) throw AppError.badRequest("Invalid bed status");
  if (!isObjectId(bedId)) throw AppError.notFound("Bed not found");
  if (status !== "Available" && await IPDAdmission.exists({ tenantId, status: "Active", bedKey: bedKeyForId(bedId) })) {
    throw AppError.conflict("Bed is occupied");
  }
  const bed = await Bed.findOneAndUpdate({ _id: bedId, tenantId }, { $set: { status } }, { new: true });
  if (!bed) throw AppError.notFound("Bed not found");
  return bed;
}

export async function deleteBed(tenantId: string, bedId: string) {
  if (!isObjectId(bedId)) throw AppError.notFound("Bed not found");
  if (await IPDAdmission.exists({ tenantId, $or: [{ bedId }, { "transfers.fromBedId": bedId }, { "transfers.toBedId": bedId }] })) {
    throw AppError.conflict("Bed has admission history — deactivate it instead");
  }
  const res = await Bed.deleteOne({ _id: bedId, tenantId });
  if (res.deletedCount === 0) throw AppError.notFound("Bed not found");
  return { deleted: true };
}
