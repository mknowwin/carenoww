import IcdCode from "../models/IcdCode.js";
import IcdCatalog from "../models/IcdCatalog.js";
import { AppError } from "../lib/AppError.js";
import { escapeRegex } from "./referralMasterService.js";
import { ICD10_COMMON } from "../data/icd10Common.js";

const normCode = (c: unknown) => String(c ?? "").trim().toUpperCase();
const normDesc = (d: unknown) => String(d ?? "").trim();

const LIMIT = 10;

// Typed codes may omit the dot: "e119" → "E11.9".
const looksLikeCode = (q: string) => /^[a-z]\d/i.test(q);
const dottedCode = (q: string) => {
  const c = q.toUpperCase().replace(/\s/g, "");
  return c.length > 3 && c[3] !== "." ? `${c.slice(0, 3)}.${c.slice(3)}` : c;
};

// Filler words in clinical text that shouldn't drive a match ("known case of hyper…").
const STOP_WORDS = new Set([
  "a", "an", "and", "or", "of", "the", "in", "on", "to", "for", "with", "without", "due", "by", "at",
  "is", "as", "known", "case", "k", "c", "h", "o", "hx", "history", "pt", "patient", "c/o", "s/p",
]);
const searchWords = (term: string) =>
  term.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOP_WORDS.has(w));

// Global ICD-10-CM catalogue. Codes by anchored prefix; descriptions by word
// prefixes (every typed word must start a word in the description), both indexed.
export async function searchIcdCatalog(q: string, limit = LIMIT) {
  const term = q.trim().toLowerCase();
  if (term.length < 2) return [];

  if (looksLikeCode(term)) {
    return IcdCatalog.find({ code: { $regex: `^${escapeRegex(dottedCode(term))}` } })
      .select("code description billable").sort({ code: 1 }).limit(limit).lean();
  }

  const words = searchWords(term);
  if (words.length === 0) return [];
  const rows = await IcdCatalog.find({ $and: words.map((w) => ({ words: { $regex: `^${escapeRegex(w)}` } })) })
    .select("code description billable").limit(300).lean();

  // Description starting with the typed text first, then broader (shorter) codes.
  const rank = (r: { description: string }) => (r.description.toLowerCase().startsWith(term) ? 0 : 1);
  return rows
    .sort((a, b) => rank(a) - rank(b) || a.code.length - b.code.length || a.code.localeCompare(b.code))
    .slice(0, limit);
}

export async function getCatalogInfo() {
  const [count, latest] = await Promise.all([
    IcdCatalog.estimatedDocumentCount(),
    IcdCatalog.findOne().select("version").lean(),
  ]);
  return { count, version: latest?.version ?? null };
}

export async function lookupCatalogCode(code: string) {
  return IcdCatalog.findOne({ code: dottedCode(code) }).select("code description billable").lean();
}

// Suggestions for SOAP Assessment: this hospital's own active codes first
// (favourites / custom), then the global catalogue, minus codes the hospital switched off.
export async function suggestIcdCodes(tenantId: string, q?: string) {
  // "known case of hyper" → try the whole text, then drop leading words until something matches.
  const words = (q ?? "").trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const term = words.slice(i).join(" ");
    if (!looksLikeCode(term) && searchWords(term).length === 0) break;
    const rows = await suggestForTerm(tenantId, term);
    if (rows.length > 0) return rows;
  }
  return [];
}

async function suggestForTerm(tenantId: string, q: string) {
  const own = await searchIcdCodes(tenantId, q);
  const out: { code: string; description: string; source: "hospital" | "catalog" }[] =
    own.map((r) => ({ code: r.code, description: r.description, source: "hospital" }));
  if (!q?.trim() || out.length >= LIMIT) return out;

  const catalog = await searchIcdCatalog(q, LIMIT * 2);
  const taken = new Set(out.map((r) => r.code));
  const hidden = new Set(
    (await IcdCode.find({ tenantId, active: false, code: { $in: catalog.map((c) => c.code) } }).select("code").lean())
      .map((r) => r.code)
  );
  for (const c of catalog) {
    if (out.length >= LIMIT) break;
    if (taken.has(c.code) || hidden.has(c.code)) continue;
    out.push({ code: c.code, description: c.description, source: "catalog" });
  }
  return out;
}

