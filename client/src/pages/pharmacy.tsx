import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Pill, Search, Plus, AlertTriangle, CheckCircle2,
  Clock, Package, RefreshCw,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pharmacy as pharmacyApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

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
  type: "OPD" | "IPD";
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
  price?: number;
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
};

// ── Add Stock Inline Component ────────────────────────────────────────────────

function AddStockRow({ drug, onDone }: { drug: DrugInventory; onDone: () => void }) {
  const qc = useQueryClient();
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    const n = parseInt(qty, 10);
    if (!n || n <= 0) return;
    setBusy(true);
    try {
      await pharmacyApi.inventory.update(drug._id, { stock: drug.stock + n });
      qc.invalidateQueries({ queryKey: ["pharmacy-inventory"] });
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 mt-2">
      <Input
        type="number"
        min={1}
        placeholder="Qty to add"
        className="h-7 text-xs w-28"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") onDone(); }}
        autoFocus
      />
      <Button size="sm" className="h-7 text-xs" disabled={busy || !qty} onClick={handleAdd}>
        {busy ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Add"}
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onDone}>
        Cancel
      </Button>
    </div>
  );
}

// ── Add Drug Inline Form ──────────────────────────────────────────────────────

interface AddDrugFormProps {
  onDone: () => void;
}

