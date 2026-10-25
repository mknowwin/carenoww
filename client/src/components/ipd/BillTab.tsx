import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, BedDouble, IndianRupee, Printer, RefreshCw, Wallet } from "lucide-react";
import { ipd as ipdApi } from "@/lib/api";
import { printBill } from "@/lib/print";
import { formatCurrencyFull } from "@/lib/utils";
import BillingModal from "@/components/modals/BillingModal";

const fmtDay = (v: string) => new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
const STATUS: Record<string, string> = {
  Paid: "bg-teal-100 text-teal-700", Partial: "bg-amber-100 text-amber-700", Pending: "bg-red-100 text-red-700",
  Claimed: "bg-blue-100 text-blue-700", Draft: "bg-gray-100 text-gray-600",
};

// Opening the tab posts bed charges owed so far (calendar days, ward rate) to the IPD bill
export default function BillTab({ admission, isAdmin }: { admission: any; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [payBill, setPayBill] = useState<any>(null);
  const key = ["ipd-billing", admission._id];

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: key,
    queryFn:  () => admission.status === "Active" ? ipdApi.syncBilling(admission._id) : ipdApi.billing(admission._id),
    staleTime: 30000,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground py-8 text-center">Updating bed charges…</p>;
  if (error || !data) return <p className="text-sm text-destructive py-8 text-center">{(error as any)?.message || "Could not load the bill"}</p>;

  const bedTotal = data.segments.reduce((s, x) => s + x.amount, 0);

  return (
    <div className="space-y-4">
      {/* Totals */}
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Billed", data.totals.amount, "text-foreground"],
          ["Paid", data.totals.paid, "text-teal-700"],
          ["Balance", data.totals.balance, data.totals.balance > 0 ? "text-red-700" : "text-foreground"],
        ].map(([label, value, cls]) => (
          <Card key={label as string}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-lg font-bold ${cls}`}>{formatCurrencyFull(value as number)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.missingRates.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            No bed charge is linked for {Array.from(new Set(data.missingRates)).join(", ")} — those days are not billed.
            {isAdmin && (
              <button className="ml-1 underline font-medium" onClick={() => setLocation("/settings?tab=wards")}>Set it in Wards & Beds</button>
            )}
          </div>
        </div>
      )}

      {/* Bed charges */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5"><BedDouble className="h-4 w-4" /> Bed Charges</CardTitle>
            {admission.status === "Active" && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={isFetching}
                onClick={() => refetch()}>
                <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} /> Update
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Every calendar day in a bed is charged, including admission and discharge days; on a transfer day both wards charge.</p>
        </CardHeader>
        <CardContent className="px-0 pb-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                {["Ward / Bed", "Dates", "Days", "Rate / day", "Amount"].map((h, i) => (
                  <th key={h} className={`font-medium px-4 py-1.5 ${i >= 2 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.segments.map((s) => (
                <tr key={s.key} className="border-b last:border-0">
                  <td className="px-4 py-1.5">{s.ward} <span className="text-muted-foreground">{s.bed}</span></td>
                  <td className="px-4 py-1.5 whitespace-nowrap">{fmtDay(s.from)} – {s.ongoing ? "today" : fmtDay(s.to)}</td>
                  <td className="px-4 py-1.5 text-right">{s.days}</td>
                  <td className="px-4 py-1.5 text-right">{s.rate > 0 ? formatCurrencyFull(s.rate) : <span className="text-amber-700">not set</span>}</td>
                  <td className="px-4 py-1.5 text-right font-medium">{formatCurrencyFull(s.amount)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} className="px-4 py-1.5 text-right text-xs text-muted-foreground">Bed charges total</td>
                <td className="px-4 py-1.5 text-right font-semibold">{formatCurrencyFull(bedTotal)}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* IPD bills: bed charges + inpatient lab / pharmacy + manual items */}
      {data.bills.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No IPD bill yet — charges appear here as they are posted.</CardContent></Card>
      ) : data.bills.map((b) => (
        <Card key={b._id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <IndianRupee className="h-4 w-4" /> {b.billId}
                <Badge className={`text-xs ${STATUS[b.status] ?? "bg-gray-100 text-gray-600"}`}>{b.status}</Badge>
              </CardTitle>
              <div className="flex gap-1.5">
                {b.balance > 0 && !b.isLocked && (
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setPayBill(b)}>
                    <Wallet className="h-3 w-3" /> Collect payment
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => printBill(b)}>
                  <Printer className="h-3 w-3" /> Print
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-2 overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {b.items.map((it: any, i: number) => (
                  <tr key={it._id ?? i} className="border-b last:border-0">
                    <td className="px-4 py-1.5">{it.description}<span className="ml-2 text-xs text-muted-foreground">{it.category}</span></td>
                    <td className="px-4 py-1.5 text-right text-muted-foreground whitespace-nowrap">{it.quantity} × {formatCurrencyFull(it.unitPrice)}</td>
                    <td className="px-4 py-1.5 text-right font-medium whitespace-nowrap">{formatCurrencyFull(it.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end gap-4 px-4 pt-2 text-sm">
              <span>Total <span className="font-semibold">{formatCurrencyFull(b.amount)}</span></span>
              <span>Paid <span className="font-semibold text-teal-700">{formatCurrencyFull(b.paid)}</span></span>
              <span>Balance <span className={`font-semibold ${b.balance > 0 ? "text-red-700" : ""}`}>{formatCurrencyFull(b.balance)}</span></span>
            </div>
          </CardContent>
        </Card>
      ))}

      {payBill && (
        <BillingModal open existing={payBill} payOnly
          onClose={() => { setPayBill(null); qc.invalidateQueries({ queryKey: key }); }} />
      )}
    </div>
  );
}
