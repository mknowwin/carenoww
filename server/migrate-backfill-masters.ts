/**
 * Migration: backfill the ReferralDoctor and Supplier master collections from
 * historical free-text fields (Appointment.referringDoctor, GRN.supplierName)
 * recorded before those master lookups existed.
 *
 * Run once after deploying:
 *   npm run migrate:masters
 *
 * Safe to re-run — skips any name that already exists (case-insensitive) for
 * that tenant, matching the same dedup rule used by the create routes.
 */

import mongoose from "mongoose";
import { connectDB } from "./db.js";
import Appointment from "./models/Appointment.js";
import GRN from "./models/GRN.js";
import ReferralDoctor from "./models/ReferralDoctor.js";
import Supplier from "./models/Supplier.js";

type NameRow = { _id: { tenantId: mongoose.Types.ObjectId; name: string } };

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function backfillNames(
  label: string,
  rows: NameRow[],
  Model: mongoose.Model<any>,
  buildDoc: (tenantId: mongoose.Types.ObjectId, name: string) => Record<string, any>
) {
  let created = 0;
  let skipped = 0;
  for (const { _id } of rows) {
    const name = _id.name?.trim();
    if (!name) continue;

    const existing = await Model.findOne({
      tenantId: _id.tenantId,
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await Model.create(buildDoc(_id.tenantId, name));
    created++;
  }
  console.log(`  [${label}] created ${created}, already present ${skipped}`);
}

async function run() {
  await connectDB();
  console.log("Backfilling master collections from historical records...\n");

  // ── ReferralDoctor ← Appointment.referringDoctor ─────────────────────────────
  const referralRows: NameRow[] = await Appointment.aggregate([
    { $match: { referringDoctor: { $exists: true, $nin: [null, ""] } } },
    { $group: { _id: { tenantId: "$tenantId", name: "$referringDoctor" } } },
  ]);
  await backfillNames(
    "ReferralDoctor / Appointment.referringDoctor",
    referralRows,
    ReferralDoctor,
    (tenantId, name) => ({ tenantId, name, specialization: "", phone: "", hospital: "" })
  );

  // ── Supplier ← GRN.supplierName ──────────────────────────────────────────────
  const supplierRows: NameRow[] = await GRN.aggregate([
    { $match: { supplierName: { $exists: true, $nin: [null, ""] } } },
    { $group: { _id: { tenantId: "$tenantId", name: "$supplierName" } } },
  ]);
  await backfillNames(
    "Supplier / GRN.supplierName",
    supplierRows,
    Supplier,
    (tenantId, name) => ({ tenantId, name, phone: "", email: "", address: "", gstNo: "" })
  );

  console.log("\n✅ Master collection backfill complete.");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
