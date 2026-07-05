import { Router } from "express";
import { superadminMiddleware } from "../middleware/superadmin.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as superadminService from "../services/superadminService.js";

const router = Router();

// POST /api/superadmin/login
router.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const data = await superadminService.login(email, password);
  res.json({ success: true, data });
}));

// All routes below require superadmin auth
router.use(superadminMiddleware);

// GET /api/superadmin/stats
router.get("/stats", asyncHandler(async (_req, res) => {
  const data = await superadminService.getStats();
  res.json({ success: true, data });
}));

// GET /api/superadmin/tenants
router.get("/tenants", asyncHandler(async (req, res) => {
  const data = await superadminService.listTenants(req.query as Record<string, string>);
  res.json({ success: true, data });
}));

// POST /api/superadmin/tenants
router.post("/tenants", asyncHandler(async (req, res) => {
  const data = await superadminService.createTenant(req.body);
  res.status(201).json({ success: true, data });
}));

// GET /api/superadmin/tenants/:id
router.get("/tenants/:id", asyncHandler(async (req, res) => {
  const data = await superadminService.getTenant(req.params.id);
  res.json({ success: true, data });
}));

// PUT /api/superadmin/tenants/:id
router.put("/tenants/:id", asyncHandler(async (req, res) => {
  const tenant = await superadminService.updateTenant(req.params.id, req.body);
  res.json({ success: true, data: tenant });
}));

// POST /api/superadmin/tenants/:id/suspend
router.post("/tenants/:id/suspend", asyncHandler(async (req, res) => {
  const data = await superadminService.suspendTenant(req.params.id);
  res.json({ success: true, data });
}));

// POST /api/superadmin/tenants/:id/activate
router.post("/tenants/:id/activate", asyncHandler(async (req, res) => {
  const data = await superadminService.activateTenant(req.params.id);
  res.json({ success: true, data });
}));

// DELETE /api/superadmin/tenants/:id
router.delete("/tenants/:id", asyncHandler(async (req, res) => {
  const data = await superadminService.cancelTenant(req.params.id);
  res.json({ success: true, data });
}));

// GET /api/superadmin/tenants/:id/users
router.get("/tenants/:id/users", asyncHandler(async (req, res) => {
  const users = await superadminService.getTenantUsers(req.params.id);
  res.json({ success: true, data: users });
}));

// POST /api/superadmin/tenants/:id/seed
router.post("/tenants/:id/seed", asyncHandler(async (req, res) => {
  const data = await superadminService.seedTenantData(req.params.id);
  res.json({ success: true, data });
}));

export default router;
