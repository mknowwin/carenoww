import { Router } from "express";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as billingService from "../services/billingService.js";

const router = Router();
router.use(authMiddleware);

// ── GET /api/billing ──────────────────────────────────────────────────────────
router.get("/", requireRole("admin", "finance", "receptionist", "pharmacist", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await billingService.listBills(req.user!.tenantId, { id: req.user!.id, role: req.user!.role }, req.user!.timezone, req.query as Record<string, string>);
  res.json({ success: true, data });
}));

// ── GET /api/billing/:id ──────────────────────────────────────────────────────
router.get("/:id", requireRole("admin", "finance", "receptionist", "pharmacist", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const bill = await billingService.getBill(req.user!.tenantId, req.params.id);
  res.json({ success: true, data: bill });
}));

// ── POST /api/billing ─────────────────────────────────────────────────────────
router.post("/", requireRole("admin", "receptionist", "nurse", "finance", "pharmacist", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const bill = await billingService.createBill(req.user!.tenantId, { name: req.user!.name, id: req.user!.id }, req.body);
  res.status(201).json({ success: true, data: bill });
}));

// ── PUT /api/billing/:id — update items / discount / notes ───────────────────
router.put("/:id", requireRole("admin", "receptionist", "nurse", "finance", "pharmacist", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const bill = await billingService.updateBill(req.user!.tenantId, req.params.id, req.body);
  res.json({ success: true, data: bill });
}));

// ── DELETE /api/billing/:id — permanently delete a draft bill ────────────────
router.delete("/:id", requireRole("admin", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await billingService.deleteDraftBill(req.user!.tenantId, req.params.id);
  res.json({ success: true, data });
}));

// ── POST /api/billing/:id/payments — record a payment installment ─────────────
router.post("/:id/payments", requireRole("admin", "receptionist", "finance", "nurse", "pharmacist", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const updated = await billingService.postPayment(req.user!.tenantId, { id: req.user!.id, name: req.user!.name }, req.params.id, req.body);
  res.status(201).json({ success: true, data: updated });
}));

// ── POST /api/billing/:id/unlock — admin unlocks a paid/locked bill ───────────
router.post("/:id/unlock", requireRole("admin", "finance"), asyncHandler(async (req: AuthRequest, res) => {
  const bill = await billingService.unlockBill(req.user!.tenantId, req.user!.name, req.params.id);
  res.json({ success: true, data: bill });
}));

// ── POST /api/billing/:id/cancel — void a bill (only if unpaid) ──────────────
router.post("/:id/cancel", requireRole("admin", "finance", "pharmacy_admin", "pharmacist"), asyncHandler(async (req: AuthRequest, res) => {
  const bill = await billingService.cancelBill(req.user!.tenantId, { id: req.user!.id, name: req.user!.name }, req.params.id, req.body?.reason);
  res.json({ success: true, data: bill });
}));

// ── POST /api/billing/:id/return — return/refund one or more line items ──────
router.post("/:id/return", requireRole("admin", "finance", "pharmacy_admin", "pharmacist"), asyncHandler(async (req: AuthRequest, res) => {
  const result = await billingService.returnBillItems(req.user!.tenantId, { id: req.user!.id, name: req.user!.name }, req.params.id, req.body);
  res.json({ success: true, data: result });
}));

// ── GET /api/billing/:id/credit-notes — credit notes linked to a bill ────────
router.get("/:id/credit-notes", requireRole("admin", "finance", "receptionist", "pharmacist", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await billingService.listCreditNotes(req.user!.tenantId, req.params.id);
  res.json({ success: true, data });
}));

// ── POST /api/billing/:id/pre-auth — submit insurance pre-authorisation ───────
router.post("/:id/pre-auth", requireRole("admin", "finance", "receptionist"), asyncHandler(async (req: AuthRequest, res) => {
  const bill = await billingService.submitPreAuth(req.user!.tenantId, req.params.id, req.body);
  res.json({ success: true, data: bill });
}));

// ── PUT /api/billing/:id/pre-auth — update pre-auth outcome ──────────────────
router.put("/:id/pre-auth", requireRole("admin", "finance"), asyncHandler(async (req: AuthRequest, res) => {
  const bill = await billingService.updatePreAuth(req.user!.tenantId, req.params.id, req.body);
  res.json({ success: true, data: bill });
}));

// ── POST /api/billing/:id/claim — file insurance claim ───────────────────────
router.post("/:id/claim", requireRole("admin", "finance"), asyncHandler(async (req: AuthRequest, res) => {
  const updated = await billingService.fileClaim(req.user!.tenantId, req.params.id, req.body);
  res.json({ success: true, data: updated });
}));

// ── PUT /api/billing/:id/claim — update claim status (through to Settled) ─────
router.put("/:id/claim", requireRole("admin", "finance"), asyncHandler(async (req: AuthRequest, res) => {
  const updated = await billingService.updateClaim(req.user!.tenantId, { id: req.user!.id, name: req.user!.name }, req.params.id, req.body);
  res.json({ success: true, data: updated });
}));

// ── GET /api/billing/report/by-staff — sales aggregated by staff member ─────────
// Non-admin/finance roles get self-scoped results (their own row only) — see salesByStaff().
router.get("/report/by-staff", requireRole("admin", "finance", "doctor", "nurse", "receptionist", "pharmacist", "pharmacy_admin", "lab_tech"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await billingService.salesByStaff(req.user!.tenantId, req.user!.timezone, req.query as Record<string, string>, { id: req.user!.id, role: req.user!.role });
  res.json({ success: true, data });
}));

export default router;
