/**
 * Migration: seed atomic counters for all existing tenants.
 *
 * Covers: patient (UHID), appointment (APT), lab order (LAB), IPD admission (ADM).
 * Pharmacy, billing, GRN, and adjustments already used getNextId — skipped here.
 *
 * Run once after deploying:
 *   npm run migrate:uhid
 *
 * Safe to re-run — uses $max so it only raises a counter, never lowers it.
 */

import { connectDB } from "./db.js";
import Patient from "./models/Patient.js";
import Appointment from "./models/Appointment.js";
import LabOrder from "./models/LabOrder.js";
import IPDAdmission from "./models/IPDAdmission.js";
import Counter from "./models/Counter.js";

type AggRow = { _id: string; maxSeq: number };

async function seedCounter(
  label: string,
  counterName: string,
  rows: AggRow[]
) {
  if (rows.length === 0) {
    console.log(`  [${label}] no existing records — skipped`);
    return;
  }
  for (const { _id: tenantId, maxSeq } of rows) {
    const c = await Counter.findOneAndUpdate(
      { tenantId: tenantId.toString(), name: counterName },
      { $max: { seq: maxSeq } },
      { upsert: true, new: true }
    );
    console.log(`  [${label}] tenant ${tenantId}  →  counter = ${c!.seq}`);
  }
}

async function run() {
  await connectDB();
  console.log("Seeding counters for existing tenants...\n");

  // ── Patient UHID ─────────────────────────────────────────────────────────────
  const patients: AggRow[] = await Patient.aggregate([
    { $match: { uhid: { $regex: /^UHID-\d+$/ } } },
    {
      $group: {
        _id: "$tenantId",
        maxSeq: { $max: { $toInt: { $arrayElemAt: [{ $split: ["$uhid", "-"] }, 1] } } },
      },
    },
  ]);
  await seedCounter("UHID / patient", "patient", patients);

  // ── Appointment APT ──────────────────────────────────────────────────────────
  const appointments: AggRow[] = await Appointment.aggregate([
    { $match: { aptId: { $regex: /^APT-\d+$/ } } },
    {
      $group: {
        _id: "$tenantId",
        maxSeq: { $max: { $toInt: { $arrayElemAt: [{ $split: ["$aptId", "-"] }, 1] } } },
      },
    },
  ]);
  await seedCounter("APT / appointment", "apt", appointments);

  // ── Lab Order LAB ─────────────────────────────────────────────────────────────
  const labOrders: AggRow[] = await LabOrder.aggregate([
    { $match: { labId: { $regex: /^LAB-\d+$/ } } },
    {
      $group: {
        _id: "$tenantId",
        maxSeq: { $max: { $toInt: { $arrayElemAt: [{ $split: ["$labId", "-"] }, 1] } } },
      },
    },
  ]);
  await seedCounter("LAB / lab order", "lab", labOrders);

  // ── IPD Admission ADM ─────────────────────────────────────────────────────────
  const admissions: AggRow[] = await IPDAdmission.aggregate([
    { $match: { admissionId: { $regex: /^ADM-\d+$/ } } },
    {
      $group: {
        _id: "$tenantId",
        maxSeq: { $max: { $toInt: { $arrayElemAt: [{ $split: ["$admissionId", "-"] }, 1] } } },
      },
    },
  ]);
  await seedCounter("ADM / IPD admission", "admission", admissions);

  console.log("\n✅ Counter migration complete.");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
