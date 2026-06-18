import Counter from "../models/Counter.js";

export async function getNextId(tenantId: string, name: string, prefix: string): Promise<string> {
  const counter = await Counter.findOneAndUpdate(
    { tenantId, name },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return `${prefix}${String(counter.seq).padStart(4, "0")}`;
}
