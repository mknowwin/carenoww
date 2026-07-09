/**
 * Migration: backfill payments[].receivedById on bills created before the
 * field existed, by matching each payment's receivedBy name to a User in
 * the same tenant.
 *
 * Entries whose receivedBy name matches zero or 2+ users in the tenant are
 * left unset and logged (ambiguous/duplicate names, or the user was since
 * deleted) — these won't appear in that staff member's self-scoped "My Bill
 * Report" until resolved, but are unaffected everywhere else (printed bills
 * and the admin/finance full report both still work off the receivedBy name).
 *
 * Run once after deploying receivedById support, before enabling self-scoped
 * staff report access:
 *   npm run migrate:receivedby-id
 *
 * Safe to re-run — only touches payment entries missing receivedById.
 */

import { connectDB } from "./db.js";
import BillingRecord from "./models/BillingRecord.js";
import User from "./models/User.js";

async function run() {
  await connectDB();
  console.log("Backfilling payments[].receivedById...\n");

  const bills = await BillingRecord.find({
    payments: { $elemMatch: { receivedBy: { $nin: [null, ""] }, receivedById: { $in: [null, ""] } } },
  });

  let updated = 0;
  let skippedNoMatch = 0;
  let skippedAmbiguous = 0;
  const userCache = new Map<string, any[]>();

  for (const bill of bills) {
    const tenantKey = String(bill.tenantId);
    if (!userCache.has(tenantKey)) {
      userCache.set(tenantKey, await User.find({ tenantId: bill.tenantId }).lean());
    }
    const tenantUsers = userCache.get(tenantKey)!;

    let dirty = false;
    for (const p of bill.payments as any[]) {
      if (p.receivedById || !p.receivedBy) continue;
      const matches = tenantUsers.filter((u) => u.name === p.receivedBy);
      if (matches.length === 1) {
        p.receivedById = String(matches[0]._id);
        dirty = true;
        updated++;
      } else if (matches.length === 0) {
        skippedNoMatch++;
        console.log(`  no match: bill ${bill.billId} payment ${p.paymentId} receivedBy="${p.receivedBy}"`);
      } else {
        skippedAmbiguous++;
        console.log(`  ambiguous (${matches.length} users): bill ${bill.billId} payment ${p.paymentId} receivedBy="${p.receivedBy}"`);
      }
    }
    if (dirty) await bill.save();
  }

  console.log(`\n  updated ${updated} payment entries`);
  console.log(`  skipped (no matching user) ${skippedNoMatch}`);
  console.log(`  skipped (ambiguous — multiple users share the name) ${skippedAmbiguous}`);

  console.log("\n✅ receivedById backfill complete.");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
