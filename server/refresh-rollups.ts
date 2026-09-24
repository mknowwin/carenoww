/**
 * Manual rollup refresh / backfill script.
 *
 * Run once after deploying the materialized-view reporting layer to backfill
 * history (rollup docs only exist for days this has been run for):
 *   npm run rollup:backfill -- --from=2026-05-01 --to=2026-08-11
 *
 * Or recompute a single day (e.g. after a late correction older than the
 * nightly finalize job's trailing 7-day window):
 *   npm run rollup:refresh -- --date=2026-08-11
 *
 * With no args, refreshes "today" for every active tenant — the same thing
 * the 15-min cron does, useful for a manual nudge in dev.
 *
 * Safe to re-run — every run recomputes from source truth and upserts.
 */

import { connectDB } from "./db.js";
import { refreshAllTenants } from "./services/rollupService.js";

function parseArgs() {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

async function run() {
  await connectDB();
  const { date, from, to } = parseArgs();

  if (from && to) {
    console.log(`Backfilling rollups from ${from} to ${to}...`);
    await refreshAllTenants({ scope: "backfill", from, to });
  } else if (date) {
    console.log(`Refreshing rollup for ${date}...`);
    await refreshAllTenants({ scope: "backfill", from: date, to: date });
  } else {
    console.log("Refreshing today's rollup for all active tenants...");
    await refreshAllTenants({ scope: "today" });
  }

  console.log("\n✅ Rollup refresh complete.");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Rollup refresh failed:", err);
  process.exit(1);
});
