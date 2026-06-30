import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  FlaskConical, Search, AlertTriangle, CheckCircle2,
  Clock, Loader2, RefreshCw, Printer, Calendar,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lab as labApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { todayInTz } from "@/lib/utils";
import { printLabReport } from "@/lib/print";
import { buildParameterTemplate } from "@/lib/labTestMaster";

// ── Types ─────────────────────────────────────────────────────────────────────
interface LabParam {
  testName: string;
  name: string;
  value: string;
  unit: string;
  referenceRange: string;
}

interface LabOrder {
  _id: string;
  labId: string;
  patientId: string;
  patientName: string;
  test: string;
  priority: "Routine" | "Urgent" | "STAT";
  status: "Pending" | "Collected" | "Processing" | "Completed";
  result?: string;
  parameters?: LabParam[];
  sampleDate?: string;
  doctor: string;
  reportedBy?: string;
  ordered: string;
  notes?: string;
}

// ── Colour maps ───────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  Completed:  "bg-green-100 text-green-700 border-green-200",
  Processing: "bg-blue-100 text-blue-700 border-blue-200",
  Collected:  "bg-teal-100 text-teal-700 border-teal-200",
  Pending:    "bg-amber-100 text-amber-700 border-amber-200",
};

const PRIORITY_COLORS: Record<string, string> = {
  STAT:    "bg-red-100 text-red-700 border-red-200",
  Urgent:  "bg-amber-100 text-amber-700 border-amber-200",
  Routine: "bg-gray-100 text-gray-600 border-gray-200",
};

const STATUS_TABS    = ["All", "Pending", "Processing", "Completed"] as const;
const PRIORITY_TABS  = ["All", "Routine", "Urgent", "STAT"] as const;

