import DrugBatch from "../models/DrugBatch.js";

export async function listBatches(tenantId: string, drugId?: string) {
  const query: any = { tenantId };
  if (drugId) query.drugId = drugId;
  return DrugBatch.find(query).sort({ expiryDate: 1 });
}

export async function getExpiryReport(tenantId: string, expiryWithin = "90", includeExpired = "true") {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(now.getDate() + parseInt(expiryWithin));

  const dateQuery =
    includeExpired === "false"
      ? { $gte: now, $lte: cutoff }
      : { $lte: cutoff };

  return DrugBatch.aggregate([
    { $match: { tenantId, expiryDate: dateQuery } },
    {
      $lookup: {
        from: "druginventories",
        localField: "drugId",
        foreignField: "_id",
        as: "drug",
      },
    },
    { $unwind: { path: "$drug", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        batchNo:           1,
        expiryDate:        1,
        quantityRemaining: 1,
        mrpPerUnit:        1,
        status:            1,
        supplierName:      1,
        drugName:          "$drug.name",
        drugCategory:      "$drug.category",
        drugUnit:          "$drug.unit",
      },
    },
    { $sort: { expiryDate: 1 } },
  ]);
}
