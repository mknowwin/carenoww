import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer } from "lucide-react";
import { insights as insightsApi } from "@/lib/api";
import { printInvestigationList } from "@/lib/print";
import ReportTable from "./ReportTable";
import { todayInTz } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

export default function InvestigationReport() {
  const { user } = useAuth();
  const today = todayInTz(user?.timezone ?? "Asia/Kolkata");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [investigationTypes, setInvestigationTypes] = useState<string[]>([]);
  const [doctor, setDoctor] = useState("");
  const [department, setDepartment] = useState("");
  const [diagnosis, setDiagnosis] = useState("");

  // Both option lists are populated from whatever's actually recorded for this tenant —
  // not a hardcoded modality list — so any investigation (cardiology or otherwise) and
  // any diagnosis ever entered shows up as a pickable filter.
  const { data: typeOptions } = useQuery({
    queryKey: ["insights-investigation-types"], queryFn: () => insightsApi.investigationTypes(), retry: false,
  });
  const { data: diagnosisOptions } = useQuery({
    queryKey: ["insights-diagnoses"], queryFn: () => insightsApi.diagnoses(), retry: false,
  });

  const toggleType = (t: string) => {
    setInvestigationTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  };

  const filters = { from, to, investigationTypes, doctor, department, diagnosis };
  const { data: rows, isLoading } = useQuery({
    queryKey: ["insights-investigation-list", from, to, investigationTypes.join(","), doctor, department, diagnosis],
    queryFn: () => insightsApi.investigationList(filters),
    retry: false,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Investigations with Diagnosis</h3>
        <Button size="sm" variant="outline" className="h-9 gap-1.5 shrink-0" onClick={() => printInvestigationList(rows ?? [], filters)}>
          <Printer className="h-4 w-4" /> Print
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" className="h-8 w-40 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="date" className="h-8 w-40 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />

        <Input className="h-8 w-36 text-xs" placeholder="Doctor" value={doctor} onChange={(e) => setDoctor(e.target.value)} />
        <Input className="h-8 w-36 text-xs" placeholder="Department" value={department} onChange={(e) => setDepartment(e.target.value)} />

        <Select value={diagnosis || "__all"} onValueChange={(v) => setDiagnosis(v === "__all" ? "" : v)}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Diagnosis" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Diagnoses</SelectItem>
            {(diagnosisOptions ?? []).map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Investigation multi-select — click to add/remove; empty = every investigation type */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Investigations {investigationTypes.length > 0 && `(${investigationTypes.length} selected)`}
          </span>
          {investigationTypes.length > 0 && (
            <button className="text-xs text-primary hover:underline" onClick={() => setInvestigationTypes([])}>Clear</button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(typeOptions ?? []).map((t) => (
            <button key={t} onClick={() => toggleType(t)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                investigationTypes.includes(t)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/40"
              }`}>
              {t}
            </button>
          ))}
          {(typeOptions ?? []).length === 0 && (
            <span className="text-xs text-muted-foreground italic">No investigations recorded yet</span>
          )}
        </div>
      </div>

      <ReportTable
        columns={[
          { key: "patientName", label: "Patient" },
          { key: "test", label: "Investigation", align: "center" },
          { key: "doctor", label: "Doctor" },
          { key: "department", label: "Department" },
          { key: "ordered", label: "Date", align: "center", render: (r) => new Date(r.ordered).toLocaleDateString("en-IN") },
          { key: "diagnosis", label: "Diagnosis", render: (r) => r.diagnosis || "—" },
        ]}
        rows={rows ?? []}
        rowKey={(r) => r._id}
        loading={isLoading}
        emptyLabel="No investigations found for these filters"
      />
    </div>
  );
}
