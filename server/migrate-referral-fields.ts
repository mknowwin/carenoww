/**
 * Migration: clean up referral fields on historical appointments so the
 * referral reports agree with each other.
 *
 *  1. Appointments with a referringDoctor but no referralSource (booked before
 *     the Referral Source dropdown existed) get referralSource = "Doctor".
 *     Without this they count in Doctor Referral Stats but not in the
 *     "Referrals by Source" report.
 *  2. Leading/trailing spaces are trimmed from area and referralDetail.
 *  3. Daily rollups for every touched (tenant, date) are recomputed, since
 *     settled days are read from rollups, not from appointments.
 *
 * Run once after deploying, then fill the master lists:
 *   npm run migrate:referral-fields
 *   npm run migrate:masters
 *
 * Pass --dry-run to only print what would change.
 * Safe to re-run — a second run finds nothing to change.
 */

import { connectDB } from "./db.js";
import Appointment from "./models/Appointment.js";
import Tenant from "./models/Tenant.js";
import { refreshTenantDay } from "./services/rollupService.js";

const dryRun = process.argv.includes("--dry-run");

async function run() {
  await connectDB();
  console.log(`Cleaning referral fields on appointments${dryRun ? " (dry run)" : ""}...\n`);

  const touched = new Map<string, Set<string>>(); // tenantId → dates
  const mark = (rows: { tenantId: any; date: string }[]) => {
    for (const r of rows) {
      const t = String(r.tenantId);
      if (!touched.has(t)) touched.set(t, new Set());
      touched.get(t)!.add(r.date);
    }
  };

  // ── 1. Missing source on doctor referrals ───────────────────────────────────
  const noSource = { referringDoctor: { $nin: [null, ""] }, referralSource: { $in: [null, ""] } };
  const noSourceRows = await Appointment.find(noSource).select("tenantId date").lean();
  console.log(`  referralSource ← "Doctor": ${noSourceRows.length} appointment(s)`);
  mark(noSourceRows as any);
  if (!dryRun && noSourceRows.length) {
    await Appointment.updateMany(noSource, { $set: { referralSource: "Doctor" } });
  }

  // ── 2. Untrimmed area / referralDetail ──────────────────────────────────────
  for (const field of ["area", "referralDetail"] as const) {
    const filter = { [field]: { $regex: /^\s|\s$/ } };
    const rows = await Appointment.find(filter).select(`tenantId date ${field}`).lean();
    console.log(`  trim ${field}: ${rows.length} appointment(s)`);
    for (const r of rows as any[]) console.log(`    "${r[field]}" → "${r[field].trim()}"`);
    mark(rows as any);
    if (!dryRun && rows.length) {
      await Appointment.updateMany(filter, [{ $set: { [field]: { $trim: { input: `$${field}` } } } }]);
    }
  }

  // ── 3. Recompute rollups for affected days ──────────────────────────────────
  if (!dryRun) {
    for (const [tenantId, dates] of touched) {
      const tenant = await Tenant.findById(tenantId).select("settings.timezone").lean();
      const tz = (tenant as any)?.settings?.timezone || "Asia/Kolkata";
      for (const date of [...dates].sort()) await refreshTenantDay(tenantId, date, tz);
      console.log(`  rollups refreshed: tenant ${tenantId}, ${dates.size} day(s)`);
    }
  }

  console.log(`\n✅ Referral field cleanup ${dryRun ? "dry run " : ""}complete.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
