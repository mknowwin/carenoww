import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Users, CalendarDays, BedDouble, Activity, TrendingUp, AlertTriangle,
  Pill, FlaskConical, CreditCard, ArrowRight, Brain, Zap, Clock,
  CheckCircle2, XCircle, Info,
} from "lucide-react";
import { useLocation } from "wouter";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { dashboard as dashApi, appointments as apptApi, patients as patientsApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/utils";

const ALERT_ICONS = { critical: XCircle, warning: AlertTriangle, info: Info };
const ALERT_COLORS = {
  critical: "border-red-200 bg-red-50 text-red-700",
  warning:  "border-amber-200 bg-amber-50 text-amber-700",
  info:     "border-blue-200 bg-blue-50 text-blue-700",
};
const CHART_COLORS = ["#0d9488", "#0891b2", "#6366f1", "#f59e0b", "#ef4444", "#10b981"];

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const { data: metricsData } = useQuery({ queryKey: ["dashboard-metrics"], queryFn: dashApi.metrics, retry: false });
  const { data: revenueData }  = useQuery({ queryKey: ["dashboard-revenue"],  queryFn: dashApi.revenueTrend, retry: false });
  const { data: deptData }     = useQuery({ queryKey: ["dashboard-dept"],     queryFn: dashApi.deptVolume, retry: false });
  const { data: bedData }      = useQuery({ queryKey: ["dashboard-beds"],     queryFn: dashApi.bedOccupancy, retry: false });
  const { data: alertsData }   = useQuery({ queryKey: ["dashboard-alerts"],   queryFn: dashApi.aiAlerts, retry: false });
  const { data: apptData }     = useQuery({ queryKey: ["appointments"],        queryFn: () => apptApi.list({ date: new Date().toISOString().split("T")[0] }), retry: false });
  const { data: highRiskData } = useQuery({ queryKey: ["patients-highrisk"],   queryFn: () => patientsApi.list({ riskLevel: "Critical", limit: "10" }), retry: false });

  const m = metricsData ?? {
    totalPatients: 0, opdToday: 0, ipdCurrent: 0, icuCurrent: 0,
    appointmentsToday: 0, pendingClaims: 0, criticalAlerts: 0,
    bedOccupancyRate: 0, revenueToday: 0, revenueMonth: 0, surgeriesThisWeek: 0, avgLOS: 0,
  };
  const REVENUE_TREND = revenueData  ?? [];
  const DEPT_VOLUME   = deptData     ?? [];
  const BED_OCCUPANCY = bedData      ?? [];
  const AI_ALERTS     = alertsData   ?? [];
  const todayAppts       = (apptData?.appointments     ?? []).slice(0, 5);
  const criticalPatients = (highRiskData?.patients     ?? []).slice(0, 4);

  const stats = [
    { label: "OPD Today",       value: m.opdToday,             icon: Users,       change: "+12 vs yesterday",  color: "text-teal-600",   bg: "bg-teal-50",   suffix: "" },
    { label: "IPD Patients",    value: m.ipdCurrent,           icon: BedDouble,   change: "Active admissions", color: "text-blue-600",   bg: "bg-blue-50",   suffix: "" },
    { label: "ICU Occupancy",   value: `${m.icuCurrent}/20`,   icon: Activity,    change: "3 beds available",  color: "text-red-600",    bg: "bg-red-50",    suffix: "" },
    { label: "Bed Occupancy",   value: `${m.bedOccupancyRate}%`,icon: BedDouble,  change: "Across all wards",  color: "text-violet-600", bg: "bg-violet-50", suffix: "" },
    { label: "Today Revenue",   value: formatCurrency(m.revenueToday), icon: CreditCard, change: "Collected today", color: "text-emerald-600",bg: "bg-emerald-50",suffix: "" },
    { label: "Pending Claims",  value: m.pendingClaims,        icon: TrendingUp,  change: "Insurance claims",  color: "text-amber-600",  bg: "bg-amber-50",  suffix: "" },
    { label: "Appointments",    value: m.appointmentsToday,    icon: CalendarDays,change: "Scheduled today",   color: "text-cyan-600",   bg: "bg-cyan-50",   suffix: "" },
    { label: "Critical Alerts", value: m.criticalAlerts,       icon: AlertTriangle,change: "Require attention",color: "text-rose-600",   bg: "bg-rose-50",   suffix: "" },
  ];


  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Welcome banner */}
      <div className="rounded-2xl bg-gradient-to-r from-teal-600/90 to-cyan-600/90 p-5 text-white flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Good morning, {user?.name?.split(" ").slice(0,2).join(" ")} 👋</h2>
          <p className="text-sm opacity-90 mt-0.5">
            {user?.department} · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <div className="hidden sm:flex gap-3 text-xs">
          <div className="text-center bg-white/20 rounded-xl px-4 py-2">
            <div className="text-xl font-bold">{m.totalPatients.toLocaleString()}</div>
            <div className="opacity-90">Total Patients</div>
          </div>
          <div className="text-center bg-white/20 rounded-xl px-4 py-2">
            <div className="text-xl font-bold">{formatCurrency(m.revenueMonth)}</div>
            <div className="opacity-90">Month Revenue</div>
          </div>
          <div className="text-center bg-white/20 rounded-xl px-4 py-2">
            <div className="text-xl font-bold">{m.surgeriesThisWeek}</div>
            <div className="opacity-90">Surgeries/Week</div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center mb-2`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div className="text-xl font-bold text-foreground">{stat.value}</div>
              <div className="text-xs font-medium text-foreground mt-0.5 leading-tight">{stat.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.change}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AI Alerts */}
      {AI_ALERTS.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Brain className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">AI Clinical Alerts</span>
            <Badge className="bg-primary/10 text-primary text-xs">{AI_ALERTS.length} active</Badge>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {AI_ALERTS.map((alert: any) => {
              const Icon = ALERT_ICONS[alert.type as keyof typeof ALERT_ICONS];
              return (
                <div key={alert.id} className={`border rounded-xl p-3 flex items-start gap-3 ${ALERT_COLORS[alert.type as keyof typeof ALERT_COLORS]}`}>
                  <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{alert.module}</span>
                      {alert.patient && <span className="text-xs opacity-75 truncate">{alert.patient}</span>}
                    </div>
                    <p className="text-xs mt-0.5 leading-snug">{alert.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="h-3 w-3 opacity-60" />
                      <span className="text-xs opacity-60">{alert.time}</span>
                      <Button variant="ghost" size="sm" className="h-5 text-xs px-2 py-0 ml-auto">{alert.action}</Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Charts row */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Revenue Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Revenue Trend (Monthly)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={REVENUE_TREND} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorOpd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorIpd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0891b2" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#0891b2" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v/100000).toFixed(0)}L`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Area type="monotone" dataKey="ipd"      name="IPD"      stroke="#0891b2" fill="url(#colorIpd)" strokeWidth={2} />
                <Area type="monotone" dataKey="opd"      name="OPD"      stroke="#0d9488" fill="url(#colorOpd)" strokeWidth={2} />
                <Area type="monotone" dataKey="pharmacy" name="Pharmacy" stroke="#6366f1" fill="none"            strokeWidth={1.5} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Dept Volume */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Today's Dept. Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={DEPT_VOLUME} layout="vertical" margin={{ top: 0, right: 10, left: 50, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={60} />
                <Tooltip />
                <Bar dataKey="patients" name="Patients" radius={[0,4,4,0]}>
                  {DEPT_VOLUME.map((_: any, i: number) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bed occupancy + Appointments + High-risk patients */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Bed Occupancy */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Bed Occupancy</CardTitle>
              <Badge className="bg-teal-50 text-teal-700 text-xs">{m.bedOccupancyRate}% Full</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {BED_OCCUPANCY.map((ward: any) => {
              const pct = Math.round((ward.occupied / ward.total) * 100);
              const color = pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-teal-500";
              return (
                <div key={ward.ward}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium">{ward.ward}</span>
                    <span className="text-muted-foreground">{ward.occupied}/{ward.total} · {ward.available} free</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Today's Appointments */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Today's Appointments</CardTitle>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setLocation("/appointments")}>
                View all <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {todayAppts.map((apt: any) => {
              const statusColor: Record<string, string> = {
                "Confirmed":  "bg-green-100 text-green-700",
                "Waiting":    "bg-amber-100 text-amber-700",
                "In Consult": "bg-blue-100 text-blue-700",
                "Scheduled":  "bg-gray-100 text-gray-700",
              };
              return (
                <div key={apt.id} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0">
                  <div className="text-xs text-muted-foreground w-16 shrink-0">{apt.time}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{apt.patientName}</div>
                    <div className="text-xs text-muted-foreground truncate">{apt.doctor}</div>
                  </div>
                  <Badge className={`text-xs shrink-0 ${statusColor[apt.status] ?? "bg-gray-100 text-gray-700"}`}>
                    {apt.status}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* High-Risk / Critical Patients */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">High-Risk Patients</CardTitle>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setLocation("/patients")}>
                View all <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {criticalPatients.map((p: any) => {
              const riskColor: Record<string, string> = {
                Critical: "bg-red-100 text-red-700",
                High:     "bg-amber-100 text-amber-700",
                Medium:   "bg-yellow-100 text-yellow-700",
                Low:      "bg-green-100 text-green-700",
              };
              return (
                <div key={p.id} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                    {p.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.diagnosis}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge className={`text-xs ${riskColor[p.riskLevel]}`}>{p.riskLevel}</Badge>
                    <div className="text-xs text-muted-foreground mt-0.5">{p.status}</div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Quick Actions</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Register Patient",   path: "/patients",     icon: Users },
              { label: "Book Appointment",   path: "/appointments", icon: CalendarDays },
              { label: "New Prescription",   path: "/opd",          icon: Pill },
              { label: "Lab Order",          path: "/lab",          icon: FlaskConical },
              { label: "Generate Bill",      path: "/billing",      icon: CreditCard },
              { label: "View Analytics",     path: "/analytics",    icon: TrendingUp },
            ].map((action) => (
              <Button
                key={action.label}
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setLocation(action.path)}
              >
                <action.icon className="h-3.5 w-3.5" />
                {action.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
