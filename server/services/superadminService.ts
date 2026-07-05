import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Tenant from "../models/Tenant.js";
import User from "../models/User.js";
import Patient from "../models/Patient.js";
import { AppError } from "../lib/AppError.js";

const SUPERADMIN_JWT_SECRET = process.env.SUPERADMIN_JWT_SECRET || "carenoww_superadmin_secret_change_in_prod";
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || "superadmin@carenoww.io";
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || "SuperAdmin@2026!";

export async function login(email: string, password: string) {
  if (!email || !password) {
    throw AppError.badRequest("Email and password required");
  }
  if (email.toLowerCase() !== SUPERADMIN_EMAIL.toLowerCase()) {
    throw new AppError("UNAUTHORIZED", { message: "Invalid credentials" });
  }
  // Direct comparison for superadmin
  if (password !== SUPERADMIN_PASSWORD) {
    throw new AppError("UNAUTHORIZED", { message: "Invalid credentials" });
  }
  const token = jwt.sign({ email: SUPERADMIN_EMAIL, role: "superadmin" }, SUPERADMIN_JWT_SECRET, { expiresIn: "8h" });
  return { token, role: "superadmin", email: SUPERADMIN_EMAIL };
}

export async function getStats() {
  const [totalTenants, activeTenants, trialTenants, suspendedTenants, totalUsers] = await Promise.all([
    Tenant.countDocuments(),
    Tenant.countDocuments({ status: "active" }),
    Tenant.countDocuments({ status: "trial" }),
    Tenant.countDocuments({ status: "suspended" }),
    User.countDocuments(),
  ]);
  return { totalTenants, activeTenants, trialTenants, suspendedTenants, totalUsers };
}

export interface TenantListFilters {
  status?: string;
  search?: string;
  page?: string;
  limit?: string;
}

export async function listTenants(filters: TenantListFilters) {
  const { status, search, page = "1", limit = "20" } = filters;
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

  return { tenants: tenantsWithCounts, total, page: parseInt(page), limit: parseInt(limit) };
}

export async function createTenant(body: Record<string, any>) {
  const { name, slug, plan, contact, settings, adminName, adminEmail, adminPassword } = body;
  if (!name || !slug || !contact?.email || !adminEmail || !adminPassword) {
    throw AppError.badRequest("name, slug, contact.email, adminEmail, adminPassword are required");
  }

  const existingTenant = await Tenant.findOne({ slug });
  if (existingTenant) throw AppError.conflict("Tenant slug already exists");

  let tenant;
  try {
    tenant = await Tenant.create({ name, slug, plan: plan || "trial", contact, settings });

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
  } catch (err: any) {
    if (err.code === 11000) throw AppError.conflict("Duplicate tenant or user");
    throw err;
  }

  return { tenant, message: "Tenant created successfully" };
}

export async function getTenant(id: string) {
  const tenant = await Tenant.findById(id);
  if (!tenant) throw AppError.notFound("Tenant not found");
  const userCount = await User.countDocuments({ tenantId: tenant._id });
  const patientCount = await Patient.countDocuments({ tenantId: tenant._id });
  return { ...tenant.toObject(), userCount, patientCount };
}

export async function updateTenant(id: string, body: Record<string, any>) {
  const { name, plan, status, contact, settings, subscription } = body;
  const tenant = await Tenant.findByIdAndUpdate(
    id,
    { $set: { name, plan, status, contact, settings, subscription } },
    { new: true, runValidators: true }
  );
  if (!tenant) throw AppError.notFound("Tenant not found");
  return tenant;
}

export async function suspendTenant(id: string) {
  const tenant = await Tenant.findByIdAndUpdate(id, { status: "suspended" }, { new: true });
  if (!tenant) throw AppError.notFound("Tenant not found");
  return { message: "Tenant suspended", tenant };
}

export async function activateTenant(id: string) {
  const tenant = await Tenant.findByIdAndUpdate(id, { status: "active" }, { new: true });
  if (!tenant) throw AppError.notFound("Tenant not found");
  return { message: "Tenant activated", tenant };
}

export async function cancelTenant(id: string) {
  const tenant = await Tenant.findByIdAndUpdate(id, { status: "cancelled" }, { new: true });
  if (!tenant) throw AppError.notFound("Tenant not found");
  return { message: "Tenant cancelled" };
}

export async function getTenantUsers(id: string) {
  return User.find({ tenantId: id }).select("-passwordHash").sort({ createdAt: -1 });
}

export async function seedTenantData(id: string) {
  const tenant = await Tenant.findById(id);
  if (!tenant) throw AppError.notFound("Tenant not found");
  // Import and run seeder for this tenant
  const { seedTenant } = await import("../seed.js");
  await seedTenant(tenant._id.toString());
  return { message: "Demo data seeded successfully" };
}
