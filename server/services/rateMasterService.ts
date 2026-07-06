import ServiceRateMaster from "../models/ServiceRateMaster.js";
import { AppError } from "../lib/AppError.js";

export interface RateMasterListFilters {
  category?: string;
  search?: string;
}

export async function listRates(tenantId: string, filters: RateMasterListFilters) {
  const { category, search } = filters;
  const query: any = { tenantId, isActive: true };
  if (category) query.category = category;
  if (search)   query.name = { $regex: search, $options: "i" };
  return ServiceRateMaster.find(query).sort({ category: 1, name: 1 });
}

export async function createRate(tenantId: string, body: Record<string, any>) {
  return ServiceRateMaster.create({ ...body, tenantId });
}

export async function updateRate(tenantId: string, id: string, body: Record<string, any>) {
  const rate = await ServiceRateMaster.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: body },
    { new: true }
  );
  if (!rate) throw AppError.notFound("Rate not found");
  return rate;
}

export async function deactivateRate(tenantId: string, id: string) {
  const rate = await ServiceRateMaster.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: { isActive: false } },
    { new: true }
  );
  if (!rate) throw AppError.notFound("Rate not found");
  return { message: "Rate deactivated" };
}
