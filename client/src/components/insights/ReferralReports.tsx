import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { insights as insightsApi } from "@/lib/api";
import { printReferralsBySource, printReferralsByArea } from "@/lib/print";
import ReportTable from "./ReportTable";
import { todayInTz } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const REPORTS = [
  { id: "source", label: "By Source" },
  { id: "area", label: "By Area" },
] as const;

export default function ReferralReports() {
  const { user } = useAuth();
  const today = todayInTz(user?.timezone ?? "Asia/Kolkata");
  const [report, setReport] = useState<typeof REPORTS[number]["id"]>("source");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const { data: sourceData, isLoading: sourceLoading } = useQuery({
    queryKey: ["insights-referrals-source", from, to], queryFn: () => insightsApi.referralsBySource(from, to),
    enabled: report === "source", retry: false,
  });
  const { data: areaData, isLoading: areaLoading } = useQuery({
    queryKey: ["insights-referrals-area", from, to], queryFn: () => insightsApi.referralsByArea(from, to),
    enabled: report === "area", retry: false,
  });

  const handlePrint = () => {
    if (report === "source") printReferralsBySource(sourceData ?? [], from, to);
    else printReferralsByArea(areaData ?? [], from, to);
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

      <div className="flex items-center gap-2">
        <Input type="date" className="h-8 w-40 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="date" className="h-8 w-40 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {report === "source" && (
        <ReportTable
          columns={[{ key: "referralSource", label: "Referral Source" }, { key: "count", label: "Count", align: "right" }]}
          rows={sourceData ?? []} rowKey={(r) => r.referralSource} loading={sourceLoading}
          emptyLabel="No referrals found for this period"
          footer={<span>Total: {(sourceData ?? []).reduce((s: number, r: any) => s + r.count, 0)}</span>}
        />
      )}
      {report === "area" && (
        <ReportTable
          columns={[{ key: "area", label: "Area" }, { key: "count", label: "Count", align: "right" }]}
          rows={areaData ?? []} rowKey={(r) => r.area} loading={areaLoading}
          emptyLabel="No referrals found for this period"
          footer={<span>Total: {(areaData ?? []).reduce((s: number, r: any) => s + r.count, 0)}</span>}
        />
      )}
    </div>
  );
}
