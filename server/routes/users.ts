import { Router } from "express";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as userService from "../services/userService.js";

const router = Router();
router.use(authMiddleware);

// ── GET /api/users/doctors — accessible to all roles ─────────────────────────
router.get("/doctors", asyncHandler(async (req: AuthRequest, res) => {
  const { department, date } = req.query as Record<string, string>;
  const data = await userService.listDoctors(req.user!.tenantId, department, date);
  res.json({ success: true, data });
}));

// ── GET /api/users — admin only ───────────────────────────────────────────────
router.get("/", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await userService.listUsers(req.user!.tenantId);
  res.json({ success: true, data });
}));

// ── POST /api/users — admin only ──────────────────────────────────────────────
router.post("/", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await userService.createUser(req.user!.tenantId, req.body);
  res.status(201).json({ success: true, data });
}));

// ── GET /api/users/:id ────────────────────────────────────────────────────────
router.get("/:id", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await userService.getUser(req.user!.tenantId, req.params.id);
  res.json({ success: true, data });
}));

// ── PUT /api/users/:id ────────────────────────────────────────────────────────
router.put("/:id", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await userService.updateUser(req.user!.tenantId, req.params.id, req.body);
  res.json({ success: true, data });
}));

// ── DELETE /api/users/:id — deactivate ───────────────────────────────────────
router.delete("/:id", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await userService.deactivateUser(req.user!.tenantId, req.user!.id, req.params.id);
  res.json({ success: true, data });
}));

export default router;
