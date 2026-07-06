import Supplier from "../models/Supplier.js";
import { AppError } from "../lib/AppError.js";

export async function searchSuppliers(tenantId: string, search?: string) {
  const filter: any = { tenantId };
  if (search?.trim()) {
    filter.name = { $regex: search.trim(), $options: "i" };
  }
  return Supplier.find(filter).sort({ name: 1 }).limit(10).lean();
}

export async function createSupplier(tenantId: string, body: Record<string, any>) {
  const { name, phone, email, address, gstNo } = body;
  if (!name?.trim()) throw AppError.badRequest("Name is required");

  const existing = await Supplier.findOne({
    tenantId,
    name: { $regex: `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
  });
  if (existing) return { supplier: existing, created: false };

  const supplier = await Supplier.create({
    tenantId,
    name: name.trim(),
    phone: phone?.trim() ?? "",
    email: email?.trim() ?? "",
    address: address?.trim() ?? "",
    gstNo: gstNo?.trim() ?? "",
  });
  return { supplier, created: true };
}
