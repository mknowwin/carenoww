import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Settings, User, Bell, Shield, Brain, Building2,
  Monitor, Globe, Key, Database, CheckCircle2, Users, Plus, Trash2,
  Stethoscope, ChevronDown, ChevronRight, Clock, CalendarDays, Pencil,
  X, Loader2, UserPlus, Mic, FlaskConical, Pill, CreditCard, UserCheck, HeartPulse,
  Upload, ImageIcon, IndianRupee, Printer,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { auth as authApi, users as usersApi, ratemaster as ratemasterApi } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const ROLES = ["admin", "doctor", "nurse", "pharmacist", "lab_tech", "finance", "receptionist"];

const ALL_DEPARTMENTS = [
  "Cardiology", "Orthopedics", "Neurology", "Obstetrics", "Nephrology",
  "Oncology", "Emergency", "General", "Dermatology", "Pediatrics",
  "ENT", "Ophthalmology", "Psychiatry", "Dental",
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOT_DURATIONS = [10, 15, 20, 30, 45, 60];

const ROLE_COLORS: Record<string, string> = {
  admin:        "bg-teal-100 text-teal-700",
  doctor:       "bg-blue-100 text-blue-700",
  nurse:        "bg-emerald-100 text-emerald-700",
  receptionist: "bg-violet-100 text-violet-700",
  pharmacist:   "bg-amber-100 text-amber-700",
  lab_tech:     "bg-indigo-100 text-indigo-700",
  finance:      "bg-rose-100 text-rose-700",
};

// ── DoctorForm — used for add/edit inside a department ────────────────────────
function DoctorForm({
  dept,
  existing,
  onDone,
  onCancel,
}: {
  dept: string;
  existing?: any;
  onDone: () => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!existing;

  const [form, setForm] = useState({
    name:         existing?.name         ?? "",
    email:        existing?.email        ?? "",
    password:     "",
    specialty:    existing?.specialty    ?? dept,
    department:   dept,
    consultingFee:existing?.consultingFee ?? 0,
    schedule: {
      days:            existing?.schedule?.days ?? ["Mon","Tue","Wed","Thu","Fri"],
      startTime:       existing?.schedule?.startTime ?? "09:00",
      endTime:         existing?.schedule?.endTime   ?? "17:00",
      slotDurationMin: existing?.schedule?.slotDurationMin ?? 15,
    },
  });

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const toggleDay = (day: string) => {
    setForm((f) => ({
      ...f,
      schedule: {
        ...f.schedule,
        days: f.schedule.days.includes(day)
          ? f.schedule.days.filter((d: string) => d !== day)
          : [...f.schedule.days, day],
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      if (isEdit) {
        const payload: any = { specialty: form.specialty, schedule: form.schedule, consultingFee: form.consultingFee };
        if (form.password) payload.password = form.password;
        await usersApi.update(existing._id, payload);
      } else {
        if (!form.password) { setError("Password is required"); setLoading(false); return; }
        await usersApi.create({ ...form, role: "doctor" });
      }
      qc.invalidateQueries({ queryKey: ["doctors"] });
      qc.invalidateQueries({ queryKey: ["users"] });
      onDone();
    } catch (err: any) {
      setError(err.message || "Failed to save doctor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-muted/30 border border-border rounded-xl p-4 space-y-3 mt-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {isEdit ? `Edit — ${existing.name}` : `Add Doctor to ${dept}`}
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Full Name *</Label>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Dr. Name" className="h-8 text-sm" required disabled={isEdit} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Email *</Label>
          <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="doctor@hospital.com" className="h-8 text-sm" required disabled={isEdit} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{isEdit ? "New Password (leave blank to keep)" : "Password *"}</Label>
          <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder={isEdit ? "Leave blank to keep current" : "Min 6 characters"} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Specialty</Label>
          <Input value={form.specialty} onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))}
            placeholder={dept} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Consulting Fee (₹)</Label>
          <Input type="number" min={0} value={form.consultingFee || ""}
            onChange={(e) => setForm((f) => ({ ...f, consultingFee: parseFloat(e.target.value) || 0 }))}
            placeholder="e.g. 500" className="h-8 text-sm" />
        </div>
      </div>

      {/* Schedule */}
      <div className="space-y-2">
        <p className="text-xs font-medium">Schedule</p>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                form.schedule.days.includes(d)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Start Time</Label>
            <Input type="time" value={form.schedule.startTime}
              onChange={(e) => setForm((f) => ({ ...f, schedule: { ...f.schedule, startTime: e.target.value } }))}
              className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">End Time</Label>
            <Input type="time" value={form.schedule.endTime}
              onChange={(e) => setForm((f) => ({ ...f, schedule: { ...f.schedule, endTime: e.target.value } }))}
              className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Slot (min)</Label>
            <select
              value={form.schedule.slotDurationMin}
              onChange={(e) => setForm((f) => ({ ...f, schedule: { ...f.schedule, slotDurationMin: parseInt(e.target.value) } }))}
              className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              {SLOT_DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Saving...</> : isEdit ? "Save Changes" : "Add Doctor"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

// ── DoctorCard ────────────────────────────────────────────────────────────────
function DoctorCard({ doctor, onDeactivate }: { doctor: any; onDeactivate: () => void }) {
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();
  const { user } = useAuth();

  if (editing) {
    return (
      <DoctorForm
        dept={doctor.department}
        existing={doctor}
        onDone={() => { setEditing(false); qc.invalidateQueries({ queryKey: ["doctors"] }); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const sch = doctor.schedule;
  const days = sch?.days?.join(", ") ?? "Mon–Fri";
  const hours = sch ? `${sch.startTime} – ${sch.endTime}` : "09:00 – 17:00";
  const slot  = sch?.slotDurationMin ? `${sch.slotDurationMin} min slots` : "15 min slots";

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-border bg-background hover:shadow-sm transition-shadow">
      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
        {doctor.name?.split(" ").slice(-1)[0]?.[0] ?? "D"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold">{doctor.name}</span>
          {doctor.specialty && doctor.specialty !== doctor.department && (
            <span className="text-xs text-muted-foreground">· {doctor.specialty}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{doctor.email}</p>
        <div className="flex flex-wrap gap-2 mt-1.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-0.5">
            <CalendarDays className="h-3 w-3" />{days}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-0.5">
            <Clock className="h-3 w-3" />{hours}
          </span>
          <span className="text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-0.5">{slot}</span>
        </div>
      </div>
      {user?.role === "admin" && (
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
            onClick={() => setEditing(true)} title="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={onDeactivate} title="Deactivate">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ── DepartmentRow ─────────────────────────────────────────────────────────────
function DepartmentRow({ dept, doctors, onDeactivate }: {
  dept: string;
  doctors: any[];
  onDeactivate: (id: string, name: string) => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(doctors.length > 0);
  const [adding, setAdding] = useState(false);
  const qc = useQueryClient();

  return (
    <Card className={`transition-all ${open ? "shadow-sm" : ""}`}>
      <button
        className="w-full flex items-center justify-between p-4 text-left"
        onClick={() => { setOpen((v) => !v); setAdding(false); }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center">
            <Stethoscope className="h-4 w-4 text-teal-600" />
          </div>
          <div>
            <p className="text-sm font-semibold">{dept}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {doctors.length === 0 ? "No doctors added" : `${doctors.length} doctor${doctors.length > 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {doctors.length > 0 && (
            <Badge className="bg-blue-100 text-blue-700 text-xs">{doctors.length}</Badge>
          )}
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-border pt-3">
          {doctors.length === 0 && !adding && (
            <p className="text-xs text-muted-foreground text-center py-3">No doctors in this department yet.</p>
          )}
          {doctors.map((doc) => (
            <DoctorCard
              key={doc._id}
              doctor={doc}
              onDeactivate={() => onDeactivate(doc._id, doc.name)}
            />
          ))}

          {adding ? (
            <DoctorForm
              dept={dept}
              onDone={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["doctors"] }); }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            user?.role === "admin" && (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs border-dashed mt-1"
                onClick={() => setAdding(true)}
              >
                <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Add Doctor to {dept}
              </Button>
            )
          )}
        </div>
      )}
    </Card>
  );
}

// ── DepartmentsSection ────────────────────────────────────────────────────────
function DepartmentsSection() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [customDept, setCustomDept] = useState("");
  const [activeDepts, setActiveDepts] = useState<string[]>(ALL_DEPARTMENTS);

  const { data: doctorsData, isLoading } = useQuery({
    queryKey: ["doctors"],
    queryFn: () => usersApi.doctors(),
    retry: false,
  });

  const allDoctors: any[] = doctorsData ?? [];

  // Group doctors by department
  const doctorsByDept: Record<string, any[]> = {};
  for (const dept of activeDepts) {
    doctorsByDept[dept] = allDoctors.filter((d) => d.department === dept);
  }
  // Also include any doctors whose department isn't in activeDepts
  for (const doc of allDoctors) {
    if (!activeDepts.includes(doc.department)) {
      if (!doctorsByDept[doc.department]) {
        doctorsByDept[doc.department] = [];
        setActiveDepts((prev) => [...prev, doc.department]);
      }
      doctorsByDept[doc.department].push(doc);
    }
  }

  const deactivateDoctor = async (id: string, name: string) => {
    if (!confirm(`Deactivate ${name}?`)) return;
    try {
      await usersApi.deactivate(id);
      qc.invalidateQueries({ queryKey: ["doctors"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (err: any) {
      alert(err.message || "Failed to deactivate");
    }
  };

  const addCustomDept = () => {
    const d = customDept.trim();
    if (!d || activeDepts.includes(d)) return;
    setActiveDepts((prev) => [...prev, d]);
    setCustomDept("");
  };

  const filteredDepts = activeDepts.filter((d) =>
    !search || d.toLowerCase().includes(search.toLowerCase()) ||
    (doctorsByDept[d] ?? []).some((doc) => doc.name.toLowerCase().includes(search.toLowerCase()))
  );

  // Stats
  const totalDoctors = allDoctors.length;
  const deptsWithDoctors = activeDepts.filter((d) => (doctorsByDept[d] ?? []).length > 0).length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Departments",       value: activeDepts.length, color: "text-teal-600",  bg: "bg-teal-50" },
          { label: "Active Depts",      value: deptsWithDoctors,   color: "text-blue-600",  bg: "bg-blue-50" },
          { label: "Total Doctors",     value: totalDoctors,       color: "text-violet-600",bg: "bg-violet-50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3 flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
                <span className={`text-base font-bold ${s.color}`}>{s.value}</span>
              </div>
              <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + Add custom dept */}
      <div className="flex gap-2">
        <Input
          placeholder="Search department or doctor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 text-sm flex-1"
        />
        <div className="flex gap-1.5 shrink-0">
          <Input
            placeholder="New department name"
            value={customDept}
            onChange={(e) => setCustomDept(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustomDept()}
            className="h-9 text-sm w-44"
          />
          <Button size="sm" className="h-9 px-3" onClick={addCustomDept} disabled={!customDept.trim()}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Department rows */}
      <div className="space-y-2">
        {filteredDepts.map((dept) => (
          <DepartmentRow
            key={dept}
            dept={dept}
            doctors={doctorsByDept[dept] ?? []}
            onDeactivate={deactivateDoctor}
          />
        ))}
        {filteredDepts.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground text-center py-8">No departments match your search.</p>
        )}
      </div>
    </div>
  );
}

// ── Staff Role Config ─────────────────────────────────────────────────────────
const STAFF_ROLES = [
  { key: "nurse",        label: "Nurse",       plural: "Nurses",          icon: HeartPulse },
  { key: "receptionist", label: "Receptionist",plural: "Reception",       icon: UserCheck  },
  { key: "lab_tech",     label: "Lab Tech",    plural: "Lab Technicians", icon: FlaskConical },
  { key: "pharmacist",   label: "Pharmacist",  plural: "Pharmacists",     icon: Pill       },
  { key: "finance",      label: "Finance",     plural: "Finance Staff",   icon: CreditCard },
] as const;

type StaffRole = (typeof STAFF_ROLES)[number]["key"];

// ── StaffSection ──────────────────────────────────────────────────────────────
function StaffSection() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<StaffRole>("receptionist");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", department: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { data: usersData, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: usersApi.list,
    retry: false,
  });

  const allUsers: any[] = usersData ?? [];
  const current = STAFF_ROLES.find((r) => r.key === activeTab)!;
  const roleUsers = allUsers.filter((u) => u.role === activeTab);

  const switchTab = (tab: StaffRole) => {
    setActiveTab(tab);
    setAdding(false);
    setError("");
    setSuccess("");
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(""); setSuccess("");
    try {
      await usersApi.create({ ...form, role: activeTab });
      qc.invalidateQueries({ queryKey: ["users"] });
      setSuccess(`${current.label} "${form.name}" added successfully.`);
      setForm({ name: "", email: "", password: "", department: "" });
      setAdding(false);
    } catch (err: any) {
      setError(err.message || "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  const deactivate = async (id: string, name: string) => {
    if (!confirm(`Deactivate ${name}?`)) return;
    try {
      await usersApi.deactivate(id);
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (err: any) {
      alert(err.message || "Failed to deactivate");
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-5 gap-2">
        {STAFF_ROLES.map((r) => {
          const count = allUsers.filter((u) => u.role === r.key).length;
          const Icon = r.icon;
          return (
            <Card
              key={r.key}
              className={`cursor-pointer transition-all hover:shadow-sm ${activeTab === r.key ? "ring-2 ring-primary shadow-sm" : ""}`}
              onClick={() => switchTab(r.key)}
            >
              <CardContent className="p-3 flex flex-col items-center gap-1.5 text-center">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${ROLE_COLORS[r.key]}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-lg font-bold leading-tight">{count}</span>
                <span className="text-[10px] text-muted-foreground leading-tight">{r.plural}</span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Role tabs */}
      <div className="flex gap-2 flex-wrap">
        {STAFF_ROLES.map((r) => (
          <button
            key={r.key}
            onClick={() => switchTab(r.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
              activeTab === r.key
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {r.plural}
          </button>
        ))}
      </div>

      {/* Users for selected role */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <current.icon className="h-4 w-4" />
              {current.plural}
              <Badge className={`text-xs ${ROLE_COLORS[activeTab]}`}>{roleUsers.length}</Badge>
            </CardTitle>
            {!adding && (
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" /> Add {current.label}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Add form */}
          {adding && (
            <form onSubmit={handleAdd} className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                New {current.label}
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Full Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Full name"
                    className="h-8 text-sm"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email *</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="user@hospital.com"
                    className="h-8 text-sm"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Password *</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Min 6 characters"
                    className="h-8 text-sm"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Department</Label>
                  <Input
                    value={form.department}
                    onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    placeholder="e.g. Emergency, ICU"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              {error && (
                <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>
              )}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={loading}>
                  {loading
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Adding…</>
                    : `Add ${current.label}`}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setAdding(false); setError(""); }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {success && (
            <p className="text-xs bg-green-50 text-green-700 px-3 py-2 rounded-lg">{success}</p>
          )}

          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && roleUsers.length === 0 && !adding && (
            <div className="text-center py-10 space-y-2">
              <current.icon className="h-8 w-8 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">
                No {current.plural.toLowerCase()} added yet.
              </p>
              <Button size="sm" variant="outline" className="gap-1.5 mt-1" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" /> Add first {current.label}
              </Button>
            </div>
          )}

          {roleUsers.map((u: any) => (
            <div
              key={u._id}
              className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background hover:shadow-sm transition-shadow"
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${ROLE_COLORS[activeTab]}`}>
                {u.name?.[0]?.toUpperCase() ?? "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{u.name}</p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
                {u.department && (
                  <p className="text-xs text-muted-foreground mt-0.5">{u.department}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => deactivate(u._id, u.name)}
                title="Deactivate"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── HospitalSection ───────────────────────────────────────────────────────────
function HospitalSection({ user }: { user: any }) {
  const [clinicName,    setClinicName]    = useState((user as any)?.organization ?? "Carenow");
  const [clinicPhone,   setClinicPhone]   = useState((user as any)?.clinicPhone  ?? "");
  const [clinicAddress, setClinicAddress] = useState((user as any)?.clinicAddress ?? "");
  const [logoUrl,       setLogoUrl]       = useState((user as any)?.clinicLogoUrl ?? "");
  const [logoPreview,   setLogoPreview]   = useState((user as any)?.clinicLogoUrl ?? "");
  const [invoiceStyle,  setInvoiceStyle]  = useState<string>(() => {
    try { const u = JSON.parse(localStorage.getItem("carenoww_user") || "{}"); return u.invoiceStyle || "classic"; } catch { return "classic"; }
  });
  const [gstNo,         setGstNo]         = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("BILL");
  const [cgstRate,      setCgstRate]      = useState(0);
  const [sgstRate,      setSgstRate]      = useState(0);
  const [igstRate,      setIgstRate]      = useState(0);
  const [taxInclusive,  setTaxInclusive]  = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [msg,           setMsg]           = useState("");

  useEffect(() => {
    authApi.getClinicSettings().then((s: any) => {
      if (s.name          !== undefined) setClinicName(s.name);
      if (s.clinicPhone   !== undefined) setClinicPhone(s.clinicPhone);
      if (s.clinicAddress !== undefined) setClinicAddress(s.clinicAddress);
      if (s.logoUrl       !== undefined) { setLogoUrl(s.logoUrl); setLogoPreview(s.logoUrl); }
      if (s.gstNo         !== undefined) setGstNo(s.gstNo);
      if (s.invoicePrefix !== undefined) setInvoicePrefix(s.invoicePrefix);
      if (s.taxConfig) {
        setCgstRate(s.taxConfig.cgstRate ?? 0);
        setSgstRate(s.taxConfig.sgstRate ?? 0);
        setIgstRate(s.taxConfig.igstRate ?? 0);
        setTaxInclusive(s.taxConfig.taxInclusivePricing ?? false);
      }
    }).catch(() => {});
  }, []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setLogoUrl(dataUrl);
      setLogoPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const saveSettings = async () => {
    setSaving(true); setMsg("");
    try {
      await authApi.updateClinicSettings({
        name:          clinicName,
        logoUrl:       logoUrl,
        clinicPhone:   clinicPhone,
        clinicAddress: clinicAddress,
        gstNo:         gstNo,
        invoicePrefix: invoicePrefix,
        taxConfig: {
          cgstRate:            cgstRate,
          sgstRate:            sgstRate,
          igstRate:            igstRate,
          taxInclusivePricing: taxInclusive,
        },
      });
      try {
        const stored = localStorage.getItem("carenoww_user");
        if (stored) {
          const u = JSON.parse(stored);
          u.organization    = clinicName;
          u.clinicLogoUrl   = logoUrl;
          u.clinicPhone     = clinicPhone;
          u.clinicAddress   = clinicAddress;
          u.invoiceStyle    = invoiceStyle;
          localStorage.setItem("carenoww_user", JSON.stringify(u));
        }
      } catch {}
      setMsg("Clinic settings saved successfully.");
    } catch (err: any) {
      setMsg(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Clinic Branding &amp; Info
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Logo upload */}
          <div className="space-y-2">
            <Label className="text-xs">Clinic Logo</Label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 shrink-0 overflow-hidden">
                {logoPreview
                  ? <img src={logoPreview} alt="logo" className="w-full h-full object-contain" />
                  : <ImageIcon className="h-7 w-7 text-gray-300" />
                }
              </div>
              <div className="space-y-1.5">
                <label className="cursor-pointer">
                  <div className="flex items-center gap-2 px-3 py-1.5 text-xs border border-input rounded-md hover:bg-accent transition-colors">
                    <Upload className="h-3.5 w-3.5" />
                    {logoPreview ? "Replace Logo" : "Upload Logo"}
                  </div>
                  <input type="file" accept="image/*" className="sr-only" onChange={handleLogoUpload} />
                </label>
                {logoPreview && (
                  <button
                    className="text-xs text-destructive hover:underline block"
                    onClick={() => { setLogoUrl(""); setLogoPreview(""); }}
                  >
                    Remove logo
                  </button>
                )}
                <p className="text-xs text-muted-foreground">PNG, JPG, or SVG. Max 2 MB. Appears on all printouts.</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Clinic details */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Clinic / Hospital Name *</Label>
              <Input
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                placeholder="e.g. Carenow Clinic"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone Number</Label>
              <Input
                value={clinicPhone}
                onChange={(e) => setClinicPhone(e.target.value)}
                placeholder="+91-44-XXXX-XXXX"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Address (shown on printouts)</Label>
              <Input
                value={clinicAddress}
                onChange={(e) => setClinicAddress(e.target.value)}
                placeholder="Street, City — PIN  ·  www.yoursite.com"
                className="h-9"
              />
            </div>
          </div>

          {msg && (
            <p className={`text-xs px-3 py-2 rounded ${msg.includes("success") ? "bg-green-50 text-green-700" : "bg-destructive/10 text-destructive"}`}>
              {msg}
            </p>
          )}

          <Button size="sm" onClick={saveSettings} disabled={saving || user?.role !== "admin"}>
            {saving ? "Saving..." : "Save Clinic Settings"}
          </Button>
          {user?.role !== "admin" && (
            <p className="text-xs text-muted-foreground">Only administrators can update clinic branding.</p>
          )}
        </CardContent>
      </Card>

      {/* Tax & Invoice */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Tax &amp; Invoice Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">GSTIN (15-char)</Label>
              <Input
                value={gstNo}
                onChange={(e) => setGstNo(e.target.value.toUpperCase())}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
                className="h-9 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">Leave blank to disable GST on invoices.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Invoice Number Prefix</Label>
              <Input
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
                placeholder="BILL"
                className="h-9 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">E.g. BILL-0001, INV-0001.</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-xs font-medium">GST Rates (% per transaction)</Label>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">CGST %</Label>
                <Input
                  type="number" min={0} max={14} step={0.5}
                  value={cgstRate}
                  onChange={(e) => setCgstRate(parseFloat(e.target.value) || 0)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">SGST %</Label>
                <Input
                  type="number" min={0} max={14} step={0.5}
                  value={sgstRate}
                  onChange={(e) => setSgstRate(parseFloat(e.target.value) || 0)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">IGST % (interstate)</Label>
                <Input
                  type="number" min={0} max={28} step={0.5}
                  value={igstRate}
                  onChange={(e) => setIgstRate(parseFloat(e.target.value) || 0)}
                  className="h-9"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Healthcare services (SAC 9993) are GST-exempt in India. Pharmacy products attract 12% GST. Set rates to 0 if you are exempt.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-xs font-medium">Tax-Inclusive Pricing (MRP includes GST)</p>
              <p className="text-xs text-muted-foreground">When enabled, displayed prices already include GST. Tax is back-calculated for invoices.</p>
            </div>
            <Switch checked={taxInclusive} onCheckedChange={setTaxInclusive} />
          </div>

          <Button
            size="sm"
            onClick={saveSettings}
            disabled={saving || user?.role !== "admin"}
          >
            {saving ? "Saving..." : "Save Tax Settings"}
          </Button>
          {user?.role !== "admin" && (
            <p className="text-xs text-muted-foreground">Only administrators can update tax settings.</p>
          )}
        </CardContent>
      </Card>

      {/* Invoice Print Style */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Printer className="h-4 w-4" /> Invoice Print Style
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Choose how invoices look when printed. Half-A4 styles (A5) automatically continue on the next page if items overflow.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {([
              { id: "classic",  label: "Classic",        size: "Full A4", desc: "Centered header, grey meta grid, bordered table. Clean & professional." },
              { id: "modern",   label: "Modern",         size: "Full A4", desc: "Dark teal header band, coloured table headers. Bold & branded." },
              { id: "minimal",  label: "Minimal",        size: "Full A4", desc: "Large typographic bill ID, hairline borders, airy whitespace." },
              { id: "thermal",  label: "Thermal / Slip", size: "Half A4 (A5)", desc: "Receipt-style, dashed dividers, compact lines. Fast queue printing." },
              { id: "compact",  label: "Compact",        size: "Half A4 (A5)", desc: "Two-column layout, condensed table, structured. Good for busy counters." },
            ] as const).map((s) => (
              <button
                key={s.id}
                onClick={() => setInvoiceStyle(s.id)}
                className={`text-left rounded-xl border-2 p-3 transition-all ${invoiceStyle === s.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold">{s.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${s.size.startsWith("Half") ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>{s.size}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
                {invoiceStyle === s.id && (
                  <div className="mt-2 text-[10px] font-semibold text-primary flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Selected
                  </div>
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Save Clinic Settings above to apply the selected style.</p>
        </CardContent>
      </Card>

      {/* Token Display */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Monitor className="h-4 w-4" /> Token Display Screen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Open this URL on a TV or kiosk in your waiting area to show live token numbers.
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              className="h-8 text-xs font-mono bg-muted/30"
              value={`${window.location.origin}/display?tid=${(user as any)?.tenantId ?? "YOUR_TENANT_ID"}`}
            />
            <Button size="sm" variant="outline" className="h-8 text-xs shrink-0"
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/display?tid=${(user as any)?.tenantId ?? ""}`)}>
              Copy
            </Button>
            <Button size="sm" className="h-8 text-xs shrink-0"
              onClick={() => window.open(`/display?tid=${(user as any)?.tenantId ?? ""}`, "_blank")}>
              Open
            </Button>
          </div>
          <div className="bg-teal-50 rounded-xl p-3 flex items-center gap-2 text-xs text-teal-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            HIPAA Compliant · HL7 FHIR R4 Native · ABDM API-Ready
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── ServiceRatesSection ───────────────────────────────────────────────────────
const RATE_CATEGORIES = ["Lab", "Diagnosis", "Procedure", "Room", "Bed Charges", "Nursing", "Other"] as const;
const RATE_UNITS = ["per test", "per visit", "per session", "per day", "per hour", "per procedure", "per admission", "per tablet", "per vial"] as const;

function ServiceRatesSection() {
  const qc = useQueryClient();
  const { data: rates = [], isLoading } = useQuery<any[]>({
    queryKey: ["ratemaster"],
    queryFn:  () => ratemasterApi.list(),
  });

  const [form, setForm]       = useState({ name: "", category: "Lab", defaultRate: "", unit: "per test" });
  const [editId, setEditId]   = useState<string | null>(null);
  const [error, setError]     = useState("");
  const [busy, setBusy]       = useState(false);

  const resetForm = () => { setForm({ name: "", category: "Lab", defaultRate: "", unit: "per test" }); setEditId(null); setError(""); };

  const startEdit = (r: any) => {
    setEditId(r._id);
    setForm({ name: r.name, category: r.category, defaultRate: String(r.defaultRate), unit: r.unit || "per test" });
    setError("");
  };

  const save = async () => {
    if (!form.name.trim()) { setError("Name is required."); return; }
    const rate = parseFloat(form.defaultRate) || 0;
    setBusy(true); setError("");
    try {
      if (editId) {
        await ratemasterApi.update(editId, { name: form.name.trim(), category: form.category, defaultRate: rate, unit: form.unit });
      } else {
        await ratemasterApi.create({ name: form.name.trim(), category: form.category, defaultRate: rate, unit: form.unit });
      }
      qc.invalidateQueries({ queryKey: ["ratemaster"] });
      resetForm();
    } catch (e: any) {
      setError(e.message || "Failed to save rate.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await ratemasterApi.remove(id);
      qc.invalidateQueries({ queryKey: ["ratemaster"] });
    } catch { /* silent */ }
  };

  const grouped = RATE_CATEGORIES.reduce<Record<string, any[]>>((acc, cat) => {
    acc[cat] = rates.filter((r) => r.category === cat);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Service Rate Master</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure per-item charges for Lab tests, Diagnosis, Procedures, and Room/Bed. These rates are used for auto-billing and the billing quick-pick panel.
        </p>
      </div>

      {/* Add / Edit form */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {editId ? "Edit Rate" : "Add Rate"}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input className="h-8 text-sm" placeholder="e.g. CBC, Hypertension" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RATE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rate (₹)</Label>
              <Input className="h-8 text-sm" type="number" min={0} placeholder="0.00" value={form.defaultRate} onChange={(e) => setForm((f) => ({ ...f, defaultRate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unit label</Label>
              <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{RATE_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {error && <p className="text-xs text-destructive mt-2">{error}</p>}
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : editId ? "Update" : "Add Rate"}</Button>
            {editId && <Button size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>}
          </div>
        </CardContent>
      </Card>

      {/* Rate list grouped by category */}
      {isLoading ? (
        <div className="text-xs text-muted-foreground py-4 text-center">Loading rates…</div>
      ) : (
        <div className="space-y-4">
          {RATE_CATEGORIES.map((cat) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-1.5">
                <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{cat}</span>
                <Badge variant="outline" className="text-xs py-0 h-4">{grouped[cat].length}</Badge>
              </div>
              {grouped[cat].length === 0 ? (
                <p className="text-xs text-muted-foreground pl-5">No rates configured.</p>
              ) : (
                <div className="border rounded-md divide-y">
                  {grouped[cat].map((r) => (
                    <div key={r._id} className="flex items-center justify-between px-3 py-2">
                      <div>
                        <span className="text-sm font-medium">{r.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{r.unit}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold">₹{r.defaultRate.toLocaleString()}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEdit(r)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => remove(r._id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main SettingsPage ─────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [notifications, setNotifications] = useState({
    aiAlerts: true, criticalValues: true, appointmentReminders: true,
    lowStock: true, claimAlerts: true, ewsAlerts: true,
  });
  const [aiSettings, setAiSettings] = useState({
    ambientScribe: true, ddxEngine: true, ewsMonitor: true,
    claimsScrubbing: true, stockPredictor: true, burnoutDetector: false,
  });

  const [profileForm, setProfileForm] = useState({ name: user?.name ?? "", department: user?.department ?? "" });
  const [profileMsg, setProfileMsg]   = useState("");
  const [profileLoading, setProfileLoading] = useState(false);

  const [scribeForm, setScribeForm] = useState({
    enabled: false,
    provider: "deepgram",
    apiKey: "",
    model: "nova-2-medical",
  });
  const [showScribeKey, setShowScribeKey] = useState(false);
  const [scribeLoading, setScribeLoading] = useState(false);
  const [scribeMsg, setScribeMsg] = useState("");

  const [pwForm, setPwForm]     = useState({ current: "", next: "", confirm: "" });
  const [pwMsg, setPwMsg]       = useState("");
  const [pwError, setPwError]   = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const [newUser, setNewUser]   = useState({ name: "", email: "", password: "", role: "doctor", department: "" });
  const [userMsg, setUserMsg]   = useState("");
  const [userError, setUserError] = useState("");
  const [userLoading, setUserLoading] = useState(false);

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: usersApi.list,
    retry: false,
    enabled: user?.role === "admin",
  });
  const userList: any[] = usersData ?? [];

  const toggleNotif = (key: keyof typeof notifications) => setNotifications((p) => ({ ...p, [key]: !p[key] }));
  const toggleAI    = (key: keyof typeof aiSettings)    => setAiSettings((p) => ({ ...p, [key]: !p[key] }));

  const sections = [
    { id: "profile",     label: "Profile",              icon: User },
    ...(user?.role === "admin" ? [{ id: "hospital",    label: "Hospital",             icon: Building2 }] : []),
    ...(user?.role === "admin" ? [{ id: "departments",  label: "Departments & Doctors", icon: Stethoscope  }] : []),
    ...(user?.role === "admin" ? [{ id: "staff",        label: "Staff Management",      icon: UserCheck    }] : []),
    ...(user?.role === "admin" ? [{ id: "servicerates", label: "Service Rates",         icon: IndianRupee  }] : []),
    { id: "notif",       label: "Notifications",        icon: Bell },
    { id: "ai",          label: "AI Features",          icon: Brain },
    { id: "security",    label: "Security",             icon: Shield },
    ...(user?.role === "admin" ? [{ id: "users",       label: "All Users",             icon: Users       }] : []),
    { id: "system",      label: "System",               icon: Monitor },
  ];
  const [active, setActive] = useState("profile");

  const saveProfile = async () => {
    setProfileLoading(true); setProfileMsg("");
    try {
      await authApi.updateProfile({ name: profileForm.name, department: profileForm.department });
      setProfileMsg("Profile updated successfully.");
    } catch (err: any) {
      setProfileMsg(err.message || "Failed to update profile");
    } finally {
      setProfileLoading(false);
    }
  };

  const changePassword = async () => {
    setPwLoading(true); setPwMsg(""); setPwError("");
    if (pwForm.next !== pwForm.confirm) { setPwError("Passwords do not match"); setPwLoading(false); return; }
    if (pwForm.next.length < 6)         { setPwError("Password must be at least 6 characters"); setPwLoading(false); return; }
    try {
      await authApi.changePassword(pwForm.current, pwForm.next);
      setPwMsg("Password changed successfully.");
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (err: any) {
      setPwError(err.message || "Failed to change password");
    } finally {
      setPwLoading(false);
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserLoading(true); setUserMsg(""); setUserError("");
    try {
      await usersApi.create(newUser);
      qc.invalidateQueries({ queryKey: ["users"] });
      setUserMsg(`User ${newUser.name} created.`);
      setNewUser({ name: "", email: "", password: "", role: "doctor", department: "" });
    } catch (err: any) {
      setUserError(err.message || "Failed to create user");
    } finally {
      setUserLoading(false);
    }
  };

  useEffect(() => {
    authApi.me().then((data: any) => {
      setScribeForm({
        enabled:  data.aiScribeEnabled  ?? false,
        provider: data.aiScribeProvider ?? "deepgram",
        apiKey:   data.aiScribeApiKey   ?? "",
        model:    data.aiScribeModel    ?? "nova-2-medical",
      });
    }).catch(() => {});
  }, []);

  const saveScribe = async () => {
    setScribeLoading(true); setScribeMsg("");
    try {
      await authApi.updateProfile({
        aiScribeEnabled:  scribeForm.enabled,
        aiScribeProvider: scribeForm.provider,
        aiScribeApiKey:   scribeForm.apiKey,
        aiScribeModel:    scribeForm.model,
      });
      setScribeMsg("Scribe settings saved successfully");
    } catch (e: any) {
      setScribeMsg(e.message || "Failed to save");
    } finally {
      setScribeLoading(false);
    }
  };

  const deactivateUser = async (id: string, name: string) => {
    if (!confirm(`Deactivate ${name}?`)) return;
    try {
      await usersApi.deactivate(id);
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (err: any) {
      alert(err.message || "Failed to deactivate");
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      <div>
        <h2 className="text-lg font-bold">Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your account and hospital system preferences</p>
      </div>

      <div className="grid lg:grid-cols-4 gap-4">
        {/* Sidebar nav */}
        <Card className="h-fit">
          <CardContent className="p-3 space-y-0.5">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all text-sm ${
                  active === s.id
                    ? "bg-primary text-primary-foreground font-medium"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <s.icon className="h-4 w-4 shrink-0" />
                {s.label}
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Content */}
        <div className="lg:col-span-3 space-y-4">

          {/* ── Profile ─────────────────────────────────────── */}
          {active === "profile" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" /> Profile Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                    {user?.name?.[0] ?? "U"}
                  </div>
                  <div>
                    <div className="font-semibold">{user?.name}</div>
                    <div className="text-sm text-muted-foreground">{user?.email}</div>
                    <Badge className="mt-1 text-xs bg-teal-100 text-teal-700">{user?.role}</Badge>
                  </div>
                </div>
                <Separator />
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Full Name</Label>
                    <Input value={profileForm.name} onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email</Label>
                    <Input value={user?.email ?? ""} disabled className="h-9 opacity-60" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Department</Label>
                    <Input value={profileForm.department} onChange={(e) => setProfileForm((f) => ({ ...f, department: e.target.value }))} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Organization</Label>
                    <Input value={(user as any)?.organization ?? ""} disabled className="h-9 opacity-60" />
                  </div>
                </div>
                {profileMsg && (
                  <p className={`text-xs px-3 py-2 rounded ${profileMsg.includes("success") ? "bg-green-50 text-green-700" : "bg-destructive/10 text-destructive"}`}>
                    {profileMsg}
                  </p>
                )}
                <Button size="sm" onClick={saveProfile} disabled={profileLoading}>
                  {profileLoading ? "Saving..." : "Save Profile"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* ── Hospital ─────────────────────────────────────── */}
          {active === "hospital" && user?.role === "admin" && <HospitalSection user={user} />}

          {/* ── Departments & Doctors ─────────────────────────── */}
          {active === "departments" && user?.role === "admin" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Departments & Doctors</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Manage departments and configure doctors with their schedules. Doctors added here appear in the appointment booking flow.
                  </p>
                </div>
              </div>
              <DepartmentsSection />
            </div>
          )}

          {/* ── Staff Management ─────────────────────────────── */}
          {active === "staff" && user?.role === "admin" && (
            <div className="space-y-2">
              <div>
                <h3 className="text-sm font-semibold">Staff Management</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Create and manage nursing, reception, lab, pharmacy, and finance staff. Each role gets access to the relevant modules only.
                </p>
              </div>
              <StaffSection />
            </div>
          )}

          {/* ── Service Rates ─────────────────────────────────── */}
          {active === "servicerates" && user?.role === "admin" && <ServiceRatesSection />}

          {/* ── Notifications ─────────────────────────────────── */}
          {active === "notif" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Bell className="h-4 w-4" /> Notification Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { key: "aiAlerts",            label: "AI Clinical Alerts",         sub: "Sepsis, EWS, deterioration alerts" },
                  { key: "criticalValues",       label: "Critical Lab Values",        sub: "Immediate notification for critical results" },
                  { key: "appointmentReminders", label: "Appointment Reminders",      sub: "24h and 2h before scheduled appointments" },
                  { key: "lowStock",             label: "Drug Stock Alerts",          sub: "Low and critical pharmacy stock notifications" },
                  { key: "claimAlerts",          label: "Insurance Claim Alerts",     sub: "Claim status, denials, and approvals" },
                  { key: "ewsAlerts",            label: "Early Warning Score Alerts", sub: "EWS threshold breach notifications" },
                ].map((n) => (
                  <div key={n.key} className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{n.label}</div>
                      <div className="text-xs text-muted-foreground">{n.sub}</div>
                    </div>
                    <Switch
                      checked={notifications[n.key as keyof typeof notifications]}
                      onCheckedChange={() => toggleNotif(n.key as keyof typeof notifications)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── AI Features ───────────────────────────────────── */}
          {active === "ai" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Brain className="h-4 w-4" /> AI Feature Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  All AI outputs are advisory only. Human-in-the-loop is mandatory per HIPAA and MedCore AI governance policy.
                </div>
                {[
                  { key: "ambientScribe",   label: "Ambient AI Scribe",             sub: "Real-time voice → SOAP note generation during consultations" },
                  { key: "ddxEngine",       label: "Differential Diagnosis Engine", sub: "AI-ranked differential diagnoses based on clinical data" },
                  { key: "ewsMonitor",      label: "EWS / Sepsis Monitor",          sub: "Continuous ICU vitals monitoring and sepsis early detection" },
                  { key: "claimsScrubbing", label: "AI Claims Scrubbing",           sub: "Pre-submission insurance claim validation" },
                  { key: "stockPredictor",  label: "Drug Stock Predictor",          sub: "ML-based drug consumption forecasting" },
                  { key: "burnoutDetector", label: "Staff Burnout Predictor",       sub: "Shift pattern analysis for burnout risk (Beta)" },
                ].map((f) => (
                  <div key={f.key} className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{f.label}</div>
                      <div className="text-xs text-muted-foreground">{f.sub}</div>
                    </div>
                    <Switch
                      checked={aiSettings[f.key as keyof typeof aiSettings]}
                      onCheckedChange={() => toggleAI(f.key as keyof typeof aiSettings)}
                    />
                  </div>
                ))}
                <Separator />
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-sm font-semibold flex items-center gap-2">
                        <Mic className="h-4 w-4 text-teal-600" /> AI Scribe Configuration
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">Personal API key — each doctor can configure independently</div>
                    </div>
                    <Switch checked={scribeForm.enabled} onCheckedChange={(v) => setScribeForm(f => ({ ...f, enabled: v }))} />
                  </div>
                  {scribeForm.enabled && (
                    <div className="space-y-3 mt-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Provider</Label>
                        <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                          value={scribeForm.provider}
                          onChange={(e) => setScribeForm(f => ({ ...f, provider: e.target.value }))}>
                          <option value="deepgram">Deepgram (Recommended)</option>
                          <option value="assemblyai">AssemblyAI</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">API Key</Label>
                        <div className="relative">
                          <Input type={showScribeKey ? "text" : "password"}
                            value={scribeForm.apiKey}
                            onChange={(e) => setScribeForm(f => ({ ...f, apiKey: e.target.value }))}
                            placeholder="Paste your API key here"
                            className="h-9 pr-20" />
                          <button className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => setShowScribeKey(v => !v)}>
                            {showScribeKey ? "Hide" : "Show"}
                          </button>
                        </div>
                        {scribeForm.provider === "deepgram" && (
                          <p className="text-xs text-muted-foreground">Get your key at console.deepgram.com</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Model</Label>
                        <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                          value={scribeForm.model}
                          onChange={(e) => setScribeForm(f => ({ ...f, model: e.target.value }))}>
                          {scribeForm.provider === "deepgram" ? (
                            <>
                              <option value="nova-2-medical">nova-2-medical (Best for clinical)</option>
                              <option value="nova-2">nova-2 (General)</option>
                              <option value="nova-3">nova-3 (Latest)</option>
                            </>
                          ) : (
                            <>
                              <option value="best">Best (AssemblyAI)</option>
                              <option value="nano">Nano (Fast)</option>
                            </>
                          )}
                        </select>
                      </div>
                      {scribeMsg && <p className={`text-xs px-3 py-2 rounded ${scribeMsg.includes("saved") ? "bg-green-50 text-green-700" : "bg-destructive/10 text-destructive"}`}>{scribeMsg}</p>}
                      <Button size="sm" onClick={saveScribe} disabled={scribeLoading} className="gap-2">
                        {scribeLoading ? "Saving..." : "Save Scribe Settings"}
                      </Button>
                    </div>
                  )}
                  {!scribeForm.enabled && (
                    <div className="mt-2">
                      {scribeMsg && <p className={`text-xs px-3 py-2 rounded ${scribeMsg.includes("saved") ? "bg-green-50 text-green-700" : "bg-destructive/10 text-destructive"}`}>{scribeMsg}</p>}
                      <Button size="sm" variant="outline" onClick={saveScribe} disabled={scribeLoading} className="mt-2">
                        {scribeLoading ? "Saving..." : "Save (disabled)"}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Security ──────────────────────────────────────── */}
          {active === "security" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Change Password
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Current Password</Label>
                    <Input type="password" value={pwForm.current}
                      onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))}
                      placeholder="Enter current password" className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">New Password</Label>
                    <Input type="password" value={pwForm.next}
                      onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))}
                      placeholder="Enter new password" className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Confirm New Password</Label>
                    <Input type="password" value={pwForm.confirm}
                      onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
                      placeholder="Confirm new password" className="h-9" />
                  </div>
                </div>
                {pwMsg   && <p className="text-xs bg-green-50 text-green-700 px-3 py-2 rounded">{pwMsg}</p>}
                {pwError && <p className="text-xs bg-destructive/10 text-destructive px-3 py-2 rounded">{pwError}</p>}
                <Button size="sm" onClick={changePassword}
                  disabled={pwLoading || !pwForm.current || !pwForm.next || !pwForm.confirm}>
                  {pwLoading ? "Updating..." : "Update Password"}
                </Button>
                <Separator />
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <div className="text-sm font-medium">Multi-Factor Authentication</div>
                    <div className="text-xs text-muted-foreground">Mandatory for all clinical roles</div>
                  </div>
                  <Badge className="bg-green-100 text-green-700 text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" />Active
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Session Timeout</div>
                    <div className="text-xs text-muted-foreground">Auto-logout after inactivity</div>
                  </div>
                  <select className="text-xs border rounded-lg px-2 py-1.5 bg-background">
                    <option>30 minutes</option>
                    <option>1 hour</option>
                    <option>4 hours</option>
                  </select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── User Management ───────────────────────────────── */}
          {active === "users" && user?.role === "admin" && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Plus className="h-4 w-4" /> Add New User
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={createUser} className="space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Full Name *</Label>
                        <Input value={newUser.name} onChange={(e) => setNewUser((f) => ({ ...f, name: e.target.value }))}
                          placeholder="Dr. Name" className="h-8 text-sm" required />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Email *</Label>
                        <Input type="email" value={newUser.email} onChange={(e) => setNewUser((f) => ({ ...f, email: e.target.value }))}
                          placeholder="user@hospital.com" className="h-8 text-sm" required />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Password *</Label>
                        <Input type="password" value={newUser.password} onChange={(e) => setNewUser((f) => ({ ...f, password: e.target.value }))}
                          placeholder="Min 6 characters" className="h-8 text-sm" required />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Role *</Label>
                        <select value={newUser.role} onChange={(e) => setNewUser((f) => ({ ...f, role: e.target.value }))}
                          className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Department</Label>
                        <Input value={newUser.department} onChange={(e) => setNewUser((f) => ({ ...f, department: e.target.value }))}
                          placeholder="Cardiology" className="h-8 text-sm" />
                      </div>
                    </div>
                    {userMsg   && <p className="text-xs bg-green-50 text-green-700 px-3 py-2 rounded">{userMsg}</p>}
                    {userError && <p className="text-xs bg-destructive/10 text-destructive px-3 py-2 rounded">{userError}</p>}
                    <Button type="submit" size="sm" disabled={userLoading}>
                      {userLoading ? "Creating..." : "Create User"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4" /> Active Users ({userList.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {userList.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">No users found or API not connected</p>
                  )}
                  {userList.map((u: any) => (
                    <div key={u._id || u.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {u.name?.[0] ?? "U"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </div>
                      <Badge className={`text-xs shrink-0 ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-600"}`}>{u.role}</Badge>
                      <span className="text-xs text-muted-foreground shrink-0">{u.department}</span>
                      {u._id !== user?.id && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0"
                          onClick={() => deactivateUser(u._id || u.id, u.name)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── System ────────────────────────────────────────── */}
          {active === "system" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Monitor className="h-4 w-4" /> System Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  ["Platform",       "Carenoww HMS v2.1"],
                  ["Tech Stack",     "React / Node.js / MongoDB"],
                  ["AI Engine",      "Claude / GPT-4-class LLM + Custom ML"],
                  ["Infrastructure", "AWS (ap-south-1) · Kubernetes EKS"],
                  ["Compliance",     "HIPAA · HL7 FHIR R4 · ABDM · GDPR"],
                  ["Uptime (30d)",   "99.97%"],
                  ["API Version",    "REST v2.1"],
                  ["Last Deploy",    "May 13, 2026"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center py-1.5 border-b border-border last:border-0">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium text-xs text-right">{v}</span>
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Database className="h-4 w-4" /> Export Data
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Key className="h-4 w-4" /> API Keys
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}
