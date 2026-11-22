/**
 * Read-only stock investigation for one drug: prints its reconciliation,
 * findings ("why is stock N?") and full ledger — the same data as
 * Pharmacy → Drug Tracking.
 *
 *   npm run drug:ledger -- --tenant=pugazh --drug="Atorite F"
 *   npm run drug:ledger -- --tenant=pugazh --drug="Atorite F" --from=2026-11-01 --to=2026-11-30
 *   npm run drug:ledger -- --tenant=pugazh --drug="Atorite F" --full     (every ledger row, not just the last 40)
 *
 * In the production container:
 *   docker exec <ctr> node scripts/run-script.mjs drug-ledger --tenant=pugazh --drug="Atorite F"
 *
 * --tenant takes the tenant slug, id or part of its name; --drug a drug id or
 * part of its name. Never writes to the database.
 */
import { connectDB } from "./db.js";
import { getDrugTracking, findDrugForCli } from "./services/drugTrackingService.js";

function parseArgs() {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] ?? "true";
  }
  return args;
}

const pad = (s: unknown, n: number) => String(s ?? "").slice(0, n).padEnd(n);
const lpad = (s: unknown, n: number) => String(s ?? "").slice(0, n).padStart(n);

async function run() {
  const args = parseArgs();
  if (!args.tenant || !args.drug) {
    console.error('Usage: npm run drug:ledger -- --tenant=<slug|id|name> --drug="<name|id>" [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--full]');
    process.exit(1);
  }
  await connectDB();
  const { tenant, drugs } = await findDrugForCli(args.tenant, args.drug);
  if (!drugs.length) throw new Error(`No drug matching "${args.drug}" in ${tenant.name}`);
  if (drugs.length > 1) {
    console.log(`Several drugs match "${args.drug}" in ${tenant.name} — pass the id or a more exact name:`);
    for (const d of drugs) console.log(`  ${d._id}  ${d.name}  (stock ${d.stock})`);
    process.exit(1);
  }

  const tz = tenant.settings?.timezone || "Asia/Kolkata";
  const t = await getDrugTracking(String(tenant._id), String(drugs[0]._id), {
    from: args.from || "2000-01-01", to: args.to, tz,
  });

  console.log(`\n${t.drug.name}  —  ${tenant.name}`);
  console.log(`Stock on hand: ${t.drug.stock} ${t.drug.unit}   reorder level ${t.drug.reorderLevel}   ${t.drug.isBatchTracked ? "batch-tracked" : "not batch-tracked"}${t.drug.isActive ? "" : "   (INACTIVE)"}`);
  console.log(`Period ${t.period.from} → ${t.period.to}\n`);

  const s = t.summary;
  console.log("Reconciliation");
  console.log(`  Opening ${s.opening}  + received ${s.received}  − sold ${s.sold}  + cancelled ${s.cancelled}  + returned ${s.returned}  ± adjusted ${s.adjusted}  ± bill edits ${s.billEdited}  = closing ${s.closing}`);
  console.log(`  Expected now ${s.expectedNow}   actual ${s.actualStock}${s.held ? ` + ${s.held} held (Expired/Quarantine)` : ""}   unexplained ${s.unexplained}\n`);

  console.log("Findings");
  for (const f of t.findings) console.log(`  [${f.level.toUpperCase()}] ${f.title}\n      ${f.detail}`);

  console.log("\nBatches");
  for (const b of t.batches) {
    console.log(`  ${pad(b.batchNo, 14)} ${pad(b.grnNo, 10)} received ${lpad(b.quantityReceived, 5)}  remaining ${lpad(b.quantityRemaining, 5)}  ${pad(b.status, 10)} exp ${b.expiryDate ? new Date(b.expiryDate).toISOString().slice(0, 10) : "-"}`);
  }

  const rows = args.full ? t.ledger : t.ledger.slice(-40);
  console.log(`\nLedger${args.full ? "" : ` (last ${rows.length} of ${t.ledger.length}; --full for all)`}`);
  console.log(`  ${pad("Date", 10)} ${pad("Type", 10)} ${pad("Ref", 12)} ${pad("Party", 22)} ${pad("Batch", 12)} ${lpad("Qty", 7)} ${lpad("Balance", 8)}  Note`);
  for (const r of rows) {
    console.log(`  ${pad(r.date, 10)} ${pad(r.type, 10)} ${pad(r.ref, 12)} ${pad(r.party, 22)} ${pad(r.batchNo, 12)} ${lpad(r.qty > 0 ? `+${r.qty}` : r.qty, 7)} ${lpad(r.balance, 8)}  ${r.note}`);
  }
  console.log("");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ drug-ledger failed:", err.message || err);
  process.exit(1);
});
