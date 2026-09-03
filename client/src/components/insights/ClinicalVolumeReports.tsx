import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { insights as insightsApi } from "@/lib/api";
import { printDoctorWise, printDepartmentWise, printInvestigationWise } from "@/lib/print";
import ReportTable from "./ReportTable";
import { todayInTz } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const REPORTS = [
  { id: "doctor", label: "Doctor-wise" },
  { id: "department", label: "Department-wise" },
  { id: "investigation", label: "Investigation-wise" },
] as const;

export default function ClinicalVolumeReports() {
  const { user } = useAuth();
  const today = todayInTz(user?.timezone ?? "Asia/Kolkata");
  const [report, setReport] = useState<typeof REPORTS[number]["id"]>("doctor");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const { data: doctorData, isLoading: doctorLoading } = useQuery({
    queryKey: ["insights-doctor-wise", from, to], queryFn: () => insightsApi.doctorWise(from, to),
    enabled: report === "doctor", retry: false,
  });
  const { data: deptData, isLoading: deptLoading } = useQuery({
    queryKey: ["insights-department-wise", from, to], queryFn: () => insightsApi.departmentWise(from, to),
    enabled: report === "department", retry: false,
  });
  const { data: investData, isLoading: investLoading } = useQuery({
    queryKey: ["insights-investigation-wise", from, to], queryFn: () => insightsApi.investigationWise(from, to),
    enabled: report === "investigation", retry: false,
  });

  const handlePrint = () => {
    if (report === "doctor") printDoctorWise(doctorData ?? [], from, to);
    else if (report === "department") printDepartmentWise(deptData ?? [], from, to);
    else printInvestigationWise(investData ?? [], from, to);
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

      {report === "doctor" && (
        <ReportTable
          columns={[
            { key: "doctor", label: "Doctor" },
            { key: "visits", label: "Visits", align: "right" },
          ]}
          rows={doctorData ?? []}
          rowKey={(r) => r.doctor}
          loading={doctorLoading}
          emptyLabel="No visits found for this period"
          footer={<span>Total: {(doctorData ?? []).reduce((s: number, r: any) => s + r.visits, 0)} visits</span>}
        />
      )}
      {report === "department" && (
        <ReportTable
          columns={[
            { key: "department", label: "Department" },
            { key: "visits", label: "Visits", align: "right" },
          ]}
          rows={deptData ?? []}
          rowKey={(r) => r.department}
          loading={deptLoading}
          emptyLabel="No visits found for this period"
          footer={<span>Total: {(deptData ?? []).reduce((s: number, r: any) => s + r.visits, 0)} visits</span>}
        />
      )}
      {report === "investigation" && (
        <ReportTable
          columns={[
            { key: "test", label: "Investigation" },
            { key: "orders", label: "Orders", align: "right" },
          ]}
          rows={investData ?? []}
          rowKey={(r) => r.test}
          loading={investLoading}
          emptyLabel="No orders found for this period"
          footer={<span>Total: {(investData ?? []).reduce((s: number, r: any) => s + r.orders, 0)} orders</span>}
        />
      )}
    </div>
  );
}
