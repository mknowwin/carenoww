import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  BedDouble, Plus, Clock, CheckCircle2, LogOut, Pencil, Settings, AlarmClock,
  ClipboardList, Stethoscope, ArrowLeftRight, Sparkles, Wrench,
} from "lucide-react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ipd as ipdApi, wards as wardsApi, type WardView, type BedView, type BedStatus } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { wardTypeColor, stayDay, canDo, roundDue, ROUND_DUE_HOURS } from "@/lib/ipd";
import { toast } from "@/hooks/use-toast";
import { useWards } from "@/components/BedPicker";
import { TransferModal, EditAdmissionModal } from "@/components/ipd/AdmissionDialogs";
import AdmitModal from "@/components/modals/AdmitModal";
import NursingRoundModal from "@/components/modals/NursingRoundModal";

export default function IPDPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const role = user?.role;
  const tz = user?.timezone ?? "Asia/Kolkata";
  const [, setLocation] = useLocation();
  const [admitOpen,        setAdmitOpen]        = useState(false);
  const [admitBedId,       setAdmitBedId]       = useState<string | undefined>();
  const [bedAction,        setBedAction]        = useState<{ ward: WardView; bed: BedView } | null>(null);
  const [roundTarget,      setRoundTarget]      = useState<any>(null);
  const [transferTarget,   setTransferTarget]   = useState<any>(null);
  const [editTarget,       setEditTarget]       = useState<any>(null);
  const [wardFilter,       setWardFilter]       = useState("All");
  const [search,           setSearch]           = useState("");
  const [activeTab,        setActiveTab]        = useState<"list" | "beds">("list");

  const { data: ipdData, isLoading } = useQuery({
    queryKey: ["ipd"],
    queryFn:  () => ipdApi.list({ status: "Active" }),
    refetchInterval: 30000,
  });
  const { data: wardList = [], isLoading: wardsLoading } = useWards();
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

  const openChart = (id: string, tab?: string) => setLocation(`/ipd/${id}${tab ? `?tab=${tab}` : ""}`);

  const refresh = (opts: { discharged?: boolean; roundsOf?: string } = {}) => {
    qc.invalidateQueries({ queryKey: ["ipd"] });
    qc.invalidateQueries({ queryKey: ["wards"] });
    qc.invalidateQueries({ queryKey: ["ipd-stats"] });
    qc.invalidateQueries({ queryKey: ["ipd-active-by-patient"] });
    if (opts.discharged) qc.invalidateQueries({ queryKey: ["ipd-discharged"] });
    if (opts.roundsOf)   qc.invalidateQueries({ queryKey: ["ipd-rounds", opts.roundsOf] });
  };

  const admissions: any[] = ipdData?.admissions ?? [];
  const discharged: any[] = dischargedData?.admissions ?? [];

  const wards = ["All", ...Array.from(new Set<string>([...wardList.map((w) => w.name), ...admissions.map((a: any) => String(a.ward))]))];
  const wardTypeByName = Object.fromEntries(wardList.map((w) => [w.name, w.type]));
  const wardColor = (name: string) => wardTypeColor(wardTypeByName[name] ?? (name === "ICU" ? "ICU" : undefined));
  const bedsTotal = wardList.reduce((n, w) => n + w.counts.total, 0);
  const bedsFree  = wardList.reduce((n, w) => n + w.counts.available, 0);

  const setBedStatus = async (bed: BedView, status: BedStatus) => {
    try {
      await wardsApi.setBedStatus(bed._id, status);
      qc.invalidateQueries({ queryKey: ["wards"] });
      setBedAction(null);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not update bed", description: e.message });
    }
  };

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

      {!wardsLoading && wardList.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <BedDouble className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 text-sm">
              <p className="font-medium">No wards or beds set up yet</p>
              <p className="text-muted-foreground text-xs">Patients are admitted into beds from the ward & bed list.{role !== "admin" && " Ask an admin to set it up."}</p>
            </div>
            {role === "admin" && (
              <Button size="sm" variant="outline" className="gap-2" onClick={() => setLocation("/settings?tab=wards")}>
                <Settings className="h-4 w-4" /> Set up wards & beds
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Admitted",   value: total,                       color: "text-blue-600",   bg: "bg-blue-50" },
          { label: "ICU",              value: icu,                         color: "text-red-600",    bg: "bg-red-50" },
          { label: "Discharged Today", value: stats?.dischargedToday ?? 0, color: "text-teal-600",   bg: "bg-teal-50" },
          { label: `Beds Free (of ${bedsTotal})`, value: bedsFree,     color: "text-purple-600", bg: "bg-purple-50" },
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
              const due = roundDue(adm);
              const demographics = [adm.patientId, adm.patientAge ? `${adm.patientAge}y` : "", adm.patientGender].filter(Boolean).join(" · ");
              return (
                <Card key={adm._id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3 cursor-pointer" role="link" tabIndex={0}
                      onClick={() => openChart(adm._id)} onKeyDown={(e) => { if (e.key === "Enter") openChart(adm._id); }}>
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                        <BedDouble className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{adm.patientName}</span>
                          <Badge className="text-xs font-mono bg-blue-50 text-blue-700">{adm.admissionId}</Badge>
                          <Badge className={`text-xs border ${wardColor(adm.ward)}`}>{adm.ward}</Badge>
                          {due && (
                            <span title={`No nursing round in the last ${ROUND_DUE_HOURS} hours`}
                              className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                              <AlarmClock className="h-3 w-3" /> Round due
                            </span>
                          )}
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
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={() => openChart(adm._id)}>
                        <ClipboardList className="h-3 w-3" /> Open Chart
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
                          onClick={() => openChart(adm._id, "discharge")}>
                          <LogOut className="h-3 w-3" /> Discharge
                        </Button>
                      )}
                    </div>
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
                  <button key={d._id} onClick={() => openChart(d._id)}
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

      {activeTab === "beds" && (
        <BedMapView wardList={wardList} tz={tz} onBedClick={(ward, bed) => setBedAction({ ward, bed })} />
      )}

      {bedAction && (
        <BedActionDialog
          ward={bedAction.ward}
          bed={bedAction.bed}
          tz={tz}
          role={role}
          onClose={() => setBedAction(null)}
          onAdmit={() => { setAdmitBedId(bedAction.bed._id); setAdmitOpen(true); setBedAction(null); }}
          onOpenAdmission={(admissionDbId) => openChart(admissionDbId)}
          onStatus={(status) => setBedStatus(bedAction.bed, status)}
        />
      )}

      <AdmitModal open={admitOpen} bedId={admitBedId}
        onClose={() => { setAdmitOpen(false); setAdmitBedId(undefined); }}
        onAdmitted={() => refresh()} />

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

    </div>
  );
}

// ── Bed map view ──────────────────────────────────────────────────────────────
const BED_STYLES = {
  occupied:    { box: "bg-blue-100 border-blue-300",      label: "text-blue-800",          icon: "text-blue-600" },
  Available:   { box: "bg-background border-emerald-300 border-dashed", label: "text-emerald-700", icon: "text-emerald-500" },
  Cleaning:    { box: "bg-amber-50 border-amber-200",     label: "text-amber-700",         icon: "text-amber-500" },
  Maintenance: { box: "bg-gray-100 border-gray-200",      label: "text-gray-500",          icon: "text-gray-400" },
} as const;
const bedStyle = (b: BedView) => BED_STYLES[b.occupant ? "occupied" : b.status];

function BedMapView({ wardList, tz, onBedClick }: {
  wardList: WardView[]; tz: string; onBedClick: (ward: WardView, bed: BedView) => void;
}) {
  if (wardList.length === 0) return (
    <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No wards set up yet</CardContent></Card>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {([["Occupied", "occupied"], ["Free", "Available"], ["Cleaning", "Cleaning"], ["Maintenance", "Maintenance"]] as const).map(([label, k]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`inline-block w-3 h-3 rounded border ${BED_STYLES[k].box}`} /> {label}
          </span>
        ))}
      </div>
      {wardList.map((ward) => (
        <Card key={ward._id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                {ward.name}
                <Badge className={`text-xs border ${wardTypeColor(ward.type)}`}>{ward.type}</Badge>
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {ward.counts.occupied} occupied · {ward.counts.available} free
                {ward.counts.cleaning ? ` · ${ward.counts.cleaning} cleaning` : ""}
                {ward.counts.maintenance ? ` · ${ward.counts.maintenance} maintenance` : ""}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {ward.beds.length === 0 ? (
              <p className="text-xs text-muted-foreground">No beds in this ward yet.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {ward.beds.map((b) => {
                  const s = bedStyle(b);
                  return (
                    <button key={b._id} onClick={() => onBedClick(ward, b)}
                      className={`border rounded-lg p-2 text-left transition-shadow hover:shadow-sm min-h-[72px] ${s.box}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-bold ${s.label}`}>{b.number}</span>
                        <BedDouble className={`h-3 w-3 ${s.icon}`} />
                      </div>
                      {b.occupant ? (
                        <>
                          <p className="text-xs font-medium truncate">{b.occupant.patientName}</p>
                          <p className="text-xs text-muted-foreground truncate">{b.occupant.diagnosis}</p>
                          <p className="text-xs text-muted-foreground">Day {stayDay(b.occupant.since, tz)}</p>
                        </>
                      ) : (
                        <p className={`text-xs ${s.label}`}>{b.status === "Available" ? "Free" : b.status}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Bed actions (from the bed map) ───────────────────────────────────────────
function BedActionDialog({ ward, bed, tz, role, onClose, onAdmit, onOpenAdmission, onStatus }: {
  ward: WardView; bed: BedView; tz: string; role?: string;
  onClose: () => void;
  onAdmit: () => void;
  onOpenAdmission: (admissionDbId: string) => void;
  onStatus: (status: BedStatus) => void;
}) {
  const o = bed.occupant;
  const canStatus = canDo(role, "bedStatus");
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>{ward.name} — {bed.number}</DialogTitle>
          <p className="text-sm text-muted-foreground">{o ? "Occupied" : bed.status === "Available" ? "Free" : bed.status}</p>
        </DialogHeader>
        {o ? (
          <div className="space-y-3">
            <div className="bg-blue-50 rounded-lg px-3 py-2 text-sm">
              <p className="font-medium">{o.patientName} <span className="font-mono text-xs text-muted-foreground">{o.patientId}</span></p>
              <p className="text-xs text-muted-foreground">{o.admissionId} · Day {stayDay(o.since, tz)} · {o.doctor}</p>
              <p className="text-xs text-muted-foreground truncate">Dx: {o.diagnosis}</p>
            </div>
            <Button className="w-full" onClick={() => onOpenAdmission(o.admissionDbId)}>Open chart</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {bed.status === "Available" && canDo(role, "admit") && (
              <Button className="w-full gap-2" onClick={onAdmit}><Plus className="h-4 w-4" /> Admit patient here</Button>
            )}
            {bed.status !== "Available" && canStatus && (
              <Button className="w-full gap-2" onClick={() => onStatus("Available")}><Sparkles className="h-4 w-4" /> Mark ready</Button>
            )}
            {bed.status === "Available" && canStatus && (
              <Button variant="outline" className="w-full gap-2" onClick={() => onStatus("Cleaning")}><Sparkles className="h-4 w-4" /> Mark for cleaning</Button>
            )}
            {bed.status !== "Maintenance" && canStatus && (
              <Button variant="outline" className="w-full gap-2" onClick={() => onStatus("Maintenance")}><Wrench className="h-4 w-4" /> Under maintenance</Button>
            )}
            {!canStatus && bed.status !== "Available" && (
              <p className="text-xs text-muted-foreground">A nurse or doctor can mark this bed ready.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
