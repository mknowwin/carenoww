import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Appointment from "../models/Appointment.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

// ── GET /api/users/doctors — accessible to all roles ─────────────────────────
// Returns all active doctors for the tenant, optionally filtered by department
// Also computes whether each doctor is available on the requested date
router.get("/doctors", async (req: AuthRequest, res) => {
  try {
    const { department, date } = req.query as Record<string, string>;
    const query: any = { tenantId: req.user!.tenantId, role: "doctor", isActive: true };
    if (department) query.department = department;

    const doctors = await User.find(query).select("-passwordHash").sort({ name: 1 });

    // If date provided, count today's appointments per doctor and compute availability
    if (date) {
      const DAY_MAP: Record<number, string> = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };
      const dayOfWeek = DAY_MAP[new Date(date).getDay()];

      const apptCounts = await Appointment.aggregate([
        {
          $match: {
            tenantId: req.user!.tenantId,
            date,
            status: { $nin: ["Cancelled"] },
          },
        },
        { $group: { _id: "$doctor", count: { $sum: 1 }, doctorId: { $first: "$doctorId" } } },
      ]);
      const countByDoctor: Record<string, number> = {};
      apptCounts.forEach((a) => { countByDoctor[a._id] = a.count; });

      const result = doctors.map((doc) => {
        const isWorkingDay = doc.schedule?.days?.includes(dayOfWeek) ?? true;
        const bookedCount = countByDoctor[doc.name] ?? 0;
        const schedule = doc.schedule ?? { startTime: "09:00", endTime: "17:00", slotDurationMin: 15, days: [] };

        // Compute total possible slots for the day
        const [sh, sm] = schedule.startTime.split(":").map(Number);
        const [eh, em] = schedule.endTime.split(":").map(Number);
        const totalMinutes = (eh * 60 + em) - (sh * 60 + sm);
        const totalSlots = Math.floor(totalMinutes / (schedule.slotDurationMin || 15));
        const remainingSlots = Math.max(0, totalSlots - bookedCount);

        return {
          ...doc.toObject(),
          consultingFee: doc.consultingFee ?? 0,
          isAvailable: isWorkingDay && remainingSlots > 0,
          isWorkingDay,
          bookedCount,
          totalSlots,
          remainingSlots,
        };
      });

      return res.json(result);
    }

    res.json(doctors.map((d) => ({ ...d.toObject(), consultingFee: d.consultingFee ?? 0 })));
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/users — admin only ───────────────────────────────────────────────
router.get("/", requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const users = await User.find({ tenantId: req.user!.tenantId, isActive: true })
      .select("-passwordHash")
      .sort({ createdAt: -1 });
    res.json(users);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/users — admin only ──────────────────────────────────────────────
router.post("/", requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const { name, email, password, role, department, specialty, schedule, consultingFee } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "name, email, password, role are required" });
    }
    const exists = await User.findOne({ tenantId: req.user!.tenantId, email: email.toLowerCase() });
    if (exists) return res.status(409).json({ error: "Email already in use" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      tenantId: req.user!.tenantId,
      name,
      email: email.toLowerCase(),
      passwordHash,
      role,
      department: department || "",
      specialty: specialty || department || "",
      schedule: schedule || undefined,
      consultingFee: consultingFee ?? 0,
      isActive: true,
    });
    const { passwordHash: _, ...userObj } = user.toObject();
    res.status(201).json(userObj);
  } catch (err: any) {
    if (err.code === 11000) return res.status(409).json({ error: "Email already in use" });
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/users/:id ────────────────────────────────────────────────────────
router.get("/:id", requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, tenantId: req.user!.tenantId }).select("-passwordHash");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/users/:id ────────────────────────────────────────────────────────
router.put("/:id", requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const updates: any = {};
    const { name, role, department, specialty, schedule, isActive, password, consultingFee } = req.body;
    if (name)      updates.name      = name;
    if (role)      updates.role      = role;
    if (department    !== undefined) updates.department    = department;
    if (specialty     !== undefined) updates.specialty     = specialty;
    if (schedule      !== undefined) updates.schedule      = schedule;
    if (isActive      !== undefined) updates.isActive      = isActive;
    if (consultingFee !== undefined) updates.consultingFee = consultingFee;
    if (password) updates.passwordHash = await bcrypt.hash(password, 10);

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { $set: updates },
      { new: true }
    ).select("-passwordHash");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/users/:id — deactivate ───────────────────────────────────────
router.delete("/:id", requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    if (req.params.id === req.user!.id) {
      return res.status(400).json({ error: "Cannot deactivate your own account" });
    }
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user!.tenantId },
      { isActive: false },
      { new: true }
    ).select("-passwordHash");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deactivated" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
