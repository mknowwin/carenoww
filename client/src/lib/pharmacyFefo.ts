// Mirrors server/lib/fefo.ts fefoDeduct's allocation order/logic (FEFO — earliest
// expiry first) so the client can preview exactly which batches a requested
// quantity will actually draw from, before the server performs the real deduction.

export interface FefoBatch {
  _id: string;
  batchNo: string;
  mrpPerUnit?: number;
  expiryDate?: string;
  quantityRemaining: number;
}

export interface BatchAllocation {
  batchId: string;
  batchNo: string;
  qty: number;
  mrpPerUnit: number;
  expiryDate?: string;
}

// `batches` must already be filtered to Active/in-stock and sorted by expiry
// ascending, same as the server's DrugBatch query in fefoDeduct.
export function allocateFefo(batches: FefoBatch[], qty: number): BatchAllocation[] {
  let remaining = qty;
  const allocations: BatchAllocation[] = [];
  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantityRemaining, remaining);
    if (take <= 0) continue;
    allocations.push({
      batchId: batch._id,
      batchNo: batch.batchNo,
      qty: take,
      mrpPerUnit: batch.mrpPerUnit ?? 0,
      expiryDate: batch.expiryDate,
    });
    remaining -= take;
  }
  return allocations;
}

export function totalAvailable(batches: FefoBatch[]): number {
  return batches.reduce((s, b) => s + b.quantityRemaining, 0);
}

export function allocationTotal(allocations: BatchAllocation[]): number {
  return allocations.reduce((s, a) => s + a.qty * a.mrpPerUnit, 0);
}
