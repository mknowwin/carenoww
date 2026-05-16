import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  CreditCard, Search, Plus, AlertTriangle, CheckCircle2,
  Clock, Brain, FileText, TrendingUp, IndianRupee, Pencil,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { billing as billingApi } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import BillingModal from "@/components/modals/BillingModal";

const STATUS_COLORS: Record<string, string> = {
  Paid:    "bg-green-100 text-green-700",
  Partial: "bg-amber-100 text-amber-700",
  Pending: "bg-red-100 text-red-700",
  Claimed: "bg-blue-100 text-blue-700",
};

export default function BillingPage() {
  const qc = useQueryClient();
  const [search,      setSearch]      = useState("");
  const [statusFilter,setStatusFilter]= useState("All");
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editBill,    setEditBill]    = useState<any>(null);
  const [payOnly,     setPayOnly]     = useState(false);
  const [paying,      setPaying]      = useState<string | null>(null);
  const [expandedId,  setExpandedId]  = useState<string | null>(null);

  const markPaid = async (bill: any) => {
    if (!confirm(`Mark bill ${bill.id} as fully paid (₹${bill.amount.toLocaleString()})?`)) return;
    setPaying(bill.id);
    try {
      await billingApi.update(bill._id || bill.id, { paid: bill.amount, status: "Paid" });
      qc.invalidateQueries({ queryKey: ["billing"] });
    } finally {
      setPaying(null);
    }
  };

  const { data: apiData } = useQuery({ queryKey: ["billing"], queryFn: () => billingApi.list(), retry: false, refetchInterval: 30000 });
  const BILLING_RECORDS: any[] = (apiData?.bills ?? []).map((b: any) => ({
    ...b, id: b.billId || b._id || b.id,
  }));

  const filtered = BILLING_RECORDS.filter((b: any) => {
    const q = search.toLowerCase();
    const matchSearch = !q || b.patientName.toLowerCase().includes(q) || (b.id || "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "All" || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalRevenue = BILLING_RECORDS.reduce((a: number, b: any) => a + (b.paid || 0), 0);
  const totalPending = BILLING_RECORDS.reduce((a: number, b: any) => a + (b.balance || 0), 0);
  const paidCount = BILLING_RECORDS.filter((b: any) => b.status === "Paid" || b.status === "Claimed").length;
  const totalAmount = BILLING_RECORDS.reduce((a: number, b: any) => a + (b.amount || 0), 0);
  const collectionRate = totalAmount > 0 ? Math.round((totalRevenue / totalAmount) * 100) : 0;

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Billing & Revenue Cycle</h2>
          <p className="text-sm text-muted-foreground">AI Claims Scrubbing active · {BILLING_RECORDS.filter((b: any) => b.status === "Pending").length} claims pending</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2"><FileText className="h-4 w-4" /> Insurance Portal</Button>
          <Button size="sm" className="gap-2" onClick={() => { setEditBill(null); setModalOpen(true); }}><Plus className="h-4 w-4" /> Generate Bill</Button>
        </div>
      </div>

      {/* AI Claims alert */}
      <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-2.5 flex items-center gap-3">
        <Brain className="h-4 w-4 text-violet-600 shrink-0" />
        <p className="text-sm text-violet-700">
          <span className="font-semibold">AI Claims Scrubbing:</span> 3 claims flagged for missing diagnosis codes. BILL-003 pre-auth pending 48+ hrs — follow up with New India TPA.
        </p>
        <Button size="sm" variant="outline" className="shrink-0">Review Claims</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Billed",     value: formatCurrency(BILLING_RECORDS.reduce((a,b) => a + b.amount, 0)), color: "text-foreground",  bg: "bg-muted",       icon: IndianRupee },
          { label: "Collected",        value: formatCurrency(totalRevenue),  color: "text-green-600", bg: "bg-green-50",    icon: CheckCircle2 },
          { label: "Pending",          value: formatCurrency(totalPending),  color: "text-amber-600", bg: "bg-amber-50",    icon: Clock },
          { label: "Collection Rate",  value: `${collectionRate}%`,          color: "text-teal-600",  bg: "bg-teal-50",     icon: TrendingUp },
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
        {/* Bills list */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patient or bill ID..."
                className="pl-9 h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {["All","Paid","Partial","Pending","Claimed"].map((s) => (
                <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" className="h-9" onClick={() => setStatusFilter(s)}>{s}</Button>
              ))}
            </div>
          </div>

          {filtered.map((bill) => {
            const isOpen = expandedId === bill.id;
            return (
              <Card key={bill.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center shrink-0">
                      <CreditCard className="h-5 w-5 text-teal-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{bill.patientName}</span>
                        <span className="text-xs font-mono text-muted-foreground">{bill.id}</span>
                        <Badge className={`text-xs ${STATUS_COLORS[bill.status] ?? "bg-gray-100"}`}>{bill.status}</Badge>
                        <Badge className="text-xs bg-muted text-muted-foreground">{bill.type || "OPD"}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {bill.createdAt ? new Date(bill.createdAt).toLocaleDateString("en-IN") : bill.date} · {bill.payer} · {bill.paymentMode}
                      </div>
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        <div>
                          <div className="text-xs text-muted-foreground">Total</div>
                          <div className="text-sm font-semibold">{formatCurrency(bill.amount)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Paid</div>
                          <div className="text-sm font-semibold text-green-600">{formatCurrency(bill.paid)}</div>
                        </div>
                        {bill.balance > 0 && (
                          <div>
                            <div className="text-xs text-muted-foreground">Balance</div>
                            <div className="text-sm font-semibold text-amber-600">{formatCurrency(bill.balance)}</div>
                          </div>
                        )}
                        {bill.amount > 0 && (
                          <div className="flex-1 min-w-16">
                            <Progress value={Math.min(100, Math.round(((bill.paid || 0) / bill.amount) * 100))} className="h-1.5 mt-3" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setExpandedId(isOpen ? null : bill.id)}>
                        {isOpen ? "▲" : "▼"} Items
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditBill(bill); setPayOnly(false); setModalOpen(true); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      {(bill.status === "Pending" || bill.status === "Partial") && (
                        <Button size="sm" variant="outline" className="h-7 text-xs text-blue-700 border-blue-300 hover:bg-blue-50"
                          onClick={() => { setEditBill(bill); setPayOnly(true); setModalOpen(true); }}>
                          Record Pay
                        </Button>
                      )}
                      {(bill.status === "Pending" || bill.status === "Partial") && (
                        <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700"
                          disabled={paying === bill.id}
                          onClick={() => markPaid(bill)}>
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {paying === bill.id ? "..." : "Full Pay"}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Line items expand */}
                  {isOpen && bill.items?.length > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <div className="grid grid-cols-12 gap-1 text-xs font-semibold text-muted-foreground mb-1 px-1">
                        <span className="col-span-5">Description</span>
                        <span className="col-span-3">Category</span>
                        <span className="col-span-1 text-center">Qty</span>
                        <span className="col-span-1 text-right">Price</span>
                        <span className="col-span-2 text-right">Total</span>
                      </div>
                      {bill.items.map((item: any, idx: number) => (
                        <div key={idx} className="grid grid-cols-12 gap-1 text-xs py-1 px-1 even:bg-muted/30 rounded">
                          <span className="col-span-5 font-medium">{item.description}</span>
                          <span className="col-span-3 text-muted-foreground">{item.category}</span>
                          <span className="col-span-1 text-center text-muted-foreground">{item.quantity}</span>
                          <span className="col-span-1 text-right text-muted-foreground">₹{item.unitPrice?.toLocaleString()}</span>
                          <span className="col-span-2 text-right font-medium">₹{item.total?.toLocaleString()}</span>
                        </div>
                      ))}
                      {bill.discount > 0 && (
                        <div className="text-xs text-right text-amber-600 mt-1 px-1">Discount: -₹{bill.discount?.toLocaleString()}</div>
                      )}
                    </div>
                  )}
                  {isOpen && (!bill.items || bill.items.length === 0) && (
                    <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">No line items recorded.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Right panel */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">AI Revenue Intelligence</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {[
                { type: "Denial Risk",       msg: "BILL-004 (TPA Corp) — 68% denial risk. Missing pre-auth reference number. Fix before submission.", sev: "warning" },
                { type: "Leakage Detected",  msg: "2 unbilled procedure codes found for Ramesh Babu (angioplasty report charges).",                    sev: "critical" },
                { type: "Contract Insight",  msg: "Star Health reimbursement rate is 12% below market. Renegotiation recommended.",                    sev: "info" },
              ].map((alert, i) => (
                <div key={i} className={`rounded-xl p-2.5 border ${
                  alert.sev === "critical" ? "bg-red-50 border-red-200" :
                  alert.sev === "warning"  ? "bg-amber-50 border-amber-200" :
                  "bg-blue-50 border-blue-200"
                }`}>
                  <div className={`font-semibold mb-0.5 ${
                    alert.sev === "critical" ? "text-red-700" :
                    alert.sev === "warning"  ? "text-amber-700" : "text-blue-700"
                  }`}>{alert.type}</div>
                  <p className="text-muted-foreground leading-snug">{alert.msg}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Payer Mix</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {[
                { payer: "Cash",       pct: 35, amount: "₹99K" },
                { payer: "Star Health",pct: 28, amount: "₹79K" },
                { payer: "New India",  pct: 22, amount: "₹62K" },
                { payer: "TPA Corp",   pct: 10, amount: "₹28K" },
                { payer: "Others",     pct: 5,  amount: "₹14K" },
              ].map((p) => (
                <div key={p.payer}>
                  <div className="flex justify-between mb-1">
                    <span className="text-muted-foreground">{p.payer}</span>
                    <span className="font-medium">{p.pct}% · {p.amount}</span>
                  </div>
                  <Progress value={p.pct} className="h-1.5" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Claims Tracker</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs">
              {[
                ["Submitted",       "12"],
                ["Under Processing","8"],
                ["Approved",        "18"],
                ["Denied",          "4"],
                ["Denial Rate",     "18.2%"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1 border-b border-border last:border-0">
                  <span className="text-muted-foreground">{k}</span>
                  <span className={`font-medium ${k === "Denied" || k === "Denial Rate" ? "text-red-600" : k === "Approved" ? "text-green-600" : ""}`}>{v}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <BillingModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditBill(null); setPayOnly(false); }}
        existing={editBill}
        payOnly={payOnly}
      />
    </div>
  );
}
