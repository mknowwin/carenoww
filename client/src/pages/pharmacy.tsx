import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DRUG_UNITS } from "@/lib/constants";
import {
  Pill, Search, Plus, AlertTriangle, CheckCircle2,
  Clock, Package, RefreshCw, FileText, History, ShoppingCart, Wrench,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pharmacy as pharmacyApi } from "@/lib/api";
import GRNModal from "@/components/modals/GRNModal";
import StockAdjustmentModal from "@/components/modals/StockAdjustmentModal";
import DispenseCounterModal from "@/components/modals/DispenseCounterModal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PharmacyOrder {
  _id: string;
  rxId: string;
  patientId: string;
  patientName: string;
  drug: string;
  qty: number;
  unit: string;
  status: "Pending" | "Verified" | "Dispensed";
  type: "OPD" | "IPD" | "ICU";
  rxSource?: "Digital" | "Paper" | "OTC";
  paperRxNote?: string;
  doctor: string;
  time: string;
  dispensedBy?: string;
  dispensedAt?: string;
}

interface DrugInventory {
  _id: string;
  name: string;
  category: string;
  stock: number;
  unit: string;
  reorderLevel: number;
  status: "OK" | "Low" | "Critical";
  mrpPerUnit?: number;
  isBatchTracked?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ORDER_STATUS_COLORS: Record<string, string> = {
  Dispensed: "bg-green-100 text-green-700",
  Pending:   "bg-amber-100 text-amber-700",
  Verified:  "bg-blue-100 text-blue-700",
};

const INVENTORY_STATUS_COLORS: Record<string, string> = {
  OK:       "bg-green-100 text-green-700",
  Low:      "bg-amber-100 text-amber-700",
  Critical: "bg-red-100 text-red-700",
};

const TYPE_COLORS: Record<string, string> = {
  OPD: "bg-teal-100 text-teal-700",
  IPD: "bg-purple-100 text-purple-700",
  ICU: "bg-red-100 text-red-700",
};

const RX_SOURCE_COLORS: Record<string, string> = {
  Digital: "bg-blue-50 text-blue-700",
  Paper:   "bg-orange-50 text-orange-700",
  OTC:     "bg-gray-100 text-gray-700",
};

// ── Inline Add-Drug Form ──────────────────────────────────────────────────────

function AddDrugForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", category: "", stock: "", unit: "Tab", reorderLevel: "", mrpPerUnit: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.unit.trim()) { setError("Name and unit are required."); return; }
    const stock        = parseInt(form.stock, 10)        || 0;
    const reorderLevel = parseInt(form.reorderLevel, 10) || 0;
    const mrpPerUnit   = parseFloat(form.mrpPerUnit)     || 0;
    const status = stock === 0 ? "Critical" : stock <= reorderLevel ? "Low" : "OK";
    setBusy(true); setError("");
    try {
      await pharmacyApi.inventory.create({ name: form.name.trim(), category: form.category.trim(), stock, unit: form.unit, reorderLevel, mrpPerUnit, status });
      qc.invalidateQueries({ queryKey: ["pharmacy-inventory"] });
      onDone();
    } catch (err: any) {
      setError(err.message || "Failed to create drug.");
    } finally { setBusy(false); }
  };

  return (
    <Card className="border-dashed border-2 border-primary/30">
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="font-semibold text-sm mb-2">New Drug / Item</div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Drug Name *",    k: "name",         placeholder: "e.g. Metformin 500mg" },
              { label: "Category",       k: "category",     placeholder: "e.g. Diabetes" },
              { label: "Initial Stock",  k: "stock",        placeholder: "0", type: "number" },
              { label: "Reorder Level",  k: "reorderLevel", placeholder: "0", type: "number" },
              { label: "Default MRP/Unit ₹ (fallback)", k: "mrpPerUnit", placeholder: "0.00", type: "number" },
            ].map(({ label, k, placeholder, type }) => (
              <div key={k} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input className="h-8 text-sm" type={type} min={0} placeholder={placeholder} value={form[k as keyof typeof form]} onChange={set(k as keyof typeof form)} />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs">Unit *</Label>
              <Select value={form.unit} onValueChange={(v) => setForm((p) => ({ ...p, unit: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{DRUG_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" className="h-8 text-xs" disabled={busy}>
              {busy ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}
              {busy ? "Saving…" : "Add Drug"}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={onDone}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PharmacyPage() {
  const qc = useQueryClient();

  // Orders tab
  const [orderSearch, setOrderSearch]   = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Pending" | "Verified" | "Dispensed">("All");
  const [updating, setUpdating]         = useState<string | null>(null);

  // Inventory tab
  const [invSearch, setInvSearch]   = useState("");
  const [showAddDrug, setShowAddDrug] = useState(false);
  const [adjustDrug, setAdjustDrug] = useState<DrugInventory | null>(null);

  // GRN tab
  const [grnSearch, setGrnSearch] = useState("");

  // Stock movements tab
  const [movSearch, setMovSearch] = useState("");

  // Modals
  const [showGRN, setShowGRN]         = useState(false);
  const [showCounter, setShowCounter] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ["pharmacy-orders"],
    queryFn: () => pharmacyApi.orders.list(),
    retry: false,
    refetchInterval: 20_000,
  });

  const { data: inventoryData, isLoading: invLoading } = useQuery({
    queryKey: ["pharmacy-inventory"],
    queryFn: () => pharmacyApi.inventory.list(),
    retry: false,
  });

  const { data: grnData, isLoading: grnLoading } = useQuery({
    queryKey: ["pharmacy-grn"],
    queryFn: () => pharmacyApi.grn.list(),
    retry: false,
  });

  const { data: adjData, isLoading: adjLoading } = useQuery({
    queryKey: ["pharmacy-adjustments"],
    queryFn: () => pharmacyApi.adjustments.list(),
    retry: false,
  });

  const orders: PharmacyOrder[]   = ordersData?.orders  ?? [];
  const inventory: DrugInventory[] = inventoryData       ?? [];
  const grns: any[]               = grnData?.grns        ?? [];
  const adjustments: any[]        = adjData?.adjustments ?? [];

  // ── Derived stats ──────────────────────────────────────────────────────────

  const pendingCount   = orders.filter((o) => o.status === "Pending").length;
  const verifiedCount  = orders.filter((o) => o.status === "Verified").length;
  const dispensedCount = orders.filter((o) => o.status === "Dispensed").length;
  const criticalCount  = inventory.filter((d) => d.status === "Critical").length;
  const lowCount       = inventory.filter((d) => d.status === "Low").length;

  // ── Filtered lists ─────────────────────────────────────────────────────────

  const filteredOrders = orders.filter((o) => {
    const q = orderSearch.toLowerCase();
    const matchSearch = !q || o.patientName.toLowerCase().includes(q) || o.rxId.toLowerCase().includes(q) || o.drug.toLowerCase().includes(q);
    return matchSearch && (statusFilter === "All" || o.status === statusFilter);
  });

  const filteredInventory = inventory.filter((d) => {
    const q = invSearch.toLowerCase();
    return !q || d.name.toLowerCase().includes(q) || (d.category || "").toLowerCase().includes(q);
  });

  const filteredGrns = grns.filter((g) => {
    const q = grnSearch.toLowerCase();
    return !q || g.grnId?.toLowerCase().includes(q) || g.supplierName?.toLowerCase().includes(q);
  });

  const filteredAdj = adjustments.filter((a) => {
    const q = movSearch.toLowerCase();
    return !q || a.drugName?.toLowerCase().includes(q) || a.adjustmentType?.toLowerCase().includes(q);
  });

  // ── Actions ────────────────────────────────────────────────────────────────

  const patchOrder = async (order: PharmacyOrder, status: string) => {
    const key = order._id + status;
    setUpdating(key);
    try {
      await pharmacyApi.orders.update(order._id, { status });
      qc.invalidateQueries({ queryKey: ["pharmacy-orders"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-inventory"] });
    } finally { setUpdating(null); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Pharmacy Management</h2>
          <p className="text-sm text-muted-foreground">
            Prescription dispensing &amp; inventory · {inventory.length} drugs tracked
          </p>
        </div>
        <Button className="h-9 gap-1.5 shrink-0" onClick={() => setShowCounter(true)}>
          <ShoppingCart className="h-4 w-4" /> Dispense at Counter
        </Button>
      </div>

      {/* Alert banners */}
      {criticalCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700 flex-1">
            <span className="font-semibold">Stock-Out Alert:</span> {criticalCount} drug{criticalCount > 1 ? "s" : ""} at critical level.
          </p>
        </div>
      )}
      {lowCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700 flex-1">
            <span className="font-semibold">Low Stock:</span> {lowCount} drug{lowCount > 1 ? "s" : ""} below reorder level.
          </p>
        </div>
      )}

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Pending",       value: pendingCount,   color: "text-amber-600", bg: "bg-amber-50",  icon: Clock },
          { label: "Verified",      value: verifiedCount,  color: "text-blue-600",  bg: "bg-blue-50",   icon: Pill },
          { label: "Dispensed",     value: dispensedCount, color: "text-green-600", bg: "bg-green-50",  icon: CheckCircle2 },
          { label: "Critical Stock",value: criticalCount,  color: "text-red-600",   bg: "bg-red-50",    icon: AlertTriangle },
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

      {/* Main Tabs */}
      <Tabs defaultValue="prescriptions">
        <TabsList className="mb-4">
          <TabsTrigger value="prescriptions" className="gap-1.5"><Pill className="h-3.5 w-3.5" />Orders</TabsTrigger>
          <TabsTrigger value="inventory"     className="gap-1.5"><Package className="h-3.5 w-3.5" />Inventory</TabsTrigger>
          <TabsTrigger value="grn"           className="gap-1.5"><FileText className="h-3.5 w-3.5" />GRN</TabsTrigger>
          <TabsTrigger value="movements"     className="gap-1.5"><History className="h-3.5 w-3.5" />Stock Movements</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Orders ───────────────────────────────────────────────── */}
        <TabsContent value="prescriptions" className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search patient, RxId or drug…" className="pl-9 h-9" value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(["All", "Pending", "Verified", "Dispensed"] as const).map((s) => (
                <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} className="h-9 text-xs" onClick={() => setStatusFilter(s)}>{s}</Button>
              ))}
            </div>
          </div>

          {ordersLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading orders…</div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No orders found.</div>
          ) : (
            filteredOrders.map((order) => (
              <Card key={order._id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Pill className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs font-mono">{order.rxId}</Badge>
                        <Badge className={`text-xs ${TYPE_COLORS[order.type] ?? "bg-gray-100 text-gray-700"}`}>{order.type}</Badge>
                        <Badge className={`text-xs ${ORDER_STATUS_COLORS[order.status] ?? "bg-gray-100"}`}>{order.status}</Badge>
                        {order.rxSource && order.rxSource !== "Digital" && (
                          <Badge className={`text-xs ${RX_SOURCE_COLORS[order.rxSource]}`}>{order.rxSource}</Badge>
                        )}
                      </div>
                      <div className="font-semibold text-sm mt-1">{order.patientName}</div>
                      <div className="text-sm text-muted-foreground">
                        {order.drug} &mdash; <span className="font-medium text-foreground">{order.qty} {order.unit}</span>
                      </div>
                      {order.paperRxNote && (
                        <div className="text-xs text-orange-700 mt-0.5 italic">{order.paperRxNote}</div>
                      )}
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {order.doctor ? `Dr. ${order.doctor} · ` : ""}{order.time}
                      </div>
                      {order.status === "Dispensed" && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                          <span className="text-xs text-green-700 font-medium">
                            Dispensed by {order.dispensedBy}
                            {order.dispensedAt ? ` · ${new Date(order.dispensedAt).toLocaleString("en-IN")}` : ""}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0 items-end">
                      {order.status === "Dispensed" ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500 mt-1" />
                      ) : (
                        <>
                          {order.status === "Pending" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs text-blue-700 border-blue-300 hover:bg-blue-50" disabled={updating === order._id + "Verified"} onClick={() => patchOrder(order, "Verified")}>
                              {updating === order._id + "Verified" ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Verify"}
                            </Button>
                          )}
                          {(order.status === "Pending" || order.status === "Verified") && (
                            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" disabled={updating === order._id + "Dispensed"} onClick={() => patchOrder(order, "Dispensed")}>
                              {updating === order._id + "Dispensed" ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Dispense"}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Tab 2: Inventory ─────────────────────────────────────────────── */}
        <TabsContent value="inventory" className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search drug name or category…" className="pl-9 h-9" value={invSearch} onChange={(e) => setInvSearch(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => setShowGRN(true)}>
              <FileText className="h-4 w-4" /> Receive Stock
            </Button>
            <Button size="sm" className="h-9 gap-1.5" onClick={() => setShowAddDrug(true)}>
              <Plus className="h-4 w-4" /> Add Drug
            </Button>
          </div>

          {showAddDrug && <AddDrugForm onDone={() => setShowAddDrug(false)} />}

          {invLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading inventory…</div>
          ) : filteredInventory.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No drugs found.</div>
          ) : (
            filteredInventory.map((drug) => (
              <Card key={drug._id} className={drug.status === "Critical" ? "border-red-200" : drug.status === "Low" ? "border-amber-200" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${drug.status === "Critical" ? "bg-red-50" : drug.status === "Low" ? "bg-amber-50" : "bg-teal-50"}`}>
                      <Package className={`h-5 w-5 ${drug.status === "Critical" ? "text-red-600" : drug.status === "Low" ? "text-amber-600" : "text-teal-600"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{drug.name}</span>
                        {drug.category && <span className="text-xs text-muted-foreground">{drug.category}</span>}
                        <Badge className={`text-xs ${INVENTORY_STATUS_COLORS[drug.status]}`}>{drug.status}</Badge>
                        {drug.isBatchTracked && <Badge variant="outline" className="text-xs">Batch tracked</Badge>}
                      </div>
                      <div className="text-sm mt-0.5">
                        Stock: <span className="font-medium">{drug.stock} {drug.unit}</span>
                        <span className="text-muted-foreground text-xs ml-2">· Reorder at {drug.reorderLevel} {drug.unit}</span>
                      </div>
                      {drug.mrpPerUnit ? (
                        <div className="text-xs text-muted-foreground">MRP: ₹{drug.mrpPerUnit}/{drug.unit}</div>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0 items-end">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowGRN(true)}>
                        <Plus className="h-3 w-3" /> GRN
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-orange-600 hover:text-orange-700" onClick={() => setAdjustDrug(drug)}>
                        <Wrench className="h-3 w-3" /> Adjust
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Tab 3: GRN ───────────────────────────────────────────────────── */}
        <TabsContent value="grn" className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search GRN ID or supplier…" className="pl-9 h-9" value={grnSearch} onChange={(e) => setGrnSearch(e.target.value)} />
            </div>
            <Button size="sm" className="h-9 gap-1.5" onClick={() => setShowGRN(true)}>
              <Plus className="h-4 w-4" /> Receive Stock
            </Button>
          </div>

          {grnLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading GRNs…</div>
          ) : filteredGrns.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No goods receipts found. Use "Receive Stock" to add incoming stock.</div>
          ) : (
            filteredGrns.map((grn) => (
              <Card key={grn._id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs font-mono">{grn.grnId}</Badge>
                        <Badge className={`text-xs ${grn.status === "Received" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{grn.status}</Badge>
                      </div>
                      <div className="font-semibold text-sm mt-1">{grn.supplierName}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {grn.invoiceNo && `Invoice: ${grn.invoiceNo} · `}
                        Received: {new Date(grn.receivedDate || grn.createdAt).toLocaleDateString("en-IN")}
                        {" · "}{grn.receivedBy}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {grn.items?.length ?? 0} item{grn.items?.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">Total Value</div>
                      <div className="font-bold text-sm">₹{(grn.totalValue || 0).toLocaleString("en-IN")}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Tab 4: Stock Movements ───────────────────────────────────────── */}
        <TabsContent value="movements" className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search drug or adjustment type…" className="pl-9 h-9" value={movSearch} onChange={(e) => setMovSearch(e.target.value)} />
          </div>

          {adjLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading movements…</div>
          ) : filteredAdj.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No stock adjustments recorded.</div>
          ) : (
            filteredAdj.map((adj) => (
              <Card key={adj._id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs font-mono">{adj.adjustmentId}</Badge>
                        <Badge className="text-xs bg-orange-100 text-orange-700">{adj.adjustmentType?.replace("-", " ")}</Badge>
                      </div>
                      <div className="font-semibold text-sm mt-0.5">{adj.drugName}</div>
                      <div className="text-xs text-muted-foreground">{adj.reason} · by {adj.adjustedBy}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-sm font-bold ${adj.quantityAdjusted < 0 ? "text-red-600" : "text-green-600"}`}>
                        {adj.quantityAdjusted > 0 ? "+" : ""}{adj.quantityAdjusted}
                      </div>
                      <div className="text-xs text-muted-foreground">{adj.quantityBefore} → {adj.quantityAfter}</div>
                      <div className="text-xs text-muted-foreground">{adj.createdAt ? new Date(adj.createdAt).toLocaleDateString("en-IN") : ""}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <GRNModal open={showGRN} onClose={() => setShowGRN(false)} inventory={inventory} />
      <StockAdjustmentModal open={!!adjustDrug} onClose={() => setAdjustDrug(null)} drug={adjustDrug} />
      <DispenseCounterModal open={showCounter} onClose={() => setShowCounter(false)} inventory={inventory} />
    </div>
  );
}