// Hospital list only — code-prefix matches first (typing "E11"), then description matches ("diab").
export async function searchIcdCodes(tenantId: string, q?: string) {
  const term = q?.trim();
  if (!term) return IcdCode.find({ tenantId, active: true }).sort({ code: 1 }).limit(10).lean();

  const codeRx = escapeRegex(looksLikeCode(term) ? dottedCode(term) : term);
  const byCode = await IcdCode.find({ tenantId, active: true, code: { $regex: `^${codeRx}`, $options: "i" } })
    .sort({ code: 1 }).limit(10).lean();
  if (byCode.length >= 10) return byCode;

  // Every typed word must start a word of the description: "fracture fem" ↔ "Fracture of femur".
  const words = searchWords(term);
  if (words.length === 0) return byCode;
  const byDesc = await IcdCode.find({
    tenantId,
    active: true,
    _id: { $nin: byCode.map((c) => c._id) },
    $and: words.map((w) => ({ description: { $regex: `(^|[^a-z0-9])${escapeRegex(w)}`, $options: "i" } })),
  }).sort({ description: 1 }).limit(10 - byCode.length).lean();
  return [...byCode, ...byDesc];
}

export async function listIcdCodes(tenantId: string) {
  return IcdCode.find({ tenantId }).sort({ code: 1 }).lean();
}

export async function createIcdCode(tenantId: string, body: Record<string, any>) {
  const code = normCode(body.code);
  const description = normDesc(body.description);
  if (!code || !description) throw AppError.badRequest("Code and description are required");

  if (await IcdCode.exists({ tenantId, code })) throw AppError.conflict(`ICD code "${code}" already exists`);
  return IcdCode.create({ tenantId, code, description });
}

export async function updateIcdCode(tenantId: string, id: string, body: Record<string, any>) {
  const icd = await IcdCode.findOne({ _id: id, tenantId });
  if (!icd) throw AppError.notFound("ICD code not found");

  if (body.code !== undefined) {
    const code = normCode(body.code);
    if (!code) throw AppError.badRequest("Code is required");
    if (code !== icd.code && await IcdCode.exists({ tenantId, code, _id: { $ne: icd._id } })) {
      throw AppError.conflict(`ICD code "${code}" already exists`);
    }
    icd.code = code;
  }
  if (body.description !== undefined) {
    const description = normDesc(body.description);
    if (!description) throw AppError.badRequest("Description is required");
    icd.description = description;
  }
  if (body.active !== undefined) icd.active = !!body.active;

  await icd.save();
  return icd;
}

// SOAP notes keep the code as plain text, so deleting never orphans a record.
export async function deleteIcdCode(tenantId: string, id: string) {
  const icd = await IcdCode.findOneAndDelete({ _id: id, tenantId });
  if (!icd) throw AppError.notFound("ICD code not found");
  return { _id: icd._id };
}

// Upsert by code. With overwrite=false, existing codes are left untouched (used for seeding).
export async function importIcdCodes(tenantId: string, rows: unknown, overwrite = true) {
  if (!Array.isArray(rows)) throw AppError.badRequest("rows must be an array");

  const clean = new Map<string, string>();
  for (const r of rows as any[]) {
    const code = normCode(r?.code);
    const description = normDesc(r?.description);
    if (code && description) clean.set(code, description);
  }
  if (clean.size === 0) return { added: 0, updated: 0 };

  const ops = [...clean].map(([code, description]) => ({
    updateOne: {
      filter: { tenantId, code },
      update: overwrite
        ? { $set: { description }, $setOnInsert: { tenantId, code, active: true } }
        : { $setOnInsert: { tenantId, code, description, active: true } },
      upsert: true,
    },
  }));
  const res = await IcdCode.bulkWrite(ops as any, { ordered: false });
  return { added: res.upsertedCount, updated: overwrite ? res.modifiedCount : 0 };
}

export async function seedCommonIcdCodes(tenantId: string) {
  return importIcdCodes(tenantId, ICD10_COMMON, false);
}
