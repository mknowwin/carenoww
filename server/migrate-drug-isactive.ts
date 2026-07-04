/**
 * Migration: backfill isActive=true on drug inventory records created before
 * the field existed, so they aren't silently excluded by the inventory list's
 * default { isActive: true } filter.
 *
 * Run once after deploying:
 *   npm run migrate:drug-isactive
 *
 * Safe to re-run — only touches documents missing the field.
 */

import { connectDB } from "./db.js";
import DrugInventory from "./models/DrugInventory.js";

async function run() {
  await connectDB();
  console.log("Backfilling DrugInventory.isActive...\n");

  const result = await DrugInventory.updateMany(
    { isActive: { $exists: false } },
    { $set: { isActive: true } }
  );
  console.log(`  matched ${result.matchedCount}, modified ${result.modifiedCount}`);

  console.log("\n✅ isActive backfill complete.");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
