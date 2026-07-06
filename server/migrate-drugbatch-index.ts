/**
 * Migration: drop the old tenant-wide unique index on DrugBatch (tenantId, batchNo).
 *
 * That index blocked the same drug + batch number from ever being received again
 * in a later GRN. The model now defines a narrower unique index scoped to
 * (tenantId, grnId, drugId, batchNo), which Mongoose's autoIndex will create on
 * next connect — but autoIndex only adds missing indexes, it never drops ones
 * that no longer match the schema, so the stale index must be removed explicitly.
 *
 * Run once after deploying:
 *   npm run migrate:drugbatch-index
 *
 * Safe to re-run — no-ops if the old index is already gone.
 */

import { connectDB } from "./db.js";
import DrugBatch from "./models/DrugBatch.js";

const OLD_INDEX_NAME = "tenantId_1_batchNo_1";

async function run() {
  await connectDB();

  const indexes = await DrugBatch.collection.indexes();
  const exists = indexes.some((i) => i.name === OLD_INDEX_NAME);

  if (!exists) {
    console.log(`Index ${OLD_INDEX_NAME} not found — already migrated, skipped.`);
  } else {
    await DrugBatch.collection.dropIndex(OLD_INDEX_NAME);
    console.log(`Dropped stale index ${OLD_INDEX_NAME}.`);
  }

  await DrugBatch.syncIndexes();
  console.log("✅ DrugBatch indexes synced.");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
