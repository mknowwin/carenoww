import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Tenant from "../models/Tenant.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "carenoww_dev_secret_change_in_prod";

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const user = await User.findOne({ email: email.toLowerCase(), isActive: true });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const tenant = await Tenant.findById(user.tenantId);
    if (!tenant || tenant.status === "suspended" || tenant.status === "cancelled") {
      return res.status(403).json({ error: "Account suspended. Contact your administrator." });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      {
        id: user._id.toString(),
        tenantId: user.tenantId.toString(),
        email: user.email,
        role: user.role,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      token,
      user: {
        id: user._id.toString(),
        tenantId: user.tenantId.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        organization:   tenant.name,
        clinicLogoUrl:  tenant.settings?.logoUrl       || "",
        clinicPhone:    tenant.settings?.clinicPhone   || tenant.contact?.phone   || "",
        clinicAddress:  tenant.settings?.clinicAddress || tenant.contact?.address || "",
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/auth/me
router.get("/me", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    const tenant = await Tenant.findById(user.tenantId);
    res.json({
      id: user._id.toString(),
      tenantId: user.tenantId.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      organization:   tenant?.name || "",
      clinicLogoUrl:  tenant?.settings?.logoUrl || "",
      clinicPhone:    tenant?.settings?.clinicPhone || tenant?.contact?.phone || "",
      clinicAddress:  tenant?.settings?.clinicAddress || tenant?.contact?.address || "",
      clinicCity:     tenant?.contact?.city || "",
      aiScribeEnabled:  user.aiScribeEnabled ?? false,
      aiScribeProvider: user.aiScribeProvider ?? "deepgram",
      aiScribeApiKey:   user.aiScribeApiKey ?? "",
      aiScribeModel:    user.aiScribeModel ?? "nova-2-medical",
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/auth/profile
router.put("/profile", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name, department, aiScribeEnabled, aiScribeProvider, aiScribeApiKey, aiScribeModel } = req.body;
    const updates: any = {};
    if (name) updates.name = name;
    if (department !== undefined) updates.department = department;
    if (aiScribeEnabled !== undefined) updates.aiScribeEnabled = aiScribeEnabled;
    if (aiScribeProvider !== undefined) updates.aiScribeProvider = aiScribeProvider;
    if (aiScribeApiKey !== undefined) updates.aiScribeApiKey = aiScribeApiKey;
    if (aiScribeModel !== undefined) updates.aiScribeModel = aiScribeModel;
    const user = await User.findByIdAndUpdate(req.user!.id, { $set: updates }, { new: true });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      name: user.name,
      department: user.department,
      aiScribeEnabled:  user.aiScribeEnabled,
      aiScribeProvider: user.aiScribeProvider,
      aiScribeApiKey:   user.aiScribeApiKey,
      aiScribeModel:    user.aiScribeModel,
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/auth/clinic-settings
router.get("/clinic-settings", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const tenant = await Tenant.findById(req.user!.tenantId);
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    res.json({
      name:          tenant.name,
      logoUrl:       tenant.settings?.logoUrl || "",
      clinicPhone:   tenant.settings?.clinicPhone || tenant.contact?.phone || "",
      clinicAddress: tenant.settings?.clinicAddress || tenant.contact?.address || "",
      clinicCity:    tenant.contact?.city || "",
      gstNo:         (tenant.settings as any)?.gstNo || "",
      invoicePrefix: (tenant.settings as any)?.invoicePrefix || "BILL",
      taxConfig:     (tenant.settings as any)?.taxConfig || { cgstRate: 0, sgstRate: 0, igstRate: 0, taxInclusivePricing: false },
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/auth/clinic-settings (admin only)
router.put("/clinic-settings", authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== "admin") return res.status(403).json({ error: "Admins only" });
    const { name, logoUrl, clinicPhone, clinicAddress, gstNo, invoicePrefix, taxConfig } = req.body;
    const update: any = {};
    if (name !== undefined)          update["name"] = name;
    if (logoUrl !== undefined)       update["settings.logoUrl"] = logoUrl;
    if (clinicPhone !== undefined)   update["settings.clinicPhone"] = clinicPhone;
    if (clinicAddress !== undefined) update["settings.clinicAddress"] = clinicAddress;
    if (gstNo !== undefined)         update["settings.gstNo"] = gstNo;
    if (invoicePrefix !== undefined) update["settings.invoicePrefix"] = invoicePrefix;
    if (taxConfig !== undefined) {
      if (taxConfig.cgstRate !== undefined)            update["settings.taxConfig.cgstRate"] = taxConfig.cgstRate;
      if (taxConfig.sgstRate !== undefined)            update["settings.taxConfig.sgstRate"] = taxConfig.sgstRate;
      if (taxConfig.igstRate !== undefined)            update["settings.taxConfig.igstRate"] = taxConfig.igstRate;
      if (taxConfig.taxInclusivePricing !== undefined) update["settings.taxConfig.taxInclusivePricing"] = taxConfig.taxInclusivePricing;
    }
    const tenant = await Tenant.findByIdAndUpdate(req.user!.tenantId, { $set: update }, { new: true });
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    res.json({ message: "Clinic settings saved" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/change-password
router.post("/change-password", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password required" });
    }
    const user = await User.findById(req.user!.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
