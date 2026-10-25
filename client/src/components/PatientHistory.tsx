import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, Hash, Pill, FlaskConical, Eye, BedDouble } from "lucide-react";
import VisitDetailModal from "@/components/modals/VisitDetailModal";
import { appointments as apptApi, lab as labApi, prescriptions as rxApi, ipd as ipdApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { stayDay } from "@/lib/ipd";

const LAB_STATUS_COLOR: Record<string, string> = {
  Pending:    "bg-amber-100 text-amber-700",
  Collected:  "bg-blue-100 text-blue-700",
  Processing: "bg-violet-100 text-violet-700",
  Completed:  "bg-teal-100 text-teal-700",
  Cancelled:  "bg-red-100 text-red-600",
};

const SOAP_LABELS: [key: string, label: string][] = [
  ["subjective", "Subjective"],
  ["objective",  "Objective"],
  ["assessment", "Diagnosis"],
  ["plan",       "Plan"],
];

function groupByAppt(items: any[]) {
  const map = new Map<string, any[]>();
  for (const it of items) {
    const key = it.appointmentId || "";
    map.set(key, [...(map.get(key) ?? []), it]);
  }
  return map;
}

export function VitalsBadges({ vitals }: { vitals?: Record<string, string> }) {
  if (!vitals || !Object.values(vitals).some(Boolean)) return null;
  return (
    <div className="flex gap-1.5 flex-wrap">
      {vitals.bp     && <Badge className="text-xs bg-blue-50 text-blue-700 border border-blue-200">BP {vitals.bp}</Badge>}
      {vitals.pulse  && <Badge className="text-xs bg-green-50 text-green-700 border border-green-200">P {vitals.pulse} bpm</Badge>}
      {vitals.temp   && <Badge className="text-xs bg-orange-50 text-orange-700 border border-orange-200">T {vitals.temp}°F</Badge>}
      {vitals.spo2   && <Badge className="text-xs bg-purple-50 text-purple-700 border border-purple-200">SpO2 {vitals.spo2}%</Badge>}
      {vitals.weight && <Badge className="text-xs bg-muted text-muted-foreground">Wt {vitals.weight} kg</Badge>}
      {vitals.height && <Badge className="text-xs bg-muted text-muted-foreground">Ht {vitals.height} cm</Badge>}
    </div>
  );
}

function RxList({ scripts }: { scripts: any[] }) {
  if (scripts.length === 0) return null;
  return (
    <div className="text-xs mt-2">
      <p className="font-semibold text-foreground flex items-center gap-1"><Pill className="h-3 w-3" /> Prescriptions</p>
      <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
        {scripts.flatMap((rx) =>
          (rx.items ?? []).map((it: any, i: number) => (
            <li key={`${rx._id}-${i}`}>
              {it.drug}{it.dose ? ` ${it.dose}` : ""}
              {[it.frequency, it.duration].filter(Boolean).length > 0 && ` · ${[it.frequency, it.duration].filter(Boolean).join(" · ")}`}
              {it.instructions && <span className="italic"> — {it.instructions}</span>}
              {rx.status === "Cancelled" && <span className="text-red-600"> (cancelled)</span>}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function LabList({ orders }: { orders: any[] }) {
  if (orders.length === 0) return null;
  return (
    <div className="text-xs mt-2">
      <p className="font-semibold text-foreground flex items-center gap-1"><FlaskConical className="h-3 w-3" /> Lab Tests</p>
      <div className="mt-0.5 space-y-1">
        {orders.map((o) => (
          <div key={o._id} className="text-muted-foreground">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span>{o.test}</span>
              <Badge className={`text-[10px] px-1.5 py-0 ${LAB_STATUS_COLOR[o.status] ?? "bg-gray-100 text-gray-600"}`}>{o.status}</Badge>
            </div>
            {o.status === "Completed" && (o.parameters?.length > 0 ? (
              <ul className="ml-3 list-disc list-inside">
                {o.parameters.map((p: any, i: number) => (
                  <li key={i}>
                    {p.name}: <span className="text-foreground">{p.value}</span>{p.unit ? ` ${p.unit}` : ""}
                    {p.referenceRange && <span className="opacity-70"> (ref {p.referenceRange})</span>}
                  </li>
                ))}
              </ul>
            ) : o.result ? (
              <p className="ml-3">Result: <span className="text-foreground">{o.result}</span></p>
            ) : null)}
          </div>
        ))}
      </div>
    </div>
  );
}

// Full visit history for a patient: vitals, SOAP, prescriptions and lab results per visit.
const fmtDay = (v: string) => new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

// One inpatient stay in the history timeline; opens the IPD chart
function StayCard({ stay, scripts, labs, onOpen }: { stay: any; scripts: any[]; labs: any[]; onOpen: () => void }) {
  const { user } = useAuth();
  const active = stay.status === "Active";
  const days = stayDay(stay.admissionDate, user?.timezone ?? "Asia/Kolkata", stay.dischargeDate ?? new Date());
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      className="border border-blue-200 bg-blue-50/30 rounded-xl p-3 cursor-pointer hover:shadow-sm hover:border-blue-300 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
          <BedDouble className="h-4 w-4 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">IPD · {fmtDay(stay.admissionDate)} – {stay.dischargeDate ? fmtDay(stay.dischargeDate) : "now"}</span>
            <Badge className={`text-xs ${active ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
              {active ? "Admitted" : stay.discharge?.condition ?? "Discharged"}
            </Badge>
            <span className="text-xs font-mono text-muted-foreground">{stay.admissionId}</span>
            <Button size="sm" variant="outline" className="ml-auto h-7 gap-1 text-xs"
              onClick={(e) => { e.stopPropagation(); onOpen(); }}>
              <Eye className="h-3 w-3" /> Open chart
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {stay.admittingDoctor} · {stay.ward} {stay.bedNumber} · {days} day{days !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            <span className="font-semibold text-foreground">{stay.discharge?.finalDiagnosis ? "Final diagnosis" : "Diagnosis"}:</span>{" "}
            {stay.discharge?.finalDiagnosis || stay.provisionalDiagnosis}
          </p>
          <RxList scripts={scripts} />
          <LabList orders={labs} />
        </div>
      </div>
    </div>
  );
}

export default function PatientHistory({ patientId }: { patientId: string }) {
  const [, setLocation] = useLocation();
  const [showCancelled, setShowCancelled] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: stayData } = useQuery({
    queryKey: ["ipd-history", patientId],
    queryFn:  () => ipdApi.list({ status: "all", patientId, limit: "50" }),
    enabled:  !!patientId,
    retry: false,
  });

  const { data: histData, isLoading } = useQuery({
    queryKey: ["appt-history", patientId],
    queryFn:  () => apptApi.list({ patientId, limit: "50" }),
    enabled:  !!patientId,
    retry: false,
  });

  const { data: labData, error: labError } = useQuery({
    queryKey: ["lab-history", patientId],
    queryFn:  () => labApi.list({ patientId, limit: "100" }),
    enabled:  !!patientId,
    retry: false,
  });

  const { data: rxData, error: rxError } = useQuery({
    queryKey: ["rx-history", patientId],
    queryFn:  () => rxApi.list({ patientId }),
    enabled:  !!patientId,
    retry: false,
  });

  const allVisits: any[] = [...(histData?.appointments ?? [])]
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const cancelledCount = allVisits.filter((a) => a.status === "Cancelled").length;
  const history = showCancelled ? allVisits : allVisits.filter((a) => a.status !== "Cancelled");

  const labOrders: any[] = Array.isArray(labData) ? labData : (labData as any)?.orders ?? [];
  const scripts: any[]   = Array.isArray(rxData)  ? rxData  : [];
  // 403 = the server doesn't show this role lab orders / prescriptions (e.g. receptionist)
  const labsRestricted = (labError as any)?.statusCode === 403;
  const rxRestricted   = (rxError as any)?.statusCode === 403;
  const labsByAppt = groupByAppt(labOrders);
  const rxByAppt   = groupByAppt(scripts);

  const stays: any[] = stayData?.admissions ?? [];
  const stayIds = new Set(stays.map((s) => String(s._id)));
  const labsForStay = (id: string) => labOrders.filter((o) => o.admissionId === id);
  const rxForStay   = (id: string) => scripts.filter((r) => r.admissionId === id);

  // Orders not tied to a listed visit or stay (e.g. older than the visit page)
  const visitIds = new Set(allVisits.map((a) => String(a._id || a.id)));
  const unlinked = (o: any) => !(o.appointmentId && visitIds.has(String(o.appointmentId))) && !(o.admissionId && stayIds.has(String(o.admissionId)));
  const otherLabs = labOrders.filter(unlinked);
  const otherRx   = scripts.filter(unlinked);

  // OPD visits and IPD stays in one newest-first timeline
  const timeline = [
    ...history.map((a: any) => ({ kind: "visit" as const, t: new Date(a.date).getTime(), a })),
    ...stays.map((s: any) => ({ kind: "stay" as const, t: new Date(s.admissionDate).getTime(), s })),
  ].sort((x, y) => y.t - x.t);

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Loading visit history...</div>;
  }
  if (allVisits.length === 0 && stays.length === 0 && otherLabs.length === 0 && otherRx.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
        No past visit records found.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {cancelledCount > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => setShowCancelled((s) => !s)}
          >
            {showCancelled ? "Hide" : "Show"} cancelled ({cancelledCount})
          </button>
        </div>
      )}

      {timeline.map((entry) => {
        if (entry.kind === "stay") {
          const sid = String(entry.s._id);
          return <StayCard key={`stay-${sid}`} stay={entry.s} scripts={rxForStay(sid)} labs={labsForStay(sid)} onOpen={() => setLocation(`/ipd/${sid}`)} />;
        }
        const a = entry.a;
        const id = String(a._id || a.id);
        const visitLabs = labsByAppt.get(id) ?? [];
        const visitRx   = rxByAppt.get(id) ?? [];
        const soapRows  = SOAP_LABELS.filter(([k]) => a.soap?.[k]);
        const hasDetail = a.notes || soapRows.length > 0 || visitLabs.length > 0 || visitRx.length > 0;
        return (
          <div
            key={id}
            role="button"
            tabIndex={0}
            onClick={() => setDetailId(id)}
            onKeyDown={(e) => { if (e.key === "Enter") setDetailId(id); }}
            className="border rounded-xl p-3 cursor-pointer hover:shadow-sm hover:border-teal-300 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 flex flex-col items-center justify-center shrink-0">
                <Hash className="h-3 w-3 text-teal-500" />
                <span className="text-xs font-bold text-teal-700 font-mono leading-tight">{a.token || "—"}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{a.date}</span>
                  <Badge className={`text-xs ${
                    a.status === "Completed" ? "bg-teal-100 text-teal-700" :
                    a.status === "Cancelled" ? "bg-red-100 text-red-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>{a.status}</Badge>
                  <Badge className="text-xs bg-gray-100 text-gray-600">{a.type}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7 gap-1 text-xs"
                    onClick={(e) => { e.stopPropagation(); setDetailId(id); }}
                  >
                    <Eye className="h-3 w-3" /> View details
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{a.doctor} · {a.department} · {a.time}</p>
                {/* Vitals recorded at check-in or during consultation */}
                <div className="mt-2"><VitalsBadges vitals={a.vitals} /></div>
                {/* Purpose of visit — chief complaint captured at booking */}
                {a.notes && (
                  <p className="text-xs text-muted-foreground mt-2">
                    <span className="font-semibold text-foreground">Reason for visit:</span> {a.notes}
                  </p>
                )}
                {/* SOAP notes */}
                {soapRows.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-2 space-y-0.5 bg-muted/40 rounded px-2 py-1.5">
                    {soapRows.map(([k, label]) => (
                      <p key={k} className="whitespace-pre-wrap"><span className="font-semibold text-foreground">{label}:</span> {a.soap[k]}</p>
                    ))}
                  </div>
                )}
                <RxList scripts={visitRx} />
                <LabList orders={visitLabs} />
                {!hasDetail && (
                  <p className="text-xs text-muted-foreground/50 italic mt-2">No visit reason or diagnosis recorded</p>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {(otherLabs.length > 0 || otherRx.length > 0) && (
        <div className="border rounded-xl p-3">
          <p className="text-sm font-medium">Other orders</p>
          <p className="text-xs text-muted-foreground">Not linked to a visit or stay above</p>
          <RxList scripts={otherRx} />
          <LabList orders={otherLabs} />
        </div>
      )}

      <VisitDetailModal
        open={!!detailId}
        onClose={() => setDetailId(null)}
        visit={allVisits.find((a) => String(a._id || a.id) === detailId)}
        labs={detailId ? labsByAppt.get(detailId) ?? [] : []}
        scripts={detailId ? rxByAppt.get(detailId) ?? [] : []}
        labsRestricted={labsRestricted}
        rxRestricted={rxRestricted}
      />
    </div>
  );
}
