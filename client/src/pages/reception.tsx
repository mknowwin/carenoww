import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { appointments as apptApi, users as usersApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { todayInTz } from "@/lib/utils";
import AppointmentModal from "@/components/modals/AppointmentModal";
import {
  Search, CheckCircle2, Clock, UserCheck, Users, Stethoscope,
  Plus, Hash, Phone, Calendar, ChevronRight, Loader2, Activity,
} from "lucide-react";

const BLANK_VITALS = { bp: "", pulse: "", temp: "", spo2: "", weight: "", height: "" };

const STATUS_COLOR: Record<string, string> = {
  Scheduled:  "bg-gray-100 text-gray-700",
  Confirmed:  "bg-green-100 text-green-700",
  Waiting:    "bg-amber-100 text-amber-700",
  "In Consult":"bg-blue-100 text-blue-700",
  Completed:  "bg-teal-100 text-teal-700",
  Cancelled:  "bg-red-100 text-red-600",
};

export default function ReceptionPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const today = todayInTz(user?.timezone ?? "Asia/Kolkata");

  const [search, setSearch]         = useState("");
  const [doctorFilter, setDoctorFilter] = useState("All");
  const [modalOpen, setModalOpen]   = useState(false);
  const [actionId, setActionId]     = useState<string | null>(null);
  const [checkedToken, setCheckedToken] = useState<{ token: string; name: string; doctor: string } | null>(null);
  const [vitalsApptId, setVitalsApptId] = useState<string | null>(null);
  const [vitalsForm, setVitalsForm] = useState(BLANK_VITALS);
  const [savingVitals, setSavingVitals] = useState(false);

  const { data: apiData, isLoading } = useQuery({
    queryKey: ["appointments", { date: today }],
    queryFn:  () => apptApi.list({ date: today, limit: "200" }),
    retry: false,
    refetchInterval: 15000,
  });

  const { data: doctorsData } = useQuery({
    queryKey: ["doctors"],
    queryFn:  () => usersApi.doctors(),
    retry: false,
  });

  const allAppointments = apiData?.appointments ?? [];
  const doctorList: string[] = ["All", ...Array.from(new Set<string>(allAppointments.map((a: any) => String(a.doctor))))];

  const searchTrimmed = search.trim();
  const effectiveSearch = searchTrimmed && /^\d+$/.test(searchTrimmed) && searchTrimmed.length <= 6
    ? `UHID-${searchTrimmed.padStart(3, "0")}`
    : search;

  const filtered = allAppointments.filter((a: any) => {
    const q = effectiveSearch.toLowerCase();
    const matchSearch = !q
      || a.patientName?.toLowerCase().includes(q)
      || a.patientId?.toLowerCase().includes(q)
      || a.patientPhone?.toLowerCase().includes(q)
      || a.token?.toLowerCase().includes(q);
    const matchDoctor = doctorFilter === "All" || a.doctor === doctorFilter;
    return matchSearch && matchDoctor;
  });

  const stats = {
    total:     allAppointments.length,
    waiting:   allAppointments.filter((a: any) => a.status === "Waiting").length,
    inConsult: allAppointments.filter((a: any) => a.status === "In Consult").length,
    completed: allAppointments.filter((a: any) => a.status === "Completed").length,
  };

  const handleCheckIn = async (apt: any) => {
    setActionId(apt._id);
    try {
      const updated = await apptApi.checkin(apt._id);
      qc.invalidateQueries({ queryKey: ["appointments"] });
      setCheckedToken({ token: updated.token, name: updated.patientName, doctor: updated.doctor });
      setVitalsForm(BLANK_VITALS);
      setVitalsApptId(apt._id);
    } catch (e: any) {
      alert(e.message || "Check-in failed");
    } finally {
      setActionId(null);
    }
  };

  const handleSaveVitals = async () => {
    if (!vitalsApptId) return;
    setSavingVitals(true);
    try {
      await apptApi.update(vitalsApptId, { vitals: vitalsForm });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      setVitalsApptId(null);
    } catch (e: any) {
      alert(e.message || "Failed to save vitals");
    } finally {
      setSavingVitals(false);
    }
  };

  const handleConfirm = async (apt: any) => {
    setActionId(apt._id + "confirm");
    try {
      await apptApi.update(apt._id, { status: "Confirmed" });
      qc.invalidateQueries({ queryKey: ["appointments"] });
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Reception & Check-in</h2>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> New Walk-in
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Today Total",  value: stats.total,     color: "text-teal-600",  bg: "bg-teal-50",  icon: Calendar },
          { label: "Waiting",      value: stats.waiting,   color: "text-amber-600", bg: "bg-amber-50", icon: Clock },
          { label: "In Consult",   value: stats.inConsult, color: "text-blue-600",  bg: "bg-blue-50",  icon: Stethoscope },
          { label: "Completed",    value: stats.completed, color: "text-green-600", bg: "bg-green-50", icon: CheckCircle2 },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center shrink-0`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div>
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Token confirmation banner */}
      {checkedToken && (
        <div className="bg-green-50 border border-green-300 rounded-xl p-4 animate-fadeIn">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-800">Check-in Successful!</p>
                <p className="text-xs text-green-600 mt-0.5">
                  {checkedToken.name} → {checkedToken.doctor}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Token slip printable block */}
              <div id="token-slip" className="text-center bg-white border-2 border-green-400 rounded-xl px-5 py-2 min-w-28">
                <p className="text-xs text-muted-foreground">Token</p>
                <p className="text-3xl font-black text-green-700 font-mono tracking-wider">{checkedToken.token}</p>
                <div className="mt-1 grid grid-cols-4 gap-0.5">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div key={i} className={`h-1.5 w-full rounded-sm ${Math.random() > 0.5 ? "bg-green-800" : "bg-green-200"}`} />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate max-w-28">{checkedToken.name}</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-green-700 border-green-400"
                  onClick={() => {
                    const slip = document.getElementById("token-slip");
                    if (!slip) return;
                    const w = window.open("", "_blank", "width=300,height=200");
                    if (w) {
                      w.document.write(`<html><body style="display:flex;align-items:center;justify-content:center;font-family:monospace;padding:20px">${slip.innerHTML}</body></html>`);
                      w.print(); w.close();
                    }
                  }}>
                  Print Slip
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600" onClick={() => setCheckedToken(null)}>Dismiss</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-4 gap-4">
        {/* Doctor filter panel */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" /> Doctors Today
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-3 pt-0">
              {doctorList.map((doc) => {
                const count = doc === "All"
                  ? allAppointments.filter((a: any) => ["Confirmed","Waiting","Scheduled"].includes(a.status)).length
                  : allAppointments.filter((a: any) => a.doctor === doc && ["Confirmed","Waiting","Scheduled"].includes(a.status)).length;
                return (
                  <button
                    key={doc}
                    onClick={() => setDoctorFilter(doc)}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                      doctorFilter === doc ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"
                    }`}
                  >
                    <span className="truncate font-medium">{doc === "All" ? "All Doctors" : doc.replace("Dr. ", "Dr. ")}</span>
                    {count > 0 && (
                      <Badge className={`text-xs ml-1 shrink-0 ${doctorFilter === doc ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}>
                        {count}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Main appointment list */}
        <div className="lg:col-span-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by patient name, UHID, phone or token..."
              className="pl-9 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {filtered.length === 0 && !isLoading && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No appointments found for today.
            </div>
          )}

          {filtered.map((apt: any) => (
            <Card key={apt._id || apt.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Token badge */}
                  <div className="shrink-0 w-14 h-14 rounded-xl bg-teal-50 border border-teal-200 flex flex-col items-center justify-center">
                    <Hash className="h-3 w-3 text-teal-500 mb-0.5" />
                    <span className="text-xs font-bold text-teal-700 font-mono leading-tight">{apt.token || "—"}</span>
                  </div>

                  {/* Patient info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{apt.patientName}</span>
                      <Badge className="text-xs font-mono bg-gray-100 text-gray-600">{apt.patientId}</Badge>
                      <Badge className={`text-xs ${STATUS_COLOR[apt.status] ?? "bg-gray-100 text-gray-600"}`}>{apt.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />{apt.doctor}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{apt.time}</span>
                      {apt.patientPhone && (
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{apt.patientPhone}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{apt.department} · {apt.type}</div>
                    {apt.vitals && Object.values(apt.vitals).some(Boolean) && (
                      <div className="flex gap-1.5 flex-wrap mt-1.5">
                        {apt.vitals.bp     && <Badge className="text-xs bg-blue-50 text-blue-700 border border-blue-100">BP {apt.vitals.bp}</Badge>}
                        {apt.vitals.pulse  && <Badge className="text-xs bg-green-50 text-green-700 border border-green-100">P {apt.vitals.pulse}</Badge>}
                        {apt.vitals.temp   && <Badge className="text-xs bg-orange-50 text-orange-700 border border-orange-100">T {apt.vitals.temp}°F</Badge>}
                        {apt.vitals.spo2   && <Badge className="text-xs bg-purple-50 text-purple-700 border border-purple-100">SpO2 {apt.vitals.spo2}%</Badge>}
                        {apt.vitals.weight && <Badge className="text-xs bg-muted text-muted-foreground">Wt {apt.vitals.weight}kg</Badge>}
                        {apt.vitals.height && <Badge className="text-xs bg-muted text-muted-foreground">Ht {apt.vitals.height}cm</Badge>}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex flex-col gap-1.5 items-end">
                    {apt.status === "Scheduled" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50"
                        disabled={actionId === apt._id + "confirm"}
                        onClick={() => handleConfirm(apt)}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Confirm
                      </Button>
                    )}
                    {(apt.status === "Scheduled" || apt.status === "Confirmed") && (
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-teal-600 hover:bg-teal-700"
                        disabled={actionId === apt._id}
                        onClick={() => handleCheckIn(apt)}
                      >
                        {actionId === apt._id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <UserCheck className="h-3 w-3 mr-1" />
                        )}
                        Check In
                      </Button>
                    )}
                    {apt.status === "Waiting" && (
                      <Badge className="text-xs bg-amber-100 text-amber-700 px-2 py-1">
                        <Clock className="h-3 w-3 mr-1" /> Waiting
                        {apt.checkedInAt && (
                          <span className="ml-1 text-amber-500">
                            · {Math.round((Date.now() - new Date(apt.checkedInAt).getTime()) / 60000)}m
                          </span>
                        )}
                      </Badge>
                    )}
                    {(apt.status === "Confirmed" || apt.status === "Waiting") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs text-teal-700 border-teal-300 hover:bg-teal-50"
                        onClick={() => { setVitalsForm(apt.vitals ? { ...BLANK_VITALS, ...apt.vitals } : BLANK_VITALS); setVitalsApptId(apt._id); }}
                      >
                        <Activity className="h-3 w-3 mr-1" />
                        {apt.vitals && Object.values(apt.vitals).some(Boolean) ? "Edit Vitals" : "Vitals"}
                      </Button>
                    )}
                    {apt.status === "In Consult" && (
                      <Badge className="text-xs bg-blue-100 text-blue-700 px-2 py-1">
                        <ChevronRight className="h-3 w-3 mr-1" /> In Room
                      </Badge>
                    )}
                    {apt.status === "Completed" && (
                      <Badge className="text-xs bg-teal-100 text-teal-700 px-2 py-1">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Done
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Notes */}
                {apt.notes && (
                  <div className="mt-2 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">
                    {apt.notes}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <AppointmentModal open={modalOpen} onClose={() => setModalOpen(false)} />

      {/* Vitals capture dialog — opens after check-in */}
      <Dialog open={!!vitalsApptId} onOpenChange={(open) => { if (!open) setVitalsApptId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-teal-600" /> Record Vitals
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {([
              { key: "bp",     label: "Blood Pressure", placeholder: "120/80", unit: "mmHg" },
              { key: "pulse",  label: "Pulse",          placeholder: "72",     unit: "bpm"  },
              { key: "temp",   label: "Temperature",    placeholder: "98.6",   unit: "°F"   },
              { key: "spo2",   label: "SpO2",           placeholder: "98",     unit: "%"    },
              { key: "weight", label: "Weight",         placeholder: "70",     unit: "kg"   },
              { key: "height", label: "Height",         placeholder: "170",    unit: "cm"   },
            ] as const).map((v) => (
              <div key={v.key} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{v.label} <span className="text-muted-foreground/60">({v.unit})</span></Label>
                <Input
                  value={vitalsForm[v.key]}
                  onChange={(e) => setVitalsForm((f) => ({ ...f, [v.key]: e.target.value }))}
                  placeholder={v.placeholder}
                  className="h-8 font-mono text-sm"
                />
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setVitalsApptId(null)}>Skip</Button>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700" disabled={savingVitals} onClick={handleSaveVitals}>
              {savingVitals ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              Save Vitals
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
