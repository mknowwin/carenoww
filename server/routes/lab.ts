import { Router } from "express";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as labService from "../services/labService.js";

const router = Router();
router.use(authMiddleware);

// ── GET /api/lab/orders ───────────────────────────────────────────────────────
router.get("/orders", requireRole("admin", "doctor", "nurse", "lab_tech"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await labService.listOrders(req.user!.tenantId, req.query as Record<string, string>);
  res.json({ success: true, data });
}));

// ── GET /api/lab/orders/:id ───────────────────────────────────────────────────
router.get("/orders/:id", requireRole("admin", "doctor", "nurse", "lab_tech"), asyncHandler(async (req: AuthRequest, res) => {
  const order = await labService.getOrder(req.user!.tenantId, req.params.id);
  res.json({ success: true, data: order });
}));

// ── POST /api/lab/orders ──────────────────────────────────────────────────────
router.post("/orders", requireRole("admin", "doctor", "nurse", "lab_tech", "receptionist"), asyncHandler(async (req: AuthRequest, res) => {
  const order = await labService.createOrder(req.user!.tenantId, req.user!.name, req.body);
  res.status(201).json({ success: true, data: order });
}));

// ── PUT /api/lab/orders/:id — update status / enter result ───────────────────
router.put("/orders/:id", requireRole("admin", "doctor", "nurse", "lab_tech"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await labService.updateOrder(req.user!.tenantId, req.user!.name, req.params.id, req.body);
  res.json({ success: true, data });
}));

export default router;
