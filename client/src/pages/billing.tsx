import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  CreditCard, Search, Plus, CheckCircle2, Clock,
  TrendingUp, IndianRupee, Pencil, Printer, ChevronDown,
  ChevronUp, FileText, Download, Banknote, Wallet,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { billing as billingApi } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { printBill } from "@/lib/print";
import BillingModal from "@/components/modals/BillingModal";
import ModalErrorBoundary from "@/components/ModalErrorBoundary";

// ── constants ──────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  Paid:    "bg-green-100 text-green-700",
  Partial: "bg-amber-100 text-amber-700",
  Pending: "bg-red-100 text-red-700",
  Claimed: "bg-blue-100 text-blue-700",
};
function PaymentIcon({ mode }: { mode: string }) {
  if (mode === "Cash")      return <Banknote className="h-3 w-3" />;
  if (mode === "Card")      return <CreditCard className="h-3 w-3" />;
  if (mode === "Insurance") return <FileText className="h-3 w-3" />;
  return <Wallet className="h-3 w-3" />;
}
const TYPE_TABS = ["All", "OPD", "IPD", "Emergency", "Lab", "Pharmacy"];

// ── component ──────────────────────────────────────────────────────────────────
export default function BillingPage() {
  const qc = useQueryClient();

  const [search,      setSearch]      = useState("");
  const [typeFilter,  setTypeFilter]  = useState("All");
  const [statusFilter,setStatusFilter]= useState("All");
  const [dateFilter,  setDateFilter]  = useState("all");
  const [dateFrom,    setDateFrom]    = useState("");
  const [dateTo,      setDateTo]      = useState("");
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editBill,    setEditBill]    = useState<any>(null);
  const [payOnly,     setPayOnly]     = useState(false);
  const [paying,      setPaying]      = useState<string | null>(null);
  const [expandedId,  setExpandedId]  = useState<string | null>(null);

  const { data: apiData, isLoading } = useQuery({
    queryKey: ["billing"],
    queryFn: () => billingApi.list(),
    retry: false,
    refetchInterval: 30_000,
  });
  const ALL_BILLS: any[] = (apiData?.bills ?? []).map((b: any) => ({
    ...b, id: b.billId || b._id || b.id,
  }));

  // ── date helpers ─────────────────────────────────────────────────────────
  const withinDate = (bill: any) => {
    if (!bill.createdAt) return true;
    const d   = new Date(bill.createdAt);
    const now = new Date();
    if (dateFilter === "today") {
      return d.toDateString() === now.toDateString();
    }
    if (dateFilter === "week") {
      const ago = new Date(now); ago.setDate(now.getDate() - 7);
      return d >= ago;
    }
    if (dateFilter === "month") {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (dateFilter === "custom") {
      const from = dateFrom ? new Date(dateFrom) : null;
      const to   = dateTo   ? new Date(dateTo + "T23:59:59") : null;
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    }
    return true; // "all"
  };

  const filtered = ALL_BILLS.filter((b: any) => {
    const q = search.toLowerCase();
    const matchSearch  = !q || b.patientName?.toLowerCase().includes(q) || (b.id || "").toLowerCase().includes(q) || b.doctor?.toLowerCase().includes(q);
    const matchType    = typeFilter === "All" || b.type === typeFilter;
    const matchStatus  = statusFilter === "All" || b.status === statusFilter;
    const matchDate    = withinDate(b);
    return matchSearch && matchType && matchStatus && matchDate;
  });

  // ── summary stats ─────────────────────────────────────────────────────────
  const totalBilled    = ALL_BILLS.reduce((a, b) => a + (b.amount || 0), 0);
  const totalCollected = ALL_BILLS.reduce((a, b) => a + (b.paid   || 0), 0);
  const totalPending   = ALL_BILLS.reduce((a, b) => a + (b.balance || 0), 0);
  const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;
  const todayRevenue   = ALL_BILLS.filter(withinDate).filter((b) => dateFilter === "all"
    ? new Date(b.createdAt).toDateString() === new Date().toDateString()
    : true
  ).reduce((a, b) => a + (b.paid || 0), 0);

  // type breakdown
  const byType = TYPE_TABS.slice(1).map((t) => ({
    type: t,
    count:  ALL_BILLS.filter((b) => b.type === t).length,
    amount: ALL_BILLS.filter((b) => b.type === t).reduce((a, b) => a + (b.amount || 0), 0),
  }));

  const markPaid = async (bill: any) => {
    if (!confirm(`Mark ${bill.id} as fully paid (₹${bill.amount?.toLocaleString()})?`)) return;
    setPaying(bill.id);
    try {
      await billingApi.update(bill._id || bill.id, { paid: bill.amount, status: "Paid" });
      qc.invalidateQueries({ queryKey: ["billing"] });
    } finally {
      setPaying(null);
    }
  };

  const openNew    = () => { setEditBill(null); setPayOnly(false); setModalOpen(true); };
  const openEdit   = (bill: any) => { setEditBill(bill); setPayOnly(false); setModalOpen(true); };
  const openPayment= (bill: any) => { setEditBill(bill); setPayOnly(true);  setModalOpen(true); };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Billing & Revenue</h2>
          <p className="text-sm text-muted-foreground">
            {ALL_BILLS.filter((b) => b.status === "Pending").length} pending ·&nbsp;
            {ALL_BILLS.filter((b) => b.status === "Partial").length} partial ·&nbsp;
            {ALL_BILLS.length} total bills
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-2 h-9">
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button size="sm" className="gap-2 h-9" onClick={openNew}>
            <Plus className="h-4 w-4" /> Generate Bill
          </Button>
        </div>
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Billed",    value: formatCurrency(totalBilled),    color: "text-foreground",  bg: "bg-muted",      icon: IndianRupee },
          { label: "Collected",       value: formatCurrency(totalCollected), color: "text-green-600",  bg: "bg-green-50",   icon: CheckCircle2 },
          { label: "Balance Due",     value: formatCurrency(totalPending),   color: "text-amber-600",  bg: "bg-amber-50",   icon: Clock },
          { label: "Collection Rate", value: `${collectionRate}%`,           color: "text-teal-600",   bg: "bg-teal-50",    icon: TrendingUp },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center shrink-0`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div>
                <div className={`text-xl font-bold leading-tight ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Revenue collection bar ────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2 text-sm">
            <span className="font-semibold">Collection Progress</span>
            <span className="text-muted-foreground">{formatCurrency(totalCollected)} of {formatCurrency(totalBilled)}</span>
          </div>
          <Progress value={collectionRate} className="h-2.5" />
          <div className="flex gap-6 mt-3 text-xs flex-wrap">
            {byType.filter((t) => t.count > 0).map((t) => (
              <button
                key={t.type}
                onClick={() => setTypeFilter(typeFilter === t.type ? "All" : t.type)}
                className={`flex flex-col transition-opacity ${typeFilter !== "All" && typeFilter !== t.type ? "opacity-40" : ""}`}
              >
                <span className="font-semibold text-sm">{t.count}</span>
                <span className="text-muted-foreground">{t.type} bills</span>
                <span className="text-teal-600">{formatCurrency(t.amount)}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Filters row ───────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {/* Type tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {TYPE_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                typeFilter === t
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {t}
              {t !== "All" && (
                <span className="ml-1.5 opacity-70">
                  {ALL_BILLS.filter((b) => b.type === t).length}
                </span>
              )}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            {[
              { key: "today",  label: "Today" },
              { key: "week",   label: "7 Days" },
              { key: "month",  label: "Month" },
              { key: "custom", label: "Custom Range" },
              { key: "all",    label: "All Time" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setDateFilter(key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                  dateFilter === key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date range inputs */}
        {dateFilter === "custom" && (
          <div className="flex items-center gap-3 p-3 bg-muted/40 border border-border rounded-xl">
            <span className="text-xs font-medium text-muted-foreground shrink-0">Date Range:</span>
            <div className="flex items-center gap-2 flex-1">
              <Input
                type="date"
                className="h-8 text-sm w-40"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <span className="text-muted-foreground text-xs">to</span>
              <Input
                type="date"
                className="h-8 text-sm w-40"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground"
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                >
                  Clear
                </Button>
              )}
            </div>
            {dateFrom && dateTo && (
              <span className="text-xs text-teal-600 font-medium shrink-0">
                {filtered.length} bills in range
              </span>
            )}
          </div>
        )}

        {/* Search + status */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search patient, bill ID, doctor…" className="pl-9 h-9"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {["All","Paid","Partial","Pending","Claimed"].map((s) => (
              <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" className="h-9"
                onClick={() => setStatusFilter(s)}>
                {s}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bills list ────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {isLoading && (
          <div className="text-center py-12 text-sm text-muted-foreground">Loading bills…</div>
        )}

        {!isLoading && filtered.length === 0 && (
          <Card>
            <CardContent className="py-14 text-center space-y-2">
              <IndianRupee className="h-10 w-10 text-muted-foreground/20 mx-auto" />
              <p className="text-sm text-muted-foreground font-medium">No bills found</p>
              <p className="text-xs text-muted-foreground">Try changing the filters or generate a new bill.</p>
              <Button size="sm" className="mt-3 gap-1.5" onClick={openNew}>
                <Plus className="h-3.5 w-3.5" /> Generate Bill
              </Button>
            </CardContent>
          </Card>
        )}

        {filtered.map((bill) => {
          const isOpen     = expandedId === bill.id;
          const paidPct    = bill.amount > 0 ? Math.min(100, Math.round(((bill.paid || 0) / bill.amount) * 100)) : 0;
          const billDate   = bill.createdAt ? new Date(bill.createdAt).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }) : "—";

          return (
            <Card key={bill.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center shrink-0">
                    <CreditCard className="h-5 w-5 text-teal-600" />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{bill.patientName}</span>
                      <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 rounded">{bill.id}</span>
                      <Badge className={`text-xs ${STATUS_COLORS[bill.status] ?? "bg-gray-100"}`}>{bill.status}</Badge>
                      <Badge className="text-xs bg-muted text-muted-foreground">{bill.type || "OPD"}</Badge>
                      {bill.doctor && (
                        <span className="text-xs text-muted-foreground hidden sm:inline">· {bill.doctor}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span>{billDate}</span>
                      <span className="flex items-center gap-1">
                        <PaymentIcon mode={bill.paymentMode} />
                        {bill.paymentMode}
                      </span>
                      <span>{bill.payer}</span>
                    </div>

                    <div className="flex items-center gap-5 mt-2 flex-wrap">
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</div>
                        <div className="text-sm font-bold">{formatCurrency(bill.amount)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Paid</div>
                        <div className="text-sm font-semibold text-green-600">{formatCurrency(bill.paid)}</div>
                      </div>
                      {bill.balance > 0 && (
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Balance</div>
                          <div className="text-sm font-semibold text-amber-600">{formatCurrency(bill.balance)}</div>
                        </div>
                      )}
                      {bill.amount > 0 && (
                        <div className="flex-1 min-w-24 max-w-48">
                          <Progress value={paidPct} className="h-1.5" />
                          <div className="text-[10px] text-muted-foreground mt-0.5">{paidPct}% collected</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Print Receipt"
                        onClick={() => printBill(bill)}>
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Edit"
                        onClick={() => openEdit(bill)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                        title={isOpen ? "Collapse" : "View items"}
                        onClick={() => setExpandedId(isOpen ? null : bill.id)}>
                        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                    {(bill.status === "Pending" || bill.status === "Partial") && (
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" className="h-7 text-xs text-blue-700 border-blue-300 hover:bg-blue-50 px-2"
                          onClick={() => openPayment(bill)}>
                          Record Pay
                        </Button>
                        <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 px-2"
                          disabled={paying === bill.id} onClick={() => markPaid(bill)}>
                          {paying === bill.id ? "…" : "Full Pay"}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded line items */}
                {isOpen && (
                  <div className="mt-3 pt-3 border-t">
                    {bill.items?.length > 0 ? (
                      <>
                        <div className="grid grid-cols-[2fr_1fr_40px_70px_80px] gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
                          <span>Description</span>
                          <span>Category</span>
                          <span className="text-center">Qty</span>
                          <span className="text-right">Rate</span>
                          <span className="text-right">Amount</span>
                        </div>
                        {bill.items.map((item: any, idx: number) => (
                          <div key={idx} className="grid grid-cols-[2fr_1fr_40px_70px_80px] gap-2 text-xs py-1.5 px-1 even:bg-muted/30 rounded items-center">
                            <span className="font-medium">{item.description}</span>
                            <span className="text-muted-foreground">{item.category}</span>
                            <span className="text-center text-muted-foreground">{item.quantity}</span>
                            <span className="text-right text-muted-foreground">₹{(item.unitPrice || 0).toLocaleString()}</span>
                            <span className="text-right font-semibold">₹{(item.total || 0).toLocaleString()}</span>
                          </div>
                        ))}
                        {bill.discount > 0 && (
                          <div className="text-xs text-right text-amber-600 mt-1 px-1">
                            Discount: −₹{bill.discount?.toLocaleString()}
                          </div>
                        )}
                        {bill.notes && (
                          <p className="text-xs text-muted-foreground mt-2 px-1 italic">Note: {bill.notes}</p>
                        )}
                        <div className="mt-2 flex justify-end">
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                            onClick={() => printBill(bill)}>
                            <Printer className="h-3 w-3" /> Print Receipt
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-2">No line items recorded.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Daily summary footer ─────────────────────────────────────────── */}
      {ALL_BILLS.length > 0 && (
        <Card className="bg-teal-50 border-teal-100">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide">Today's Revenue</p>
                <p className="text-2xl font-bold text-teal-800">
                  {formatCurrency(ALL_BILLS.filter((b) => new Date(b.createdAt).toDateString() === new Date().toDateString()).reduce((a, b) => a + (b.paid || 0), 0))}
                </p>
              </div>
              <div className="flex gap-6 text-sm">
                {["Paid","Partial","Pending"].map((s) => (
                  <div key={s} className="text-center">
                    <p className={`text-xl font-bold ${s === "Paid" ? "text-green-600" : s === "Partial" ? "text-amber-600" : "text-red-600"}`}>
                      {ALL_BILLS.filter((b) => b.status === s).length}
                    </p>
                    <p className="text-xs text-muted-foreground">{s}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <ModalErrorBoundary>
        <BillingModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditBill(null); setPayOnly(false); }}
          existing={editBill}
          payOnly={payOnly}
        />
      </ModalErrorBoundary>
    </div>
  );
}
