/**
 * Migration: give every bill line its own _id.
 *
 * Before the fix in deductAndExpandPharmacyItems, finalizing a draft (or any
 * re-sent saved line) whose quantity was split across several batches (FEFO)
 * copied the original line's _id onto every batch line. The return screen keys
 * lines by _id, so selecting one of them selected both with the same quantity.
 *
 * For each bill with repeated (or missing) line _ids, the first line keeps the
 * _id and the later ones get new ids. Existing returns stay correct: the
 * server always matched a return's itemId to the first line with that _id.
 *
 *   npm run migrate:bill-item-ids -- --dry-run
 *   npm run migrate:bill-item-ids
 *
 * Safe to re-run — bills whose line ids are already unique are not touched.
 */

import { connectDB } from "./db.js";
import mongoose from "mongoose";

const dryRun = process.argv.includes("--dry-run");

async function run() {
  await connectDB();
  console.log(`Checking bill line ids${dryRun ? " (dry run — nothing is written)" : ""}...\n`);

  const col = mongoose.connection.collection("billingrecords");
  const cursor = col.find({ "items.1": { $exists: true } }, { projection: { billId: 1, items: 1 } });

  let bills = 0;
  let lines = 0;
  let skipped = 0;
  for await (const doc of cursor) {
    const seen = new Set<string>();
    let changed = 0;
    const items = (doc.items ?? []).map((it: any) => {
      const id = it._id?.toString();
      if (id && !seen.has(id)) { seen.add(id); return it; }
      changed++;
      const fresh = new mongoose.Types.ObjectId();
      seen.add(fresh.toString());
      return { ...it, _id: fresh };
    });
    if (!changed) continue;

    if (!dryRun) {
      // Only write if the bill's lines are exactly as read, so an edit made
      // while the script runs is never overwritten. A skipped bill is picked
      // up by running the script again.
      const res = await col.updateOne({ _id: doc._id, items: doc.items }, { $set: { items } });
      if (!res.modifiedCount) {
        skipped++;
        console.log(`  ${doc.billId}: changed while running — skipped, run again`);
        continue;
      }
    }
    bills++;
    lines += changed;
    console.log(`  ${doc.billId}: ${changed} line(s) get a new id`);
  }

  console.log(`\n${dryRun ? "Would fix" : "Fixed"} ${lines} line(s) on ${bills} bill(s).`);
  if (skipped) console.log(`${skipped} bill(s) changed while running — run the script again.`);
  console.log("✅ Bill line id migration complete.");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
