import { Router } from "express";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import * as appointmentService from "../services/appointmentService.js";

const router = Router();
router.use(authMiddleware);

// ── GET /api/appointments ─────────────────────────────────────────────────────
router.get("/", asyncHandler(async (req: AuthRequest, res) => {
  const data = await appointmentService.listAppointments(req.user!.tenantId, req.query as Record<string, string>);
  res.json({ success: true, data });
}));

// ── GET /api/appointments/queue — ordered queue for a doctor ─────────────────
router.get("/queue", asyncHandler(async (req: AuthRequest, res) => {
  const { doctor, date } = req.query as Record<string, string>;
  const queue = await appointmentService.getQueue(req.user!.tenantId, { doctor, date });
  res.json({ success: true, data: queue });
}));

// ── GET /api/appointments/slots — available time slots for a doctor on a date ─
router.get("/slots", asyncHandler(async (req: AuthRequest, res) => {
  const { doctor, date } = req.query as Record<string, string>;
  const slots = await appointmentService.getSlots(req.user!.tenantId, doctor, date);
  res.json({ success: true, data: slots });
}));

// ── POST /api/appointments ────────────────────────────────────────────────────
router.post("/", requireRole("admin", "doctor", "receptionist"), asyncHandler(async (req: AuthRequest, res) => {
  const appointment = await appointmentService.createAppointment(req.user!.tenantId, req.body);
  res.status(201).json({ success: true, data: appointment });
}));

// ── GET /api/appointments/:id ─────────────────────────────────────────────────
router.get("/:id", asyncHandler(async (req: AuthRequest, res) => {
  const appt = await appointmentService.getAppointment(req.user!.tenantId, req.params.id);
  res.json({ success: true, data: appt });
}));

// ── PUT /api/appointments/:id ─────────────────────────────────────────────────
router.put("/:id", requireRole("admin", "doctor", "receptionist", "nurse"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await appointmentService.updateAppointment(req.user!.tenantId, req.user!.name, req.params.id, req.body);
  res.json({ success: true, data });
}));

// ── POST /api/appointments/:id/checkin — receptionist checks patient in ───────
router.post("/:id/checkin", requireRole("admin", "receptionist", "nurse"), asyncHandler(async (req: AuthRequest, res) => {
  const appt = await appointmentService.checkin(req.user!.tenantId, req.params.id);
  res.json({ success: true, data: appt });
}));

// ── POST /api/appointments/:id/call — doctor calls patient into room ──────────
router.post("/:id/call", requireRole("admin", "doctor", "nurse"), asyncHandler(async (req: AuthRequest, res) => {
  const appt = await appointmentService.callPatient(req.user!.tenantId, req.params.id);
  res.json({ success: true, data: appt });
}));

// ── DELETE /api/appointments/:id — cancel ─────────────────────────────────────
router.delete("/:id", requireRole("admin", "receptionist"), asyncHandler(async (req: AuthRequest, res) => {
  const data = await appointmentService.cancelAppointment(req.user!.tenantId, req.params.id);
  res.json({ success: true, data });
}));

export default router;
