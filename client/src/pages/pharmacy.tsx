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
  Clock, Package, RefreshCw, FileText, History, ShoppingCart, SlidersHorizontal, Pencil, Trash2,
  BarChart3, Printer, Upload, ChevronLeft, ChevronRight, Layers,
} from "lucide-react";
import { printExpiryReport, printCurrentStockReport } from "@/lib/print";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pharmacy as pharmacyApi, describeStockError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { confirm } from "@/hooks/use-confirm";
import GRNModal from "@/components/modals/GRNModal";
import StockAdjustmentModal from "@/components/modals/StockAdjustmentModal";
import DispenseCounterModal from "@/components/modals/DispenseCounterModal";
import DrugEditModal from "@/components/modals/DrugEditModal";
import BulkUploadInventoryModal from "@/components/modals/BulkUploadInventoryModal";
import HistoryModal from "@/components/modals/HistoryModal";
import DrugBatchesModal from "@/components/modals/DrugBatchesModal";

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
  purchasePricePerUnit?: number;
  supplier?: string;
  hsnCode?: string;
  isBatchTracked?: boolean;
  isActive?: boolean;
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

const INVENTORY_STATUS_ACCENT: Record<string, string> = {
  OK:       "border-l-green-500",
  Low:      "border-l-amber-500",
  Critical: "border-l-red-500",
};

const INVENTORY_STATUS_ICON_BG: Record<string, string> = {
  OK:       "bg-green-50 text-green-600",
  Low:      "bg-amber-50 text-amber-600",
  Critical: "bg-red-50 text-red-600",
};

const INVENTORY_STATUS_BAR: Record<string, string> = {
  OK:       "bg-green-500",
  Low:      "bg-amber-500",
  Critical: "bg-red-500",
};

