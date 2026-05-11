import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FlaskConical, Search, Plus, AlertTriangle, CheckCircle2,
  Clock, Brain, Barcode, FileText, Microscope, Pencil,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lab as labApi } from "@/lib/api";
import { LAB_ORDERS as ORDERS_FALLBACK } from "@/lib/mock-data";
import LabOrderModal from "@/components/modals/LabOrderModal";

const STATUS_COLORS: Record<string, string> = {
  Completed:  "bg-green-100 text-green-700",
  Processing: "bg-blue-100 text-blue-700",
  Collected:  "bg-teal-100 text-teal-700",
  Pending:    "bg-amber-100 text-amber-700",
  Scheduled:  "bg-gray-100 text-gray-700",
};
const PRIORITY_COLORS: Record<string, string> = {
  STAT:    "bg-red-100 text-red-700",
  Routine: "bg-gray-100 text-gray-600",
  Urgent:  "bg-amber-100 text-amber-700",
};

export default function LabPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<any>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const patchStatus = async (order: any, status: string) => {
    const mongoId = order._id;
    setUpdating(mongoId + status);
    try {
      await labApi.update(mongoId, { status });
      qc.invalidateQueries({ queryKey: ["lab-orders"] });
    } finally {
      setUpdating(null);
    }
  };

  const { data: apiData } = useQuery({ queryKey: ["lab-orders"], queryFn: () => labApi.list(), retry: false });
  const LAB_ORDERS: any[] = (apiData?.orders ?? ORDERS_FALLBACK).map((o: any) => ({
    ...o, id: o.labId || o._id || o.id,
  }));

  const filtered = LAB_ORDERS.filter((o) => {
    const q = search.toLowerCase();
    const matchSearch = !q || o.patientName.toLowerCase().includes(q) || o.test.toLowerCase().includes(q);
    const matchPriority = priorityFilter === "All" || o.priority === priorityFilter;
    const matchStatus = statusFilter === "All" || o.status === statusFilter;
    return matchSearch && matchPriority && matchStatus;
  });

  const statCount = LAB_ORDERS.filter((o) => o.priority === "STAT").length;
  const pendingCount = LAB_ORDERS.filter((o) => o.status !== "Completed").length;
  const completedCount = LAB_ORDERS.filter((o) => o.status === "Completed").length;

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Laboratory Information System</h2>
          <p className="text-sm text-muted-foreground">{LAB_ORDERS.length} orders today · AI anomaly detection active</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2"><Barcode className="h-4 w-4" /> Scan Sample</Button>
          <Button size="sm" className="gap-2" onClick={() => { setEditOrder(null); setModalOpen(true); }}><Plus className="h-4 w-4" /> New Order</Button>
        </div>
      </div>

      {/* AI Alert */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center gap-3">
        <Brain className="h-4 w-4 text-blue-600 shrink-0" />
        <p className="text-sm text-blue-700">
          <span className="font-semibold">AI Result Anomaly:</span> Suresh Kumar — Combined CBC + Metabolic panel shows early sepsis pattern (elevated WBC 18.4, CRP 142, lactate trend). Alert sent to Dr. Rajesh Mohan.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "STAT Orders",    value: statCount,      color: "text-red-600",   bg: "bg-red-50",    icon: AlertTriangle },
          { label: "Pending",        value: pendingCount,   color: "text-amber-600", bg: "bg-amber-50",  icon: Clock },
          { label: "Completed",      value: completedCount, color: "text-green-600", bg: "bg-green-50",  icon: CheckCircle2 },
          { label: "Total Today",    value: LAB_ORDERS.length, color: "text-teal-600", bg: "bg-teal-50", icon: FlaskConical },
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

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Lab orders list */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patient or test..."
                className="pl-9 h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1.5">
              {["All","STAT","Routine"].map((p) => (
                <Button key={p} variant={priorityFilter === p ? "default" : "outline"} size="sm" className="h-9" onClick={() => setPriorityFilter(p)}>{p}</Button>
              ))}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {["All","Pending","Collected","Processing","Completed"].map((s) => (
                <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" className="h-9" onClick={() => setStatusFilter(s)}>{s}</Button>
              ))}
            </div>
          </div>

          {filtered.map((order) => (
            <Card key={order.id} className={order.priority === "STAT" ? "border-red-200" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    order.priority === "STAT" ? "bg-red-50" : "bg-teal-50"
                  }`}>
                    <FlaskConical className={`h-5 w-5 ${order.priority === "STAT" ? "text-red-600" : "text-teal-600"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{order.test}</span>
                      <Badge className={`text-xs ${PRIORITY_COLORS[order.priority] ?? "bg-gray-100"}`}>{order.priority}</Badge>
                      <Badge className={`text-xs ${STATUS_COLORS[order.status] ?? "bg-gray-100"}`}>{order.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {order.patientName} · {order.doctor}
                    </div>
                    <div className="text-xs text-muted-foreground">{order.ordered}</div>
                    {order.result && (
                      <div className={`text-xs mt-1 font-medium ${order.result.includes("High") || order.result.includes("Low") ? "text-amber-600" : "text-teal-600"}`}>
                        Result: {order.result}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditOrder(order); setModalOpen(true); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    {order.status === "Pending" && (
                      <Button size="sm" className="h-7 text-xs bg-teal-600 hover:bg-teal-700"
                        disabled={updating === order._id + "Collected"}
                        onClick={() => patchStatus(order, "Collected")}>
                        Collect
                      </Button>
                    )}
                    {order.status === "Collected" && (
                      <Button size="sm" className="h-7 text-xs"
                        disabled={updating === order._id + "Processing"}
                        onClick={() => patchStatus(order, "Processing")}>
                        Process
                      </Button>
                    )}
                    {order.status === "Processing" && (
                      <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700"
                        onClick={() => { setEditOrder({ ...order, status: "Completed" }); setModalOpen(true); }}>
                        Enter Result
                      </Button>
                    )}
                    {order.status === "Completed" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                        <FileText className="h-3 w-3" /> Report
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Right panel */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">AI Pathology Assist</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
                <div className="font-semibold text-teal-700 mb-1">Deep Learning Analysis</div>
                <p className="text-muted-foreground leading-snug">CBC pattern recognition flagged borderline thrombocytopenia in 2 patients. Peripheral smear review recommended.</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <div className="font-semibold text-amber-700 mb-1">Trend Alert</div>
                <p className="text-muted-foreground leading-snug">Suresh Kumar: Creatinine trending up (0.9 → 1.4 → 2.1 mg/dL over 3 visits) — Progressive renal decline.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Instrument Interface</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {[
                { name: "Sysmex XN-1000", type: "Haematology", status: "Online", queue: 3 },
                { name: "Roche cobas 501", type: "Biochemistry", status: "Online", queue: 5 },
                { name: "Vitros 5600",    type: "Immunoassay", status: "Maintenance", queue: 0 },
              ].map((inst) => (
                <div key={inst.name} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
                  <Microscope className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{inst.name}</div>
                    <div className="text-muted-foreground">{inst.type}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge className={`text-xs ${inst.status === "Online" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                      {inst.status}
                    </Badge>
                    {inst.queue > 0 && <div className="text-muted-foreground mt-0.5">{inst.queue} queued</div>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Lab Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs">
              {[
                ["Avg TAT (Routine)", "2.4 hrs"],
                ["Avg TAT (STAT)",    "45 min"],
                ["Critical Values Alerted", "2 today"],
                ["QC Pass Rate",      "98.7%"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1 border-b border-border last:border-0">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <LabOrderModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditOrder(null); }}
        existing={editOrder}
      />
    </div>
  );
}
