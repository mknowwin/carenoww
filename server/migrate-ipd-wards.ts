/**
 * Migration: build the ward & bed master from existing IPD admissions.
 *
 *  1. Every ward name used on an admission becomes a Ward (type inferred from
 *     the old fixed list: "ICU" → ICU, "Private Ward" → Private, …).
 *  2. Every bed number used in that ward becomes a Bed.
 *  3. Admissions get wardId / bedId; active ones switch to the "BED:<id>"
 *     occupancy key so the unique active-bed index follows the bed master.
 *
 * Tenants that never used IPD get nothing — their admin sets up wards in
 * Settings → Wards & Beds. Beds created here only cover beds that were used;
 * add the rest in Settings (dashboard occupancy counts master beds only).
 *
 * Run once after deploying, after migrate:ipd-phase1:
 *   npm run migrate:ipd-wards
 *
 * Pass --dry-run to only print what would change.
 * Safe to re-run — existing wards/beds are reused, linked admissions skipped.
 */

import { connectDB } from "./db.js";
import IPDAdmission from "./models/IPDAdmission.js";
import Ward, { WardType } from "./models/Ward.js";
import Bed from "./models/Bed.js";
import { normalizeBed, bedKeyForId } from "./services/wardService.js";

const dryRun = process.argv.includes("--dry-run");

const LEGACY_TYPES: Record<string, WardType> = {
  "ICU": "ICU", "GENERAL WARD": "General", "PRIVATE WARD": "Private",
  "SEMI-PRIVATE": "Semi-Private", "OBS/GYN": "Obs/Gyn", "PEDIATRIC": "Pediatric",
};
const inferType = (name: string): WardType =>
  LEGACY_TYPES[name.toUpperCase()] ?? (/\bICU\b/i.test(name) ? "ICU" : "General");

async function run() {
  await connectDB();
  console.log(`IPD ward & bed master migration${dryRun ? " (dry run)" : ""}...\n`);

  const tenantIds: string[] = (await IPDAdmission.distinct("tenantId")).map(String);
  let wardsCreated = 0, bedsCreated = 0, linked = 0, conflicts = 0;

  for (const tenantId of tenantIds) {
    const admissions = await IPDAdmission.find({ tenantId, $or: [{ bedId: { $in: ["", null] } }, { bedId: { $exists: false } }] })
      .select("admissionId ward bedNumber status")
      .sort({ admissionDate: -1 })   // newest first, so a new ward takes the latest spelling
      .lean();
    if (admissions.length === 0) continue;
    console.log(`Tenant ${tenantId}: ${admissions.length} admission(s) to link`);

    const wardIds = new Map<string, string>();   // upper(name) → wardId
    const bedIds = new Map<string, string>();    // wardId|number → bedId
    let sortOrder = await Ward.countDocuments({ tenantId });

    for (const a of admissions) {
      const wardName = String(a.ward ?? "").trim();
      const number = normalizeBed(a.bedNumber);
      if (!wardName || !number) { console.log(`  ${a.admissionId}: missing ward/bed — skipped`); continue; }

      // 1. Ward
      let wardId = wardIds.get(wardName.toUpperCase());
      if (!wardId) {
        const existing = await Ward.findOne({ tenantId, name: wardName }).collation({ locale: "en", strength: 2 });
        if (existing) {
          wardId = String(existing._id);
        } else {
          wardsCreated++;
          console.log(`  + ward "${wardName}" (${inferType(wardName)})`);
          wardId = dryRun ? `new:${wardName}` : String((await Ward.create({ tenantId, name: wardName, type: inferType(wardName), sortOrder: sortOrder++ }))._id);
        }
        wardIds.set(wardName.toUpperCase(), wardId);
      }

      // 2. Bed
      const bedMapKey = `${wardId}|${number}`;
      let bedId = bedIds.get(bedMapKey);
      if (!bedId) {
        const existing = wardId.startsWith("new:") ? null : await Bed.findOne({ tenantId, wardId, number });
        if (existing) {
          bedId = String(existing._id);
        } else {
          bedsCreated++;
          bedId = dryRun ? `new:${bedMapKey}` : String((await Bed.create({ tenantId, wardId, number }))._id);
        }
        bedIds.set(bedMapKey, bedId);
      }

      // 3. Link admission
      linked++;
      if (dryRun) continue;
      const set: Record<string, unknown> = { wardId, bedId, bedNumber: number };
      if (a.status === "Active") set.bedKey = bedKeyForId(bedId);
      try {
        await IPDAdmission.updateOne({ _id: a._id }, { $set: set });
      } catch (err: any) {
        if (err?.code !== 11000) throw err;
        conflicts++; linked--;
        console.log(`  ⚠️  ${a.admissionId}: another active admission already holds ${wardName} ${number} — left unlinked, transfer it manually`);
      }
    }
  }

  console.log(`\n  wards created: ${wardsCreated}`);
  console.log(`  beds created: ${bedsCreated}`);
  console.log(`  admissions linked: ${linked}${conflicts ? `  (conflicts: ${conflicts})` : ""}`);
  console.log(`\n✅ Ward & bed migration ${dryRun ? "dry run " : ""}complete.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
