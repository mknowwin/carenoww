import { Router } from "express";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as prescriptionService from "../services/prescriptionService.js";

const router = Router();
router.use(authMiddleware);

// ── GET /api/prescriptions ────────────────────────────────────────────────────
router.get("/", requireRole("admin", "doctor", "nurse", "pharmacist", "pharmacy_admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await prescriptionService.listPrescriptions(req.user!.tenantId, req.query as Record<string, string>);
  res.json({ success: true, data });
}));

// ── POST /api/prescriptions — create prescription + auto-create pharmacy order ─
router.post("/", requireRole("admin", "doctor"), asyncHandler(async (req: AuthRequest, res) => {
  const prescription = await prescriptionService.createPrescription(req.user!.tenantId, { name: req.user!.name, id: req.user!.id }, req.body);
  res.status(201).json({ success: true, data: prescription });
}));

// ── PUT /api/prescriptions/:id ────────────────────────────────────────────────
router.put("/:id", requireRole("admin", "doctor"), asyncHandler(async (req: AuthRequest, res) => {
  const rx = await prescriptionService.updatePrescription(req.user!.tenantId, req.params.id, req.body);
  res.json({ success: true, data: rx });
}));

export default router;
