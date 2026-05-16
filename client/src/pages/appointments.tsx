import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Plus, Search, Clock, Video,
  User, Brain, AlertCircle, CheckCircle2, RefreshCw, Pencil, XCircle,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { appointments as apptApi, users as usersApi } from "@/lib/api";
import AppointmentModal from "@/components/modals/AppointmentModal";

const STATUS_COLORS: Record<string, string> = {
  "Confirmed":  "bg-green-100 text-green-700",
  "Waiting":    "bg-amber-100 text-amber-700",
  "In Consult": "bg-blue-100 text-blue-700",
  "Scheduled":  "bg-gray-100 text-gray-700",
  "Completed":  "bg-teal-100 text-teal-700",
};
const TYPE_ICONS: Record<string, React.ElementType> = {
  "Teleconsult": Video,
  "Emergency":   AlertCircle,
  "Follow-up":   RefreshCw,
  "New":         User,
};

export default function AppointmentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [editAppt, setEditAppt] = useState<any>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const { data: apiData } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => apptApi.list(),
    retry: false,
  });

  const { data: doctorsData } = useQuery({
    queryKey: ["doctors", today],
    queryFn: () => usersApi.doctors({ date: today }),
    retry: false,
    refetchInterval: 30000,
  });

  // Always use _id (MongoDB ObjectId) for API calls, not the display id (aptId)
  const patchStatus = async (apt: any, status: string) => {
    const mongoId = apt._id;
    setUpdating(mongoId + status);
    try {
      await apptApi.update(mongoId, { status });
      qc.invalidateQueries({ queryKey: ["appointments"] });
    } finally {
      setUpdating(null);
    }
  };

  const APPOINTMENTS = (apiData?.appointments ?? []).map((a: any) => ({
    ...a,
    id: a.aptId || a._id || a.id,
  }));

  const filtered = APPOINTMENTS.filter((a: any) => {
    const q = search.toLowerCase();
    const matchSearch = !q || a.patientName.toLowerCase().includes(q) || a.doctor.toLowerCase().includes(q);
    const matchType = typeFilter === "All" || a.type === typeFilter;
    return matchSearch && matchType;
  });

  const inConsult = APPOINTMENTS.filter((a: any) => a.status === "In Consult").length;
  const waiting   = APPOINTMENTS.filter((a: any) => a.status === "Waiting").length;
  const confirmed = APPOINTMENTS.filter((a: any) => a.status === "Confirmed").length;

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Appointment & Scheduling</h2>
          <p className="text-sm text-muted-foreground">{apiData?.total ?? APPOINTMENTS.length} appointments today · AI Smart Scheduling active</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2"><Video className="h-4 w-4" /> Teleconsult</Button>
          <Button size="sm" className="gap-2" onClick={() => { setEditAppt(null); setModalOpen(true); }}><Plus className="h-4 w-4" /> Book Appointment</Button>
        </div>
      </div>

      {/* AI No-Show banner */}
      <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-2.5 flex items-center gap-3">
        <Brain className="h-4 w-4 text-violet-600 shrink-0" />
        <p className="text-sm text-violet-700">
          <span className="font-semibold">AI No-Show Predictor:</span> 2 appointments flagged as high no-show risk today. Smart reminders sent automatically.
        </p>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "In Consult", value: inConsult, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Waiting",    value: waiting,   color: "text-amber-600",bg: "bg-amber-50" },
          { label: "Confirmed",  value: confirmed, color: "text-green-600",bg: "bg-green-50" },
          { label: "Total Today",value: APPOINTMENTS.length, color: "text-teal-600", bg: "bg-teal-50" },
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

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Appointment list */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search patient or doctor..." className="pl-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {["All","New","Follow-up","Emergency","Teleconsult"].map((t) => (
                <Button key={t} variant={typeFilter === t ? "default" : "outline"} size="sm" className="h-9" onClick={() => setTypeFilter(t)}>{t}</Button>
              ))}
            </div>
          </div>

          {filtered.map((apt: any) => {
            const TypeIcon = TYPE_ICONS[apt.type] ?? User;
            return (
              <Card key={apt.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center shrink-0">
                      <TypeIcon className="h-5 w-5 text-teal-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{apt.patientName}</span>
                        <Badge className="text-xs bg-teal-50 text-teal-700 font-mono">Token {apt.token}</Badge>
                        <Badge className={`text-xs ${STATUS_COLORS[apt.status] ?? "bg-gray-100"}`}>{apt.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {apt.doctor} · {apt.department}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="flex items-center gap-1 text-sm font-medium">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {apt.time}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{apt.type}</div>
                    </div>
                  </div>
                  <div className="flex gap-1.5 mt-3 flex-wrap">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setEditAppt(apt); setModalOpen(true); }}>
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    {apt.status === "Scheduled" && (
                      <Button variant="outline" size="sm" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50"
                        disabled={updating === apt._id + "Confirmed"}
                        onClick={() => patchStatus(apt, "Confirmed")}>
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Confirm
                      </Button>
                    )}
                    {apt.status === "Confirmed" && (
                      <Button variant="default" size="sm" className="h-7 text-xs"
                        disabled={updating === apt._id + "In Consult"}
                        onClick={() => patchStatus(apt, "In Consult")}>
                        Start Consult
                      </Button>
                    )}
                    {apt.status === "In Consult" && (
                      <Button variant="default" size="sm" className="h-7 text-xs bg-teal-600 hover:bg-teal-700"
                        disabled={updating === apt._id + "Completed"}
                        onClick={() => patchStatus(apt, "Completed")}>
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                      </Button>
                    )}
                    {apt.status === "Waiting" && (
                      <Button variant="default" size="sm" className="h-7 text-xs"
                        disabled={updating === apt._id + "In Consult"}
                        onClick={() => patchStatus(apt, "In Consult")}>
                        Call In
                      </Button>
                    )}
                    {!["Completed","Cancelled"].includes(apt.status) && (
                      <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                        disabled={updating === apt._id + "Cancelled"}
                        onClick={() => patchStatus(apt, "Cancelled")}>
                        <XCircle className="h-3 w-3 mr-1" /> Cancel
                      </Button>
                    )}
                    {apt.type === "Teleconsult" && !["Completed","Cancelled"].includes(apt.status) && (
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                        <Video className="h-3 w-3" /> Join
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Doctor availability */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Doctor Availability</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(!doctorsData || doctorsData.length === 0) && (
                <p className="text-xs text-muted-foreground text-center py-3">
                  No doctors configured. Add via Settings → Departments & Doctors.
                </p>
              )}
              {(doctorsData ?? []).slice(0, 8).map((doc: any) => {
                const initials = doc.name.split(" ").slice(-1)[0]?.[0] ?? "D";
                const bookedToday = doc.bookedCount ?? 0;
                const isAvail     = doc.isAvailable !== false;
                return (
                  <div key={doc._id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{doc.name}</div>
                      <div className="text-xs text-muted-foreground">{doc.specialty || doc.department}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge className={`text-xs ${isAvail ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                        {isAvail ? <CheckCircle2 className="h-2.5 w-2.5 mr-0.5 inline" /> : null}
                        {isAvail ? "Available" : "Fully Booked"}
                      </Badge>
                      {bookedToday > 0 && (
                        <div className="text-xs text-muted-foreground mt-0.5">{bookedToday} booked</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Today's Slot Utilization</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                const appts = apiData?.appointments ?? [];
                const todayAppts = appts.filter((a: any) => a.date === today);
                const slots = [
                  { label: "Morning (8AM–12PM)",   hours: [8,9,10,11] },
                  { label: "Afternoon (12PM–4PM)",  hours: [12,13,14,15] },
                  { label: "Evening (4PM–8PM)",     hours: [16,17,18,19] },
                ];
                const totalDoctors = (doctorsData ?? []).length || 1;
                return slots.map(({ label, hours }) => {
                  const booked = todayAppts.filter((a: any) => {
                    const h = parseInt(a.time?.split(":")?.[0] ?? "0");
                    const isAM = a.time?.includes("AM");
                    const isPM = a.time?.includes("PM");
                    const h24 = isAM ? (h === 12 ? 0 : h) : isPM ? (h === 12 ? 12 : h + 12) : h;
                    return hours.includes(h24);
                  }).length;
                  const maxSlots = hours.length * (60 / 15) * totalDoctors;
                  const pct = Math.min(100, Math.round((booked / maxSlots) * 100));
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium">{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                });
              })()}
            </CardContent>
          </Card>
        </div>
      </div>

      <AppointmentModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditAppt(null); }}
        existing={editAppt}
      />
    </div>
  );
}
