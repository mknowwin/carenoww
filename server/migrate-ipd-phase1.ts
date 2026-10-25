/**
 * Migration: bring existing IPD admissions in line with the Phase 1 IPD fixes.
 *
 *  1. patientId → UHID. Admissions made from the IPD page stored the patient's
 *     Mongo _id; everything else (appointments, Rx, labs, bills) uses the UHID.
 *     Missing age/gender/phone are filled from the Patient record.
 *  2. bedNumber is normalised (trim, uppercase, no spaces) and bedKey is set.
 *  3. Transfer entries that were logged as all-zero "rounds" move to transfers[].
 *  4. The unique "one active patient per bed" / "one active admission per
 *     patient" indexes are created — skipped (and listed) while duplicates exist.
 *  5. Patient.status is recomputed from active admissions: IPD/ICU while
 *     admitted, IPD/ICU labels without an active admission go back to OPD.
 *
 * Run once after deploying:
 *   npm run migrate:ipd-phase1
 *
 * Pass --dry-run to only print what would change.
 * Safe to re-run — a second run finds nothing to change.
 */

import mongoose from "mongoose";
import { connectDB } from "./db.js";
import IPDAdmission from "./models/IPDAdmission.js";
import Patient from "./models/Patient.js";
import { normalizeUhid, normalizeBed, bedKeyFor } from "./services/ipdService.js";

const dryRun = process.argv.includes("--dry-run");

const TRANSFER_NOTE = /^Transferred to (.+?) — Bed (\S+)(?::\s*(.*))?$/;

