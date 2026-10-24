import { Router } from "express";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as icdCodeService from "../services/icdCodeService.js";

const router = Router();
router.use(authMiddleware);

// GET /api/icd-codes?search=term  → top 10 suggestions: hospital's active codes first,
//   then the global ICD-10-CM catalogue (minus codes this hospital switched off)
//   &all=1  → this hospital's full list incl. inactive, for Settings
router.get("/", asyncHandler(async (req: AuthRequest, res) => {
  const { search, all } = req.query as { search?: string; all?: string };
  const rows = all
    ? await icdCodeService.listIcdCodes(req.user!.tenantId)
    : await icdCodeService.suggestIcdCodes(req.user!.tenantId, search);
  res.json({ success: true, data: rows });
}));

// GET /api/icd-codes/catalog  → { count, version } of the global catalogue
// GET /api/icd-codes/catalog?search=term  → catalogue matches only
// GET /api/icd-codes/catalog?code=E11.9  → single catalogue entry (null if absent)
router.get("/catalog", asyncHandler(async (req: AuthRequest, res) => {
  const { search, code } = req.query as { search?: string; code?: string };
  const data = code
    ? await icdCodeService.lookupCatalogCode(code)
    : search
      ? await icdCodeService.searchIcdCatalog(search)
      : await icdCodeService.getCatalogInfo();
  res.json({ success: true, data });
}));

// POST /api/icd-codes  { code, description } — doctors can add a missing code inline
router.post("/", requireRole("admin", "doctor"), asyncHandler(async (req: AuthRequest, res) => {
  const icd = await icdCodeService.createIcdCode(req.user!.tenantId, req.body);
  res.status(201).json({ success: true, data: icd });
}));

// POST /api/icd-codes/import  { rows: [{ code, description }] } — upsert by code
router.post("/import", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await icdCodeService.importIcdCodes(req.user!.tenantId, req.body?.rows);
  res.json({ success: true, data });
}));

// POST /api/icd-codes/seed-common — add the built-in starter list (missing codes only)
router.post("/seed-common", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await icdCodeService.seedCommonIcdCodes(req.user!.tenantId);
  res.json({ success: true, data });
}));

// PUT /api/icd-codes/:id  { code?, description?, active? }
router.put("/:id", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const icd = await icdCodeService.updateIcdCode(req.user!.tenantId, req.params.id, req.body);
  res.json({ success: true, data: icd });
}));

// DELETE /api/icd-codes/:id
router.delete("/:id", requireRole("admin"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await icdCodeService.deleteIcdCode(req.user!.tenantId, req.params.id);
  res.json({ success: true, data });
}));

export default router;
