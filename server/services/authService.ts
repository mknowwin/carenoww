import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Tenant from "../models/Tenant.js";
import { AppError } from "../lib/AppError.js";

const JWT_SECRET = process.env.JWT_SECRET || "carenoww_dev_secret_change_in_prod";

export async function login(email: string, password: string) {
  if (!email || !password) {
    throw AppError.badRequest("Email and password required");
  }

  const user = await User.findOne({ email: email.toLowerCase(), isActive: true });
  if (!user) throw new AppError("UNAUTHORIZED", { message: "Invalid credentials" });

  const tenant = await Tenant.findById(user.tenantId);
  if (!tenant || tenant.status === "suspended" || tenant.status === "cancelled") {
    throw AppError.forbidden("Account suspended. Contact your administrator.");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError("UNAUTHORIZED", { message: "Invalid credentials" });

  user.lastLogin = new Date();
  await user.save();

  const timezone = tenant.settings?.timezone || "Asia/Kolkata";

  const token = jwt.sign(
    {
      id: user._id.toString(),
      tenantId: user.tenantId.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
      timezone,
    },
    JWT_SECRET,
    { expiresIn: "12h" }
  );

  return {
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
      timezone,
    },
  };
}

export async function getMe(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound("User not found");
  const tenant = await Tenant.findById(user.tenantId);
  return {
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
    timezone:       tenant?.settings?.timezone || "Asia/Kolkata",
    aiScribeEnabled:  user.aiScribeEnabled ?? false,
    aiScribeProvider: user.aiScribeProvider ?? "deepgram",
    aiScribeApiKey:   user.aiScribeApiKey ?? "",
    aiScribeModel:    user.aiScribeModel ?? "nova-2-medical",
  };
}

export async function updateProfile(userId: string, body: Record<string, unknown>) {
  const { name, department, aiScribeEnabled, aiScribeProvider, aiScribeApiKey, aiScribeModel } = body as any;
  const updates: any = {};
  if (name) updates.name = name;
  if (department !== undefined) updates.department = department;
  if (aiScribeEnabled !== undefined) updates.aiScribeEnabled = aiScribeEnabled;
  if (aiScribeProvider !== undefined) updates.aiScribeProvider = aiScribeProvider;
  if (aiScribeApiKey !== undefined) updates.aiScribeApiKey = aiScribeApiKey;
  if (aiScribeModel !== undefined) updates.aiScribeModel = aiScribeModel;
  const user = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true });
  if (!user) throw AppError.notFound("User not found");
  return {
    name: user.name,
    department: user.department,
    aiScribeEnabled:  user.aiScribeEnabled,
    aiScribeProvider: user.aiScribeProvider,
    aiScribeApiKey:   user.aiScribeApiKey,
    aiScribeModel:    user.aiScribeModel,
  };
}

export async function getClinicSettings(tenantId: string) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw AppError.notFound("Tenant not found");
  return {
    name:          tenant.name,
    logoUrl:       tenant.settings?.logoUrl || "",
    clinicPhone:   tenant.settings?.clinicPhone || tenant.contact?.phone || "",
    clinicAddress: tenant.settings?.clinicAddress || tenant.contact?.address || "",
    clinicCity:    tenant.contact?.city || "",
    gstNo:         (tenant.settings as any)?.gstNo || "",
    invoicePrefix: (tenant.settings as any)?.invoicePrefix || "BILL",
    timezone:      tenant.settings?.timezone || "Asia/Kolkata",
    taxConfig:     (tenant.settings as any)?.taxConfig || { cgstRate: 0, sgstRate: 0, igstRate: 0, taxInclusivePricing: false },
  };
}

export async function updateClinicSettings(tenantId: string, role: string, body: Record<string, unknown>) {
  if (role !== "admin") throw AppError.forbidden("Admins only");
  const { name, logoUrl, clinicPhone, clinicAddress, gstNo, invoicePrefix, timezone, taxConfig } = body as any;
  const update: any = {};
  if (name !== undefined)          update["name"] = name;
  if (logoUrl !== undefined)       update["settings.logoUrl"] = logoUrl;
  if (clinicPhone !== undefined)   update["settings.clinicPhone"] = clinicPhone;
  if (clinicAddress !== undefined) update["settings.clinicAddress"] = clinicAddress;
  if (gstNo !== undefined)         update["settings.gstNo"] = gstNo;
  if (invoicePrefix !== undefined) update["settings.invoicePrefix"] = invoicePrefix;
  if (timezone !== undefined)      update["settings.timezone"] = timezone;
  if (taxConfig !== undefined) {
    if (taxConfig.cgstRate !== undefined)            update["settings.taxConfig.cgstRate"] = taxConfig.cgstRate;
    if (taxConfig.sgstRate !== undefined)            update["settings.taxConfig.sgstRate"] = taxConfig.sgstRate;
    if (taxConfig.igstRate !== undefined)            update["settings.taxConfig.igstRate"] = taxConfig.igstRate;
    if (taxConfig.taxInclusivePricing !== undefined) update["settings.taxConfig.taxInclusivePricing"] = taxConfig.taxInclusivePricing;
  }
  const tenant = await Tenant.findByIdAndUpdate(tenantId, { $set: update }, { new: true });
  if (!tenant) throw AppError.notFound("Tenant not found");
  return { message: "Clinic settings saved" };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  if (!currentPassword || !newPassword) {
    throw AppError.badRequest("Current and new password required");
  }
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound("User not found");
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new AppError("UNAUTHORIZED", { message: "Current password is incorrect" });
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
  return { message: "Password updated successfully" };
}