async function run() {
  await connectDB();
  console.log(`IPD Phase 1 migration${dryRun ? " (dry run)" : ""}...\n`);

  // ── 1–3. Per-admission fixes ────────────────────────────────────────────────
  const admissions = await IPDAdmission.find({}).lean();
  let keyFixed = 0, bedFixed = 0, transfersMoved = 0, unresolved = 0;
  const uhidOf = new Map<string, string>(); // admission _id → resolved UHID (so --dry-run previews step 5 correctly)

  for (const a of admissions as any[]) {
    const set: Record<string, unknown> = {};

    // 1. Patient key
    let patient: any = null;
    if (mongoose.Types.ObjectId.isValid(a.patientId) && !/^\d+$/.test(a.patientId)) {
      patient = await Patient.findOne({ _id: a.patientId, tenantId: a.tenantId }).lean();
      if (patient) {
        set.patientId = patient.uhid;
        keyFixed++;
        console.log(`  ${a.admissionId}: patientId ${a.patientId} → ${patient.uhid}`);
      } else {
        unresolved++;
        console.log(`  ${a.admissionId}: patientId ${a.patientId} — no matching patient, left as is`);
      }
    } else {
      const uhid = normalizeUhid(a.patientId);
      if (uhid !== a.patientId) { set.patientId = uhid; keyFixed++; }
      patient = await Patient.findOne({ uhid, tenantId: a.tenantId }).lean();
    }
    uhidOf.set(String(a._id), (set.patientId as string) ?? a.patientId);
    if (patient) {
      if (!a.patientAge && patient.age)       set.patientAge = patient.age;
      if (!a.patientGender && patient.gender) set.patientGender = patient.gender;
      if (!a.patientPhone && patient.phone)   set.patientPhone = patient.phone;
    }

    // 2. Bed key
    const bed = normalizeBed(a.bedNumber);
    const key = bedKeyFor(a.ward, bed);
    if (bed !== a.bedNumber) set.bedNumber = bed;
    if (key !== a.bedKey) { set.bedKey = key; bedFixed++; }

    // 3. Transfers logged as rounds
    const rounds: any[] = a.rounds ?? [];
    const isTransferRound = (r: any) =>
      TRANSFER_NOTE.test(r.notes ?? "") && !r.bp && !r.pulse && !r.temp && !r.spo2;
    const moved = rounds.filter(isTransferRound);
    if (moved.length) {
      let prevWard = "", prevBed = "";
      const transfers = moved.map((r) => {
        const [, toWard, toBed, reason] = r.notes.match(TRANSFER_NOTE);
        const t = { at: r.roundedAt, fromWard: prevWard, fromBed: prevBed, toWard, toBed, reason: reason ?? "", by: r.nurse ?? "" };
        prevWard = toWard; prevBed = toBed;
        return t;
      });
      set.transfers = [...transfers, ...(a.transfers ?? [])];
      set.rounds = rounds.filter((r) => !isTransferRound(r));
      transfersMoved += moved.length;
      console.log(`  ${a.admissionId}: ${moved.length} transfer(s) moved out of rounds`);
    }

    if (!dryRun && Object.keys(set).length) {
      await IPDAdmission.updateOne({ _id: a._id }, { $set: set });
    }
  }
  console.log(`\n  patientId → UHID: ${keyFixed}  (unresolved: ${unresolved})`);
  console.log(`  bedKey set: ${bedFixed}`);
  console.log(`  transfers moved: ${transfersMoved}\n`);

  // ── 4. Unique indexes ───────────────────────────────────────────────────────
  const dupes = async (field: "$bedKey" | "$patientId") =>
    IPDAdmission.aggregate([
      { $match: { status: "Active" } },
      { $group: { _id: { tenantId: "$tenantId", key: field }, n: { $sum: 1 }, ids: { $push: "$admissionId" } } },
      { $match: { n: { $gt: 1 } } },
    ]);
  const bedDupes = dryRun ? [] : await dupes("$bedKey");
  const patientDupes = dryRun ? [] : await dupes("$patientId");
  for (const d of bedDupes)     console.log(`  ⚠️  bed ${d._id.key} has ${d.n} active admissions: ${d.ids.join(", ")}`);
  for (const d of patientDupes) console.log(`  ⚠️  patient ${d._id.key} has ${d.n} active admissions: ${d.ids.join(", ")}`);

  if (dryRun) {
    console.log("  unique indexes: skipped (dry run)");
  } else if (bedDupes.length || patientDupes.length) {
    console.log("  unique indexes NOT created — transfer or discharge the duplicates above, then re-run.");
  } else {
    await IPDAdmission.createIndexes();
    console.log("  unique indexes: ensured");
  }

  // ── 5. Patient.status from active admissions ───────────────────────────────
  const active = await IPDAdmission.find({ status: "Active" }).select("tenantId patientId ward").lean();
  const admitted = new Map<string, string>(); // tenant|uhid → IPD/ICU
  for (const a of active as any[]) {
    const uhid = uhidOf.get(String(a._id)) ?? normalizeUhid(a.patientId);
    admitted.set(`${a.tenantId}|${uhid}`, String(a.ward).trim().toUpperCase() === "ICU" ? "ICU" : "IPD");
  }

  let statusFixed = 0;
  const labelled = await Patient.find({ status: { $in: ["IPD", "ICU"] } }).select("tenantId uhid status").lean();
  for (const p of labelled as any[]) {
    if (!admitted.has(`${p.tenantId}|${p.uhid}`)) {
      console.log(`  ${p.uhid}: status ${p.status} → OPD (no active admission)`);
      statusFixed++;
      if (!dryRun) await Patient.updateOne({ _id: p._id }, { $set: { status: "OPD" } });
    }
  }
  for (const [k, status] of admitted) {
    const [tenantId, uhid] = k.split("|");
    const p: any = await Patient.findOne({ tenantId, uhid }).select("status").lean();
    if (p && p.status !== status) {
      console.log(`  ${uhid}: status ${p.status} → ${status}`);
      statusFixed++;
      if (!dryRun) await Patient.updateOne({ _id: p._id }, { $set: { status } });
    }
  }
  console.log(`  patient status fixed: ${statusFixed}`);

  console.log(`\n✅ IPD Phase 1 migration ${dryRun ? "dry run " : ""}complete.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
