import { useState, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CreditCard, Search, Plus, CheckCircle2, Clock,
  TrendingUp, IndianRupee, Pencil, Printer, ChevronDown,
  ChevronUp, FileText, Download, Banknote, Wallet, Users, User,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { billing as billingApi } from "@/lib/api";
import { formatCurrency, formatCurrencyFull } from "@/lib/utils";
import { printBill, printSalesReport } from "@/lib/print";
import BillingModal from "@/components/modals/BillingModal";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { confirm } from "@/hooks/use-confirm";

// ── constants ──────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  Draft:   "bg-slate-100 text-slate-600",
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
function todayLocalStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── component ──────────────────────────────────────────────────────────────────
export default function BillingPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "finance";

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

  const [staffFilter,   setStaffFilter]   = useState<string | null>(null);

  // By Staff view
  const [view,          setView]         = useState<"list" | "staff">("list");
  const [staffDateFrom, setStaffDateFrom] = useState(todayLocalStr);
  const [staffDateTo,   setStaffDateTo]   = useState(todayLocalStr);
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set());

  const toggleStaffExpand = (name: string) =>
    setExpandedStaff(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const { data: staffReport = [], isLoading: staffLoading } = useQuery({
    queryKey: ["billing-by-staff", staffDateFrom, staffDateTo],
    queryFn: () => billingApi.salesByStaff({ from: staffDateFrom || undefined, to: staffDateTo || undefined }),
    enabled: view === "staff",
    retry: false,
  });

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
    const matchStaff   = !staffFilter || b.createdBy === staffFilter;
    return matchSearch && matchType && matchStatus && matchDate && matchStaff;
  });

  const staffOptions = Array.from(new Set(ALL_BILLS.map((b) => b.createdBy).filter(Boolean))).sort();

  // ── summary stats ─────────────────────────────────────────────────────────
  // Drafts can carry a non-zero computed amount before they're finalized — exclude
  // them from financial totals so "Total Billed"/"Balance Due" only reflect real invoices.
  const billableBills  = ALL_BILLS.filter((b) => b.status !== "Draft");
  const totalBilled    = billableBills.reduce((a, b) => a + (b.amount || 0), 0);
  const totalCollected = billableBills.reduce((a, b) => a + (b.paid   || 0), 0);
  const totalPending   = billableBills.reduce((a, b) => a + (b.balance || 0), 0);
  const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;
  const todaysRevenue  = billableBills
    .filter((b) => new Date(b.createdAt).toDateString() === new Date().toDateString())
    .reduce((a, b) => a + (b.paid || 0), 0);

  // type breakdown
  const byType = TYPE_TABS.slice(1).map((t) => ({
    type: t,
    count:  billableBills.filter((b) => b.type === t).length,
    amount: billableBills.filter((b) => b.type === t).reduce((a, b) => a + (b.amount || 0), 0),
  }));

  const markPaid = async (bill: any) => {
    const ok = await confirm({
      title: `Mark ${bill.id} as fully paid?`,
      description: `₹${bill.amount?.toLocaleString()} will be recorded as paid in full.`,
      confirmText: "Mark Paid",
    });
    if (!ok) return;
    setPaying(bill.id);
    try {
      await billingApi.update(bill._id || bill.id, { paid: bill.amount, status: "Paid" });
      qc.invalidateQueries({ queryKey: ["billing"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Payment failed", description: err.message || "Failed to mark bill as paid." });
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
          {!isAdmin && (
            <p className="text-xs text-teal-600 mt-0.5">
              Showing bills created by <strong>{user?.name}</strong>
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          <div className="flex items-center border rounded-lg p-0.5 bg-muted/40">
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${view === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Bills List
            </button>
            <button
              onClick={() => setView("staff")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${view === "staff" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {isAdmin ? <Users className="h-3 w-3" /> : <User className="h-3 w-3" />}
              {isAdmin ? "By Staff" : "My Report"}
            </button>
          </div>
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

      {/* ── Today's Revenue ──────────────────────────────────────────────── */}
      {view === "list" && (
        <Card className="bg-teal-50 border-teal-100">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide">Today's Revenue</p>
                <p className="text-2xl font-bold text-teal-800">
                  {formatCurrencyFull(todaysRevenue)}
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

      {/* ── By Staff Report ───────────────────────────────────────────────── */}
      {view === "staff" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium shrink-0">Date Range:</span>
                <Input type="date" className="h-8 text-sm w-40" value={staffDateFrom} onChange={(e) => setStaffDateFrom(e.target.value)} />
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="date" className="h-8 text-sm w-40" value={staffDateTo} onChange={(e) => setStaffDateTo(e.target.value)} />
                {(staffDateFrom || staffDateTo) && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setStaffDateFrom(""); setStaffDateTo(""); }}>Clear</Button>
                )}
                <div className="ml-auto">
                  <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={staffReport.length === 0}
                    onClick={() => printSalesReport(staffReport, { from: staffDateFrom, to: staffDateTo })}>
                    <Printer className="h-4 w-4" /> Print Report
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {isAdmin ? (
            <>
              {staffReport.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Staff Members",   value: String(staffReport.length),                                                                              color: "text-foreground",  bg: "bg-muted" },
                    { label: "Total Billed",    value: formatCurrencyFull(staffReport.reduce((a: number, r: any) => a + (r.totalBilled   || 0), 0)),                color: "text-foreground",  bg: "bg-muted" },
                    { label: "Total Collected", value: formatCurrencyFull(staffReport.reduce((a: number, r: any) => a + (r.totalPaid     || 0), 0)),                color: "text-green-600",  bg: "bg-green-50" },
                    { label: "Cash Received",   value: formatCurrencyFull(staffReport.reduce((a: number, r: any) => a + (r.totalReceived || 0), 0)),                color: "text-teal-600",   bg: "bg-teal-50" },
                  ].map((s) => (
                    <Card key={s.label}>
                      <CardContent className="p-4">
                        <div className={`text-xl font-bold leading-tight ${s.color}`}>{s.value}</div>
                        <div className="text-xs text-muted-foreground">{s.label}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {staffLoading ? (
                <div className="text-center py-12 text-sm text-muted-foreground">Loading report…</div>
              ) : staffReport.length === 0 ? (
                <Card>
                  <CardContent className="py-14 text-center space-y-2">
                    <Users className="h-10 w-10 text-muted-foreground/20 mx-auto" />
                    <p className="text-sm text-muted-foreground font-medium">No billing records found</p>
                    <p className="text-xs text-muted-foreground">Try a different date range.</p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            {["#", "Staff Name", "Bills Created", "Total Billed", "Collected", "Payments #", "Cash Received", ""].map((h, i) => (
                              <th key={i} className={`py-2.5 px-4 text-xs font-semibold text-muted-foreground ${i === 0 || i === 1 ? "text-left" : "text-right"}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {staffReport.map((row: any, idx: number) => {
                            const breakdown: Record<string, number> = row.paymentBreakdown || {};
                            const activeModePairs = (["Cash", "Card", "UPI", "Insurance", "Online", "Advance-Adjustment"] as const)
                              .map(m => ({ mode: m, amount: breakdown[m] || 0 }))
                              .filter(p => p.amount > 0);
                            const isExpanded = expandedStaff.has(row.staffName);
                            return (
                              <Fragment key={row.staffName}>
                                <tr className="border-b hover:bg-muted/20">
                                  <td className="py-3 px-4 text-muted-foreground">{idx + 1}</td>
                                  <td className="py-3 px-4 font-medium">{row.staffName}</td>
                                  <td className="py-3 px-4 text-right">{row.billsCreated}</td>
                                  <td className="py-3 px-4 text-right font-medium">{formatCurrencyFull(row.totalBilled)}</td>
                                  <td className="py-3 px-4 text-right text-green-600 font-medium">{formatCurrencyFull(row.totalPaid)}</td>
                                  <td className="py-3 px-4 text-right">{row.paymentsCount}</td>
                                  <td className="py-3 px-4 text-right text-teal-600 font-medium">{formatCurrencyFull(row.totalReceived)}</td>
                                  <td className="py-3 px-4 text-right">
                                    {activeModePairs.length > 0 && (
                                      <button
                                        onClick={() => toggleStaffExpand(row.staffName)}
                                        className="p-1 rounded hover:bg-muted text-muted-foreground"
                                        title={isExpanded ? "Hide breakdown" : "Show payment breakdown"}
                                      >
                                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                                {isExpanded && activeModePairs.length > 0 && (
                                  <tr className="bg-muted/10 border-b">
                                    <td />
                                    <td colSpan={7} className="py-2 px-4 pb-3">
                                      <div className="flex flex-wrap gap-x-5 gap-y-1 pl-2 border-l-2 border-muted-foreground/20">
                                        {activeModePairs.map(({ mode, amount }) => (
                                          <div key={mode} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <span className="font-medium text-foreground">{mode}</span>
                                            <span className="text-teal-600 font-semibold">{formatCurrencyFull(amount)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                          <tr className="border-t bg-muted/40 font-semibold">
                            <td className="py-3 px-4" colSpan={2}>Total</td>
                            <td className="py-3 px-4 text-right">{staffReport.reduce((a: number, r: any) => a + (r.billsCreated  || 0), 0)}</td>
                            <td className="py-3 px-4 text-right">{formatCurrencyFull(staffReport.reduce((a: number, r: any) => a + (r.totalBilled   || 0), 0))}</td>
                            <td className="py-3 px-4 text-right text-green-600">{formatCurrencyFull(staffReport.reduce((a: number, r: any) => a + (r.totalPaid     || 0), 0))}</td>
                            <td className="py-3 px-4 text-right">{staffReport.reduce((a: number, r: any) => a + (r.paymentsCount || 0), 0)}</td>
                            <td className="py-3 px-4 text-right text-teal-600">{formatCurrencyFull(staffReport.reduce((a: number, r: any) => a + (r.totalReceived || 0), 0))}</td>
                            <td />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <>
              {staffLoading ? (
                <div className="text-center py-12 text-sm text-muted-foreground">Loading report…</div>
              ) : staffReport.length === 0 ? (
                <Card>
                  <CardContent className="py-14 text-center space-y-2">
                    <User className="h-10 w-10 text-muted-foreground/20 mx-auto" />
                    <p className="text-sm text-muted-foreground font-medium">No billing activity found</p>
                    <p className="text-xs text-muted-foreground">Try a different date range.</p>
                  </CardContent>
                </Card>
              ) : (() => {
                const myRow = staffReport[0];
                const breakdown: Record<string, number> = myRow.paymentBreakdown || {};
                const activeModePairs = (["Cash", "Card", "UPI", "Insurance", "Online", "Advance-Adjustment"] as const)
                  .map(m => ({ mode: m, amount: breakdown[m] || 0 }))
                  .filter(p => p.amount > 0);
                return (
                  <>
                    <p className="text-xs text-muted-foreground -mt-1">Your billing summary for the selected date range.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: "Bills Created",   value: String(myRow.billsCreated || 0),          color: "text-foreground",  bg: "bg-muted" },
                        { label: "Total Billed",    value: formatCurrencyFull(myRow.totalBilled || 0),    color: "text-foreground",  bg: "bg-muted" },
                        { label: "Total Collected", value: formatCurrencyFull(myRow.totalPaid || 0),      color: "text-green-600",   bg: "bg-green-50" },
                        { label: "Cash Received",   value: formatCurrencyFull(myRow.totalReceived || 0),  color: "text-teal-600",    bg: "bg-teal-50" },
                      ].map((s) => (
                        <Card key={s.label}>
                          <CardContent className="p-4">
                            <div className={`text-xl font-bold leading-tight ${s.color}`}>{s.value}</div>
                            <div className="text-xs text-muted-foreground">{s.label}</div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    {activeModePairs.length > 0 && (
                      <Card>
                        <CardContent className="p-4">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Payments by mode</p>
                          <div className="flex flex-wrap gap-x-6 gap-y-2">
                            {activeModePairs.map(({ mode, amount }) => (
                              <div key={mode} className="flex items-center gap-1.5 text-sm">
                                <span className="font-medium text-foreground">{mode}</span>
                                <span className="text-teal-600 font-semibold">{formatCurrencyFull(amount)}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* ── Filters row ───────────────────────────────────────────────────── */}
      {view === "list" && <div className="space-y-2">
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
          {isAdmin && staffOptions.length > 0 && (
            <Select value={staffFilter ?? "All"} onValueChange={(v) => setStaffFilter(v === "All" ? null : v)}>
              <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="Staff" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Staff</SelectItem>
                {staffOptions.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex gap-1.5 flex-wrap">
            {["All","Draft","Paid","Partial","Pending","Claimed"].map((s) => (
              <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" className="h-9"
                onClick={() => setStatusFilter(s)}>
                {s}
              </Button>
            ))}
          </div>
        </div>
      </div>}

      {/* ── Bills list ────────────────────────────────────────────────────── */}
      {view === "list" && <div className="space-y-2">
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
                            <span className="font-medium leading-tight">
                              {item.description}
                              {item.batchNo && (
                                <span className="block text-[10px] text-muted-foreground font-normal">
                                  Batch: {item.batchNo}{item.expiryDate ? ` · Exp: ${new Date(item.expiryDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}` : ""}
                                </span>
                              )}
                            </span>
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
      </div>}


      <AppErrorBoundary>
        <BillingModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditBill(null); setPayOnly(false); }}
          existing={editBill}
          payOnly={payOnly}
        />
      </AppErrorBoundary>
    </div>
  );
}
