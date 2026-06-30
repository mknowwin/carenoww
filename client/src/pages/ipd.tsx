import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BedDouble, Plus, Clock, CheckCircle2, LogOut,
  Activity, ChevronDown, ChevronUp, Stethoscope, ArrowLeftRight,
} from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ipd as ipdApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { todayInTz } from "@/lib/utils";
import AdmitModal from "@/components/modals/AdmitModal";
import DischargeModal from "@/components/modals/DischargeModal";
import NursingRoundModal from "@/components/modals/NursingRoundModal";

const WARDS = ["General Ward", "ICU", "Private Ward", "Semi-Private", "Obs/Gyn", "Pediatric"];

const WARD_COLORS: Record<string, string> = {
  ICU:            "bg-red-50 border-red-200 text-red-700",
  "General Ward": "bg-blue-50 border-blue-200 text-blue-700",
  "Private Ward": "bg-purple-50 border-purple-200 text-purple-700",
  "Semi-Private": "bg-teal-50 border-teal-200 text-teal-700",
  "Obs/Gyn":      "bg-pink-50 border-pink-200 text-pink-700",
  Pediatric:      "bg-amber-50 border-amber-200 text-amber-700",
};
const wardColor = (ward: string) => WARD_COLORS[ward] ?? "bg-gray-50 border-gray-200 text-gray-700";

