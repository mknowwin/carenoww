import { Router } from "express";
import Report from "../models/Report.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB base64 limit

// ── GET /api/reports?patientId=X ──────────────────────────────────────────────
router.get("/", async (req: AuthRequest, res) => {
  try {
    const { patientId } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId };
    if (patientId) query.patientId = patientId;

    const reports = await Report.find(query)
      .select("-fileData")   // don't send raw data in list
      .sort({ createdAt: -1 });

    res.json(reports);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/reports/:id/download — returns base64 data ──────────────────────
router.get("/:id/download", async (req: AuthRequest, res) => {
  try {
    const report = await Report.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!report) return res.status(404).json({ error: "Report not found" });
    res.json({ fileData: report.fileData, fileName: report.fileName, fileType: report.fileType });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/reports — upload report ─────────────────────────────────────────
router.post("/", requireRole("admin", "doctor", "nurse", "receptionist", "lab_tech"), async (req: AuthRequest, res) => {
  try {
    const { patientId, patientName, appointmentId, fileName, fileType, fileData, fileSize, notes } = req.body;

    if (!patientId || !fileName || !fileData) {
      return res.status(400).json({ error: "patientId, fileName and fileData are required" });
    }
    if (fileSize > MAX_FILE_BYTES) {
      return res.status(413).json({ error: "File too large. Maximum 8 MB." });
    }

    const report = await Report.create({
      tenantId:      req.user!.tenantId,
      patientId,
      patientName:   patientName || "",
      appointmentId: appointmentId || "",
      fileName,
      fileType:      fileType || "application/octet-stream",
      fileData,
      fileSize:      fileSize || 0,
      notes:         notes || "",
      uploadedBy:    req.user!.name,
    });

    // Return without the heavy fileData
    const { fileData: _, ...safe } = report.toObject();
    res.status(201).json(safe);
  } catch (err: any) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/reports/:id — update notes only ──────────────────────────────────
router.put("/:id", requireRole("admin", "doctor", "nurse"), async (req: AuthRequest, res) => {
  try {
    const { notes } = req.body;
    const report = await Report.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { $set: { notes } },
      { new: true }
    ).select("-fileData");
    if (!report) return res.status(404).json({ error: "Report not found" });
    res.json(report);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/reports/:id ───────────────────────────────────────────────────
router.delete("/:id", requireRole("admin", "doctor"), async (req: AuthRequest, res) => {
  try {
    const report = await Report.findOneAndDelete({ _id: req.params.id, tenantId: req.user!.tenantId });
    if (!report) return res.status(404).json({ error: "Report not found" });
    res.json({ message: "Report deleted" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
