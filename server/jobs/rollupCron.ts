import cron from "node-cron";
import { refreshAllTenants } from "../services/rollupService.js";

// Single-process overlap guard — if a cycle ever runs longer than its own interval,
// skip the next tick rather than running two refreshes concurrently. Not distributed-
// safe, but irrelevant at today's single-container deployment (see plan Part B3).
function guarded(label: string, fn: () => Promise<void>) {
  let running = false;
  return async () => {
    if (running) {
      console.warn(`[rollupCron] ${label} still running, skipping this tick`);
      return;
    }
    running = true;
    try {
      await fn();
    } catch (err) {
      console.error(`[rollupCron] ${label} failed:`, err);
    } finally {
      running = false;
    }
  };
}

export function startRollupCron() {
  // Every 15 min: refresh "today" only, all tenants. Purely a pre-warm — the read
  // path never trusts a "provisional" rollup doc, so this is never load-bearing
  // for correctness, just keeps a cached today-snapshot warm for future consumers.
  cron.schedule("*/15 * * * *", guarded("today-refresh", () => refreshAllTenants({ scope: "today" })));

  // Once daily, off-peak: finalize a trailing 7-day window ending yesterday. This
  // self-heals late corrections to recent history without hooking every mutation
  // call site — see plan Part B3 for why 7 days vs. a dirty-marker approach.
  cron.schedule("20 0 * * *", guarded("finalize-window", () => refreshAllTenants({ scope: "finalize" })));

  console.log("🕒 Rollup cron scheduled (today: */15 * * * *, finalize: 20 0 * * *)");
}
