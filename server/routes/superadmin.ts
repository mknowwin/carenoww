import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import Patient from "../models/Patient.js";
import { superadminMiddleware, SuperAdminRequest } from "../middleware/superadmin.js";

const router = Router();
const SUPERADMIN_JWT_SECRET = process.env.SUPERADMIN_JWT_SECRET || "carenoww_superadmin_secret_change_in_prod";
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || "superadmin@carenoww.io";
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || "SuperAdmin@2026!";

// POST /api/superadmin/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }
    if (email.toLowerCase() !== SUPERADMIN_EMAIL.toLowerCase()) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const valid = await bcrypt.compare(password, await bcrypt.hash(SUPERADMIN_PASSWORD, 10));
    // Direct comparison for superadmin
    if (password !== SUPERADMIN_PASSWORD) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ email: SUPERADMIN_EMAIL, role: "superadmin" }, SUPERADMIN_JWT_SECRET, { expiresIn: "8h" });
    res.json({ token, role: "superadmin", email: SUPERADMIN_EMAIL });
  } catch (err) {
    console.error("Superadmin login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// All routes below require superadmin auth
router.use(superadminMiddleware);

// GET /api/superadmin/stats
router.get("/stats", async (_req, res) => {
  try {
    const [totalTenants, activeTenants, trialTenants, suspendedTenants, totalUsers] = await Promise.all([
      Tenant.countDocuments(),
      Tenant.countDocuments({ status: "active" }),
      Tenant.countDocuments({ status: "trial" }),
      Tenant.countDocuments({ status: "suspended" }),
      User.countDocuments(),
    ]);
    res.json({ totalTenants, activeTenants, trialTenants, suspendedTenants, totalUsers });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/superadmin/tenants
router.get("/tenants", async (req, res) => {
  try {
    const { status, search, page = "1", limit = "20" } = req.query as Record<string, string>;
    const query: any = {};
    if (status) query.status = status;
    if (search) query.name = { $regex: search, $options: "i" };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [tenants, total] = await Promise.all([
      Tenant.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Tenant.countDocuments(query),
    ]);

    // Attach user counts
    const tenantsWithCounts = await Promise.all(
      tenants.map(async (t) => {
        const userCount = await User.countDocuments({ tenantId: t._id });
        const patientCount = await Patient.countDocuments({ tenantId: t._id });
        return { ...t.toObject(), userCount, patientCount };
      })
    );

    res.json({ tenants: tenantsWithCounts, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/superadmin/tenants
router.post("/tenants", async (req, res) => {
  try {
    const { name, slug, plan, contact, settings, adminName, adminEmail, adminPassword } = req.body;
    if (!name || !slug || !contact?.email || !adminEmail || !adminPassword) {
      return res.status(400).json({ error: "name, slug, contact.email, adminEmail, adminPassword are required" });
    }

    const existingTenant = await Tenant.findOne({ slug });
    if (existingTenant) return res.status(409).json({ error: "Tenant slug already exists" });

    const tenant = await Tenant.create({ name, slug, plan: plan || "trial", contact, settings });

    // Create admin user for this tenant
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await User.create({
      tenantId: tenant._id,
      name: adminName || `Admin - ${name}`,
      email: adminEmail,
      passwordHash,
      role: "admin",
      department: "Administration",
      isActive: true,
    });

    res.status(201).json({ tenant, message: "Tenant created successfully" });
  } catch (err: any) {
    if (err.code === 11000) return res.status(409).json({ error: "Duplicate tenant or user" });
    console.error("Create tenant error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/superadmin/tenants/:id
router.get("/tenants/:id", async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    const userCount = await User.countDocuments({ tenantId: tenant._id });
    const patientCount = await Patient.countDocuments({ tenantId: tenant._id });
    res.json({ ...tenant.toObject(), userCount, patientCount });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/superadmin/tenants/:id
router.put("/tenants/:id", async (req, res) => {
  try {
    const { name, plan, status, contact, settings, subscription } = req.body;
    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      { $set: { name, plan, status, contact, settings, subscription } },
      { new: true, runValidators: true }
    );
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/superadmin/tenants/:id/suspend
router.post("/tenants/:id/suspend", async (req, res) => {
  try {
    const tenant = await Tenant.findByIdAndUpdate(req.params.id, { status: "suspended" }, { new: true });
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    res.json({ message: "Tenant suspended", tenant });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/superadmin/tenants/:id/activate
router.post("/tenants/:id/activate", async (req, res) => {
  try {
    const tenant = await Tenant.findByIdAndUpdate(req.params.id, { status: "active" }, { new: true });
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    res.json({ message: "Tenant activated", tenant });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/superadmin/tenants/:id
router.delete("/tenants/:id", async (req, res) => {
  try {
    const tenant = await Tenant.findByIdAndUpdate(req.params.id, { status: "cancelled" }, { new: true });
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    res.json({ message: "Tenant cancelled" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/superadmin/tenants/:id/users
router.get("/tenants/:id/users", async (req, res) => {
  try {
    const users = await User.find({ tenantId: req.params.id }).select("-passwordHash").sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/superadmin/tenants/:id/seed
router.post("/tenants/:id/seed", async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    // Import and run seeder for this tenant
    const { seedTenant } = await import("../seed.js");
    await seedTenant(tenant._id.toString());
    res.json({ message: "Demo data seeded successfully" });
  } catch (err) {
    console.error("Seed error:", err);
    res.status(500).json({ error: "Seed failed" });
  }
});

export default router;
