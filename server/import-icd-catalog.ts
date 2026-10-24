/**
 * Import the complete ICD-10-CM code set (CMS, public domain) into the global
 * IcdCatalog collection shared by all tenants.
 *
 *   npm run icd:import                       # download CMS FY2026 order file
 *   npm run icd:import -- --year=2027        # a newer release
 *   npm run icd:import -- --file=/path/icd10cm_order_2026.txt   # offline (.txt or .zip)
 *   npm run icd:import -- --dry-run
 *
 * Safe to re-run: upserts by code, then removes codes no longer in the release.
 * Includes category headings (billable=false) as well as full billable codes.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mongoose from "mongoose";
import { connectDB } from "./db.js";
import IcdCatalog, { icdWords } from "./models/IcdCatalog.js";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const dryRun = process.argv.includes("--dry-run");
const year = arg("year") ?? "2026";
const file = arg("file");

// "E119" → "E11.9"; 3-character categories stay as-is.
const dotted = (raw: string) => (raw.length > 3 ? `${raw.slice(0, 3)}.${raw.slice(3)}` : raw);

// Pattern (not -Z1 listing) so it works with both Info-ZIP and BusyBox unzip (Alpine image).
function unzipOrderFile(zipPath: string) {
  const text = execFileSync("unzip", ["-p", zipPath, "*icd10cm_order_20[0-9][0-9].txt"], {
    encoding: "latin1",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!text.trim()) throw new Error(`No icd10cm_order_YYYY.txt inside ${zipPath}`);
  return text;
}

async function loadOrderText(): Promise<{ text: string; version: string }> {
  if (file) {
    const version = file.match(/(20\d{2})/)?.[1] ?? year;
    const text = file.toLowerCase().endsWith(".zip") ? unzipOrderFile(file) : readFileSync(file, "latin1");
    return { text, version };
  }
  const url = `https://www.cms.gov/files/zip/${year}-code-descriptions-tabular-order.zip`;
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} (try --file=)`);
  const dir = mkdtempSync(join(tmpdir(), "icd-"));
  try {
    const zipPath = join(dir, "icd.zip");
    writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
    return { text: unzipOrderFile(zipPath), version: year };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Fixed-width order file: order(5) sp code(7) sp billable(1) sp short(60) sp long
function parse(text: string) {
  const rows: { code: string; description: string; billable: boolean }[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.length < 16) continue;
    const code = line.slice(6, 13).trim();
    const description = (line.slice(77).trim() || line.slice(16, 76).trim());
    if (!code || !description) continue;
    rows.push({ code: dotted(code), description, billable: line[14] === "1" });
  }
  return rows;
}

(async () => {
  const { text, version } = await loadOrderText();
  const rows = parse(text);
  console.log(`Parsed ${rows.length} codes (${rows.filter((r) => r.billable).length} billable) from ICD-10-CM ${version}`);
  if (rows.length < 50_000) throw new Error("Unexpectedly few codes — wrong file?");
  if (dryRun) { console.log("Dry run — sample:", rows.slice(0, 3)); process.exit(0); }

  await connectDB();
  await IcdCatalog.syncIndexes();

  const BATCH = 5000;
  let upserted = 0, modified = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const ops = rows.slice(i, i + BATCH).map((r) => ({
      updateOne: {
        filter: { code: r.code },
        update: { $set: { ...r, words: icdWords(r.description), version } },
        upsert: true,
      },
    }));
    const res = await IcdCatalog.bulkWrite(ops, { ordered: false });
    upserted += res.upsertedCount;
    modified += res.modifiedCount;
    process.stdout.write(`\r  ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  const removed = await IcdCatalog.deleteMany({ version: { $ne: version } });
  console.log(`\nDone: ${upserted} added, ${modified} updated, ${removed.deletedCount} removed (not in ${version}).`);

  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