function daysSince(date: string | Date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

export default function IPDPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [admitOpen,        setAdmitOpen]        = useState(false);
  const [dischargeTarget,  setDischargeTarget]  = useState<any>(null);
  const [roundTarget,      setRoundTarget]      = useState<any>(null);
  const [transferTarget,   setTransferTarget]   = useState<any>(null);
  const [expandedId,       setExpandedId]       = useState<string | null>(null);
  const [wardFilter,       setWardFilter]       = useState("All");
  const [search,           setSearch]           = useState("");
  const [activeTab,        setActiveTab]        = useState<"list" | "beds">("list");

  const { data: ipdData, isLoading } = useQuery({
    queryKey: ["ipd"],
    queryFn:  () => ipdApi.list({ status: "Active" }),
    refetchInterval: 30000,
  });
  const { data: bedsData } = useQuery({
    queryKey: ["ipd-beds"],
    queryFn:  () => ipdApi.beds(),
    refetchInterval: 30000,
  });
  const { data: dischargedData } = useQuery({
    queryKey: ["ipd-discharged"],
    queryFn:  () => ipdApi.list({ status: "Discharged" } as any),
    staleTime: 60000,
  });

  const admissions: any[] = ipdData?.admissions ?? [];
  const discharged: any[] = dischargedData?.admissions ?? [];
  const todayStr = todayInTz(user?.timezone ?? "Asia/Kolkata");

  const wards = ["All", ...Array.from(new Set<string>(admissions.map((a: any) => String(a.ward))))];

  const filtered = admissions.filter((a: any) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      a.patientName.toLowerCase().includes(q) ||
      a.admissionId.toLowerCase().includes(q) ||
      a.bedNumber.toLowerCase().includes(q);
    return matchSearch && (wardFilter === "All" || a.ward === wardFilter);
  });

  const icu   = admissions.filter((a: any) => a.ward === "ICU").length;
  const total = admissions.length;
  const tz = user?.timezone ?? "Asia/Kolkata";
  const dischargedToday = discharged.filter((d: any) =>
    d.dischargeDate &&
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(d.dischargeDate)) === todayStr
  ).length;

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Inpatient (IPD)</h2>
          <p className="text-sm text-muted-foreground">{total} active admissions · {icu} in ICU</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setAdmitOpen(true)}>
          <Plus className="h-4 w-4" /> Admit Patient
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Admitted",   value: total,          color: "text-blue-600",   bg: "bg-blue-50" },
          { label: "ICU",              value: icu,            color: "text-red-600",    bg: "bg-red-50" },
          { label: "Discharged Today", value: dischargedToday, color: "text-teal-600",  bg: "bg-teal-50" },
          { label: "Wards Active",     value: Object.keys(bedsData ?? {}).length, color: "text-purple-600", bg: "bg-purple-50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center`}>
                <span className={`text-lg font-bold ${s.color}`}>{s.value}</span>
              </div>
              <span className="text-sm font-medium">{s.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tab toggle */}
      <div className="flex gap-2 border-b pb-2">
        {(["list", "beds"] as const).map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`text-sm px-3 py-1 rounded-md capitalize transition-colors ${
              activeTab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}>
            {t === "list" ? "Patient List" : "Bed Map"}
          </button>
        ))}
      </div>

      {activeTab === "list" && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Search patient, bed, ADM-ID..." className="h-9 flex-1 min-w-40"
                value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="flex gap-1.5 flex-wrap">
                {wards.map((w) => (
                  <Button key={w} variant={wardFilter === w ? "default" : "outline"} size="sm" className="h-9"
                    onClick={() => setWardFilter(w)}>{w}</Button>
                ))}
              </div>
            </div>

            {isLoading && <p className="text-sm text-muted-foreground text-center py-8">Loading admissions...</p>}
            {!isLoading && filtered.length === 0 && (
              <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No active admissions</CardContent></Card>
            )}

            {filtered.map((adm: any) => {
              const days = daysSince(adm.admissionDate);
              const open = expandedId === adm._id;
              return (
                <Card key={adm._id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                        <BedDouble className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{adm.patientName}</span>
                          <Badge className="text-xs font-mono bg-blue-50 text-blue-700">{adm.admissionId}</Badge>
                          <Badge className={`text-xs border ${wardColor(adm.ward)}`}>{adm.ward}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Bed {adm.bedNumber} · {adm.department} · {adm.admittingDoctor}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">Dx: {adm.provisionalDiagnosis}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" /> Day {days + 1}
                        </div>
                        <p className="text-xs text-muted-foreground">{new Date(adm.admissionDate).toLocaleDateString("en-IN")}</p>
                      </div>
                    </div>

                    <div className="flex gap-1.5 mt-3 flex-wrap">
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                        onClick={() => setExpandedId(open ? null : adm._id)}>
                        <Activity className="h-3 w-3" />
                        {open ? <><ChevronUp className="h-3 w-3" /> Hide</> : <><ChevronDown className="h-3 w-3" /> Rounds</>}
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                        onClick={() => setRoundTarget(adm)}>
                        <Stethoscope className="h-3 w-3" /> Add Round
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs text-violet-700 border-violet-300 hover:bg-violet-50 gap-1"
                        onClick={() => setTransferTarget(adm)}>
                        <ArrowLeftRight className="h-3 w-3" /> Transfer
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50 gap-1"
                        onClick={() => setDischargeTarget(adm)}>
                        <LogOut className="h-3 w-3" /> Discharge
                      </Button>
                    </div>

                    {open && <RoundsPanel admissionId={adm._id} />}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Right: Recent discharges */}
          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Recent Discharges</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {discharged.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">No discharged patients</p>
                )}
                {discharged.slice(0, 10).map((d: any) => (
                  <div key={d._id} className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-teal-50 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{d.patientName}</p>
                      <p className="text-xs text-muted-foreground">{d.ward} · {d.discharge?.condition ?? "—"}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {d.dischargeDate ? new Date(d.dischargeDate).toLocaleDateString("en-IN") : "—"}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "beds" && <BedMapView bedsData={bedsData ?? {}} />}

      <AdmitModal open={admitOpen} onClose={() => setAdmitOpen(false)}
        onAdmitted={() => {
          qc.invalidateQueries({ queryKey: ["ipd"] });
          qc.invalidateQueries({ queryKey: ["ipd-beds"] });
        }} />

      {dischargeTarget && (
        <DischargeModal admission={dischargeTarget}
          onClose={() => setDischargeTarget(null)}
          onDischarged={() => {
            setDischargeTarget(null);
            qc.invalidateQueries({ queryKey: ["ipd"] });
            qc.invalidateQueries({ queryKey: ["ipd-beds"] });
            qc.invalidateQueries({ queryKey: ["ipd-discharged"] });
          }} />
      )}

      {roundTarget && (
        <NursingRoundModal admission={roundTarget}
          onClose={() => setRoundTarget(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["ipd-rounds", roundTarget._id] });
          }} />
      )}

      {transferTarget && (
        <TransferModal
          admission={transferTarget}
          onClose={() => setTransferTarget(null)}
          onTransferred={() => {
            setTransferTarget(null);
            qc.invalidateQueries({ queryKey: ["ipd"] });
            qc.invalidateQueries({ queryKey: ["ipd-beds"] });
          }}
        />
      )}
    </div>
  );
}

// ── Transfer Modal ────────────────────────────────────────────────────────────
function TransferModal({ admission, onClose, onTransferred }: { admission: any; onClose: () => void; onTransferred: () => void }) {
  const [ward,    setWard]    = useState(admission.ward);
  const [bed,     setBed]     = useState(admission.bedNumber);
  const [reason,  setReason]  = useState("");
  const [error,   setError]   = useState("");

  const mut = useMutation({
    mutationFn: () => ipdApi.transfer(admission._id, { ward, bedNumber: bed, reason }),
    onSuccess:  onTransferred,
    onError:    (e: any) => setError(e.message || "Transfer failed"),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="text-base font-bold">Transfer Patient</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{admission.patientName} · {admission.admissionId}</p>
          <p className="text-xs text-muted-foreground">Current: {admission.ward} — Bed {admission.bedNumber}</p>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">New Ward</Label>
            <select
              className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={ward}
              onChange={(e) => setWard(e.target.value)}
            >
              {WARDS.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">New Bed Number</Label>
            <Input className="mt-1 h-9" placeholder="e.g. B-205" value={bed} onChange={(e) => setBed(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Reason (optional)</Label>
            <Input className="mt-1 h-9" placeholder="e.g. Condition improved, moved from ICU" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1 gap-2"
            disabled={!ward || !bed || ward === admission.ward && bed === admission.bedNumber || mut.isPending}
            onClick={() => { setError(""); mut.mutate(); }}
          >
            <ArrowLeftRight className="h-4 w-4" />
            {mut.isPending ? "Transferring..." : "Confirm Transfer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Rounds panel (inline expand) ─────────────────────────────────────────────
function RoundsPanel({ admissionId }: { admissionId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["ipd-rounds", admissionId],
    queryFn:  () => ipdApi.get(admissionId),
    staleTime: 10000,
  });
  const rounds: any[] = data?.rounds ?? [];
  if (isLoading) return <p className="text-xs text-muted-foreground mt-2 pt-3 border-t">Loading rounds...</p>;
  if (rounds.length === 0) return <p className="text-xs text-muted-foreground mt-2 pt-3 border-t">No nursing rounds recorded yet.</p>;
  return (
    <div className="mt-3 border-t pt-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nursing Rounds ({rounds.length})</p>
      {[...rounds].reverse().slice(0, 5).map((r: any) => (
        <div key={r._id} className="bg-muted/40 rounded-lg px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">{r.nurse}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(r.roundedAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
            </span>
          </div>
          <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {r.bp    && <span>BP: {r.bp}</span>}
            {r.pulse ? <span>Pulse: {r.pulse}</span> : null}
            {r.temp  ? <span>Temp: {r.temp}°F</span> : null}
            {r.spo2  ? <span>SpO₂: {r.spo2}%</span> : null}
            {r.weight ? <span>Wt: {r.weight}kg</span> : null}
          </div>
          {r.notes && <p className="text-xs mt-1 text-foreground">{r.notes}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Bed map view ──────────────────────────────────────────────────────────────
function BedMapView({ bedsData }: { bedsData: Record<string, any[]> }) {
  const wards = Object.keys(bedsData);
  if (wards.length === 0) return (
    <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No active admissions to display on bed map</CardContent></Card>
  );
  return (
    <div className="space-y-4">
      {wards.map((ward) => {
        const beds: any[] = bedsData[ward];
        return (
          <Card key={ward}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">{ward}</CardTitle>
                <Badge className={`text-xs border ${wardColor(ward)}`}>{beds.length} occupied</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {beds.map((b: any) => (
                  <div key={b._id} className="border rounded-lg p-2 bg-blue-50 border-blue-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-blue-700">{b.bedNumber}</span>
                      <BedDouble className="h-3 w-3 text-blue-500" />
                    </div>
                    <p className="text-xs font-medium truncate">{b.patientName}</p>
                    <p className="text-xs text-muted-foreground truncate">{b.diagnosis}</p>
                    <p className="text-xs text-muted-foreground">Day {daysSince(b.since) + 1}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
