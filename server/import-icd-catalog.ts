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

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { inflateRawSync } from "node:zlib";
import mongoose from "mongoose";
import { connectDB } from "./db.js";
import IcdCatalog, { icdWords } from "./models/IcdCatalog.js";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const dryRun = process.argv.includes("--dry-run");
const year = arg("year") ?? "2026";
const file = arg("file");

// "E119" → "E11.9"; 3-character categories stay as-is.
const dotted = (raw: string) => (raw.length > 3 ? `${raw.slice(0, 3)}.${raw.slice(3)}` : raw);

// Extract icd10cm_order_YYYY.txt from the CMS zip in-process (the production image
// has no `unzip`). Reads the central directory, then inflates that one entry.
function unzipOrderFile(zip: Buffer): { text: string; name: string } {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("Not a zip file");
  const entries = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < entries; i++) {
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28), extraLen = zip.readUInt16LE(p + 30), commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const name = zip.toString("latin1", p + 46, p + 46 + nameLen);
    if (/(^|\/)icd10cm_order_20\d{2}\.txt$/i.test(name)) {
      const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
      const data = zip.subarray(dataStart, dataStart + compSize);
      if (method === 0) return { text: data.toString("latin1"), name };
      if (method === 8) return { text: inflateRawSync(data).toString("latin1"), name };
      throw new Error(`Unsupported zip compression method ${method}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("No icd10cm_order_YYYY.txt inside the zip");
}

// Release year from the order file's own name (icd10cm_order_2026.txt), never the
// directory path, which may contain unrelated years.
const releaseYear = (name: string) => name.match(/order_(20\d{2})/i)?.[1] ?? year;

async function loadOrderText(): Promise<{ text: string; version: string }> {
  if (file) {
    const { text, name } = file.toLowerCase().endsWith(".zip")
      ? unzipOrderFile(readFileSync(file))
      : { text: readFileSync(file, "latin1"), name: basename(file) };
    return { text, version: releaseYear(name) };
  }
  const url = `https://www.cms.gov/files/zip/${year}-code-descriptions-tabular-order.zip`;
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} (try --file=)`);
  const { text, name } = unzipOrderFile(Buffer.from(await res.arrayBuffer()));
  return { text, version: releaseYear(name) };
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