function fmtDate(raw?: string) {
  if (!raw) return "—";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function fmtDateOnly(raw?: string) {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Order card ────────────────────────────────────────────────────────────────
interface CardProps {
  order: LabOrder;
  onStatusChange: (id: string, payload: Record<string, any>) => Promise<void>;
  busy: string | null;
}

function OrderCard({ order, onStatusChange, busy }: CardProps) {
  const { user } = useAuth();
  const todayStr = todayInTz(user?.timezone ?? "Asia/Kolkata");

  // Build initial parameters: use saved ones or generate fresh template
  const initialParams = (): LabParam[] => {
    if (order.parameters && order.parameters.length > 0) return order.parameters;
    const tests = order.test.split(",").map((t) => t.trim());
    return buildParameterTemplate(tests).map((p) => ({ ...p, value: p.defaultValue })) as LabParam[];
  };

  const [params,       setParams]       = useState<LabParam[]>(initialParams);
  const [reportedBy,   setReportedBy]   = useState(order.reportedBy ?? "");
  const [sampleDate,   setSampleDate]   = useState(
    order.sampleDate ? order.sampleDate.slice(0, 10) : todayStr
  );
  const [resultText,   setResultText]   = useState(order.result ?? "");
  const [showResultBox, setShowResultBox] = useState(false);
  const [useStructured, setUseStructured] = useState(params.length > 0);

  useEffect(() => {
    if (order.status === "Processing") setShowResultBox(true);
    else setShowResultBox(false);
  }, [order.status]);

  const isBusy = busy === order._id;

  const updateParam = (testName: string, paramName: string, value: string) => {
    setParams((prev) =>
      prev.map((p) => p.testName === testName && p.name === paramName ? { ...p, value } : p)
    );
  };

  // Group params by testName for display
  const byTest: Record<string, LabParam[]> = {};
  for (const p of params) {
    const key = p.testName || order.test;
    if (!byTest[key]) byTest[key] = [];
    byTest[key].push(p);
  }

  const handleComplete = async () => {
    const payload: any = { status: "Completed", sampleDate, reportedBy };
    if (useStructured && params.length > 0) {
      payload.parameters = params;
      payload.result = params.map((p) => `${p.name}: ${p.value} ${p.unit}`).join(", ");
    } else {
      payload.result = resultText.trim();
    }
    await onStatusChange(order._id, payload);
  };

  const canComplete = useStructured
    ? params.some((p) => p.value.trim() !== "")
    : resultText.trim().length > 0;

  const borderClass =
    order.priority === "STAT" ? "border-red-200" :
    order.priority === "Urgent" ? "border-amber-200" :
    "border-border";

  return (
    <Card className={`transition-shadow hover:shadow-md ${borderClass}`}>
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
            order.priority === "STAT" ? "bg-red-50" :
            order.priority === "Urgent" ? "bg-amber-50" : "bg-teal-50"
          }`}>
            <FlaskConical className={`h-5 w-5 ${
              order.priority === "STAT" ? "text-red-600" :
              order.priority === "Urgent" ? "text-amber-600" : "text-teal-600"
            }`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-muted-foreground">
                #{order.labId || order._id.slice(-6).toUpperCase()}
              </span>
              <Badge variant="outline" className={`text-xs ${PRIORITY_COLORS[order.priority] ?? "bg-gray-100"}`}>
                {order.priority}
              </Badge>
              <Badge variant="outline" className={`text-xs ${STATUS_COLORS[order.status] ?? "bg-gray-100"}`}>
                {order.status}
              </Badge>
            </div>

            <p className="font-semibold text-sm mt-1 leading-snug">{order.patientName}</p>
            <p className="text-xs text-muted-foreground">{order.test}</p>

            <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-muted-foreground">
              <span>Dr. {order.doctor}</span>
              <span>{fmtDate(order.ordered)}</span>
              {order.sampleDate && (
                <span className="flex items-center gap-0.5">
                  <Calendar className="h-3 w-3" /> Sample: {fmtDateOnly(order.sampleDate)}
                </span>
              )}
            </div>

            {order.notes && (
              <p className="text-xs text-muted-foreground mt-1 italic truncate">
                Note: {order.notes}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="shrink-0 flex flex-col gap-1.5 items-end">
            {order.status === "Pending" && (
              <Button
                size="sm"
                className="h-7 text-xs bg-teal-600 hover:bg-teal-700"
                disabled={isBusy}
                onClick={() => onStatusChange(order._id, { status: "Collected" })}
              >
                {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Mark Collected"}
              </Button>
            )}

            {order.status === "Collected" && (
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={isBusy}
                onClick={() => onStatusChange(order._id, { status: "Processing" })}
              >
                {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Start Processing"}
              </Button>
            )}

            {order.status === "Completed" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
                onClick={() => printLabReport(order)}
              >
                <Printer className="h-3 w-3" /> Print
              </Button>
            )}
          </div>
        </div>

        {/* Completed — show result summary + print */}
        {order.status === "Completed" && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <p className="text-xs font-semibold text-green-700 mb-1">Result</p>
            {(order.parameters && order.parameters.length > 0) ? (
              Object.entries(
                order.parameters.reduce((acc: Record<string, LabParam[]>, p) => {
                  const k = p.testName || order.test;
                  if (!acc[k]) acc[k] = [];
                  acc[k].push(p);
                  return acc;
                }, {})
              ).map(([testName, ps]) => (
                <div key={testName} className="mb-2">
                  <p className="text-xs font-semibold text-green-800 mb-1">{testName}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                    {ps.map((p) => (
                      <div key={p.name} className="text-xs text-green-700 flex gap-1">
                        <span className="text-green-500">{p.name}:</span>
                        <span className="font-semibold">{p.value || "—"} {p.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-green-800 whitespace-pre-wrap">{order.result}</p>
            )}
          </div>
        )}

        {/* Processing — result entry panel */}
        {order.status === "Processing" && showResultBox && (
          <div className="space-y-3 pt-2 border-t border-border">
            {/* Sample Date + Reported By */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Sample / Collection Date</Label>
                <Input
                  type="date"
                  className="mt-1 h-8 text-sm"
                  value={sampleDate}
                  max={todayStr}
                  onChange={(e) => setSampleDate(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Reported By (Lab Tech)</Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  placeholder="Technician name"
                  value={reportedBy}
                  onChange={(e) => setReportedBy(e.target.value)}
                />
              </div>
            </div>

            {/* Toggle structured vs free-text */}
            {params.length > 0 && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setUseStructured(true)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    useStructured ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600"
                  }`}
                >
                  Parameter Table
                </button>
                <button
                  onClick={() => setUseStructured(false)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    !useStructured ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600"
                  }`}
                >
                  Free Text
                </button>
              </div>
            )}

            {/* Structured parameter entry */}
            {useStructured && params.length > 0 ? (
              <div className="space-y-3">
                {Object.entries(byTest).map(([testName, testParams]) => (
                  <div key={testName} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-teal-50 border-b border-teal-100 px-3 py-1.5 flex items-center gap-2">
                      <FlaskConical className="h-3.5 w-3.5 text-teal-600" />
                      <span className="text-xs font-semibold text-teal-700">{testName}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50">
                            <th className="text-left px-3 py-1.5 font-medium text-gray-600 w-[38%]">Parameter</th>
                            <th className="text-left px-3 py-1.5 font-medium text-gray-600 w-[22%]">Value *</th>
                            <th className="text-left px-3 py-1.5 font-medium text-gray-600 w-[14%]">Unit</th>
                            <th className="text-left px-3 py-1.5 font-medium text-gray-600">Reference Range</th>
                          </tr>
                        </thead>
                        <tbody>
                          {testParams.map((p) => (
                            <tr key={p.name} className="border-b border-gray-50 last:border-0">
                              <td className="px-3 py-1.5 text-gray-700 font-medium">{p.name}</td>
                              <td className="px-2 py-1">
                                <Input
                                  className="h-7 text-xs border-gray-300 focus:border-teal-400 w-full"
                                  value={p.value}
                                  placeholder="Enter value"
                                  onChange={(e) => updateParam(testName, p.name, e.target.value)}
                                />
                              </td>
                              <td className="px-3 py-1.5 text-gray-500">{p.unit}</td>
                              <td className="px-3 py-1.5 text-gray-400 italic">{p.referenceRange}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Enter result:</p>
                <Textarea
                  value={resultText}
                  onChange={(e) => setResultText(e.target.value)}
                  placeholder="Type lab result here (e.g. WBC 12.4 × 10³/µL, Hb 11.2 g/dL…)"
                  className="text-sm min-h-[72px] resize-none"
                  rows={3}
                />
              </div>
            )}

            <div className="flex justify-end">
              <Button
                size="sm"
                className="h-7 text-xs bg-green-600 hover:bg-green-700"
                disabled={isBusy || !canComplete}
                onClick={handleComplete}
              >
                {isBusy
                  ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Saving…</>
                  : "Save & Complete"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LabPage() {
  const qc = useQueryClient();
  const [search,          setSearch]          = useState("");
  const [statusFilter,    setStatusFilter]    = useState<string>("All");
  const [priorityFilter,  setPriorityFilter]  = useState<string>("All");
  const [busy,            setBusy]            = useState<string | null>(null);

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ["lab-orders", statusFilter],
    queryFn: () =>
      labApi.list(statusFilter !== "All" ? { status: statusFilter } : undefined),
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  const orders: LabOrder[] = data?.orders ?? [];

  const filtered = orders.filter((o) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      o.patientName?.toLowerCase().includes(q) ||
      o.labId?.toLowerCase().includes(q) ||
      o.test?.toLowerCase().includes(q);
    const matchPriority = priorityFilter === "All" || o.priority === priorityFilter;
    return matchSearch && matchPriority;
  });

  const totalCount      = orders.length;
  const pendingCount    = orders.filter((o) => o.status === "Pending").length;
  const processingCount = orders.filter((o) => o.status === "Processing").length;
  const completedCount  = orders.filter((o) => o.status === "Completed").length;

  const handleStatusChange = async (id: string, payload: Record<string, any>) => {
    setBusy(id);
    try {
      await labApi.update(id, payload);
      qc.invalidateQueries({ queryKey: ["lab-orders"] });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Lab Orders</h2>
          <p className="text-sm text-muted-foreground">
            {totalCount} orders · auto-refreshes every 20 s
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
          Failed to load lab orders. Check network or server.
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total",      value: totalCount,      color: "text-teal-600",  bg: "bg-teal-50",   icon: FlaskConical },
          { label: "Pending",    value: pendingCount,    color: "text-amber-600", bg: "bg-amber-50",  icon: Clock },
          { label: "Processing", value: processingCount, color: "text-blue-600",  bg: "bg-blue-50",   icon: Loader2 },
          { label: "Completed",  value: completedCount,  color: "text-green-600", bg: "bg-green-50",  icon: CheckCircle2 },
        ].map((s) => (
          <Card key={s.label} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center shrink-0`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by patient name, Lab ID, or test…"
              className="pl-9 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1.5 flex-wrap">
              {STATUS_TABS.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFilter === s ? "default" : "outline"}
                  className="h-8 text-xs"
                  onClick={() => setStatusFilter(s)}
                >
                  {s}
                </Button>
              ))}
            </div>

            <div className="w-px bg-border hidden sm:block" />

            <div className="flex gap-1.5 flex-wrap items-center">
              <span className="text-xs text-muted-foreground">Priority:</span>
              {PRIORITY_TABS.map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={priorityFilter === p ? "default" : "outline"}
                  className={`h-8 text-xs ${
                    priorityFilter !== p && p === "STAT" ? "border-red-200 text-red-600" :
                    priorityFilter !== p && p === "Urgent" ? "border-amber-200 text-amber-600" : ""
                  }`}
                  onClick={() => setPriorityFilter(p)}
                >
                  {p === "STAT" && <AlertTriangle className="h-3 w-3 mr-1" />}
                  {p}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Order list */}
      {isFetching && !orders.length ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading orders…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FlaskConical className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No orders match your filters</p>
          <p className="text-xs mt-1">Try adjusting the status or priority filter</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <OrderCard
              key={order._id}
              order={order}
              onStatusChange={handleStatusChange}
              busy={busy}
            />
          ))}
        </div>
      )}
    </div>
  );
}