// Windowed page numbers around `current`, capped at `size` entries, clamped to [1, total]
function getPageWindow(current: number, total: number, size = 5): number[] {
  if (total <= size) return Array.from({ length: total }, (_, i) => i + 1);
  let start = Math.max(1, current - Math.floor(size / 2));
  let end = start + size - 1;
  if (end > total) { end = total; start = end - size + 1; }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

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
              { label: "Default MRP/Unit ₹ (fallback)", k: "mrpPerUnit", placeholder: "0.00", type: "number", step: "0.01" },
            ].map(({ label, k, placeholder, type, step }) => (
              <div key={k} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input className="h-8 text-sm" type={type} min={0} step={step} placeholder={placeholder} value={form[k as keyof typeof form]} onChange={set(k as keyof typeof form)} />
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
  const { user } = useAuth();
  const canManageInventory = user?.role === "admin" || user?.role === "pharmacy_admin";

  // Orders tab
  const [orderSearch, setOrderSearch]   = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Pending" | "Verified" | "Dispensed">("All");
  const [updating, setUpdating]         = useState<string | null>(null);

  // Inventory tab
  const [invSearch, setInvSearch]   = useState("");
  const [invPage, setInvPage]       = useState(1);
  const [invLimit, setInvLimit]     = useState(10);
  const [showInactive, setShowInactive] = useState(false);
  const [showAddDrug, setShowAddDrug] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [adjustDrug, setAdjustDrug] = useState<DrugInventory | null>(null);

  // GRN tab
  const [grnSearch, setGrnSearch] = useState("");
  const [editGrn, setEditGrn]     = useState<any>(null);

  // Inventory edit
  const [editDrug, setEditDrug] = useState<any>(null);
  const [historyDrug, setHistoryDrug] = useState<any>(null);
  const [batchesDrug, setBatchesDrug] = useState<any>(null);
  const [deactivatingDrug, setDeactivatingDrug] = useState<string | null>(null);
  const [cancellingGrn, setCancellingGrn] = useState<string | null>(null);

  // Stock movements tab
  const [movSearch, setMovSearch] = useState("");

  // Modals
  const [showGRN, setShowGRN]         = useState(false);
  const [showCounter, setShowCounter] = useState(false);

  // Reports tab
  const [activeTab, setActiveTab]           = useState("prescriptions");
  const [stockStatusFilter, setStockStatusFilter] = useState<"All" | "OK" | "Low" | "Critical">("All");
  const [stockSearch, setStockSearch]       = useState("");
  const [expiryWithin, setExpiryWithin]     = useState("90");
  const [includeExpired, setIncludeExpired] = useState(true);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ["pharmacy-orders"],
    queryFn: () => pharmacyApi.orders.list(),
    retry: false,
    refetchInterval: 20_000,
  });

  // Paginated + server-side searched list backing the Inventory tab table
  const { data: inventoryData, isLoading: invLoading } = useQuery({
    queryKey: ["pharmacy-inventory", "table", showInactive, invSearch, invPage, invLimit],
    queryFn: () => pharmacyApi.inventory.list({
      ...(showInactive ? { includeInactive: "true" } : {}),
      ...(invSearch.trim() ? { search: invSearch.trim() } : {}),
      page: String(invPage),
      limit: String(invLimit),
    }),
    retry: false,
  });

  // Full active catalog — feeds stock stats and drug-picker dropdowns (GRN, Dispense-at-Counter)
  const { data: inventoryFullData } = useQuery({
    queryKey: ["pharmacy-inventory", "full"],
    queryFn: () => pharmacyApi.inventory.list({ limit: "1000" }),
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

  const { data: expiryData, isLoading: expiryLoading } = useQuery({
    queryKey: ["pharmacy-expiry", expiryWithin, includeExpired],
    queryFn: () => pharmacyApi.batches.expiryReport({ expiryWithin, includeExpired: String(includeExpired) }),
    enabled: activeTab === "reports",
    retry: false,
  });

  const { data: stockReportData = [], isLoading: stockReportLoading } = useQuery({
    queryKey: ["pharmacy-stock-report", stockStatusFilter, stockSearch],
    queryFn: async () => {
      const params: Record<string, string> = { limit: "1000" };
      if (stockStatusFilter !== "All") params.status = stockStatusFilter;
      if (stockSearch.trim()) params.search = stockSearch.trim();
      const data = await pharmacyApi.inventory.list(params);
      return (data?.drugs ?? []) as any[];
    },
    enabled: activeTab === "reports",
    retry: false,
  });

  const orders: PharmacyOrder[]   = ordersData?.orders  ?? [];
  // Full active catalog: drives stock stats and the GRN/Dispense drug-picker dropdowns
  const inventory: DrugInventory[] = inventoryFullData?.drugs ?? [];
  // Current page of the (server-searched) Inventory tab table
  const tableInventory: DrugInventory[] = inventoryData?.drugs ?? [];
  const invTotal       = inventoryData?.total ?? 0;
  const invTotalPages  = Math.max(1, Math.ceil(invTotal / invLimit));
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
    } catch (err: any) {
      toast({ variant: "destructive", title: status === "Dispensed" ? "Dispense failed" : "Update failed", description: describeStockError(err) });
    } finally { setUpdating(null); }
  };

  const deactivateDrug = async (drug: DrugInventory) => {
    const ok = await confirm({
      title: `Deactivate ${drug.name}?`,
      description: "It will be hidden from inventory but its history is kept.",
      confirmText: "Deactivate",
      variant: "destructive",
    });
    if (!ok) return;
    setDeactivatingDrug(drug._id);
    try {
      await pharmacyApi.inventory.remove(drug._id);
      qc.invalidateQueries({ queryKey: ["pharmacy-inventory"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Deactivate failed", description: err.message || "Failed to deactivate drug." });
    } finally { setDeactivatingDrug(null); }
  };

  const reactivateDrug = async (drug: DrugInventory) => {
    setDeactivatingDrug(drug._id);
    try {
      await pharmacyApi.inventory.reactivate(drug._id);
      qc.invalidateQueries({ queryKey: ["pharmacy-inventory"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Reactivate failed", description: err.message || "Failed to reactivate drug." });
    } finally { setDeactivatingDrug(null); }
  };

  const cancelGrn = async (grnId: string) => {
    const ok = await confirm({
      title: "Cancel this GRN?",
      description: "If received, its stock impact will be reversed.",
      confirmText: "Cancel GRN",
      variant: "destructive",
    });
    if (!ok) return;
    setCancellingGrn(grnId);
    try {
      await pharmacyApi.grn.cancel(grnId);
      qc.invalidateQueries({ queryKey: ["pharmacy-grn"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-inventory"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Cancel failed", description: err.message || "Failed to cancel GRN." });
    } finally { setCancellingGrn(null); }
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
      <Tabs defaultValue="prescriptions" onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="prescriptions" className="gap-1.5"><Pill className="h-3.5 w-3.5" />Orders</TabsTrigger>
          <TabsTrigger value="inventory"     className="gap-1.5"><Package className="h-3.5 w-3.5" />Inventory</TabsTrigger>
          <TabsTrigger value="grn"           className="gap-1.5"><FileText className="h-3.5 w-3.5" />GRN</TabsTrigger>
          <TabsTrigger value="movements"     className="gap-1.5"><History className="h-3.5 w-3.5" />Stock Movements</TabsTrigger>
          <TabsTrigger value="reports"       className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Reports</TabsTrigger>
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
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold">Inventory</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {invTotal} active item{invTotal !== 1 ? "s" : ""} · {criticalCount + lowCount} need attention
              </p>
            </div>
            {canManageInventory && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer w-fit shrink-0">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5"
                  checked={showInactive}
                  onChange={(e) => { setShowInactive(e.target.checked); setInvPage(1); }}
                />
                Show deactivated
              </label>
            )}
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search drug name or category…" className="pl-9 h-9" value={invSearch} onChange={(e) => { setInvSearch(e.target.value); setInvPage(1); }} />
            </div>
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => setShowGRN(true)}>
              <FileText className="h-4 w-4" /> Receive Stock
            </Button>
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => setShowBulkUpload(true)}>
              <Upload className="h-4 w-4" /> Bulk Upload
            </Button>
            <Button size="sm" className="h-9 gap-1.5" onClick={() => setShowAddDrug(true)}>
              <Plus className="h-4 w-4" /> Add Drug
            </Button>
          </div>

          {showAddDrug && <AddDrugForm onDone={() => setShowAddDrug(false)} />}

          {invLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading inventory…</div>
          ) : tableInventory.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No drugs found.</div>
          ) : (
            <div className="space-y-2">
              {tableInventory.map((drug) => (
                <div
                  key={drug._id}
                  className={`flex items-center gap-3 rounded-xl border border-l-4 bg-card p-3.5 ${INVENTORY_STATUS_ACCENT[drug.status] ?? "border-l-gray-300"} ${drug.isActive === false ? "opacity-60" : ""}`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${INVENTORY_STATUS_ICON_BG[drug.status] ?? "bg-gray-50 text-gray-600"}`}>
                    <Package className="h-5 w-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{drug.name}</span>
                      <Badge className={`text-xs ${INVENTORY_STATUS_COLORS[drug.status]}`}>{drug.status}</Badge>
                      {drug.isBatchTracked && <Badge variant="outline" className="text-xs">Batch tracked</Badge>}
                      {drug.isActive === false && <Badge variant="outline" className="text-xs text-muted-foreground">Deactivated</Badge>}
                    </div>
                    {drug.supplier && <div className="text-xs text-muted-foreground mt-0.5">{drug.supplier}</div>}
                  </div>

                  <div className="w-40 shrink-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-sm">{drug.stock.toLocaleString()} {drug.unit}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">reorder {drug.reorderLevel.toLocaleString()} {drug.unit}</div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100 mt-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${INVENTORY_STATUS_BAR[drug.status] ?? "bg-gray-400"}`}
                        style={{ width: `${Math.min(100, (drug.stock / (drug.reorderLevel || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {canManageInventory && drug.isActive !== false && (
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setEditDrug(drug)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setHistoryDrug(drug)} title="History">
                      <History className="h-3.5 w-3.5" />
                    </Button>
                    {drug.isBatchTracked && (
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setBatchesDrug(drug)} title="Batches">
                        <Layers className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {drug.isActive === false ? (
                      canManageInventory && (
                        <Button
                          size="icon" variant="outline" className="h-8 w-8 text-green-600 hover:text-green-700"
                          disabled={deactivatingDrug === drug._id}
                          onClick={() => reactivateDrug(drug)}
                          title="Reactivate"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      )
                    ) : (
                      <>
                        <Button size="icon" variant="outline" className="h-8 w-8 text-orange-600 hover:text-orange-700" onClick={() => setAdjustDrug(drug)} title="Adjust stock">
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                        </Button>
                        {canManageInventory && (
                          <Button
                            size="icon" variant="outline" className="h-8 w-8 text-red-600 hover:text-red-700 border-red-200"
                            disabled={deactivatingDrug === drug._id}
                            onClick={() => deactivateDrug(drug)}
                            title="Deactivate"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!invLoading && invTotal > 0 && (
            <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  Showing {(invPage - 1) * invLimit + 1}–{Math.min(invPage * invLimit, invTotal)} of {invTotal}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Per page</span>
                  <Select value={String(invLimit)} onValueChange={(v) => { setInvLimit(Number(v)); setInvPage(1); }}>
                    <SelectTrigger className="h-8 w-[68px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm" variant="outline" className="h-8 gap-1 text-xs"
                  disabled={invPage <= 1}
                  onClick={() => setInvPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </Button>
                {getPageWindow(invPage, invTotalPages).map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={p === invPage ? "default" : "outline"}
                    className={`h-8 w-8 p-0 text-xs ${p === invPage ? "bg-teal-700 hover:bg-teal-800" : ""}`}
                    onClick={() => setInvPage(p)}
                  >
                    {p}
                  </Button>
                ))}
                <Button
                  size="sm" variant="outline" className="h-8 gap-1 text-xs"
                  disabled={invPage >= invTotalPages}
                  onClick={() => setInvPage((p) => Math.min(invTotalPages, p + 1))}
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
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
                      {grn.items?.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {grn.items.map((it: any, i: number) => (
                            <div key={i} className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                              <span className="font-medium text-foreground">{it.drugName}</span>
                              {it.batchNo && <span>Batch: {it.batchNo}</span>}
                              {it.expiryDate && <span>Exp: {new Date(it.expiryDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span>}
                              <span>Qty: {it.quantityReceived} {it.unit}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Total Value</div>
                        <div className="font-bold text-sm">₹{(grn.totalValue || 0).toLocaleString("en-IN")}</div>
                      </div>
                      {canManageInventory && grn.status !== "Cancelled" && (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => setEditGrn(grn)}>
                          <Pencil className="h-3 w-3" /> Edit
                        </Button>
                      )}
                      {canManageInventory && grn.status !== "Cancelled" && (
                        <Button
                          size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 text-red-600 hover:text-red-700"
                          disabled={cancellingGrn === grn._id}
                          onClick={() => cancelGrn(grn._id)}
                        >
                          <Trash2 className="h-3 w-3" /> Cancel
                        </Button>
                      )}
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
        {/* ── Tab 5: Reports ──────────────────────────────────────────────── */}
        <TabsContent value="reports" className="space-y-6">

          {/* Section A: Current Stock Report */}
          <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-sm">Current Stock Report</h3>
                    <p className="text-xs text-muted-foreground">All drugs with stock levels as of now</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-9 gap-1.5 shrink-0"
                    onClick={() => printCurrentStockReport(stockReportData, stockStatusFilter)}>
                    <Printer className="h-4 w-4" /> Print
                  </Button>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search drug name or category…" className="pl-9 h-9" value={stockSearch} onChange={(e) => setStockSearch(e.target.value)} />
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {(["All", "OK", "Low", "Critical"] as const).map((s) => (
                      <button key={s} onClick={() => setStockStatusFilter(s)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                          stockStatusFilter === s
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        {s}
                        <span className="ml-1.5 opacity-70">
                          {s === "All" ? inventory.length : inventory.filter((d) => d.status === s).length}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {stockReportLoading ? (
                  <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
                ) : stockReportData.length === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-center">
                      <Package className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No drugs match the filter</p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-0 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/40">
                              {["#", "Drug Name", "Category", "Stock", "Reorder Level", "MRP/Unit", "Batch Tracked", "Status"].map((h, i) => (
                                <th key={h} className={`py-2.5 px-4 text-xs font-semibold text-muted-foreground ${i < 3 ? "text-left" : "text-right"} ${i === 6 || i === 7 ? "text-center" : ""}`}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {stockReportData.map((drug, idx) => (
                              <tr key={drug._id} className={`border-b last:border-0 hover:bg-muted/20 ${drug.status === "Critical" ? "bg-red-50/40" : drug.status === "Low" ? "bg-amber-50/40" : ""}`}>
                                <td className="py-2.5 px-4 text-muted-foreground">{idx + 1}</td>
                                <td className="py-2.5 px-4 font-medium">{drug.name}</td>
                                <td className="py-2.5 px-4 text-muted-foreground">{drug.category || "—"}</td>
                                <td className="py-2.5 px-4 text-right font-semibold">{drug.stock} <span className="font-normal text-muted-foreground">{drug.unit}</span></td>
                                <td className="py-2.5 px-4 text-right text-muted-foreground">{drug.reorderLevel} {drug.unit}</td>
                                <td className="py-2.5 px-4 text-right text-muted-foreground">{drug.mrpPerUnit ? `₹${Number(drug.mrpPerUnit).toLocaleString("en-IN")}` : "—"}</td>
                                <td className="py-2.5 px-4 text-center">
                                  <Badge variant={drug.isBatchTracked ? "default" : "outline"} className="text-xs">{drug.isBatchTracked ? "Yes" : "No"}</Badge>
                                </td>
                                <td className="py-2.5 px-4 text-center">
                                  <Badge className={`text-xs ${INVENTORY_STATUS_COLORS[drug.status]}`}>{drug.status}</Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-4 py-2 text-xs text-muted-foreground border-t flex items-center gap-4">
                        <span>{stockReportData.length} item{stockReportData.length !== 1 ? "s" : ""}</span>
                        {stockStatusFilter === "All" && (
                          <>
                            <span className="text-green-600">{inventory.filter((d) => d.status === "OK").length} OK</span>
                            <span className="text-amber-600">{lowCount} Low</span>
                            <span className="text-red-600">{criticalCount} Critical</span>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

          <div className="border-t" />

          {/* Section D: Expiry Report */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-sm">Expiry Date Report</h3>
                <p className="text-xs text-muted-foreground">Batches nearing or past expiry date</p>
              </div>
              <Button size="sm" variant="outline" className="h-9 gap-1.5 shrink-0"
                onClick={() => printExpiryReport(expiryData ?? [], { expiryWithin })}>
                <Printer className="h-4 w-4" /> Print
              </Button>
            </div>

            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">Expiring within:</span>
                <Select value={expiryWithin} onValueChange={setExpiryWithin}>
                  <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="180">180 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeExpired}
                  onChange={(e) => setIncludeExpired(e.target.checked)}
                  className="rounded"
                />
                Include already expired
              </label>
            </div>

            {expiryLoading ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
            ) : (expiryData ?? []).length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center">
                  <Package className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No batches found for this expiry window</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          {["#", "Drug Name", "Batch No", "Expiry Date", "Days Left", "Qty Remaining", "Status"].map((h, i) => (
                            <th key={h} className={`py-2.5 px-4 text-xs font-semibold text-muted-foreground ${i < 3 ? "text-left" : "text-right"} ${i === 6 ? "text-center" : ""}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(expiryData ?? []).map((batch: any, idx: number) => {
                          const daysLeft  = Math.ceil((new Date(batch.expiryDate).getTime() - Date.now()) / 86_400_000);
                          const isExpired = daysLeft < 0;
                          return (
                            <tr key={batch._id || idx} className={`border-b last:border-0 hover:bg-muted/20 ${isExpired ? "bg-red-50/60" : ""}`}>
                              <td className="py-2.5 px-4 text-muted-foreground">{idx + 1}</td>
                              <td className="py-2.5 px-4 font-medium">{batch.drugName || "—"}</td>
                              <td className="py-2.5 px-4 font-mono text-xs">{batch.batchNo || "—"}</td>
                              <td className="py-2.5 px-4 text-right text-muted-foreground">
                                {batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                              </td>
                              <td className={`py-2.5 px-4 text-right font-medium ${isExpired ? "text-red-600" : daysLeft <= 30 ? "text-amber-600" : "text-foreground"}`}>
                                {isExpired ? `${Math.abs(daysLeft)}d ago` : `${daysLeft}d`}
                              </td>
                              <td className="py-2.5 px-4 text-right">{batch.quantityRemaining} {batch.drugUnit || ""}</td>
                              <td className="py-2.5 px-4 text-center">
                                <Badge className={`text-xs ${batch.status === "Expired" ? "bg-red-100 text-red-700" : batch.status === "Active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}`}>
                                  {batch.status}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2 text-xs text-muted-foreground border-t">
                    {(expiryData ?? []).length} batch{(expiryData ?? []).length !== 1 ? "es" : ""}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

        </TabsContent>
      </Tabs>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <GRNModal open={showGRN || !!editGrn} onClose={() => { setShowGRN(false); setEditGrn(null); }} inventory={inventory} existing={editGrn} />
      <StockAdjustmentModal open={!!adjustDrug} onClose={() => setAdjustDrug(null)} drug={adjustDrug} />
      <DispenseCounterModal open={showCounter} onClose={() => setShowCounter(false)} inventory={inventory} />
      <DrugEditModal open={!!editDrug} onClose={() => setEditDrug(null)} drug={editDrug} />
      <BulkUploadInventoryModal open={showBulkUpload} onClose={() => setShowBulkUpload(false)} />
      <HistoryModal open={!!historyDrug} onClose={() => setHistoryDrug(null)} drug={historyDrug} />
      <DrugBatchesModal open={!!batchesDrug} onClose={() => setBatchesDrug(null)} drug={batchesDrug} canEdit={canManageInventory} />
    </div>
  );
}
