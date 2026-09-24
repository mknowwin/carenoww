import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { insights as insightsApi } from "@/lib/api";
import {
  printCashCollected, printDailyBillsCount, printReturnBills,
  printTimewiseSales, printDiscountDaywise, printDiscountBillwise, printCashFlow,
} from "@/lib/print";
import ReportTable from "./ReportTable";
import { todayInTz } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const REPORTS = [
  { id: "cash", label: "Cash Collected", scope: "day" },
  { id: "bills", label: "Bills / Day", scope: "day" },
  { id: "timewise", label: "Timewise Sales", scope: "day" },
  { id: "cashflow", label: "Cash Flow", scope: "day" },
  { id: "returns", label: "Return Bills", scope: "range" },
  { id: "discountDay", label: "Discount — Daywise", scope: "range" },
  { id: "discountBill", label: "Discount — Billwise", scope: "range" },
] as const;

const money = (n: number) => `₹${(n ?? 0).toLocaleString("en-IN")}`;

export default function BillingCashReports() {
  const { user } = useAuth();
  const today = todayInTz(user?.timezone ?? "Asia/Kolkata");
  const [report, setReport] = useState<typeof REPORTS[number]["id"]>("cash");
  const [day, setDay] = useState(today);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const scope = REPORTS.find((r) => r.id === report)!.scope;

  const cash    = useQuery({ queryKey: ["insights-cash", day], queryFn: () => insightsApi.cashCollected(day), enabled: report === "cash", retry: false });
  const bills   = useQuery({ queryKey: ["insights-bills", day], queryFn: () => insightsApi.dailyBillsCount(day), enabled: report === "bills", retry: false });
  const time    = useQuery({ queryKey: ["insights-timewise", day], queryFn: () => insightsApi.timewiseSales(day), enabled: report === "timewise", retry: false });
  const flow    = useQuery({ queryKey: ["insights-cashflow", day], queryFn: () => insightsApi.cashFlow(day), enabled: report === "cashflow", retry: false });
  const returns = useQuery({ queryKey: ["insights-returns", from, to], queryFn: () => insightsApi.returnBills(from, to), enabled: report === "returns", retry: false });
  const discDay = useQuery({ queryKey: ["insights-discount-day", from, to], queryFn: () => insightsApi.discountDaywise(from, to), enabled: report === "discountDay", retry: false });
  const discBill= useQuery({ queryKey: ["insights-discount-bill", from, to], queryFn: () => insightsApi.discountBillwise(from, to), enabled: report === "discountBill", retry: false });

  const handlePrint = () => {
    if (report === "cash" && cash.data) printCashCollected(cash.data, day);
    else if (report === "bills" && bills.data) printDailyBillsCount(bills.data, day);
    else if (report === "timewise") printTimewiseSales(time.data ?? [], day);
    else if (report === "cashflow" && flow.data) printCashFlow(flow.data, day);
    else if (report === "returns" && returns.data) printReturnBills(returns.data, from, to);
    else if (report === "discountDay") printDiscountDaywise(discDay.data ?? [], from, to);
    else if (report === "discountBill") printDiscountBillwise(discBill.data ?? [], from, to);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {REPORTS.map((r) => (
            <button key={r.id} onClick={() => setReport(r.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                report === r.id ? "bg-primary text-primary-foreground border-primary shadow-sm" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}>
              {r.label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={handlePrint}>
          <Printer className="h-4 w-4" /> Print
        </Button>
      </div>

      {scope === "day" ? (
        <Input type="date" className="h-8 w-40 text-sm" value={day} onChange={(e) => setDay(e.target.value)} />
      ) : (
        <div className="flex items-center gap-2">
          <Input type="date" className="h-8 w-40 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" className="h-8 w-40 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      )}

      {report === "cash" && (
        <ReportTable
          columns={[{ key: "paymentMode", label: "Payment Mode" }, { key: "total", label: "Amount", align: "right", render: (r) => money(r.total) }]}
          rows={cash.data?.rows ?? []} rowKey={(r) => r.paymentMode} loading={cash.isLoading}
          emptyLabel="No collections for this day"
          footer={<span>Grand Total: {money(cash.data?.grandTotal ?? 0)}</span>}
        />
      )}
      {report === "bills" && (
        <ReportTable
          columns={[
            { key: "type", label: "Type" }, { key: "status", label: "Status" },
            { key: "count", label: "Bills", align: "right" }, { key: "amount", label: "Amount", align: "right", render: (r) => money(r.amount) },
          ]}
          rows={bills.data?.rows ?? []} rowKey={(r, i) => `${r.type}-${r.status}-${i}`} loading={bills.isLoading}
          emptyLabel="No bills generated for this day"
          footer={<span>Total: {bills.data?.totalBills ?? 0} bills · {money(bills.data?.totalAmount ?? 0)}</span>}
        />
      )}
      {report === "timewise" && (
        <ReportTable
          columns={[
            { key: "hour", label: "Hour", render: (r) => `${String(r.hour).padStart(2, "0")}:00 – ${String((r.hour + 1) % 24).padStart(2, "0")}:00` },
            { key: "count", label: "Payments", align: "right" }, { key: "total", label: "Amount", align: "right", render: (r) => money(r.total) },
          ]}
          rows={(time.data ?? []).filter((r: any) => r.count > 0)} rowKey={(r) => r.hour} loading={time.isLoading}
          emptyLabel="No sales recorded for this day"
          footer={<span>Total: {money((time.data ?? []).reduce((s: number, r: any) => s + r.total, 0))}</span>}
        />
      )}
      {report === "cashflow" && flow.data && (
        <ReportTable
          columns={[{ key: "item", label: "Item" }, { key: "value", label: "Value", align: "right" }]}
          rows={[
            { item: "Cash In (collections)", value: money(flow.data.cashIn) },
            { item: "Cash Out (returns/credit notes)", value: money(flow.data.cashOut) },
            { item: "Cancelled Bills (informational)", value: `${flow.data.cancelledBills} · ${money(flow.data.cancelledAmount)}` },
          ]}
          rowKey={(r) => r.item} loading={flow.isLoading} emptyLabel="No cash flow for this day"
          footer={<span className="font-semibold">Net Cash: {money(flow.data.netCash)}</span>}
        />
      )}
      {report === "returns" && (
        <ReportTable
          columns={[
            { key: "billId", label: "Credit Note" }, { key: "originalBillNo", label: "Original Bill", render: (r) => r.originalBillNo || "—" },
            { key: "patientName", label: "Patient" }, { key: "date", label: "Date", align: "center", render: (r) => new Date(r.date).toLocaleDateString("en-IN") },
            { key: "amount", label: "Amount", align: "right", render: (r) => money(Math.abs(r.amount)) },
            { key: "cancelReason", label: "Reason", render: (r) => r.cancelReason || "—" },
          ]}
          rows={returns.data?.notes ?? []} rowKey={(r) => r.billId} loading={returns.isLoading}
          emptyLabel="No returns for this period"
          footer={<span>Total Returned: {money(returns.data?.totalReturned ?? 0)}</span>}
        />
      )}
      {report === "discountDay" && (
        <ReportTable
          columns={[
            { key: "day", label: "Day" }, { key: "bills", label: "Bills", align: "right" },
            { key: "totalDiscount", label: "Total Discount", align: "right", render: (r) => money(r.totalDiscount) },
          ]}
          rows={discDay.data ?? []} rowKey={(r) => r.day} loading={discDay.isLoading}
          emptyLabel="No discounts given in this period"
          footer={<span>Total: {money((discDay.data ?? []).reduce((s: number, r: any) => s + r.totalDiscount, 0))}</span>}
        />
      )}
      {report === "discountBill" && (
        <ReportTable
          columns={[
            { key: "billId", label: "Bill No" }, { key: "patientName", label: "Patient" },
            { key: "date", label: "Date", align: "center", render: (r) => new Date(r.date).toLocaleDateString("en-IN") },
            { key: "amount", label: "Bill Amount", align: "right", render: (r) => money(r.amount) },
            { key: "discountType", label: "Discount Type", render: (r) => `${r.discountType}${r.discountType === "Percent" ? ` (${r.discountPercent}%)` : ""}` },
            { key: "discount", label: "Discount", align: "right", render: (r) => money(r.discount) },
          ]}
          rows={discBill.data ?? []} rowKey={(r) => r.billId} loading={discBill.isLoading}
          emptyLabel="No discounted bills in this period"
          footer={<span>Total: {money((discBill.data ?? []).reduce((s: number, r: any) => s + r.discount, 0))}</span>}
        />
      )}
    </div>
  );
}
