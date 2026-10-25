import mongoose from "mongoose";
import IPDAdmission from "../models/IPDAdmission.js";
import BillingRecord from "../models/BillingRecord.js";
import Ward from "../models/Ward.js";
import ServiceRateMaster from "../models/ServiceRateMaster.js";
import { createOrAppendBill } from "../lib/autoBilling.js";
import { AppError } from "../lib/AppError.js";

// ── Bed charges ───────────────────────────────────────────────────────────────
// Billing rule (hospital policy): CALENDAR DAYS — every date the patient is in a
// bed is charged, including admission and discharge days. A segment is one
// stay in one ward (admission → transfer → … → discharge/now); on a transfer day
// both wards charge that date.
//
// Bed lines live on the admission's IPD bill(s) as items with itemId
// "bed:<segment index>:<ward>". syncBedCharges() tops them up to the days owed
// (adjusting the line on the open bill), so it is safe to call any time:
// opening the Bill tab, on transfer and at discharge. No cron needed.

const BED_ITEM_PREFIX = "bed:";

function calendarDays(from: Date, to: Date, tz: string): number {
  const day = (d: Date) => Date.parse(new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d));
  return Math.max(1, Math.round((day(to) - day(from)) / 86400000) + 1);
}

const fmtDay = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: tz, day: "2-digit", month: "short" }).format(d);

export interface BedSegment {
  key: string;
  wardId: string;
  ward: string;
  bed: string;
  from: Date;
  to: Date;
  ongoing: boolean;
  days: number;
  rateName: string;
  rate: number;          // per day; 0 when the ward has no bed charge linked
  amount: number;
}

async function wardRates(tenantId: string, wardIds: string[], wardNames: string[]) {
  const wards = await Ward.find({
    tenantId,
    $or: [{ _id: { $in: wardIds.filter((id) => mongoose.Types.ObjectId.isValid(id)) } }, { name: { $in: wardNames } }],
  }).lean();
  const rateIds = wards.map((w) => w.bedRateId).filter((id): id is string => !!id && mongoose.Types.ObjectId.isValid(id));
  const rates = await ServiceRateMaster.find({ tenantId, _id: { $in: rateIds } }).lean();
  const rateById = new Map(rates.map((r) => [String(r._id), r]));
  const byId = new Map(wards.map((w) => [String(w._id), w]));
  const byName = new Map(wards.map((w) => [w.name.toUpperCase(), w]));
  return (wardId: string, name: string) => {
    const w = (wardId && byId.get(wardId)) || byName.get(name.toUpperCase());
    const r = w?.bedRateId ? rateById.get(w.bedRateId) : undefined;
    return { wardId: w ? String(w._id) : wardId, rateName: r?.name ?? "", rate: r?.defaultRate ?? 0 };
  };
}

export async function bedSegments(tenantId: string, admission: any, tz: string): Promise<BedSegment[]> {
  const end: Date = admission.dischargeDate ?? new Date();
  const transfers: any[] = [...(admission.transfers ?? [])].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // Ward/bed at admission = first transfer's "from", else the current ward/bed
  const stops: { wardId: string; ward: string; bed: string; from: Date }[] = [{
    wardId: transfers[0]?.fromWardId || (transfers.length ? "" : admission.wardId || ""),
    ward:   transfers[0]?.fromWard   || admission.ward,
    bed:    transfers[0]?.fromBed    || admission.bedNumber,
    from:   new Date(admission.admissionDate),
  }];
  for (const t of transfers) stops.push({ wardId: t.toWardId || "", ward: t.toWard, bed: t.toBed, from: new Date(t.at) });

  const rateFor = await wardRates(tenantId, stops.map((s) => s.wardId), stops.map((s) => s.ward));
  return stops.map((s, i) => {
    const to = i + 1 < stops.length ? stops[i + 1].from : end;
    const { wardId, rateName, rate } = rateFor(s.wardId, s.ward);
    const days = calendarDays(s.from, to, tz);
    return {
      key: `${BED_ITEM_PREFIX}${i}:${wardId || s.ward}`,
      wardId, ward: s.ward, bed: s.bed, from: s.from, to,
      ongoing: i === stops.length - 1 && !admission.dischargeDate,
      days, rateName, rate, amount: days * rate,
    };
  });
}

