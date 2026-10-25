import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, ArrowLeftRight, BedDouble, CalendarPlus, CheckCircle2, Clock, FlaskConical,
  LogOut, NotebookPen, Pencil, Pill, Printer, Stethoscope, AlarmClock,
} from "lucide-react";
import { ipd as ipdApi, lab as labApi, prescriptions as rxApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { canDo, stayDay, vitalFlags, roundDue, ROUND_DUE_HOURS } from "@/lib/ipd";
import { printDischargeReport, printLabReport } from "@/lib/print";
import { toast } from "@/hooks/use-toast";
import SoapTextarea from "@/components/SoapTextarea";
import VitalFlags from "@/components/ipd/VitalFlags";
import VitalsCharts from "@/components/ipd/VitalsCharts";
import DischargeForm from "@/components/ipd/DischargeForm";
import BillTab from "@/components/ipd/BillTab";
import { TransferModal, EditAdmissionModal } from "@/components/ipd/AdmissionDialogs";
import NursingRoundModal from "@/components/modals/NursingRoundModal";
import PrescriptionModal from "@/components/modals/PrescriptionModal";
import LabOrderModal from "@/components/modals/LabOrderModal";
import AppointmentModal from "@/components/modals/AppointmentModal";

const TABS = [
  { id: "overview",  label: "Overview" },
  { id: "vitals",    label: "Vitals" },
  { id: "notes",     label: "Notes" },
  { id: "orders",    label: "Orders" },
  { id: "transfers", label: "Transfers" },
  { id: "discharge", label: "Discharge" },
  { id: "bill",      label: "Bill" },
] as const;
type TabId = typeof TABS[number]["id"];

const fmtDateTime = (v: string | Date) => new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const LAB_STATUS: Record<string, string> = {
  Completed: "bg-teal-100 text-teal-700", Processing: "bg-blue-100 text-blue-700",
  Collected: "bg-violet-100 text-violet-700", Pending: "bg-amber-100 text-amber-700", Scheduled: "bg-gray-100 text-gray-600",
};
const SOAP_ROWS = [["subjective", "S"], ["objective", "O"], ["assessment", "A"], ["plan", "P"]] as const;

// "Tab Amox 500mg — 1 BD × 5 days" lines from the stay's prescriptions (discharge medication starter)
function medsText(scripts: any[]) {
  return scripts.filter((rx) => rx.status !== "Cancelled").flatMap((rx) => (rx.items ?? []).map((it: any) =>
    [it.drug, it.dose && `— ${it.dose}`, it.frequency, it.duration && `× ${it.duration}`, it.instructions && `(${it.instructions})`].filter(Boolean).join(" ")
  )).join("\n");
}

export default function IPDChartPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const role = user?.role;
  const tz = user?.timezone ?? "Asia/Kolkata";

  const tabs = TABS.filter((t) => t.id !== "bill" || canDo(role, "bill"));
  const [tab, setTab] = useState<TabId>(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    return (tabs.some((x) => x.id === t) ? t : "overview") as TabId;
  });
  const [roundOpen, setRoundOpen]       = useState(false);
  const [rxOpen, setRxOpen]             = useState(false);
  const [labOpen, setLabOpen]           = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editOpen, setEditOpen]         = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);

  const { data: adm, isLoading, error } = useQuery({
    queryKey: ["ipd-rounds", id],
    queryFn:  () => ipdApi.get(id),
    refetchInterval: 30000,
  });
  // 403 = this role can't see prescriptions / lab orders (same rule as patient history)
  const { data: rxData, error: rxError } = useQuery({
    queryKey: ["ipd-rx", id],
    queryFn:  () => rxApi.list({ admissionId: id }),
    retry: false,
  });
  const { data: labData, error: labError } = useQuery({
    queryKey: ["ipd-labs", id],
    queryFn:  () => labApi.list({ admissionId: id, limit: "100" }),
    retry: false,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["ipd-rounds", id] });
    qc.invalidateQueries({ queryKey: ["ipd"] });
    qc.invalidateQueries({ queryKey: ["ipd-stats"] });
    qc.invalidateQueries({ queryKey: ["wards"] });
    qc.invalidateQueries({ queryKey: ["ipd-active-by-patient"] });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground text-center py-16">Loading chart…</p>;
  if (error || !adm) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-sm text-muted-foreground">Admission not found.</p>
        <Button variant="outline" size="sm" onClick={() => setLocation("/ipd")}>Back to IPD</Button>
      </div>
    );
  }

  const active = adm.status === "Active";
  const scripts: any[] = Array.isArray(rxData) ? rxData : [];
  const labs: any[] = Array.isArray(labData) ? labData : (labData as any)?.orders ?? [];
  const rxRestricted  = (rxError as any)?.statusCode === 403;
  const labRestricted = (labError as any)?.statusCode === 403;
  const rounds: any[] = adm.rounds ?? [];
  const notes: any[] = adm.progressNotes ?? [];
  const lastVitals = [...rounds].reverse().find((r) => r.bp || r.pulse || r.temp || r.spo2 || r.respRate);
  const day = stayDay(adm.admissionDate, tz, adm.dischargeDate ?? new Date());
  const due = active && roundDue(adm);
  const demographics = [adm.patientId, adm.patientAge ? `${adm.patientAge}y` : "", adm.patientGender].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header */}
      <Button variant="ghost" size="sm" className="gap-1 -ml-2 h-7 text-xs" onClick={() => setLocation("/ipd")}>
        <ArrowLeft className="h-3.5 w-3.5" /> IPD
      </Button>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-start gap-3">
            <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
              <BedDouble className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold">{adm.patientName}</h2>
                <Badge className="text-xs font-mono bg-blue-50 text-blue-700">{adm.admissionId}</Badge>
                {active
                  ? <Badge className="text-xs bg-teal-100 text-teal-700">Admitted</Badge>
                  : <Badge className="text-xs bg-gray-100 text-gray-700">Discharged · {adm.discharge?.condition}</Badge>}
                {due && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800"
                    title={`No nursing round in the last ${ROUND_DUE_HOURS} hours`}>
                    <AlarmClock className="h-3 w-3" /> Round due
                  </span>
                )}
              </div>
              {demographics && <p className="text-xs text-muted-foreground font-mono mt-0.5">{demographics}{adm.patientPhone ? ` · ${adm.patientPhone}` : ""}</p>}
              <p className="text-sm text-muted-foreground mt-0.5">
                {adm.ward} · Bed {adm.bedNumber}{adm.department ? ` · ${adm.department}` : ""} · {adm.admittingDoctor}
              </p>
            </div>
            <div className="text-sm md:text-right shrink-0">
              <p className="flex md:justify-end items-center gap-1 font-medium"><Clock className="h-3.5 w-3.5" /> Day {day}</p>
              <p className="text-xs text-muted-foreground">Admitted {fmtDateTime(adm.admissionDate)}</p>
              {adm.dischargeDate && <p className="text-xs text-muted-foreground">Discharged {fmtDateTime(adm.dischargeDate)}</p>}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-1.5 flex-wrap">
            {active && canDo(role, "round") && (
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setRoundOpen(true)}>
                <Stethoscope className="h-3.5 w-3.5" /> Add Round
              </Button>
            )}
            {active && canDo(role, "note") && (
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setTab("notes")}>
                <NotebookPen className="h-3.5 w-3.5" /> Progress Note
              </Button>
            )}
            {active && canDo(role, "orders") && (
              <>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setRxOpen(true)}>
                  <Pill className="h-3.5 w-3.5 text-amber-600" /> Write Rx
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setLabOpen(true)}>
                  <FlaskConical className="h-3.5 w-3.5 text-teal-600" /> Order Lab
                </Button>
              </>
            )}
            {active && canDo(role, "edit") && (
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            )}
            {active && canDo(role, "transfer") && (
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1 text-violet-700 border-violet-300 hover:bg-violet-50" onClick={() => setTransferOpen(true)}>
                <ArrowLeftRight className="h-3.5 w-3.5" /> Transfer
              </Button>
            )}
            {active && canDo(role, "discharge") && (
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1 text-amber-700 border-amber-300 hover:bg-amber-50" onClick={() => setTab("discharge")}>
                <LogOut className="h-3.5 w-3.5" /> Discharge
              </Button>
            )}
            {!active && (
              <Button size="sm" className="h-8 text-xs gap-1" onClick={() => printDischargeReport(adm)}>
                <Printer className="h-3.5 w-3.5" /> Print Summary
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`text-sm px-3 py-2 -mb-px border-b-2 whitespace-nowrap transition-colors ${
              tab === t.id ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {t.label}
            {t.id === "notes" && (rounds.length + notes.length) > 0 && <span className="ml-1 text-xs text-muted-foreground">({rounds.length + notes.length})</span>}
            {t.id === "orders" && (scripts.length + labs.length) > 0 && <span className="ml-1 text-xs text-muted-foreground">({scripts.length + labs.length})</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab adm={adm} lastVitals={lastVitals} lastNote={notes[notes.length - 1]}
          scripts={scripts} labs={labs} rxRestricted={rxRestricted} labRestricted={labRestricted} onTab={setTab} />
      )}
      {tab === "vitals" && <VitalsCharts rounds={rounds} />}
      {tab === "notes" && <NotesTab adm={adm} canWrite={active && canDo(role, "note")} onSaved={refresh} />}
      {tab === "orders" && (
        <OrdersTab scripts={scripts} labs={labs} rxRestricted={rxRestricted} labRestricted={labRestricted}
          canOrder={active && canDo(role, "orders")} onRx={() => setRxOpen(true)} onLab={() => setLabOpen(true)} />
      )}
      {tab === "transfers" && <TransfersTab adm={adm} />}
      {tab === "bill" && <BillTab admission={adm} isAdmin={role === "admin"} />}
      {tab === "discharge" && (
        <DischargeTab adm={adm} role={role} tz={tz} suggestedMedications={medsText(scripts)}
          onOpenBill={canDo(role, "bill") ? () => setTab("bill") : undefined}
          onDischarged={() => { refresh(); qc.invalidateQueries({ queryKey: ["ipd-discharged"] }); qc.invalidateQueries({ queryKey: ["ipd-billing", id] }); }}
          onFollowUp={() => setFollowUpOpen(true)} />
      )}

      {roundOpen && <NursingRoundModal admission={adm} onClose={() => setRoundOpen(false)} onSaved={refresh} />}
      {transferOpen && <TransferModal admission={adm} onClose={() => setTransferOpen(false)} onTransferred={() => { refresh(); setTransferOpen(false); }} />}
      {editOpen && <EditAdmissionModal admission={adm} onClose={() => setEditOpen(false)} onSaved={() => { refresh(); setEditOpen(false); }} />}
      <PrescriptionModal open={rxOpen} onClose={() => setRxOpen(false)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["ipd-rx", id] }); setRxOpen(false); }}
        patientId={adm.patientId} patientName={adm.patientName} admissionId={adm._id} type="IPD" />
      <LabOrderModal open={labOpen} onClose={() => setLabOpen(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["ipd-labs", id] })}
        patientId={adm.patientId} patientName={adm.patientName} admissionId={adm._id} doctor={user?.role === "doctor" ? user.name : adm.admittingDoctor} />
      {followUpOpen && (
        <AppointmentModal open onClose={() => setFollowUpOpen(false)}
          initialPatient={{ uhid: adm.patientId, name: adm.patientName, age: adm.patientAge ? String(adm.patientAge) : "", gender: adm.patientGender, phone: adm.patientPhone }}
          prefill={{ type: "Follow-up", department: adm.department || undefined, notes: `Post-discharge follow-up (${adm.admissionId})` }} />
      )}
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────
function OverviewTab({ adm, lastVitals, lastNote, scripts, labs, rxRestricted, labRestricted, onTab }: {
  adm: any; lastVitals?: any; lastNote?: any; scripts: any[]; labs: any[];
  rxRestricted: boolean; labRestricted: boolean; onTab: (t: TabId) => void;
}) {
  const pendingLabs = labs.filter((l) => l.status !== "Completed");
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Diagnosis</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Provisional (at admission)</p>
            <p className="whitespace-pre-wrap">{adm.provisionalDiagnosis}</p>
          </div>
          {adm.discharge?.finalDiagnosis && (
            <div>
              <p className="text-xs text-muted-foreground">Final</p>
              <p className="whitespace-pre-wrap">{adm.discharge.finalDiagnosis}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Latest Vitals</CardTitle>
            <button className="text-xs text-primary hover:underline" onClick={() => onTab("vitals")}>Trends</button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {lastVitals ? (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {[
                  ["BP", lastVitals.bp], ["Pulse", lastVitals.pulse], ["Temp", lastVitals.temp ? `${lastVitals.temp}°F` : ""],
                  ["SpO₂", lastVitals.spo2 ? `${lastVitals.spo2}%` : ""], ["RR", lastVitals.respRate],
                ].map(([label, value]) => (
                  <div key={label} className="bg-muted/50 rounded-lg px-2 py-1.5">
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className="text-sm font-semibold">{value || "—"}</p>
                  </div>
                ))}
              </div>
              <VitalFlags flags={vitalFlags(lastVitals)} />
              <p className="text-xs text-muted-foreground">{fmtDateTime(lastVitals.roundedAt)} · {lastVitals.nurse}</p>
            </>
          ) : <p className="text-sm text-muted-foreground">No vitals recorded yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Latest Progress Note</CardTitle>
            <button className="text-xs text-primary hover:underline" onClick={() => onTab("notes")}>All notes</button>
          </div>
        </CardHeader>
        <CardContent>
          {lastNote ? <SoapBlock note={lastNote} /> : <p className="text-sm text-muted-foreground">No progress notes yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Orders</CardTitle>
            <button className="text-xs text-primary hover:underline" onClick={() => onTab("orders")}>All orders</button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {rxRestricted ? <p className="text-xs text-muted-foreground">Prescriptions not available for your role.</p> : (
            <p><Pill className="h-3.5 w-3.5 inline mr-1 text-amber-600" />{scripts.length} prescription{scripts.length !== 1 ? "s" : ""}
              {scripts[0] && <span className="text-muted-foreground"> · latest {fmtDateTime(scripts[0].createdAt)}</span>}</p>
          )}
          {labRestricted ? <p className="text-xs text-muted-foreground">Lab orders not available for your role.</p> : (
            <p><FlaskConical className="h-3.5 w-3.5 inline mr-1 text-teal-600" />{labs.length} lab order{labs.length !== 1 ? "s" : ""}
              {pendingLabs.length > 0 && <span className="text-amber-700"> · {pendingLabs.length} pending</span>}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SoapBlock({ note }: { note: any }) {
  return (
    <div className="space-y-1 text-sm">
      {SOAP_ROWS.filter(([k]) => note[k]).map(([k, letter]) => (
        <p key={k} className="whitespace-pre-wrap"><span className="font-semibold text-muted-foreground mr-1.5">{letter}</span>{note[k]}</p>
      ))}
      <p className="text-xs text-muted-foreground pt-0.5">{fmtDateTime(note.at)} · {note.doctor}</p>
    </div>
  );
}

// ── Notes: progress notes (doctor) + nursing rounds, one timeline ────────────
function NotesTab({ adm, canWrite, onSaved }: { adm: any; canWrite: boolean; onSaved: () => void }) {
  const [filter, setFilter] = useState<"all" | "doctor" | "nursing">("all");
  const [form, setForm] = useState({ subjective: "", objective: "", assessment: "", plan: "" });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!Object.values(form).some((v) => v.trim())) {
      toast({ variant: "destructive", title: "Empty note", description: "Write at least one section." }); return;
    }
    setSaving(true);
    try {
      await ipdApi.addNote(adm._id, form);
      setForm({ subjective: "", objective: "", assessment: "", plan: "" });
      onSaved();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not save note", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const timeline = [
    ...(filter !== "nursing" ? (adm.progressNotes ?? []).map((n: any) => ({ kind: "note" as const, at: n.at, n })) : []),
    ...(filter !== "doctor" ? (adm.rounds ?? []).map((r: any) => ({ kind: "round" as const, at: r.roundedAt, r })) : []),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="grid lg:grid-cols-5 gap-4">
      {canWrite && (
        <Card className="lg:col-span-2 h-fit">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">New Progress Note</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(["subjective", "objective", "assessment", "plan"] as const).map((k) => (
              <div key={k}>
                <Label className="text-xs capitalize">{k}</Label>
                <SoapTextarea field={k} className="mt-1" value={form[k]} onChange={(v) => setForm((f) => ({ ...f, [k]: v }))}
                  placeholder={{ subjective: "Complaints, overnight events", objective: "Exam findings, drains, wounds", assessment: "Diagnosis / ICD-10, progress", plan: "Treatment changes, investigations" }[k]} />
              </div>
            ))}
            <div className="flex justify-end">
              <Button size="sm" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save Note"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className={`${canWrite ? "lg:col-span-3" : "lg:col-span-5"} space-y-2`}>
        <div className="flex gap-1.5">
          {([["all", "All"], ["doctor", "Doctor notes"], ["nursing", "Nursing rounds"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filter === k ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}>
              {label}
            </button>
          ))}
        </div>
        {timeline.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Nothing recorded yet.</p>}
        {timeline.map((e) => e.kind === "note" ? (
          <div key={`n-${e.n._id}`} className="border rounded-lg px-3 py-2 bg-blue-50/40">
            <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide mb-1">Progress note</p>
            <SoapBlock note={e.n} />
          </div>
        ) : (
          <div key={`r-${e.r._id}`} className="border rounded-lg px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Nursing round · {e.r.nurse}</span>
              <span className="text-xs text-muted-foreground">{fmtDateTime(e.at)}</span>
            </div>
            <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              {e.r.bp     && <span>BP {e.r.bp}</span>}
              {e.r.pulse  ? <span>Pulse {e.r.pulse}</span> : null}
              {e.r.temp   ? <span>Temp {e.r.temp}°F</span> : null}
              {e.r.spo2   ? <span>SpO₂ {e.r.spo2}%</span> : null}
              {e.r.respRate ? <span>RR {e.r.respRate}</span> : null}
              {e.r.weight ? <span>Wt {e.r.weight}kg</span> : null}
              {e.r.intake ? <span>In {e.r.intake}ml</span> : null}
              {e.r.output ? <span>Out {e.r.output}ml</span> : null}
            </div>
            <VitalFlags flags={vitalFlags(e.r)} className="mt-1" />
            {e.r.notes && <p className="text-sm mt-1 whitespace-pre-wrap">{e.r.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Orders: prescriptions + lab orders linked to this admission ──────────────
function OrdersTab({ scripts, labs, rxRestricted, labRestricted, canOrder, onRx, onLab }: {
  scripts: any[]; labs: any[]; rxRestricted: boolean; labRestricted: boolean;
  canOrder: boolean; onRx: () => void; onLab: () => void;
}) {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5"><Pill className="h-4 w-4 text-amber-600" /> Prescriptions</CardTitle>
            {canOrder && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRx}>Write Rx</Button>}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {rxRestricted ? <p className="text-sm text-muted-foreground">Not available for your role.</p>
            : scripts.length === 0 ? <p className="text-sm text-muted-foreground">No prescriptions for this stay.</p>
            : scripts.map((rx) => (
              <div key={rx._id} className="border rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-muted-foreground">{rx.rxId}</span>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(rx.createdAt)} · {rx.prescribedBy}</span>
                </div>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {(rx.items ?? []).map((it: any, i: number) => (
                    <li key={i}><span className="font-medium">{it.drug}</span> <span className="text-muted-foreground">{[it.dose, it.route, it.frequency, it.duration].filter(Boolean).join(" · ")}</span></li>
                  ))}
                </ul>
                {rx.notes && <p className="text-xs text-muted-foreground mt-1">{rx.notes}</p>}
              </div>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5"><FlaskConical className="h-4 w-4 text-teal-600" /> Lab Orders</CardTitle>
            {canOrder && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onLab}>Order Lab</Button>}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {labRestricted ? <p className="text-sm text-muted-foreground">Not available for your role.</p>
            : labs.length === 0 ? <p className="text-sm text-muted-foreground">No lab orders for this stay.</p>
            : labs.map((l) => (
              <div key={l._id} className="border rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{l.test}</span>
                  <Badge className={`text-xs ${LAB_STATUS[l.status] ?? "bg-gray-100 text-gray-600"}`}>{l.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{l.labId} · {l.priority} · {fmtDateTime(l.ordered ?? l.createdAt)}</p>
                {l.result && <p className="text-xs mt-1 whitespace-pre-wrap">{l.result}</p>}
                {l.status === "Completed" && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 mt-1 text-xs gap-1" onClick={() => printLabReport(l)}>
                    <Printer className="h-3 w-3" /> Print report
                  </Button>
                )}
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Transfers ─────────────────────────────────────────────────────────────────
function TransfersTab({ adm }: { adm: any }) {
  const transfers: any[] = [...(adm.transfers ?? [])].reverse();
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <p className="text-sm"><span className="text-muted-foreground">Current:</span> {adm.ward} — Bed {adm.bedNumber}</p>
        {transfers.length === 0 ? <p className="text-sm text-muted-foreground">No transfers during this stay.</p> : transfers.map((t) => (
          <div key={t._id} className="border rounded-lg px-3 py-2 bg-violet-50/50">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium flex items-center gap-1.5 text-violet-800">
                <ArrowLeftRight className="h-3.5 w-3.5" />
                {t.fromWard ? `${t.fromWard} ${t.fromBed} → ` : "→ "}{t.toWard} {t.toBed}
              </span>
              <span className="text-xs text-muted-foreground">{fmtDateTime(t.at)}</span>
            </div>
            {(t.reason || t.by) && <p className="text-xs text-muted-foreground mt-0.5">{[t.reason, t.by && `by ${t.by}`].filter(Boolean).join(" · ")}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Discharge: form while admitted, summary afterwards ───────────────────────
function DischargeTab({ adm, role, tz, suggestedMedications, onOpenBill, onDischarged, onFollowUp }: {
  adm: any; role?: string; tz: string; suggestedMedications: string; onOpenBill?: () => void;
  onDischarged: () => void; onFollowUp: () => void;
}) {
  if (adm.status === "Active") {
    if (!canDo(role, "discharge")) {
      return <p className="text-sm text-muted-foreground py-6">Only a doctor or admin can discharge a patient.</p>;
    }
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Discharge Summary</CardTitle></CardHeader>
        <CardContent>
          <DischargeForm admission={adm} role={role} suggestedMedications={suggestedMedications} onOpenBill={onOpenBill} onDischarged={onDischarged} />
        </CardContent>
      </Card>
    );
  }

  const d = adm.discharge ?? {};
  const rows: [string, string | undefined][] = [
    ["Final Diagnosis", d.finalDiagnosis], ["Treatment Summary", d.treatment], ["Discharge Medications", d.medications],
    ["Follow-up", d.followUp], ["LAMA Reason / Consent", d.lamaReason], ["Notes", d.notes],
    ["Discharged With Unpaid Balance", d.balanceAtDischarge ? `₹${d.balanceAtDischarge.toLocaleString("en-IN")}${d.balanceNote ? ` — ${d.balanceNote}` : ""}` : undefined],
  ];
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3 bg-teal-50 rounded-lg px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-teal-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">Discharged · {d.condition}</p>
            <p className="text-xs text-muted-foreground">
              {fmtDateTime(adm.dischargeDate)} · {stayDay(adm.admissionDate, tz, adm.dischargeDate)} day stay{d.dischargedBy ? ` · by ${d.dischargedBy}` : ""}
            </p>
            {d.deathAt && <p className="text-xs text-red-700 font-medium">Time of death: {fmtDateTime(d.deathAt)}</p>}
          </div>
        </div>
        {rows.filter(([, v]) => v).map(([label, value]) => (
          <div key={label}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-sm whitespace-pre-wrap">{value}</p>
          </div>
        ))}
        <div className="flex gap-2 flex-wrap pt-1">
          <Button className="gap-2" onClick={() => printDischargeReport(adm)}><Printer className="h-4 w-4" /> Print Summary</Button>
          {d.condition !== "Expired" && ["admin", "receptionist", "doctor"].includes(role ?? "") && (
            <Button variant="outline" className="gap-2" onClick={onFollowUp}><CalendarPlus className="h-4 w-4" /> Book Follow-up</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
