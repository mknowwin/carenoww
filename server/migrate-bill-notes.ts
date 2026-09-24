/**
 * Migration: convert BillingRecord.notes from a single free-text string to an
 * array of per-author note entries ({ authorId, authorName, text, createdAt }),
 * so notes can be attributed and only edited by their own author.
 *
 * Operates on the raw collection (not the Mongoose model) because the model's
 * schema has already moved to the array shape — reading old string-valued
 * documents through it would fail to cast. Each non-empty string is wrapped
 * into a single note authored by the bill's createdBy/createdById; empty
 * strings become an empty array.
 *
 * Run once after deploying the array-notes support, before traffic hits the
 * new /notes endpoints:
 *   npm run migrate:bill-notes
 *
 * Safe to re-run — only touches documents where `notes` is still a string.
 */

import { connectDB } from "./db.js";
import mongoose from "mongoose";

async function run() {
  await connectDB();
  console.log("Converting BillingRecord.notes string → array...\n");

  const col = mongoose.connection.collection("billingrecords");
  const cursor = col.find({ notes: { $type: "string" } });

  let updated = 0;
  let cleared = 0;

  for await (const doc of cursor) {
    const text = typeof doc.notes === "string" ? doc.notes.trim() : "";
    const notes = text
      ? [{
          _id: new mongoose.Types.ObjectId(),
          authorId: doc.createdById || "",
          authorName: doc.createdBy || "Unknown",
          text,
          createdAt: doc.createdAt || doc.date || new Date(),
        }]
      : [];

    await col.updateOne({ _id: doc._id }, { $set: { notes } });
    if (text) updated++; else cleared++;
  }

  console.log(`  wrapped ${updated} non-empty notes into a single author entry`);
  console.log(`  cleared ${cleared} empty-string notes to []`);
  console.log("\n✅ Bill notes migration complete.");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
