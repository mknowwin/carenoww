import GovernmentReportSubmission, { GovReportType } from "../models/GovernmentReportSubmission.js";
import { getNextId } from "../lib/counter.js";
import { AppError } from "../lib/AppError.js";
import * as insightsService from "./insightsService.js";
import * as pharmacyReportService from "./pharmacyReportService.js";
import * as grnService from "./grnService.js";
import * as drugBatchService from "./drugBatchService.js";

function addDaysStr(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
function daysBetween(fromStr: string, toStr: string): string[] {
  const days: string[] = [];
  for (let d = fromStr; d <= toStr; d = addDaysStr(d, 1)) days.push(d);
  return days;
}

// Drug sales is only day-scoped in pharmacyReportService — sum it across the period by
// calling it per day (cheap once Part B's rollup covers those days: each call becomes a
// rollup lookup, not a live aggregation) and merging by drugName.
async function periodDrugSales(tenantId: string, tz: string, periodFrom: string, periodTo: string) {
  const days = daysBetween(periodFrom, periodTo);
  const perDay = await Promise.all(days.map((d) => pharmacyReportService.getDrugSalesReport(tenantId, tz, d)));
  const map = new Map<string, { drugName: string; quantity: number; amount: number }>();
  for (const day of perDay) {
    for (const row of day.rows) {
      const existing = map.get(row.drugName);
      if (existing) { existing.quantity += row.quantity; existing.amount += row.amount; }
      else map.set(row.drugName, { ...row });
    }
  }
  const rows = Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  return { rows, totalQuantity: rows.reduce((s, r) => s + r.quantity, 0), totalAmount: rows.reduce((s, r) => s + r.amount, 0) };
}

async function buildSnapshot(tenantId: string, tz: string, reportType: GovReportType, periodFrom: string, periodTo: string) {
  if (reportType === "HMIS-Monthly") {
    const [doctorWise, departmentWise, investigationWise, referralsBySource, referralsByArea] = await Promise.all([
      insightsService.getDoctorWise(tenantId, tz, periodFrom, periodTo),
      insightsService.getDepartmentWise(tenantId, tz, periodFrom, periodTo),
      insightsService.getInvestigationWise(tenantId, tz, periodFrom, periodTo),
      insightsService.getReferralsBySource(tenantId, tz, periodFrom, periodTo),
      insightsService.getReferralsByArea(tenantId, tz, periodFrom, periodTo),
    ]);
    return { doctorWise, departmentWise, investigationWise, referralsBySource, referralsByArea };
  }

  // PharmacyAudit
  const [drugSales, nonMovingDrugs, grn, expiryReport] = await Promise.all([
    periodDrugSales(tenantId, tz, periodFrom, periodTo),
    pharmacyReportService.getNonMovingDrugs(tenantId, 90),
    grnService.listGRNs(tenantId, { from: periodFrom, to: periodTo, limit: "1000" }),
    drugBatchService.getExpiryReport(tenantId, "180", "true"),
  ]);
  return { drugSales, nonMovingDrugs, grns: grn.grns, expiryReport };
}

export async function generateReport(
  tenantId: string, tz: string, userName: string, userId: string,
  reportType: GovReportType, periodFrom: string, periodTo: string
) {
  if (!periodFrom || !periodTo) throw AppError.badRequest("periodFrom and periodTo are required");
  const snapshotData = await buildSnapshot(tenantId, tz, reportType, periodFrom, periodTo);
  const submissionId = await getNextId(tenantId, "govsub", "GOVSUB-");

  return GovernmentReportSubmission.create({
    tenantId, submissionId, reportType, periodFrom, periodTo,
    generatedBy: userName, generatedById: userId,
    snapshotData, status: "Draft",
  });
}

export async function listSubmissions(tenantId: string, filters: { reportType?: string; page?: string; limit?: string }) {
  const { reportType, page = "1", limit = "50" } = filters;
  const query: any = { tenantId };
  if (reportType) query.reportType = reportType;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [submissions, total] = await Promise.all([
    GovernmentReportSubmission.find(query).select("-snapshotData").sort({ generatedAt: -1 }).skip(skip).limit(parseInt(limit)),
    GovernmentReportSubmission.countDocuments(query),
  ]);
  return { submissions, total };
}

export async function getSubmission(tenantId: string, id: string) {
  const submission = await GovernmentReportSubmission.findOne({ _id: id, tenantId });
  if (!submission) throw AppError.notFound("Submission not found");
  return submission;
}

export async function finalizeSubmission(tenantId: string, id: string) {
  const submission = await GovernmentReportSubmission.findOneAndUpdate(
    { _id: id, tenantId, status: "Draft" },
    { $set: { status: "Finalized" } },
    { new: true }
  );
  if (!submission) throw AppError.notFound("Draft submission not found");
  return submission;
}

export async function markSubmitted(tenantId: string, id: string, userName: string, referenceNo: string) {
  const submission = await GovernmentReportSubmission.findOneAndUpdate(
    { _id: id, tenantId, status: { $in: ["Draft", "Finalized"] } },
    { $set: { status: "Submitted", submittedAt: new Date(), submittedBy: userName, referenceNo } },
    { new: true }
  );
  if (!submission) throw AppError.notFound("Submission not found or already submitted");
  return submission;
}
