import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BedDouble, Plus, Clock, CheckCircle2, LogOut, Pencil, Printer,
  Activity, ChevronDown, ChevronUp, Stethoscope, ArrowLeftRight,
} from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ipd as ipdApi, users as usersApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { WARDS, DEPTS, wardColor, normalizeBed, stayDay, canDo } from "@/lib/ipd";
import { printDischargeReport } from "@/lib/print";
import AdmitModal from "@/components/modals/AdmitModal";
import DischargeModal from "@/components/modals/DischargeModal";
import NursingRoundModal from "@/components/modals/NursingRoundModal";

export default function IPDPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const role = user?.role;
  const tz = user?.timezone ?? "Asia/Kolkata";
  const [admitOpen,        setAdmitOpen]        = useState(false);
  const [dischargeTarget,  setDischargeTarget]  = useState<any>(null);
  const [roundTarget,      setRoundTarget]      = useState<any>(null);
  const [transferTarget,   setTransferTarget]   = useState<any>(null);
  const [editTarget,       setEditTarget]       = useState<any>(null);
  const [viewDischargedId, setViewDischargedId] = useState<string | null>(null);
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
  const { data: stats } = useQuery({
    queryKey: ["ipd-stats"],
    queryFn:  () => ipdApi.stats(),
    refetchInterval: 30000,
  });
  const { data: dischargedData } = useQuery({
    queryKey: ["ipd-discharged"],
    queryFn:  () => ipdApi.list({ status: "Discharged", limit: "10" }),
    staleTime: 60000,
  });

  const refresh = (opts: { discharged?: boolean; roundsOf?: string } = {}) => {
    qc.invalidateQueries({ queryKey: ["ipd"] });
    qc.invalidateQueries({ queryKey: ["ipd-beds"] });
    qc.invalidateQueries({ queryKey: ["ipd-stats"] });
    qc.invalidateQueries({ queryKey: ["ipd-active-by-patient"] });
    if (opts.discharged) qc.invalidateQueries({ queryKey: ["ipd-discharged"] });
    if (opts.roundsOf)   qc.invalidateQueries({ queryKey: ["ipd-rounds", opts.roundsOf] });
  };

  const admissions: any[] = ipdData?.admissions ?? [];
  const discharged: any[] = dischargedData?.admissions ?? [];

  const wards = ["All", ...Array.from(new Set<string>(admissions.map((a: any) => String(a.ward))))];

  const filtered = admissions.filter((a: any) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      a.patientName.toLowerCase().includes(q) ||
      a.admissionId.toLowerCase().includes(q) ||
      a.bedNumber.toLowerCase().includes(q) ||
      String(a.patientId ?? "").toLowerCase().includes(q);
    return matchSearch && (wardFilter === "All" || a.ward === wardFilter);
  });

  const total = stats?.active ?? admissions.length;
  const icu   = stats?.icu ?? admissions.filter((a: any) => a.ward === "ICU").length;

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Inpatient (IPD)</h2>
          <p className="text-sm text-muted-foreground">{total} active admissions · {icu} in ICU</p>
        </div>
        {canDo(role, "admit") && (
          <Button size="sm" className="gap-2" onClick={() => setAdmitOpen(true)}>
            <Plus className="h-4 w-4" /> Admit Patient
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Admitted",   value: total,                       color: "text-blue-600",   bg: "bg-blue-50" },
          { label: "ICU",              value: icu,                         color: "text-red-600",    bg: "bg-red-50" },
          { label: "Discharged Today", value: stats?.dischargedToday ?? 0, color: "text-teal-600",   bg: "bg-teal-50" },
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
              <Input placeholder="Search patient, UHID, bed, ADM-ID..." className="h-9 flex-1 min-w-40"
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
              const day = stayDay(adm.admissionDate, tz);
              const open = expandedId === adm._id;
              const demographics = [adm.patientId, adm.patientAge ? `${adm.patientAge}y` : "", adm.patientGender].filter(Boolean).join(" · ");
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
                        {demographics && <p className="text-xs text-muted-foreground font-mono mt-0.5">{demographics}</p>}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Bed {adm.bedNumber}{adm.department ? ` · ${adm.department}` : ""} · {adm.admittingDoctor}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">Dx: {adm.provisionalDiagnosis}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" /> Day {day}
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
                      {canDo(role, "round") && (
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                          onClick={() => setRoundTarget(adm)}>
                          <Stethoscope className="h-3 w-3" /> Add Round
                        </Button>
                      )}
                      {canDo(role, "edit") && (
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                          onClick={() => setEditTarget(adm)}>
                          <Pencil className="h-3 w-3" /> Edit
                        </Button>
                      )}
                      {canDo(role, "transfer") && (
                        <Button variant="outline" size="sm" className="h-7 text-xs text-violet-700 border-violet-300 hover:bg-violet-50 gap-1"
                          onClick={() => setTransferTarget(adm)}>
                          <ArrowLeftRight className="h-3 w-3" /> Transfer
                        </Button>
                      )}
                      {canDo(role, "discharge") && (
                        <Button variant="outline" size="sm" className="h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50 gap-1"
                          onClick={() => setDischargeTarget(adm)}>
                          <LogOut className="h-3 w-3" /> Discharge
                        </Button>
                      )}
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
              <CardContent className="space-y-1">
                {discharged.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">No discharged patients</p>
                )}
                {discharged.map((d: any) => (
                  <button key={d._id} onClick={() => setViewDischargedId(d._id)}
                    className="w-full flex items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-muted transition-colors">
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
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "beds" && <BedMapView bedsData={bedsData ?? {}} tz={tz} />}

      <AdmitModal open={admitOpen} onClose={() => setAdmitOpen(false)} onAdmitted={() => refresh()} />

      {dischargeTarget && (
        <DischargeModal admission={dischargeTarget}
          onClose={() => setDischargeTarget(null)}
          onDischarged={() => refresh({ discharged: true })} />
      )}

      {roundTarget && (
        <NursingRoundModal admission={roundTarget}
          onClose={() => setRoundTarget(null)}
          onSaved={() => refresh({ roundsOf: roundTarget._id })} />
      )}

      {transferTarget && (
        <TransferModal
          admission={transferTarget}
          onClose={() => setTransferTarget(null)}
          onTransferred={() => {
            refresh({ roundsOf: transferTarget._id });
            setTransferTarget(null);
          }}
        />
      )}

      {editTarget && (
        <EditAdmissionModal
          admission={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            refresh({ roundsOf: editTarget._id });
            setEditTarget(null);
          }}
        />
      )}

      {viewDischargedId && (
        <DischargedDetailModal admissionId={viewDischargedId} tz={tz} onClose={() => setViewDischargedId(null)} />
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

  const unchanged = ward === admission.ward && normalizeBed(bed) === admission.bedNumber;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Transfer Patient</DialogTitle>
          <p className="text-sm text-muted-foreground">{admission.patientName} · {admission.admissionId}</p>
          <p className="text-xs text-muted-foreground">Current: {admission.ward} — Bed {admission.bedNumber}</p>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">New Ward</Label>
            <Select value={ward} onValueChange={setWard}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WARDS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">New Bed Number</Label>
            <Input className="mt-1 h-9 uppercase" placeholder="e.g. B-205" value={bed} onChange={(e) => setBed(e.target.value.toUpperCase())} />
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
            disabled={!ward || !bed.trim() || unchanged || mut.isPending}
            onClick={() => { setError(""); mut.mutate(); }}
          >
            <ArrowLeftRight className="h-4 w-4" />
            {mut.isPending ? "Transferring..." : "Confirm Transfer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit admission (diagnosis / department / doctor) ─────────────────────────
function EditAdmissionModal({ admission, onClose, onSaved }: { admission: any; onClose: () => void; onSaved: () => void }) {
  const [diagnosis, setDiagnosis] = useState(admission.provisionalDiagnosis ?? "");
  const [dept,      setDept]      = useState(admission.department ?? "");
  const [doctor,    setDoctor]    = useState(admission.admittingDoctor ?? "");
  const [doctorId,  setDoctorId]  = useState(admission.admittingDoctorId ?? "");
  const [error,     setError]     = useState("");

  const { data: doctorsData } = useQuery({ queryKey: ["doctors-admit"], queryFn: () => usersApi.doctors() });
  const doctors: any[] = doctorsData ?? [];

  const mut = useMutation({
    mutationFn: () => ipdApi.update(admission._id, {
      provisionalDiagnosis: diagnosis, department: dept, admittingDoctor: doctor, admittingDoctorId: doctorId,
    }),
    onSuccess: onSaved,
    onError:   (e: any) => setError(e.message || "Update failed"),
  });

  // Keep departments the admission already uses even if not in the fixed list
  const deptOptions = dept && !DEPTS.includes(dept) ? [dept, ...DEPTS] : DEPTS;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Admission</DialogTitle>
          <p className="text-sm text-muted-foreground">{admission.patientName} · {admission.admissionId}</p>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Provisional Diagnosis</Label>
            <Textarea className="mt-1 h-20" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Department</Label>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {deptOptions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Admitting Doctor</Label>
            <Select value={doctorId} onValueChange={(id) => {
              setDoctorId(id);
              setDoctor(doctors.find((d: any) => d._id === id)?.name ?? doctor);
            }}>
              <SelectTrigger className="mt-1 h-9"><SelectValue placeholder={doctor || "Select doctor"} /></SelectTrigger>
              <SelectContent>
                {doctors.map((d: any) => (
                  <SelectItem key={d._id} value={d._id}>{d.name} — {d.specialty || d.department}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">To change ward or bed, use Transfer.</p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!diagnosis.trim() || !doctor || mut.isPending} onClick={() => { setError(""); mut.mutate(); }}>
            {mut.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Discharged admission (read-only) ─────────────────────────────────────────
function DischargedDetailModal({ admissionId, tz, onClose }: { admissionId: string; tz: string; onClose: () => void }) {
  const { data: adm, isLoading } = useQuery({
    queryKey: ["ipd-rounds", admissionId],
    queryFn:  () => ipdApi.get(admissionId),
  });
  const d = adm?.discharge ?? {};
  const rows: [string, string | undefined][] = adm ? [
    ["Final Diagnosis",       d.finalDiagnosis],
    ["Treatment Summary",     d.treatment],
    ["Discharge Medications", d.medications],
    ["Follow-up",             d.followUp],
    ["Notes",                 d.notes],
  ] : [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Discharge Summary</DialogTitle>
        </DialogHeader>
        {isLoading || !adm ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>
        ) : (
          <div className="space-y-3">
            <div className="bg-teal-50 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold">{adm.patientName} <span className="font-mono text-xs text-muted-foreground">{adm.patientId}</span></p>
              <p className="text-xs text-muted-foreground">
                {adm.admissionId} · {adm.ward} {adm.bedNumber} · {adm.admittingDoctor}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(adm.admissionDate).toLocaleDateString("en-IN")} → {adm.dischargeDate ? new Date(adm.dischargeDate).toLocaleDateString("en-IN") : "—"}
                {adm.dischargeDate && ` · ${stayDay(adm.admissionDate, tz, adm.dischargeDate)} days`}
                {" · "}<span className="font-medium text-foreground">{d.condition ?? "—"}</span>
                {d.dischargedBy && ` · by ${d.dischargedBy}`}
              </p>
            </div>
            {rows.filter(([, v]) => v).map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
                <p className="text-sm whitespace-pre-wrap">{value}</p>
              </div>
            ))}
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button className="gap-2" onClick={() => printDischargeReport(adm)}>
                <Printer className="h-4 w-4" /> Print Summary
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Rounds panel (inline expand): rounds + transfers, newest first ───────────
function RoundsPanel({ admissionId }: { admissionId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["ipd-rounds", admissionId],
    queryFn:  () => ipdApi.get(admissionId),
    staleTime: 10000,
  });
  const rounds: any[] = data?.rounds ?? [];
  const transfers: any[] = data?.transfers ?? [];
  const timeline = [
    ...rounds.map((r) => ({ kind: "round" as const, at: r.roundedAt, r })),
    ...transfers.map((t) => ({ kind: "transfer" as const, at: t.at, t })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const fmt = (v: string) => new Date(v).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });

  if (isLoading) return <p className="text-xs text-muted-foreground mt-2 pt-3 border-t">Loading rounds...</p>;
  if (timeline.length === 0) return <p className="text-xs text-muted-foreground mt-2 pt-3 border-t">No nursing rounds recorded yet.</p>;
  return (
    <div className="mt-3 border-t pt-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Nursing Rounds ({rounds.length}){transfers.length ? ` · Transfers (${transfers.length})` : ""}
      </p>
      {timeline.slice(0, 8).map((e) => e.kind === "transfer" ? (
        <div key={`t-${e.t._id}`} className="bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-violet-700 flex items-center gap-1">
              <ArrowLeftRight className="h-3 w-3" />
              {e.t.fromWard ? `${e.t.fromWard} ${e.t.fromBed} → ` : "→ "}{e.t.toWard} {e.t.toBed}
            </span>
            <span className="text-xs text-muted-foreground">{fmt(e.at)}</span>
          </div>
          {(e.t.reason || e.t.by) && (
            <p className="text-xs mt-1 text-muted-foreground">{[e.t.reason, e.t.by && `by ${e.t.by}`].filter(Boolean).join(" · ")}</p>
          )}
        </div>
      ) : (
        <div key={e.r._id} className="bg-muted/40 rounded-lg px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">{e.r.nurse}</span>
            <span className="text-xs text-muted-foreground">{fmt(e.at)}</span>
          </div>
          <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {e.r.bp    && <span>BP: {e.r.bp}</span>}
            {e.r.pulse ? <span>Pulse: {e.r.pulse}</span> : null}
            {e.r.temp  ? <span>Temp: {e.r.temp}°F</span> : null}
            {e.r.spo2  ? <span>SpO₂: {e.r.spo2}%</span> : null}
            {e.r.weight ? <span>Wt: {e.r.weight}kg</span> : null}
          </div>
          {e.r.notes && <p className="text-xs mt-1 text-foreground">{e.r.notes}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Bed map view ──────────────────────────────────────────────────────────────
function BedMapView({ bedsData, tz }: { bedsData: Record<string, any[]>; tz: string }) {
  const wards = Object.keys(bedsData);
  if (wards.length === 0) return (
    <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No active admissions to display on bed map</CardContent></Card>
  );
  return (
    <div className="space-y-4">
      {wards.map((ward) => {
        const beds: any[] = [...bedsData[ward]].sort((a, b) => String(a.bedNumber).localeCompare(String(b.bedNumber), undefined, { numeric: true }));
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
                    <p className="text-xs text-muted-foreground">Day {stayDay(b.since, tz)}</p>
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
