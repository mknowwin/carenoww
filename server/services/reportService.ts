import Report from "../models/Report.js";
import { AppError } from "../lib/AppError.js";

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB base64 limit

export async function listReports(tenantId: string, patientId?: string) {
  const query: any = { tenantId };
  if (patientId) query.patientId = patientId;

  return Report.find(query)
    .select("-fileData")   // don't send raw data in list
    .sort({ createdAt: -1 });
}

export async function downloadReport(tenantId: string, id: string) {
  const report = await Report.findOne({ _id: id, tenantId });
  if (!report) throw AppError.notFound("Report not found");
  return { fileData: report.fileData, fileName: report.fileName, fileType: report.fileType };
}

export async function uploadReport(tenantId: string, uploadedBy: string, body: Record<string, any>) {
  const { patientId, patientName, appointmentId, fileName, fileType, fileData, fileSize, notes } = body;

  if (!patientId || !fileName || !fileData) {
    throw AppError.badRequest("patientId, fileName and fileData are required");
  }
  if (fileSize > MAX_FILE_BYTES) {
    throw new AppError("BAD_REQUEST", { message: "File too large. Maximum 8 MB.", statusCode: 413 });
  }

  const report = await Report.create({
    tenantId,
    patientId,
    patientName:   patientName || "",
    appointmentId: appointmentId || "",
    fileName,
    fileType:      fileType || "application/octet-stream",
    fileData,
    fileSize:      fileSize || 0,
    notes:         notes || "",
    uploadedBy,
  });

  // Return without the heavy fileData
  const { fileData: _, ...safe } = report.toObject();
  return safe;
}

export async function updateReportNotes(tenantId: string, id: string, notes: string) {
  const report = await Report.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: { notes } },
    { new: true }
  ).select("-fileData");
  if (!report) throw AppError.notFound("Report not found");
  return report;
}

export async function deleteReport(tenantId: string, id: string) {
  const report = await Report.findOneAndDelete({ _id: id, tenantId });
  if (!report) throw AppError.notFound("Report not found");
  return { message: "Report deleted" };
}
