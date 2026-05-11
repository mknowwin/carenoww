import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { authMiddleware, requireRole, AuthRequest } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

// GET /api/users  (admin only)
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

// POST /api/users  (admin only)
router.post("/", requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const { name, email, password, role, department } = req.body;
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
      isActive: true,
    });
    const { passwordHash: _, ...userObj } = user.toObject();
    res.status(201).json(userObj);
  } catch (err: any) {
    if (err.code === 11000) return res.status(409).json({ error: "Email already in use" });
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/users/:id
router.get("/:id", requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, tenantId: req.user!.tenantId }).select("-passwordHash");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/users/:id
router.put("/:id", requireRole("admin"), async (req: AuthRequest, res) => {
  try {
    const updates: any = {};
    const { name, role, department, isActive, password } = req.body;
    if (name) updates.name = name;
    if (role) updates.role = role;
    if (department !== undefined) updates.department = department;
    if (isActive !== undefined) updates.isActive = isActive;
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

// DELETE /api/users/:id  (deactivate)
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
