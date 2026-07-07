import mongoose from "mongoose";
import { gzipSync, gunzipSync } from "zlib";
import { EJSON } from "bson";
import { AppError } from "../lib/AppError.js";

export interface BackupResult {
  fileName: string;
  fileType: string;
  fileData: string;
  sizeBytes: number;
  collectionCount: number;
  documentCount: number;
  generatedAt: string;
}

export interface RestoreResult {
  restoredCollections: number;
  restoredDocuments: number;
}

// Dumps every collection in the connected database to a single gzip-compressed
// EJSON file — a JS-native equivalent of `mongodump --archive --gzip` that needs
// no external binary, since the mongodb-database-tools CLI isn't bundled here.
export async function createBackup(): Promise<BackupResult> {
  const db = mongoose.connection.db;
  if (!db) {
    throw new AppError("DB_ERROR", { message: "Database connection is not available" });
  }

  const collections = await db.listCollections().toArray();
  const dump: Record<string, unknown[]> = {};
  let documentCount = 0;

  for (const { name } of collections) {
    if (name.startsWith("system.")) continue;
    const docs = await db.collection(name).find({}).toArray();
    dump[name] = docs;
    documentCount += docs.length;
  }

  const gzipped = gzipSync(Buffer.from(EJSON.stringify(dump), "utf-8"));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  return {
    fileName: `carenoww-backup-${timestamp}.json.gz`,
    fileType: "application/gzip",
    fileData: gzipped.toString("base64"),
    sizeBytes: gzipped.length,
    collectionCount: Object.keys(dump).length,
    documentCount,
    generatedAt: new Date().toISOString(),
  };
}

// Restores a dump produced by createBackup(): replaces the contents of every
// collection named in the archive with the documents it contains. Destructive —
// existing documents in those collections are deleted before the restore.
export async function restoreBackup(fileDataBase64: string): Promise<RestoreResult> {
  if (!fileDataBase64) {
    throw AppError.badRequest("No backup file provided");
  }

  const db = mongoose.connection.db;
  if (!db) {
    throw new AppError("DB_ERROR", { message: "Database connection is not available" });
  }

  let dump: unknown;
  try {
    const json = gunzipSync(Buffer.from(fileDataBase64, "base64")).toString("utf-8");
    dump = EJSON.parse(json);
  } catch {
    throw AppError.badRequest("The uploaded file is not a valid Carenoww backup archive");
  }

  if (!dump || typeof dump !== "object" || Array.isArray(dump)) {
    throw AppError.badRequest("The uploaded file is not a valid Carenoww backup archive");
  }

  const entries = Object.entries(dump as Record<string, unknown>).filter(
    (entry): entry is [string, unknown[]] => Array.isArray(entry[1])
  );
  if (entries.length === 0) {
    throw AppError.badRequest("The uploaded file contains no collections to restore");
  }

  let restoredDocuments = 0;
  for (const [name, docs] of entries) {
    await db.collection(name).deleteMany({});
    if (docs.length > 0) {
      await db.collection(name).insertMany(docs as any[], { ordered: false });
    }
    restoredDocuments += docs.length;
  }

  return { restoredCollections: entries.length, restoredDocuments };
}
