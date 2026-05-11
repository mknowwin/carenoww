import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Pill, Search, Plus, AlertTriangle, CheckCircle2, Clock,
  Package, Brain, Barcode, RefreshCw, Pencil,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pharmacy as pharmApi } from "@/lib/api";
import { PHARMACY_ORDERS as ORDERS_FB, DRUG_INVENTORY as INVENTORY_FB } from "@/lib/mock-data";
import PharmacyModal from "@/components/modals/PharmacyModal";

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

export default function PharmacyPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"orders" | "inventory">("orders");
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [modalMode, setModalMode] = useState<"order" | "inventory">("order");
  const [updating, setUpdating] = useState<string | null>(null);

  const patchOrder = async (order: any, status: string) => {
    const mongoId = order._id;
    setUpdating(mongoId + status);
    try {
      await pharmApi.orders.update(mongoId, { status });
      qc.invalidateQueries({ queryKey: ["pharmacy-orders"] });
    } finally {
      setUpdating(null);
    }
  };

  const { data: ordersData }    = useQuery({ queryKey: ["pharmacy-orders"],    queryFn: () => pharmApi.orders.list(), retry: false });
  const { data: inventoryData } = useQuery({ queryKey: ["pharmacy-inventory"], queryFn: () => pharmApi.inventory.list(), retry: false });

  const PHARMACY_ORDERS: any[] = (ordersData?.orders ?? ORDERS_FB).map((o: any) => ({ ...o, id: o.rxId || o._id || o.id }));
  const DRUG_INVENTORY: any[]  = inventoryData ?? INVENTORY_FB;

  const filteredOrders = PHARMACY_ORDERS.filter((o: any) =>
    !search || o.patientName.toLowerCase().includes(search.toLowerCase()) || o.drug.toLowerCase().includes(search.toLowerCase())
  );
  const filteredInventory = DRUG_INVENTORY.filter((d: any) =>
    !search || d.name.toLowerCase().includes(search.toLowerCase())
  );

  const pendingCount = PHARMACY_ORDERS.filter((o: any) => o.status === "Pending").length;
  const criticalStock = DRUG_INVENTORY.filter((d: any) => d.status === "Critical").length;

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Pharmacy Management</h2>
          <p className="text-sm text-muted-foreground">AI-powered dispensing safety · {DRUG_INVENTORY.length} drugs tracked</p>

        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2"><Barcode className="h-4 w-4" /> Scan Barcode</Button>
          <Button size="sm" className="gap-2" onClick={() => { setEditItem(null); setModalMode(tab === "inventory" ? "inventory" : "order"); setModalOpen(true); }}>
            <Plus className="h-4 w-4" /> {tab === "inventory" ? "Add Drug" : "Dispense"}
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {criticalStock > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-3">
          <Brain className="h-4 w-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700">
            <span className="font-semibold">AI Stock-Out Alert:</span> {criticalStock} drug(s) at critical level. Insulin Glargine: 45 vials remaining — reorder threshold breached.
          </p>
          <Button size="sm" variant="outline" className="shrink-0 text-red-700 border-red-300 hover:bg-red-50">Order Now</Button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Pending Orders",  value: pendingCount,     color: "text-amber-600", bg: "bg-amber-50",   icon: Clock },
          { label: "Dispensed Today", value: PHARMACY_ORDERS.filter((o) => o.status === "Dispensed").length, color: "text-green-600", bg: "bg-green-50", icon: CheckCircle2 },
          { label: "Critical Stock",  value: criticalStock,    color: "text-red-600",   bg: "bg-red-50",     icon: AlertTriangle },
          { label: "Low Stock Items", value: DRUG_INVENTORY.filter((d) => d.status === "Low").length, color: "text-amber-600", bg: "bg-amber-50", icon: Package },
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

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-0">
        <Button
          variant={tab === "orders" ? "default" : "ghost"}
          size="sm"
          onClick={() => setTab("orders")}
          className="rounded-b-none"
        >
          Prescription Orders
        </Button>
        <Button
          variant={tab === "inventory" ? "default" : "ghost"}
          size="sm"
          onClick={() => setTab("inventory")}
          className="rounded-b-none"
        >
          Drug Inventory
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={tab === "orders" ? "Search patient or drug..." : "Search drug name..."}
              className="pl-9 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {tab === "orders" ? (
            filteredOrders.map((order) => (
              <Card key={order.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
                      <Pill className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{order.drug}</span>
                        <Badge className="text-xs bg-muted text-muted-foreground">{order.type}</Badge>
                        <Badge className={`text-xs ${ORDER_STATUS_COLORS[order.status] ?? "bg-gray-100"}`}>{order.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {order.patientName} · {order.doctor} · {order.time}
                      </div>
                      <div className="text-xs mt-0.5">
                        Qty: <span className="font-medium">{order.qty} {order.unit}</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditItem(order); setModalMode("order"); setModalOpen(true); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      {order.status === "Pending" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs text-blue-700 border-blue-300 hover:bg-blue-50"
                          disabled={updating === order._id + "Verified"}
                          onClick={() => patchOrder(order, "Verified")}>
                          Verify
                        </Button>
                      )}
                      {(order.status === "Pending" || order.status === "Verified") && (
                        <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700"
                          disabled={updating === order._id + "Dispensed"}
                          onClick={() => patchOrder(order, "Dispensed")}>
                          Dispense
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            filteredInventory.map((drug) => {
              const pct = Math.round((drug.stock / (drug.reorderLevel * 5)) * 100);
              return (
                <Card key={drug.name} className={drug.status === "Critical" ? "border-red-200" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        drug.status === "Critical" ? "bg-red-50" : drug.status === "Low" ? "bg-amber-50" : "bg-teal-50"
                      }`}>
                        <Package className={`h-5 w-5 ${
                          drug.status === "Critical" ? "text-red-600" : drug.status === "Low" ? "text-amber-600" : "text-teal-600"
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{drug.name}</span>
                          <Badge className={`text-xs ${INVENTORY_STATUS_COLORS[drug.status]}`}>{drug.status}</Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Progress value={Math.min(pct, 100)} className="h-1.5 flex-1" />
                          <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">
                            {drug.stock} {drug.unit}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex gap-3">
                          <span>Reorder: {drug.reorderLevel}</span>
                          <span>Exp: {drug.expiryDate}</span>
                          <span>{drug.supplier}</span>
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditItem(drug); setModalMode("inventory"); setModalOpen(true); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {drug.status !== "OK" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                            <RefreshCw className="h-3 w-3" /> Reorder
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Right: AI insights */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">AI Drug Safety</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs">
              {[
                { type: "interaction", msg: "Amlodipine + Telmisartan (Arjun Mehta) — Monitor BP closely. Additive hypotensive effect.", severity: "warning" },
                { type: "allergy",    msg: "Lakshmi Devi: Sulpha allergy on file — Trimethoprim-Sulfa contraindicated.", severity: "critical" },
                { type: "expiry",     msg: "Metformin 500mg batch EXP-2024 — 90 tabs, dispense first before new stock.", severity: "info" },
              ].map((alert, i) => (
                <div key={i} className={`rounded-xl p-2.5 border ${
                  alert.severity === "critical" ? "bg-red-50 border-red-200" :
                  alert.severity === "warning"  ? "bg-amber-50 border-amber-200" :
                  "bg-blue-50 border-blue-200"
                }`}>
                  <div className={`font-semibold capitalize mb-0.5 ${
                    alert.severity === "critical" ? "text-red-700" :
                    alert.severity === "warning"  ? "text-amber-700" : "text-blue-700"
                  }`}>{alert.type}</div>
                  <p className="text-muted-foreground leading-snug">{alert.msg}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Dispensing Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {[
                { label: "OPD Prescriptions", value: "48", sub: "Today" },
                { label: "IPD Medications",   value: "124", sub: "Active MARs" },
                { label: "Drug Interactions Caught", value: "3", sub: "AI prevented" },
                { label: "Avg Dispensing Time", value: "4.2 min", sub: "Per patient" },
              ].map((s) => (
                <div key={s.label} className="flex justify-between items-center py-1.5 border-b border-border last:border-0">
                  <span className="text-muted-foreground">{s.label}</span>
                  <div className="text-right">
                    <div className="font-semibold text-sm">{s.value}</div>
                    <div className="text-muted-foreground">{s.sub}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <PharmacyModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditItem(null); }}
        existing={editItem}
        mode={modalMode}
      />
    </div>
  );
}
