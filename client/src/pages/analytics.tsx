import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BarChart3, Brain, TrendingUp, TrendingDown, Users, BedDouble,
  CreditCard, Activity, Search, Download,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { dashboard as dashApi } from "@/lib/api";
import { REVENUE_TREND as REV_FB, DEPT_VOLUME as DEPT_FB, BED_OCCUPANCY as BED_FB, HOSPITAL_METRICS as METRICS_FB } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

const PATIENT_TREND = [
  { month: "Nov", opd: 1820, ipd: 142, icu: 18 },
  { month: "Dec", opd: 1640, ipd: 158, icu: 22 },
  { month: "Jan", opd: 2100, ipd: 171, icu: 19 },
  { month: "Feb", opd: 1980, ipd: 162, icu: 17 },
  { month: "Mar", opd: 2340, ipd: 178, icu: 21 },
  { month: "Apr", opd: 2180, ipd: 168, icu: 20 },
  { month: "May", opd: 870,  ipd: 148, icu: 17 },
];

const ALOS_DATA = [
  { dept: "Cardiology", alos: 5.2 },
  { dept: "Ortho",      alos: 7.8 },
  { dept: "OBG",        alos: 3.1 },
  { dept: "Neuro",      alos: 6.4 },
  { dept: "ICU",        alos: 8.2 },
  { dept: "General",    alos: 3.9 },
];

const COLORS = ["#0d9488","#0891b2","#6366f1","#f59e0b","#ef4444","#10b981"];