function AddDrugForm({ onDone }: AddDrugFormProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", category: "", stock: "", unit: "", reorderLevel: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.unit.trim()) { setError("Name and unit are required."); return; }
    const stock = parseInt(form.stock, 10) || 0;
    const reorderLevel = parseInt(form.reorderLevel, 10) || 0;
    const status = stock === 0 ? "Critical" : stock <= reorderLevel ? "Low" : "OK";
    setBusy(true);
    setError("");
    try {
      await pharmacyApi.inventory.create({
        name: form.name.trim(),
        category: form.category.trim(),
        stock,
        unit: form.unit.trim(),
        reorderLevel,
        status,
      });
      qc.invalidateQueries({ queryKey: ["pharmacy-inventory"] });
      onDone();
    } catch (err: any) {
      setError(err.message || "Failed to create drug.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-dashed border-2 border-primary/30">
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="font-semibold text-sm mb-2">New Drug</div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Drug Name *</Label>
              <Input className="h-8 text-sm" placeholder="e.g. Metformin 500mg" value={form.name} onChange={set("name")} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Input className="h-8 text-sm" placeholder="e.g. Diabetes" value={form.category} onChange={set("category")} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Initial Stock</Label>
              <Input className="h-8 text-sm" type="number" min={0} placeholder="0" value={form.stock} onChange={set("stock")} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unit *</Label>
              <Input className="h-8 text-sm" placeholder="tabs / vials / ml" value={form.unit} onChange={set("unit")} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reorder Level</Label>
              <Input className="h-8 text-sm" type="number" min={0} placeholder="0" value={form.reorderLevel} onChange={set("reorderLevel")} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" className="h-8 text-xs" disabled={busy}>
              {busy ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}
              {busy ? "Saving…" : "Add Drug"}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={onDone}>
              Cancel
            </Button>
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

  // Orders tab state
  const [orderSearch, setOrderSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Pending" | "Verified" | "Dispensed">("All");
  const [updating, setUpdating] = useState<string | null>(null);

  // Inventory tab state
  const [invSearch, setInvSearch] = useState("");
  const [addStockFor, setAddStockFor] = useState<string | null>(null);
  const [showAddDrug, setShowAddDrug] = useState(false);

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

  const orders: PharmacyOrder[] = ordersData?.orders ?? [];
  const inventory: DrugInventory[] = inventoryData ?? [];

  // ── Derived stats ──────────────────────────────────────────────────────────

  const pendingCount   = orders.filter((o) => o.status === "Pending").length;
  const verifiedCount  = orders.filter((o) => o.status === "Verified").length;
  const dispensedCount = orders.filter((o) => o.status === "Dispensed").length;
  const criticalCount  = inventory.filter((d) => d.status === "Critical").length;

  // ── Filtered lists ─────────────────────────────────────────────────────────

  const filteredOrders = orders.filter((o) => {
    const q = orderSearch.toLowerCase();
    const matchSearch = !q
      || o.patientName.toLowerCase().includes(q)
      || o.rxId.toLowerCase().includes(q)
      || o.drug.toLowerCase().includes(q);
    const matchStatus = statusFilter === "All" || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const filteredInventory = inventory.filter((d) => {
    const q = invSearch.toLowerCase();
    return !q || d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q);
  });

  // ── Actions ────────────────────────────────────────────────────────────────

  const patchOrder = async (order: PharmacyOrder, status: string) => {
    const key = order._id + status;
    setUpdating(key);
    try {
      const payload: Record<string, string> = { status };
      if (status === "Dispensed") {
        payload.dispensedBy = user?.name ?? "Pharmacist";
        payload.dispensedAt = new Date().toISOString();
      }
      await pharmacyApi.orders.update(order._id, payload);
      qc.invalidateQueries({ queryKey: ["pharmacy-orders"] });
    } finally {
      setUpdating(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Page header */}
      <div>
        <h2 className="text-lg font-bold">Pharmacy Management</h2>
        <p className="text-sm text-muted-foreground">
          Prescription dispensing &amp; drug inventory · {inventory.length} drugs tracked
        </p>
      </div>

      {/* Critical stock alert banner */}
      {criticalCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700 flex-1">
            <span className="font-semibold">Stock-Out Alert:</span> {criticalCount} drug{criticalCount > 1 ? "s" : ""} at critical level. Check Inventory tab.
          </p>
        </div>
      )}

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Pending",   value: pendingCount,   color: "text-amber-600", bg: "bg-amber-50",  icon: Clock },
          { label: "Verified",  value: verifiedCount,  color: "text-blue-600",  bg: "bg-blue-50",   icon: Pill },
          { label: "Dispensed", value: dispensedCount, color: "text-green-600", bg: "bg-green-50",  icon: CheckCircle2 },
          { label: "Critical Stock", value: criticalCount, color: "text-red-600", bg: "bg-red-50",  icon: AlertTriangle },
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
          <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Prescriptions ──────────────────────────────────────── */}
        <TabsContent value="prescriptions" className="space-y-3">
          {/* Search + Status filter */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patient name or RxId…"
                className="pl-9 h-9"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(["All", "Pending", "Verified", "Dispensed"] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFilter === s ? "default" : "outline"}
                  className="h-9 text-xs"
                  onClick={() => setStatusFilter(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>

          {/* Order cards */}
          {ordersLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading prescriptions…</div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No prescriptions found.</div>
          ) : (
            filteredOrders.map((order) => (
              <Card key={order._id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Pill className="h-5 w-5 text-amber-600" />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Row 1: RxId + type badge + status badge */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs font-mono">{order.rxId}</Badge>
                        <Badge className={`text-xs ${TYPE_COLORS[order.type] ?? "bg-gray-100 text-gray-700"}`}>
                          {order.type}
                        </Badge>
                        <Badge className={`text-xs ${ORDER_STATUS_COLORS[order.status] ?? "bg-gray-100"}`}>
                          {order.status}
                        </Badge>
                      </div>

                      {/* Row 2: patient name */}
                      <div className="font-semibold text-sm mt-1">{order.patientName}</div>

                      {/* Row 3: drug + qty */}
                      <div className="text-sm text-muted-foreground">
                        {order.drug} &mdash; <span className="font-medium text-foreground">{order.qty} {order.unit}</span>
                      </div>

                      {/* Row 4: doctor + time */}
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Dr. {order.doctor} &middot; {order.time}
                      </div>

                      {/* Dispensed info */}
                      {order.status === "Dispensed" && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                          <span className="text-xs text-green-700 font-medium">
                            Dispensed by {order.dispensedBy}
                            {order.dispensedAt
                              ? ` · ${new Date(order.dispensedAt).toLocaleString()}`
                              : ""}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-1.5 shrink-0 items-end">
                      {order.status === "Dispensed" ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500 mt-1" />
                      ) : (
                        <>
                          {order.status === "Pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-blue-700 border-blue-300 hover:bg-blue-50"
                              disabled={updating === order._id + "Verified"}
                              onClick={() => patchOrder(order, "Verified")}
                            >
                              {updating === order._id + "Verified"
                                ? <RefreshCw className="h-3 w-3 animate-spin" />
                                : "Verify"}
                            </Button>
                          )}
                          {(order.status === "Pending" || order.status === "Verified") && (
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-green-600 hover:bg-green-700"
                              disabled={updating === order._id + "Dispensed"}
                              onClick={() => patchOrder(order, "Dispensed")}
                            >
                              {updating === order._id + "Dispensed"
                                ? <RefreshCw className="h-3 w-3 animate-spin" />
                                : "Dispense"}
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

        {/* ── Tab 2: Inventory ──────────────────────────────────────────── */}
        <TabsContent value="inventory" className="space-y-3">
          {/* Search + Add Drug button */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search drug name or category…"
                className="pl-9 h-9"
                value={invSearch}
                onChange={(e) => setInvSearch(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => { setShowAddDrug(true); setAddStockFor(null); }}
            >
              <Plus className="h-4 w-4" /> Add Drug
            </Button>
          </div>

          {/* Inline add drug form */}
          {showAddDrug && (
            <AddDrugForm onDone={() => setShowAddDrug(false)} />
          )}

          {/* Inventory cards */}
          {invLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading inventory…</div>
          ) : filteredInventory.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No drugs found.</div>
          ) : (
            filteredInventory.map((drug) => (
              <Card
                key={drug._id}
                className={drug.status === "Critical" ? "border-red-200" : drug.status === "Low" ? "border-amber-200" : ""}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      drug.status === "Critical" ? "bg-red-50"
                      : drug.status === "Low" ? "bg-amber-50"
                      : "bg-teal-50"
                    }`}>
                      <Package className={`h-5 w-5 ${
                        drug.status === "Critical" ? "text-red-600"
                        : drug.status === "Low" ? "text-amber-600"
                        : "text-teal-600"
                      }`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Name + category + status */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{drug.name}</span>
                        {drug.category && (
                          <span className="text-xs text-muted-foreground">{drug.category}</span>
                        )}
                        <Badge className={`text-xs ${INVENTORY_STATUS_COLORS[drug.status]}`}>
                          {drug.status}
                        </Badge>
                      </div>

                      {/* Stock */}
                      <div className="text-sm mt-0.5">
                        Stock: <span className="font-medium">{drug.stock} {drug.unit}</span>
                        <span className="text-muted-foreground text-xs ml-2">
                          · Reorder at {drug.reorderLevel} {drug.unit}
                        </span>
                      </div>
                      {drug.price !== undefined && (
                        <div className="text-xs text-muted-foreground">
                          Price: ₹{drug.price}/{drug.unit}
                        </div>
                      )}

                      {/* Inline add-stock row */}
                      {addStockFor === drug._id && (
                        <AddStockRow drug={drug} onDone={() => setAddStockFor(null)} />
                      )}
                    </div>

                    {/* Buttons */}
                    <div className="flex flex-col gap-1.5 shrink-0 items-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => setAddStockFor(addStockFor === drug._id ? null : drug._id)}
                      >
                        <Plus className="h-3 w-3" /> Add Stock
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
