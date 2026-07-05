import { Router } from "express";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as patientService from "../services/patientService.js";

const router = Router();
router.use(authMiddleware);

// GET /api/patients
router.get("/", requireRole("admin", "doctor", "nurse", "receptionist", "pharmacist", "pharmacy_admin", "lab_tech"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await patientService.listPatients(req.user!.tenantId, req.query as Record<string, string>);
  res.json({ success: true, data });
}));

// POST /api/patients
router.post("/", requireRole("admin", "doctor", "receptionist", "nurse"), asyncHandler(async (req: AuthRequest, res) => {
  const patient = await patientService.createPatient(req.user!.tenantId, req.body);
  res.status(201).json({ success: true, data: patient });
}));

// GET /api/patients/:id
router.get("/:id", requireRole("admin", "doctor", "nurse", "receptionist", "pharmacist", "pharmacy_admin", "lab_tech"), asyncHandler(async (req: AuthRequest, res) => {
  const patient = await patientService.getPatient(req.user!.tenantId, req.params.id);
  res.json({ success: true, data: patient });
}));

// PUT /api/patients/:id
router.put("/:id", requireRole("admin", "doctor", "receptionist", "nurse"), asyncHandler(async (req: AuthRequest, res) => {
  const patient = await patientService.updatePatient(req.user!.tenantId, req.params.id, req.body);
  res.json({ success: true, data: patient });
}));

// DELETE /api/patients/:id (soft delete)
router.delete("/:id", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const result = await patientService.deactivatePatient(req.user!.tenantId, req.params.id);
  res.json({ success: true, data: result });
}));

export default router;