export default function AnalyticsPage() {
  const { data: metricsData }  = useQuery({ queryKey: ["dash-metrics"],  queryFn: dashApi.metrics, retry: false });
  const { data: revenueData }  = useQuery({ queryKey: ["dash-revenue"],  queryFn: dashApi.revenueTrend, retry: false });
  const { data: deptData }     = useQuery({ queryKey: ["dash-dept"],     queryFn: dashApi.deptVolume, retry: false });
  const { data: bedsData }     = useQuery({ queryKey: ["dash-beds"],     queryFn: dashApi.bedOccupancy, retry: false });

  const HOSPITAL_METRICS = metricsData || METRICS_FB;
  const REVENUE_TREND    = revenueData || REV_FB;
  const DEPT_VOLUME      = deptData    || DEPT_FB;
  const BED_OCCUPANCY    = bedsData    || BED_FB;

  const [nlQuery, setNlQuery] = useState("");
  const [nlResult, setNlResult] = useState<string | null>(null);

  const handleNLQ = (e: React.FormEvent) => {
    e.preventDefault();
    const q = nlQuery.toLowerCase();
    if (q.includes("bed") || q.includes("occupancy")) {
      setNlResult(`Bed Occupancy Rate this month: 76% overall. ICU is at 85% (17/20 beds). General ward is 85% (68/80). Highest occupancy: ICU and General wards.`);
    } else if (q.includes("revenue") || q.includes("income")) {
      setNlResult(`Monthly revenue: ${formatCurrency(HOSPITAL_METRICS.revenueMonth)}. IPD contributes ~75%, OPD ~12%, Pharmacy ~13%. May revenue (partial): ${formatCurrency(2464000)}.`);
    } else if (q.includes("opd") || q.includes("patient")) {
      setNlResult(`OPD footfall today: 87 patients. This month (partial): 870. Monthly trend shows peak in March (2,340 patients). Cardiology and Orthopedics are highest volume departments.`);
    } else {
      setNlResult(`AI Analysis: Based on your query about "${nlQuery}" — current hospital metrics show BOR 76%, ALOS 4.2 days, OPD 87 today. For detailed department breakdowns, try asking about a specific metric.`);
    }
  };

  const kpiCards = [
    { label: "Bed Occupancy Rate", value: `${HOSPITAL_METRICS.bedOccupancyRate}%`, change: "+2% vs last month", up: true,  icon: BedDouble,   color: "text-teal-600",  bg: "bg-teal-50" },
    { label: "Avg Length of Stay", value: `${HOSPITAL_METRICS.avgLOS} days`,        change: "-0.3 vs target",   up: false, icon: Activity,    color: "text-blue-600",  bg: "bg-blue-50" },
    { label: "OPD Footfall",       value: HOSPITAL_METRICS.opdToday.toString(),     change: "+12 vs yesterday", up: true,  icon: Users,       color: "text-violet-600",bg: "bg-violet-50" },
    { label: "Month Revenue",      value: formatCurrency(HOSPITAL_METRICS.revenueMonth), change: "+8% vs last month", up: true, icon: CreditCard, color: "text-emerald-600", bg: "bg-emerald-50" },
  ];

  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Clinical & Business Analytics</h2>
          <p className="text-sm text-muted-foreground">AI-powered insights · NLQ engine active</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" /> Export Report
        </Button>
      </div>

      {/* NLQ Engine */}
      <Card className="bg-gradient-to-r from-teal-50 to-cyan-50 border-teal-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="h-4 w-4 text-teal-600" />
            <span className="text-sm font-semibold text-teal-700">AI Natural Language Query</span>
            <Badge className="bg-teal-100 text-teal-700 text-xs">Ask anything about your hospital</Badge>
          </div>
          <form onSubmit={handleNLQ} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder='Try: "What was bed occupancy last month?" or "Show revenue by department"'
                className="pl-9 h-10 bg-white"
                value={nlQuery}
                onChange={(e) => setNlQuery(e.target.value)}
              />
            </div>
            <Button type="submit" className="h-10">Ask AI</Button>
          </form>
          {nlResult && (
            <div className="mt-3 p-3 bg-white rounded-xl border border-teal-200 text-sm text-foreground">
              <div className="flex items-center gap-1.5 mb-1.5 text-teal-700 font-medium text-xs">
                <Brain className="h-3.5 w-3.5" /> AI Response
              </div>
              {nlResult}
            </div>
          )}
          {!nlResult && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {["ICU bed occupancy?", "Revenue this month?", "OPD patient trend?"].map((q) => (
                <button key={q} onClick={() => setNlQuery(q)} className="text-xs bg-white border border-teal-200 rounded-full px-3 py-1 text-teal-700 hover:bg-teal-50 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpiCards.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className={`w-8 h-8 rounded-lg ${k.bg} flex items-center justify-center mb-2`}>
                <k.icon className={`h-4 w-4 ${k.color}`} />
              </div>
              <div className="text-xl font-bold">{k.value}</div>
              <div className="text-xs font-medium mt-0.5">{k.label}</div>
              <div className={`text-xs flex items-center gap-0.5 mt-1 ${k.up ? "text-green-600" : "text-amber-600"}`}>
                {k.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {k.change}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Patient Volume Trend (Monthly)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={PATIENT_TREND} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="opd" name="OPD"  stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="ipd" name="IPD"  stroke="#0891b2" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="icu" name="ICU"  stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2" dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Revenue by Stream (Monthly)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={REVENUE_TREND} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="aIPD" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0891b2" stopOpacity={0.3}/><stop offset="95%" stopColor="#0891b2" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="aOPD" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3}/><stop offset="95%" stopColor="#0d9488" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v/100000).toFixed(0)}L`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Area type="monotone" dataKey="ipd"      name="IPD"      stroke="#0891b2" fill="url(#aIPD)" strokeWidth={2} />
                <Area type="monotone" dataKey="opd"      name="OPD"      stroke="#0d9488" fill="url(#aOPD)" strokeWidth={2} />
                <Area type="monotone" dataKey="pharmacy" name="Pharmacy" stroke="#6366f1" fill="none" strokeWidth={1.5} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Avg Length of Stay by Dept</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={ALOS_DATA} layout="vertical" margin={{ top: 0, right: 10, left: 50, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} unit=" d" />
                <YAxis type="category" dataKey="dept" tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => `${v} days`} />
                <Bar dataKey="alos" name="ALOS" radius={[0,4,4,0]}>
                  {ALOS_DATA.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Bed Occupancy by Ward</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={BED_OCCUPANCY}
                  dataKey="occupied"
                  nameKey="ward"
                  cx="50%" cy="50%"
                  innerRadius={55} outerRadius={80}
                  paddingAngle={2}
                >
                  {BED_OCCUPANCY.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number, n: string) => [v, n]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-1.5 justify-center mt-1">
              {BED_OCCUPANCY.map((w: any, i: number) => (
                <div key={w.ward} className="flex items-center gap-1 text-xs">
                  <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-muted-foreground">{w.ward}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">AI Insight Narrative</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="bg-teal-50 rounded-xl p-2.5 border border-teal-100">
              <div className="font-semibold text-teal-700 mb-1">Today's Summary</div>
              <p className="text-muted-foreground leading-snug">
                Hospital operating at 76% capacity. OPD up 12% from yesterday. ICU at 85% — consider opening overflow protocol if 2+ more critical admissions occur.
              </p>
            </div>
            <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-100">
              <div className="font-semibold text-amber-700 mb-1">Revenue Trend</div>
              <p className="text-muted-foreground leading-snug">
                May revenue pacing 8% above April at same date. IPD revenue strong (+11%). Claims denial rate at 18.2% — above 15% target. AI flagged 3 correctable claims.
              </p>
            </div>
            <div className="bg-blue-50 rounded-xl p-2.5 border border-blue-100">
              <div className="font-semibold text-blue-700 mb-1">Population Health</div>
              <p className="text-muted-foreground leading-snug">
                12 diabetic patients with HbA1c &gt; 9% identified for outreach. 5 post-MI patients missing statin therapy — care gap detected.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
