import { Router } from "express";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as ipdService from "../services/ipdService.js";
import * as ipdBillingService from "../services/ipdBillingService.js";

const router = Router();
router.use(authMiddleware);

// ── GET /api/ipd — list admissions (active by default) ────────────────────────
// Discharged: ?status=Discharged&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=50 (newest first)
// ?status=all&patientId=UHID — every stay for a patient (history)
router.get("/", asyncHandler(async (req: AuthRequest, res) => {
  const data = await ipdService.listAdmissions(req.user!.tenantId, req.query as Record<string, string>, req.user!.timezone);
  res.json({ success: true, data });
}));

// ── GET /api/ipd/stats — active, ICU and discharged-today counts ──────────────
router.get("/stats", asyncHandler(async (req: AuthRequest, res) => {
  const data = await ipdService.getStats(req.user!.tenantId, req.user!.timezone);
  res.json({ success: true, data });
}));

// ── GET /api/ipd/active-by-patient?ids=UHID-001,UHID-002 — { uhid: admission } ─
router.get("/active-by-patient", asyncHandler(async (req: AuthRequest, res) => {
  const ids = String(req.query.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const data = await ipdService.activeByPatient(req.user!.tenantId, ids);
  res.json({ success: true, data });
}));

// ── GET /api/ipd/:id — full admission with rounds ─────────────────────────────
router.get("/:id", asyncHandler(async (req: AuthRequest, res) => {
  const admission = await ipdService.getAdmission(req.user!.tenantId, req.params.id);
  res.json({ success: true, data: admission });
}));

// ── GET /api/ipd/:id/billing — bed-charge segments, IPD bills, totals ────────
router.get("/:id/billing", requireRole("admin", "finance"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await ipdBillingService.admissionBilling(req.user!.tenantId, req.params.id, req.user!.timezone);
  res.json({ success: true, data });
}));

// ── POST /api/ipd/:id/billing/sync — post bed charges owed so far to the IPD bill ─
router.post("/:id/billing/sync", requireRole("admin", "finance"), asyncHandler(async (req: AuthRequest, res) => {
  await ipdBillingService.syncBedCharges(req.user!.tenantId, req.params.id, req.user!.timezone, req.user!.name);
  const data = await ipdBillingService.admissionBilling(req.user!.tenantId, req.params.id, req.user!.timezone);
  res.json({ success: true, data });
}));

// ── POST /api/ipd — admit patient ─────────────────────────────────────────────
router.post("/", requireRole("admin", "doctor", "nurse", "receptionist"), asyncHandler(async (req: AuthRequest, res) => {
  const admission = await ipdService.admitPatient(req.user!.tenantId, req.body);
  res.status(201).json({ success: true, data: admission });
}));

// ── POST /api/ipd/:id/rounds — add nursing round ──────────────────────────────
router.post("/:id/rounds", requireRole("admin", "doctor", "nurse"), asyncHandler(async (req: AuthRequest, res) => {
  const round = await ipdService.addRound(req.user!.tenantId, req.user!.name, req.params.id, req.body);
  res.status(201).json({ success: true, data: round });
}));

// ── POST /api/ipd/:id/notes — doctor's progress note { subjective, objective, assessment, plan } ─
router.post("/:id/notes", requireRole("admin", "doctor"), asyncHandler(async (req: AuthRequest, res) => {
  const note = await ipdService.addProgressNote(req.user!.tenantId, { name: req.user!.name, id: req.user!.id }, req.params.id, req.body);
  res.status(201).json({ success: true, data: note });
}));

// ── POST /api/ipd/:id/transfer — move patient to a different ward/bed ────────
router.post("/:id/transfer", requireRole("admin", "doctor", "nurse"), asyncHandler(async (req: AuthRequest, res) => {
  const admission = await ipdService.transferPatient(req.user!.tenantId, req.user!.name, req.params.id, req.body, req.user!.timezone);
  res.json({ success: true, data: admission });
}));

// ── PUT /api/ipd/:id — edit diagnosis / department / doctor (active only) ──────
router.put("/:id", requireRole("admin", "doctor", "nurse"), asyncHandler(async (req: AuthRequest, res) => {
  const admission = await ipdService.updateAdmission(req.user!.tenantId, req.params.id, req.body);
  res.json({ success: true, data: admission });
}));

// ── POST /api/ipd/:id/discharge — discharge patient ───────────────────────────
router.post("/:id/discharge", requireRole("admin", "doctor"), asyncHandler(async (req: AuthRequest, res) => {
  const admission = await ipdService.dischargePatient(req.user!.tenantId, req.user!.name, req.params.id, req.body, { role: req.user!.role, tz: req.user!.timezone });
  res.json({ success: true, data: admission });
}));

export default router;
