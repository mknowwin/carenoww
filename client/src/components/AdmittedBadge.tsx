import { useQuery } from "@tanstack/react-query";
import { BedDouble } from "lucide-react";
import { ipd as ipdApi } from "@/lib/api";

type ActiveAdmission = { _id: string; admissionId: string; ward: string; bedNumber: string; admissionDate: string };

// One request per page for every UHID on screen: { [uhid]: active admission }
export function useActiveAdmissions(uhids: (string | undefined | null)[]) {
  const ids = Array.from(new Set(uhids.filter((u): u is string => !!u))).sort();
  const { data } = useQuery({
    queryKey: ["ipd-active-by-patient", ids],
    queryFn:  () => ipdApi.activeByPatient(ids),
    enabled:  ids.length > 0,
    staleTime: 30000,
  });
  return (data ?? {}) as Record<string, ActiveAdmission>;
}

// "IPD · ADM-0042 · GW-05" — marks a UHID that is currently an inpatient
export default function AdmittedBadge({ admission, compact = false }: { admission?: ActiveAdmission | null; compact?: boolean }) {
  if (!admission) return null;
  return (
    <span
      title={`Currently admitted — ${admission.admissionId}, ${admission.ward} bed ${admission.bedNumber}`}
      className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 whitespace-nowrap"
    >
      <BedDouble className="h-3 w-3" />
      {compact ? `IPD · ${admission.bedNumber}` : `IPD · ${admission.admissionId} · ${admission.ward} ${admission.bedNumber}`}
    </span>
  );
}
