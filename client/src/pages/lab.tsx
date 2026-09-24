import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FlaskConical, Search, AlertTriangle, CheckCircle2,
  Clock, Loader2, RefreshCw, Printer, Calendar, Pencil,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lab as labApi } from "@/lib/api";
import { printLabReport } from "@/lib/print";
import { LabResultEditor, type LabParam } from "@/components/lab-result-editor";
import { toast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────
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
  const [editing, setEditing] = useState(false);
  const isBusy = busy === order._id;

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
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-gray-300 text-gray-600 hover:bg-gray-50"
                  onClick={() => setEditing((v) => !v)}
                >
                  <Pencil className="h-3 w-3" /> {editing ? "Cancel" : "Edit"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
                  onClick={() => printLabReport(order)}
                >
                  <Printer className="h-3 w-3" /> Print
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Completed — show result summary + print, or the editor when correcting it */}
        {order.status === "Completed" && !editing && (
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

        {order.status === "Completed" && editing && (
          <div className="pt-2 border-t border-border">
            <LabResultEditor
              order={order}
              saving={isBusy}
              onSave={async (payload) => { await onStatusChange(order._id, payload); setEditing(false); }}
            />
          </div>
        )}

        {/* Processing — result entry panel */}
        {order.status === "Processing" && (
          <div className="pt-2 border-t border-border">
            <LabResultEditor
              order={order}
              saving={isBusy}
              onSave={(payload) => onStatusChange(order._id, payload)}
            />
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
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update failed", description: err.message || "Failed to update lab order." });
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
