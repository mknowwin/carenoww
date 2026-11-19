import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";
import { AlertTriangle, AlertOctagon, Info, Search, X, Activity, Download, Loader2, Printer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReportTable, { ReportColumn } from "@/components/insights/ReportTable";
import { pharmacy as pharmacyApi } from "@/lib/api";
import { todayInTz } from "@/lib/utils";
import { downloadDrugLedgerPdf } from "@/lib/drugLedgerPdf";
import { printDrugLedger } from "@/lib/print";
import { toast } from "@/hooks/use-toast";

interface Props {
  drugs: any[];             // full active catalog (["pharmacy-inventory","full"])
  drugId: string | null;    // selected drug (controlled, so Inventory's "Track" can set it)
  onDrugChange: (id: string | null) => void;
  timezone: string;
}

const shiftDays = (dateStr: string, days: number) => {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const fmtDate = (v: any) => (v ? format(new Date(v), "dd MMM yyyy") : "—");
const fmtDateTime = (v: any) => (v ? format(new Date(v), "dd MMM yyyy, h:mm a") : "—");
const inr = (n: number) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

const TYPE_STYLE: Record<string, string> = {
  Opening: "bg-slate-100 text-slate-700",
  GRN: "bg-emerald-100 text-emerald-700",
  Sale: "bg-blue-100 text-blue-700",
  Cancel: "bg-amber-100 text-amber-700",
  Return: "bg-teal-100 text-teal-700",
  Adjustment: "bg-orange-100 text-orange-700",
  Manual: "bg-rose-100 text-rose-700",
  BillEdit: "bg-purple-100 text-purple-700",
};
const TYPE_LABEL: Record<string, string> = { BillEdit: "Bill edit", Manual: "Manual edit" };

const BATCH_STYLE: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-700",
  Exhausted: "bg-slate-100 text-slate-600",
  Expired: "bg-red-100 text-red-700",
  Quarantine: "bg-amber-100 text-amber-700",
  Cancelled: "bg-slate-100 text-slate-500 line-through",
};

export default function DrugTrackingTab({ drugs, drugId, onDrugChange, timezone }: Props) {
  const today = todayInTz(timezone);
  const [from, setFrom] = useState(shiftDays(today, -89));
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const selected = useMemo(() => drugs.find((d) => d._id === drugId) ?? null, [drugs, drugId]);
  useEffect(() => { if (selected) setSearch(selected.name); }, [selected]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || (selected && q === selected.name.toLowerCase())) return drugs.slice(0, 12);
    return drugs.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 12);
  }, [drugs, search, selected]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["pharmacy-drug-tracking", drugId, from, to],
    queryFn: () => pharmacyApi.drugTracking(drugId!, from, to),
    enabled: !!drugId && !!from && !!to && from <= to,
    retry: false,
  });

  const t: any = data;
  const s = t?.summary;
  const unit = t?.drug?.unit || "units";

  const ledgerRows = useMemo(() => (t?.ledger ?? []).filter((r: any) => r.inPeriod), [t]);
  const grnRows = useMemo(() => (t?.grns ?? []).filter((g: any) => g.inPeriod), [t]);
  const billRows = useMemo(() => (t?.bills ?? []).filter((b: any) => b.inPeriod), [t]);
  const backRows = useMemo(() => [
    ...(t?.cancellations ?? []).map((c: any) => ({ kind: "Cancelled bill", ref: c.billId, at: c.at, quantity: c.quantity, party: c.by, note: c.stillCancelled ? "" : "Bill edited after cancelling" })),
    ...(t?.returns ?? []).map((r: any) => ({ kind: "Return (credit note)", ref: r.creditNoteId, at: r.date, quantity: r.quantity, party: r.patientName, note: r.originalBillNo ? `On ${r.originalBillNo}${r.batchNos ? ` · batch ${r.batchNos}` : ""}` : "" })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()), [t]);
  const adjRows = useMemo(() => [
    ...(t?.adjustments ?? []).map((a: any) => ({ kind: a.type, ref: a.adjustmentId, at: a.date, quantity: a.quantity, party: a.by, note: `${a.before} → ${a.after}${a.reason ? ` · ${a.reason}` : ""}` })),
    ...(t?.billEdits ?? []).map((e: any) => ({ kind: "Bill edit", ref: e.billId, at: e.at, quantity: e.qty, party: e.by, note: e.change })),
    ...(t?.ledger ?? []).filter((r: any) => r.type === "Manual").map((r: any) => ({ kind: "Manual stock edit", ref: "—", at: r.at, quantity: r.qty, party: r.party, note: r.note })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()), [t]);

  const ledgerCols: ReportColumn[] = [
    { key: "at", label: "Date", render: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.at)}</span> },
    { key: "type", label: "Type", render: (r) => <Badge className={`${TYPE_STYLE[r.type]} border-0 font-medium`}>{TYPE_LABEL[r.type] ?? r.type}</Badge> },
    { key: "ref", label: "Ref", render: (r) => <span className="font-mono text-xs">{r.ref}</span> },
    { key: "party", label: "Party" },
    { key: "batchNo", label: "Batch", render: (r) => <span className="font-mono text-xs">{r.batchNo || "—"}</span> },
    { key: "qty", label: "Qty", align: "right", render: (r) => <span className={`font-semibold ${r.qty > 0 ? "text-emerald-600" : "text-red-600"}`}>{signed(r.qty)}</span> },
    { key: "balance", label: "Balance", align: "right", render: (r) => <span className={r.balance <= 0 ? "font-semibold text-red-600" : "font-medium"}>{r.balance}</span> },
    { key: "note", label: "Note", render: (r) => <span className="text-xs text-muted-foreground">{r.note}</span> },
  ];
  const grnCols: ReportColumn[] = [
    { key: "receivedDate", label: "Received", render: (g) => <span className="whitespace-nowrap">{fmtDate(g.receivedDate)}</span> },
    { key: "grnId", label: "GRN", render: (g) => <span className="font-mono text-xs">{g.grnId}</span> },
    { key: "supplierName", label: "Supplier" },
    { key: "invoiceNo", label: "Invoice", render: (g) => g.invoiceNo || "—" },
    { key: "batchNo", label: "Batch", render: (g) => <span className="font-mono text-xs">{g.batchNo}</span> },
    { key: "expiryDate", label: "Expiry", render: (g) => fmtDate(g.expiryDate) },
    { key: "quantity", label: "Qty", align: "right", render: (g) => <span className="font-semibold">{g.quantity}</span> },
    { key: "purchasePricePerUnit", label: "Cost/unit", align: "right", render: (g) => inr(g.purchasePricePerUnit) },
    { key: "mrpPerUnit", label: "MRP", align: "right", render: (g) => inr(g.mrpPerUnit) },
    { key: "status", label: "Status", render: (g) => (
      <div className="flex gap-1 flex-wrap">
        <Badge variant="outline" className={g.status === "Cancelled" ? "text-red-600 border-red-200" : g.status === "Draft" ? "text-amber-600 border-amber-200" : ""}>{g.status}</Badge>
        {g.editedAfterReceipt && <Badge variant="outline" className="text-amber-600 border-amber-200">Edited</Badge>}
      </div>
    ) },
  ];
  const billCols: ReportColumn[] = [
    { key: "date", label: "Date", render: (b) => <span className="whitespace-nowrap">{fmtDateTime(b.date)}</span> },
    { key: "billId", label: "Bill", render: (b) => <span className="font-mono text-xs">{b.billId}</span> },
    { key: "patientName", label: "Patient", render: (b) => <div><div>{b.patientName || "—"}</div>{b.patientId && <div className="text-xs text-muted-foreground">{b.patientId}</div>}</div> },
    { key: "type", label: "Type" },
    { key: "batchNos", label: "Batch", render: (b) => <span className="font-mono text-xs">{b.batchNos || "—"}</span> },
    { key: "quantity", label: "Qty", align: "right", render: (b) => <span className="font-semibold">{b.quantity}</span> },
    { key: "unitPrice", label: "Rate", align: "right", render: (b) => inr(b.unitPrice) },
    { key: "total", label: "Amount", align: "right", render: (b) => inr(b.total) },
    { key: "status", label: "Status", render: (b) => <Badge variant="outline" className={b.status === "Cancelled" ? "text-red-600 border-red-200" : ""}>{b.status}</Badge> },
    { key: "createdBy", label: "By", render: (b) => <span className="text-xs text-muted-foreground">{b.createdBy || "—"}</span> },
  ];
  const eventCols: ReportColumn[] = [
    { key: "at", label: "Date", render: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.at)}</span> },
    { key: "kind", label: "Type" },
    { key: "ref", label: "Ref", render: (r) => <span className="font-mono text-xs">{r.ref}</span> },
    { key: "quantity", label: "Qty", align: "right", render: (r) => <span className={`font-semibold ${r.quantity > 0 ? "text-emerald-600" : "text-red-600"}`}>{signed(r.quantity)}</span> },
    { key: "party", label: "By / Patient" },
    { key: "note", label: "Note", render: (r) => <span className="text-xs text-muted-foreground">{r.note}</span> },
  ];
  const batchCols: ReportColumn[] = [
    { key: "batchNo", label: "Batch", render: (b) => <span className="font-mono text-xs">{b.batchNo}</span> },
    { key: "grnNo", label: "Source", render: (b) => b.grnNo || b.supplierName || "—" },
    { key: "receivedAt", label: "Received", render: (b) => fmtDate(b.receivedAt) },
    { key: "expiryDate", label: "Expiry", render: (b) => fmtDate(b.expiryDate) },
    { key: "quantityReceived", label: "Received qty", align: "right" },
    { key: "quantityRemaining", label: "Remaining", align: "right", render: (b) => <span className="font-semibold">{b.quantityRemaining}</span> },
    { key: "mrpPerUnit", label: "MRP", align: "right", render: (b) => inr(b.mrpPerUnit) },
    { key: "status", label: "Status", render: (b) => <Badge className={`${BATCH_STYLE[b.status] ?? ""} border-0`}>{b.status}</Badge> },
  ];

  const pickDrug = (d: any) => { onDrugChange(d._id); setSearch(d.name); setPickerOpen(false); };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <label className="text-xs text-muted-foreground">Drug</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPickerOpen(true); }}
                onFocus={() => setPickerOpen(true)}
                onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) pickDrug(matches[0]); }}
                placeholder="Search a drug to track…"
                className="h-9 pl-8 pr-8 text-sm"
              />
              {search && (
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setSearch(""); onDrugChange(null); }} aria-label="Clear">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {pickerOpen && matches.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md max-h-72 overflow-auto">
                {matches.map((d) => (
                  <button key={d._id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickDrug(d)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between gap-3 ${d._id === drugId ? "bg-muted/60" : ""}`}>
                    <span className="truncate">{d.name}</span>
                    <span className={`text-xs shrink-0 ${d.stock <= 0 ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>{d.stock} {d.unit}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="h-9 w-40 text-sm" />
          </div>
          <div className="flex gap-1">
            {[{ l: "30d", d: 29 }, { l: "90d", d: 89 }, { l: "1y", d: 364 }].map((r) => (
              <Button key={r.l} size="sm" variant="outline" className="h-9 text-xs" onClick={() => { setTo(today); setFrom(shiftDays(today, -r.d)); }}>{r.l}</Button>
            ))}
            <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => { setTo(today); setFrom(t?.drug?.createdAt ? format(new Date(t.drug.createdAt), "yyyy-MM-dd") : shiftDays(today, -729)); }}>All</Button>
          </div>
          {t && (
            <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs" onClick={() => printDrugLedger(t)}>
              <Printer className="h-3.5 w-3.5" /> Print ledger
            </Button>
          )}
          {t && (
            <Button size="sm" className="h-9 gap-1.5 text-xs" disabled={downloading} onClick={async () => {
              setDownloading(true);
              try { await downloadDrugLedgerPdf(t); }
              catch (e: any) { toast({ title: "Couldn't create the PDF", description: e?.message, variant: "destructive" }); }
              finally { setDownloading(false); }
            }}>
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download ledger PDF
            </Button>
          )}
        </CardContent>
      </Card>

      {!drugId && (
        <Card><CardContent className="py-14 text-center">
          <Activity className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Pick a drug to see its GRNs, bills, returns and why its stock is what it is.</p>
        </CardContent></Card>
      )}
      {drugId && isLoading && <div className="text-sm text-muted-foreground py-10 text-center">Loading drug history…</div>}
      {drugId && isError && <div className="text-sm text-red-600 py-6 text-center">{(error as any)?.message || "Couldn't load drug history"}</div>}

      {t && s && (
        <>
          {/* Drug header */}
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{t.drug.name}</h2>
            <Badge className={`border-0 ${t.drug.stock <= 0 ? "bg-red-100 text-red-700" : t.drug.stock <= t.drug.reorderLevel ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
              Stock {t.drug.stock} {unit}
            </Badge>
            <span className="text-xs text-muted-foreground">Reorder level {t.drug.reorderLevel} · MRP {inr(t.drug.mrpPerUnit)} · {t.drug.isBatchTracked ? "Batch-tracked" : "Not batch-tracked"}{t.drug.isActive ? "" : " · Inactive"}</span>
          </div>

          {/* Reconciliation tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: "Opening", value: s.opening, sub: fmtDate(`${t.period.from}T00:00:00`) },
              { label: "Received (GRN)", value: signed(s.received), color: "text-emerald-600" },
              { label: "Sold (bills)", value: s.sold ? `−${s.sold}` : "0", color: "text-blue-600" },
              { label: "Cancelled + returned", value: signed(s.cancelled + s.returned), color: "text-teal-600" },
              { label: "Adjusted + bill edits", value: signed(Math.round((s.adjusted + s.billEdited) * 100) / 100), color: "text-orange-600" },
              { label: "Closing", value: s.closing, sub: fmtDate(`${t.period.to}T00:00:00`) },
              {
                label: "Stock check",
                value: Math.abs(s.unexplained) < 0.01 ? "OK" : signed(s.unexplained),
                color: Math.abs(s.unexplained) < 0.01 ? "text-emerald-600" : "text-red-600",
                sub: `expected ${s.expectedNow} · on hand ${s.actualStock}${s.held ? ` + ${s.held} held` : ""}`,
              },
            ].map((k) => (
              <Card key={k.label}><CardContent className="p-3">
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <div className={`text-xl font-bold ${k.color ?? ""}`}>{k.value}</div>
                {k.sub && <div className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</div>}
              </CardContent></Card>
            ))}
          </div>

          {/* Diagnosis */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold text-sm">Why is stock {t.drug.stock}?</h3>
              {t.findings.map((f: any, i: number) => {
                const Icon = f.level === "critical" ? AlertOctagon : f.level === "warning" ? AlertTriangle : Info;
                const color = f.level === "critical" ? "text-red-600" : f.level === "warning" ? "text-amber-600" : "text-blue-600";
                return (
                  <div key={i} className="flex gap-2.5">
                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
                    <div>
                      <div className="text-sm font-medium">{f.title}</div>
                      <div className="text-xs text-muted-foreground">{f.detail}</div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Stats + chart */}
          <div className="grid lg:grid-cols-3 gap-3">
            <Card><CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-3">Period statistics</h3>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                {[
                  ["Sales value", inr(t.stats.salesValue)],
                  ["Bills", t.stats.billCount],
                  ["Avg sold / day", t.stats.avgDaily],
                  ["Last 30 days / day", t.stats.pace30],
                  ["Days of cover", t.stats.daysOfCover ?? "—"],
                  ["Avg sale price", inr(t.stats.avgSalePrice)],
                  ["Avg purchase price", inr(t.stats.avgPurchasePrice)],
                  ["Last GRN", t.stats.lastGrnNo ? `${t.stats.lastGrnNo} · ${fmtDate(t.stats.lastGrnAt)} (${t.stats.lastGrnQty})` : "—"],
                  ["Sold since last GRN", t.stats.soldSinceLastGrn],
                  ["Last sale", t.stats.lastSaleNo ? `${t.stats.lastSaleNo} · ${fmtDate(t.stats.lastSaleAt)}` : "—"],
                  ["Received (all time)", t.stats.totalReceivedAllTime],
                  ["Sold (all time)", t.stats.totalSoldAllTime],
                ].map(([k, v]) => (
                  <div key={String(k)} className="contents">
                    <dt className="text-muted-foreground text-xs self-center">{k}</dt>
                    <dd className="font-medium text-right">{v}</dd>
                  </div>
                ))}
              </dl>
              {t.stockOuts.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <div className="text-xs font-semibold text-red-600 mb-1">Out of stock</div>
                  {t.stockOuts.map((o: any, i: number) => (
                    <div key={i} className="text-xs text-muted-foreground">
                      {fmtDate(o.from)} → {o.to ? fmtDate(o.to) : "now"} · {o.days} day(s)
                    </div>
                  ))}
                </div>
              )}
            </CardContent></Card>
            <Card className="lg:col-span-2"><CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-3">Monthly movement</h3>
              {t.monthly.length === 0 ? (
                <div className="text-sm text-muted-foreground py-16 text-center">No movement in this period</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={t.monthly} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(m) => format(new Date(`${m}-01T00:00:00`), "MMM yy")} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={(m) => format(new Date(`${m}-01T00:00:00`), "MMMM yyyy")} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="received" name="Received" fill="#10b981" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="sold" name="Sold" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                    <Line type="monotone" dataKey="closing" name="Month-end stock" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent></Card>
          </div>

          {/* Detail tables */}
          <Tabs defaultValue="ledger">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="ledger">Ledger ({ledgerRows.length})</TabsTrigger>
              <TabsTrigger value="grn">GRN entries ({grnRows.length})</TabsTrigger>
              <TabsTrigger value="bills">Bill entries ({billRows.length})</TabsTrigger>
              <TabsTrigger value="back">Cancels &amp; returns ({backRows.length})</TabsTrigger>
              <TabsTrigger value="adj">Adjustments &amp; edits ({adjRows.length})</TabsTrigger>
              <TabsTrigger value="batches">Batches ({t.batches.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="ledger" className="mt-3">
              <ReportTable columns={ledgerCols} rows={ledgerRows} rowKey={(r, i) => `${r.at}-${r.ref}-${i}`} emptyLabel="No stock movement in this period" />
            </TabsContent>
            <TabsContent value="grn" className="mt-3">
              <ReportTable columns={grnCols} rows={grnRows} rowKey={(r, i) => `${r.id}-${i}`} emptyLabel="No GRN for this drug in this period"
                footer={grnRows.length ? <div className="text-xs text-right px-4 py-2 border-t">Total received: <b>{grnRows.filter((g: any) => g.status === "Received").reduce((a: number, g: any) => a + g.quantity, 0)}</b> {unit}</div> : undefined} />
            </TabsContent>
            <TabsContent value="bills" className="mt-3">
              <ReportTable columns={billCols} rows={billRows} rowKey={(r) => r.id} emptyLabel="No bills for this drug in this period"
                footer={billRows.length ? <div className="text-xs text-right px-4 py-2 border-t">Total sold: <b>{billRows.reduce((a: number, b: any) => a + b.quantity, 0)}</b> {unit} · {inr(billRows.reduce((a: number, b: any) => a + b.total, 0))}</div> : undefined} />
            </TabsContent>
            <TabsContent value="back" className="mt-3">
              <ReportTable columns={eventCols} rows={backRows} emptyLabel="No cancelled bills or returns for this drug" />
            </TabsContent>
            <TabsContent value="adj" className="mt-3">
              <ReportTable columns={eventCols} rows={adjRows} emptyLabel="No stock adjustments or bill edits for this drug" />
            </TabsContent>
            <TabsContent value="batches" className="mt-3">
              <ReportTable columns={batchCols} rows={t.batches} rowKey={(r) => r.id} emptyLabel="No batches" />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