function bedLineDescription(seg: BedSegment, tz: string) {
  const range = seg.days === 1 ? fmtDay(seg.from, tz) : `${fmtDay(seg.from, tz)} – ${seg.ongoing ? "today" : fmtDay(seg.to, tz)}`;
  return `Bed charges — ${seg.ward} ${seg.bed} (${range})`;
}

function statusFor(amount: number, paid: number) {
  if (paid >= amount) return "Paid";
  if (paid > 0) return "Partial";
  return "Pending";
}

// Bring bed-charge lines on the IPD bill up to date. Returns the segments used.
// `until` charges through a discharge time that isn't saved yet (discharge check).
export async function syncBedCharges(tenantId: string, admissionDbId: string, tz: string, userName: string, until?: Date) {
  const admission = await IPDAdmission.findOne({ _id: admissionDbId, tenantId }).lean();
  if (!admission) throw AppError.notFound("Admission not found");
  const segments = await bedSegments(tenantId, until ? { ...admission, dischargeDate: until } : admission, tz);
  const admissionId = String(admission._id);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const bills = await BillingRecord.find({ tenantId, admissionId, status: { $ne: "Cancelled" } }).sort({ createdAt: 1 }).session(session);

      // Days already billed per segment, across every bill of this admission
      const billed = new Map<string, number>();
      for (const b of bills) for (const it of b.items) {
        if (it.itemId?.startsWith(BED_ITEM_PREFIX)) billed.set(it.itemId, (billed.get(it.itemId) ?? 0) + it.quantity);
      }

      // The bill we may edit: newest one that is not paid, locked or cancelled
      let open = [...bills].reverse().find((b) => b.status !== "Paid" && !b.isLocked) ?? null;
      const newLines: any[] = [];
      let delta = 0;

      for (const seg of segments) {
        if (seg.rate <= 0) continue;
        const diff = seg.days - (billed.get(seg.key) ?? 0);
        const line = open?.items.find((it) => it.itemId === seg.key);
        if (line) {
          const qty = line.quantity + diff;
          const before = line.total;
          line.quantity = Math.max(qty, 0);
          line.unitPrice = seg.rate;
          line.total = line.quantity * seg.rate;
          line.description = bedLineDescription(seg, tz);
          delta += line.total - before;
        } else if (diff > 0) {
          newLines.push({
            itemId: seg.key, description: bedLineDescription(seg, tz), category: "Room",
            quantity: diff, unitPrice: seg.rate, total: diff * seg.rate,
          });
        }
        // diff < 0 with no editable line (already paid/locked): leave it for finance to adjust
      }

      if (open && delta !== 0) {
        open.items = open.items.filter((it) => !(it.itemId?.startsWith(BED_ITEM_PREFIX) && it.quantity === 0)) as any;
        open.amount += delta;
        open.balance = open.amount - open.paid;
        open.status = statusFor(open.amount, open.paid) as any;
        await open.save({ session });
      }
      if (newLines.length) {
        await createOrAppendBill({
          tenantId, patientId: admission.patientId, patientName: admission.patientName,
          admissionId, items: newLines, type: "IPD", createdBy: userName,
        }, session);
      }
    });
  } finally {
    await session.endSession();
  }
  return segments;
}

// ── Bill summary for the chart's Bill tab and the discharge check ────────────
export async function admissionBilling(tenantId: string, admissionDbId: string, tz: string) {
  const admission = await IPDAdmission.findOne({ _id: admissionDbId, tenantId }).lean();
  if (!admission) throw AppError.notFound("Admission not found");
  const [segments, bills] = await Promise.all([
    bedSegments(tenantId, admission, tz),
    BillingRecord.find({ tenantId, admissionId: String(admission._id), status: { $ne: "Cancelled" } }).sort({ createdAt: 1 }).lean(),
  ]);
  const totals = bills.reduce((t, b) => ({ amount: t.amount + b.amount, paid: t.paid + b.paid, balance: t.balance + b.balance }), { amount: 0, paid: 0, balance: 0 });
  return { segments, bills, totals, missingRates: segments.filter((s) => s.rate <= 0).map((s) => s.ward) };
}

export async function outstandingBalance(tenantId: string, admissionDbId: string) {
  const bills = await BillingRecord.find({ tenantId, admissionId: admissionDbId, status: { $ne: "Cancelled" } }).select("balance").lean();
  return bills.reduce((s, b) => s + Math.max(b.balance, 0), 0);
}
