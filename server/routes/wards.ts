import { Router } from "express";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as wardService from "../services/wardService.js";

const router = Router();
router.use(authMiddleware);

// GET /api/wards — active wards with beds + live occupancy; ?all=1 includes inactive (Settings)
router.get("/", asyncHandler(async (req: AuthRequest, res) => {
  const data = await wardService.listWards(req.user!.tenantId, req.query.all === "1");
  res.json({ success: true, data });
}));

// POST /api/wards  { name, code?, type?, bedRateId? }
router.post("/", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const ward = await wardService.createWard(req.user!.tenantId, req.body);
  res.status(201).json({ success: true, data: ward });
}));

// PUT /api/wards/:id  { name?, code?, type?, bedRateId?, sortOrder?, active? }
router.put("/:id", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const ward = await wardService.updateWard(req.user!.tenantId, req.params.id, req.body);
  res.json({ success: true, data: ward });
}));

// DELETE /api/wards/:id — 409 once any admission used the ward (deactivate instead)
router.delete("/:id", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await wardService.deleteWard(req.user!.tenantId, req.params.id);
  res.json({ success: true, data });
}));

// POST /api/wards/:id/beds  { numbers: [...] } | { prefix, from, to, pad }
router.post("/:id/beds", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await wardService.addBeds(req.user!.tenantId, req.params.id, req.body);
  res.status(201).json({ success: true, data });
}));

// PUT /api/wards/beds/:bedId  { number?, active? }
router.put("/beds/:bedId", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const bed = await wardService.updateBed(req.user!.tenantId, req.params.bedId, req.body);
  res.json({ success: true, data: bed });
}));

// PATCH /api/wards/beds/:bedId/status  { status: Available | Cleaning | Maintenance }
router.patch("/beds/:bedId/status", requireRole("admin", "doctor", "nurse"), asyncHandler(async (req: AuthRequest, res) => {
  const bed = await wardService.setBedStatus(req.user!.tenantId, req.params.bedId, req.body?.status);
  res.json({ success: true, data: bed });
}));

// DELETE /api/wards/beds/:bedId — 409 once any admission used the bed
router.delete("/beds/:bedId", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await wardService.deleteBed(req.user!.tenantId, req.params.bedId);
  res.json({ success: true, data });
}));

export default router;
