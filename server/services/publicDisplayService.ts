import Appointment from "../models/Appointment.js";
import Tenant from "../models/Tenant.js";
import { todayInTz } from "../lib/dateUtils.js";
import { AppError } from "../lib/AppError.js";

export async function getDisplayData(tenantId: string | undefined, slug: string | undefined) {
  let resolvedTenantId = tenantId;
  let resolvedTenant: any = null;

  if (!resolvedTenantId && slug) {
    resolvedTenant = await (Tenant as any).findOne({ slug });
    if (!resolvedTenant) throw AppError.notFound("Clinic not found");
    resolvedTenantId = resolvedTenant._id.toString();
  }

  if (!resolvedTenantId) throw AppError.badRequest("tenantId or slug required");

  if (!resolvedTenant) resolvedTenant = await (Tenant as any).findById(resolvedTenantId);
  const tz = resolvedTenant?.settings?.timezone || "Asia/Kolkata";
  const today = todayInTz(tz);

  const [inConsult, waiting] = await Promise.all([
    Appointment.find({
      tenantId: resolvedTenantId,
      date: today,
      status: "In Consult",
    }).select("token tokenNumber doctor department patientName calledAt"),
    Appointment.aggregate([
      {
        $match: {
          tenantId: { $eq: resolvedTenantId } as any,
          date: today,
          status: "Waiting",
        },
      },
      { $group: { _id: "$doctor", count: { $sum: 1 }, department: { $first: "$department" } } },
    ]),
  ]);

  const waitingMap: Record<string, number> = {};
  waiting.forEach((w: any) => { waitingMap[w._id] = w.count; });

  return {
    date: today,
    inConsult: inConsult.map((a) => ({
      token:       a.token,
      tokenNumber: a.tokenNumber,
      doctor:      a.doctor,
      department:  a.department,
      patientName: a.patientName,
      calledAt:    a.calledAt,
    })),
    waitingByDoctor: waitingMap,
  };
}
