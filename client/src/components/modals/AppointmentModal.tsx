import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { appointments as apptApi, users as usersApi, patients as patientsApi, referralDoctors as refDocApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { todayInTz } from "@/lib/utils";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, AlertCircle, Search, Loader2, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  existing?: any;
}

const DEPARTMENTS = [
  "Cardiology","Orthopedics","Neurology","Obstetrics","Nephrology",
  "Oncology","Emergency","General","Dermatology","Pediatrics",
  "ENT","Ophthalmology","Psychiatry","Dental",
];

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs font-medium">{label}</Label>{children}</div>;
}

function SI({ value, onChange, placeholder, type = "text", required, readOnly }: {
  value: string; onChange?: (v: string) => void; placeholder?: string;
  type?: string; required?: boolean; readOnly?: boolean;
}) {
  return (
    <Input
      type={type}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      className="h-8 text-sm"
      required={required}
      readOnly={readOnly}
    />
  );
}

function Sel({ value, onChange, opts, disabled }: {
  value: string; onChange: (v: string) => void; opts: string[]; disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
    >
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export default function AppointmentModal({ open, onClose, existing }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isEdit = !!existing;
  const today = todayInTz(user?.timezone ?? "Asia/Kolkata");

  const [form, setForm] = useState({
    patientId:    (existing?.patientId ?? "").replace(/^UHID-/, ""),
    patientName:  existing?.patientName  ?? "",
    patientAge:   existing?.patientAge   ?? "",
    patientGender:existing?.patientGender?? "",
    patientPhone: existing?.patientPhone ?? "",
    doctorId:         existing?.doctorId         ?? "",
    doctor:           existing?.doctor           ?? "",
    department:       existing?.department       ?? "Cardiology",
    date:             existing?.date             ?? today,
    time:             existing?.time             ?? "",
    type:             existing?.type             ?? "New",
    status:           existing?.status           ?? "Scheduled",
    notes:            existing?.notes            ?? "",
    referringDoctor:  existing?.referringDoctor  ?? "",
  });

  const [selectedDoc, setSelectedDoc] = useState<any>(null);

  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<any[]>([]);
  const [searchingPatient, setSearchingPatient] = useState(false);
  const [patientSelected, setPatientSelected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Referral doctor combobox state
  const [refDocSearch, setRefDocSearch] = useState("");
  const [refDocResults, setRefDocResults] = useState<any[]>([]);
  const [refDocOpen, setRefDocOpen] = useState(false);
  const [refDocCreating, setRefDocCreating] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const effectivePatientId = form.patientId ? `UHID-${form.patientId.padStart(3, "0")}` : "";

  const trimmedSearch = patientSearch.trim();
  const effectivePatientSearch = trimmedSearch && /^\d+$/.test(trimmedSearch) && trimmedSearch.length <= 6
    ? `UHID-${trimmedSearch.padStart(3, "0")}`
    : patientSearch;

  const skipTime = selectedDoc?.schedule?.skipTimeSlot === true;

  // Load doctors when department or date changes
  const { data: doctorData, isFetching: loadingDoctors } = useQuery({
    queryKey: ["doctors", form.department, form.date],
    queryFn:  () => usersApi.doctors({ department: form.department, date: form.date }),
    enabled:  open && !isEdit,
    retry:    false,
  });

  const doctors: any[] = doctorData ?? [];

  // Load available slots when doctor + date change
  const { data: slotsData, isFetching: loadingSlots } = useQuery({
    queryKey: ["slots", form.doctor, form.date],
    queryFn:  () => apptApi.slots(form.doctor, form.date),
    enabled:  open && !!form.doctor && !!form.date && !isEdit && !skipTime,
    retry:    false,
  });

  const slots: { time: string; available: boolean }[] = slotsData ?? [];
  const availableSlots = slots.filter((s) => s.available);

  // Auto-select first available slot when slots load (only when time slot selection is active)
  useEffect(() => {
    if (!skipTime && availableSlots.length > 0 && !form.time) {
      set("time", availableSlots[0].time);
    }
  }, [slotsData]);

  // Clear time when a doctor with skipTimeSlot is selected
  useEffect(() => {
    if (skipTime) set("time", "");
  }, [skipTime]);

  // Search patient by name/UHID
  useEffect(() => {
    if (patientSearch.length < 2) { setPatientResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchingPatient(true);
      try {
        const res = await patientsApi.list({ search: effectivePatientSearch, limit: "5" });
        setPatientResults(res?.patients ?? []);
      } catch {
        setPatientResults([]);
      } finally {
        setSearchingPatient(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [patientSearch]);

  // Search referral doctors
  useEffect(() => {
    if (refDocSearch.length < 2) { setRefDocResults([]); setRefDocOpen(false); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await refDocApi.search(refDocSearch);
        setRefDocResults(res ?? []);
        setRefDocOpen(true);
      } catch {
        setRefDocResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [refDocSearch]);

  const selectPatient = (p: any) => {
    setForm((f) => ({
      ...f,
      patientId:    (p.uhid || p._id || "").replace(/^UHID-/, ""),
      patientName:  p.name,
      patientAge:   String(p.age ?? ""),
      patientGender:p.gender ?? "",
      patientPhone: p.phone ?? "",
    }));
    setPatientSearch("");
    setPatientResults([]);
    setPatientSelected(true);
  };

  const clearPatient = () => {
    setForm((f) => ({ ...f, patientId: "", patientName: "", patientAge: "", patientGender: "", patientPhone: "" }));
    setPatientSelected(false);
    setPatientSearch("");
    setPatientResults([]);
  };

  const selectDoctor = (doc: any) => {
    setSelectedDoc(doc);
    setForm((f) => ({ ...f, doctorId: doc._id, doctor: doc.name, time: "" }));
  };

  const selectRefDoc = (name: string) => {
    set("referringDoctor", name);
    setRefDocSearch("");
    setRefDocResults([]);
    setRefDocOpen(false);
  };

  const clearRefDoc = () => {
    set("referringDoctor", "");
    setRefDocSearch("");
    setRefDocResults([]);
    setRefDocOpen(false);
  };

  const addRefDoc = async () => {
    if (!refDocSearch.trim()) return;
    setRefDocCreating(true);
    try {
      const doc = await refDocApi.create({ name: refDocSearch.trim() });
      selectRefDoc(doc.name);
    } catch {
      selectRefDoc(refDocSearch.trim());
    } finally {
      setRefDocCreating(false);
    }
  };

  const hasExactRefDocMatch = refDocResults.some(
    (d) => d.name.toLowerCase() === refDocSearch.trim().toLowerCase()
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patientName) { setError("Patient name is required"); return; }
    if (!form.doctor)      { setError("Please select a doctor"); return; }

    setLoading(true); setError("");
    try {
      const payload = { ...form, patientId: effectivePatientId };
      if (isEdit) {
        await apptApi.update(existing._id || existing.id, payload);
      } else {
        await apptApi.create(payload);
      }
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["queue"] });
      qc.invalidateQueries({ queryKey: ["referral-stats"] });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save appointment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setPatientSelected(false); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Appointment" : "Book Appointment"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Patient search */}
          {!isEdit && (
            <div className="bg-muted/40 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Patient</p>

              {patientSelected ? (
                <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold">{form.patientName}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      UHID-{form.patientId.padStart(3, "0")}{form.patientPhone ? ` · ${form.patientPhone}` : ""}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={clearPatient}>Change</Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8 h-8 text-sm"
                      placeholder="Search by name, UHID or phone..."
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                    />
                    {searchingPatient && <Loader2 className="absolute right-2.5 top-2 h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>
                  {patientResults.length > 0 && (
                    <div className="border rounded-lg divide-y bg-background shadow-sm">
                      {patientResults.map((p) => (
                        <button
                          key={p._id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                          onClick={() => selectPatient(p)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{p.name}</span>
                            <span className="text-xs text-muted-foreground font-mono">{p.uhid}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {p.age}y · {p.gender} · {p.phone}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <F label="Patient UHID *">
                      <div className="relative flex items-center h-8 border rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-ring">
                        <span className="px-2 text-xs text-muted-foreground bg-muted border-r h-full flex items-center select-none shrink-0">UHID-</span>
                        <Input className="border-0 h-full text-sm focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none" value={form.patientId} placeholder="001" inputMode="numeric" required onChange={(e) => set("patientId", e.target.value.replace(/\D/g, ""))} />
                      </div>
                    </F>
                    <F label="Patient Name *">
                      <SI value={form.patientName} onChange={(v) => set("patientName", v)} placeholder="Full name" required />
                    </F>
                    <F label="Age">
                      <SI value={String(form.patientAge)} onChange={(v) => set("patientAge", v)} placeholder="30" type="number" />
                    </F>
                    <F label="Gender">
                      <Sel value={form.patientGender} onChange={(v) => set("patientGender", v)} opts={["", "M", "F", "O"]} />
                    </F>
                    <F label="Phone">
                      <SI value={form.patientPhone} onChange={(v) => set("patientPhone", v)} placeholder="9876543210" />
                    </F>
                  </div>
                </>
              )}

              <F label="Visit Type">
                <Sel value={form.type} onChange={(v) => set("type", v)} opts={["New","Follow-up","Emergency","Teleconsult","Home Visit"]} />
              </F>
            </div>
          )}

          {isEdit && (
            <div className="grid grid-cols-2 gap-3">
              <F label="Patient UHID">
                <div className="relative flex items-center h-8 border rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-ring">
                  <span className="px-2 text-xs text-muted-foreground bg-muted border-r h-full flex items-center select-none shrink-0">UHID-</span>
                  <Input className="border-0 h-full text-sm focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none" value={form.patientId} placeholder="001" inputMode="numeric" onChange={(e) => set("patientId", e.target.value.replace(/\D/g, ""))} />
                </div>
              </F>
              <F label="Patient Name *"><SI value={form.patientName} onChange={(v) => set("patientName", v)} placeholder="Full name" required /></F>
              <F label="Type"><Sel value={form.type} onChange={(v) => set("type", v)} opts={["New","Follow-up","Emergency","Teleconsult","Home Visit"]} /></F>
              <F label="Status"><Sel value={form.status} onChange={(v) => set("status", v)} opts={["Scheduled","Confirmed","Waiting","In Consult","Completed","Cancelled"]} /></F>
            </div>
          )}

          {/* Department + Date */}
          <div className="grid grid-cols-2 gap-3">
            <F label="Department">
              <Sel value={form.department} onChange={(v) => { set("department", v); set("doctor", ""); set("doctorId", ""); set("time", ""); setSelectedDoc(null); }} opts={DEPARTMENTS} />
            </F>
            <F label="Date *">
              <SI value={form.date} onChange={(v) => { set("date", v); set("time", ""); }} type="date" required />
            </F>
          </div>

          {/* Doctor selection */}
          {!isEdit && (
            <div className="bg-muted/40 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select Doctor</p>
                {loadingDoctors && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              {doctors.length === 0 && !loadingDoctors && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No doctors found for {form.department}. Add doctors via Settings.
                </p>
              )}
              <div className="grid gap-2">
                {doctors.map((doc) => (
                  <button
                    key={doc._id}
                    type="button"
                    onClick={() => selectDoctor(doc)}
                    className={`w-full text-left rounded-lg border p-3 transition-all ${
                      form.doctorId === doc._id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">{doc.specialty || doc.department}</p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        {doc.isAvailable === false ? (
                          <Badge className="text-xs bg-red-100 text-red-700">
                            <AlertCircle className="h-2.5 w-2.5 mr-1" />
                            Not Available
                          </Badge>
                        ) : (
                          <Badge className="text-xs bg-green-100 text-green-700">
                            <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                            {doc.remainingSlots != null ? `${doc.remainingSlots} slots` : "Available"}
                          </Badge>
                        )}
                        {doc.bookedCount != null && (
                          <p className="text-xs text-muted-foreground mt-0.5">{doc.bookedCount} booked today</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isEdit && (
            <F label="Doctor">
              <SI value={form.doctor} onChange={(v) => set("doctor", v)} placeholder="Dr. Name" />
            </F>
          )}

          {/* Time slot selection — hidden when doctor has skipTimeSlot enabled */}
          {!isEdit && form.doctor && !skipTime && (
            <div className="bg-muted/40 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Time Slot</p>
                {loadingSlots && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              {availableSlots.length === 0 && !loadingSlots && (
                <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                  No slots available for this doctor on this date.
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {slots.map(({ time, available }) => (
                  <button
                    key={time}
                    type="button"
                    disabled={!available}
                    onClick={() => available && set("time", time)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                      form.time === time
                        ? "bg-primary text-primary-foreground border-primary"
                        : available
                        ? "border-border hover:border-primary/50 hover:bg-muted/50"
                        : "border-border bg-muted/30 text-muted-foreground line-through cursor-not-allowed opacity-50"
                    }`}
                  >
                    <Clock className="h-2.5 w-2.5 inline mr-1" />
                    {time}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Walk-in notice when skipTimeSlot is on */}
          {!isEdit && form.doctor && skipTime && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-xs text-amber-700 font-medium">Walk-in / No time slot required</p>
              <p className="text-xs text-amber-600 mt-0.5">This doctor is configured for walk-in appointments. Time slot selection is skipped.</p>
            </div>
          )}

          {isEdit && (
            <F label="Time">
              <SI value={form.time} onChange={(v) => set("time", v)} placeholder="09:00 AM" />
            </F>
          )}

          <F label="Notes">
            <Input
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Chief complaint or notes (optional)"
              className="h-8 text-sm"
            />
          </F>

          {/* Referring Doctor — searchable combobox */}
          <F label="Referring Doctor (optional)">
            {form.referringDoctor ? (
              <div className="flex items-center gap-2 h-8 border rounded-md px-3 bg-background">
                <span className="text-sm flex-1 truncate">{form.referringDoctor}</span>
                <button type="button" onClick={clearRefDoc} className="shrink-0 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  className="h-8 text-sm"
                  placeholder="Search or type doctor name..."
                  value={refDocSearch}
                  onChange={(e) => setRefDocSearch(e.target.value)}
                  onFocus={() => { if (refDocResults.length > 0) setRefDocOpen(true); }}
                  onBlur={() => setTimeout(() => setRefDocOpen(false), 150)}
                />
                {refDocOpen && (refDocResults.length > 0 || refDocSearch.trim().length >= 2) && (
                  <div className="absolute z-50 top-full mt-1 w-full border rounded-lg bg-background shadow-md divide-y">
                    {refDocResults.map((d) => (
                      <button
                        key={d._id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                        onMouseDown={(e) => { e.preventDefault(); selectRefDoc(d.name); }}
                      >
                        <span className="font-medium">{d.name}</span>
                        {d.specialization && <span className="text-xs text-muted-foreground ml-2">{d.specialization}</span>}
                        {d.hospital && <span className="text-xs text-muted-foreground ml-1">· {d.hospital}</span>}
                      </button>
                    ))}
                    {!hasExactRefDocMatch && refDocSearch.trim().length >= 2 && (
                      <button
                        type="button"
                        disabled={refDocCreating}
                        className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5 transition-colors flex items-center gap-1.5"
                        onMouseDown={(e) => { e.preventDefault(); addRefDoc(); }}
                      >
                        {refDocCreating
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <span className="font-medium">+ Add "{refDocSearch.trim()}"</span>
                        }
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </F>

          {/* Token preview */}
          {!isEdit && form.doctor && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-teal-600 font-medium">Token will be auto-generated</p>
                <p className="text-xs text-teal-500 mt-0.5">Assigned on booking confirmation</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-teal-700">{form.department.slice(0, 2).toUpperCase()}-###</p>
                <p className="text-xs text-teal-500">{form.date} · {form.time || "Walk-in"}</p>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : isEdit ? "Update" : "Book Appointment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
