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
  X, Loader2, UserPlus, Mic,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { auth as authApi, users as usersApi } from "@/lib/api";
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
    name:      existing?.name      ?? "",
    email:     existing?.email     ?? "",
    password:  "",
    specialty: existing?.specialty ?? dept,
    department:dept,
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
        const payload: any = { specialty: form.specialty, schedule: form.schedule };
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
    { id: "hospital",    label: "Hospital",             icon: Building2 },
    ...(user?.role === "admin" ? [{ id: "departments", label: "Departments & Doctors", icon: Stethoscope }] : []),
    { id: "notif",       label: "Notifications",        icon: Bell },
    { id: "ai",          label: "AI Features",          icon: Brain },
    { id: "security",    label: "Security",             icon: Shield },
    ...(user?.role === "admin" ? [{ id: "users", label: "User Management", icon: Users }] : []),
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
          {active === "hospital" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Hospital Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    { label: "Hospital Name",    value: (user as any)?.organization ?? "Carenoww City Hospital" },
                    { label: "Registration No.", value: "MCI-2019-TN-0421" },
                    { label: "NABH Accredited",  value: "Yes (2023–2026)" },
                    { label: "Total Beds",        value: "188" },
                    { label: "Data Residency",    value: "AWS Mumbai (ap-south-1)" },
                  ].map((f) => (
                    <div key={f.label} className="space-y-1.5">
                      <Label className="text-xs">{f.label}</Label>
                      <Input defaultValue={f.value} className="h-9" />
                    </div>
                  ))}
                </div>
                {/* Token Display URL */}
                <div className="border rounded-xl p-4 space-y-2 bg-violet-50 border-violet-200">
                  <p className="text-xs font-semibold text-violet-800 flex items-center gap-1.5">
                    <Monitor className="h-3.5 w-3.5" /> Token Display Screen (TV / Kiosk)
                  </p>
                  <p className="text-xs text-violet-700">
                    Open this URL on a TV or kiosk in your waiting area to show live token numbers.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      className="h-8 text-xs font-mono bg-white"
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
                </div>

                <div className="bg-teal-50 rounded-xl p-3 flex items-center gap-2 text-xs text-teal-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  HIPAA Compliant · HL7 FHIR R4 Native · ABDM API-Ready · ISO 27001 Roadmap Q3 2026
                </div>
                <Button size="sm">Save Configuration</Button>
              </CardContent>
            </Card>
          )}

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
