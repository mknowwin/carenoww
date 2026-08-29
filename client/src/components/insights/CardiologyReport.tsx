import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer } from "lucide-react";
import { insights as insightsApi } from "@/lib/api";
import { printCardiologyList } from "@/lib/print";
import ReportTable from "./ReportTable";
import { todayInTz } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const MODALITIES = ["ECG", "ECHO", "TMT", "Holter", "ABP"];

export default function CardiologyReport() {
  const { user } = useAuth();
  const today = todayInTz(user?.timezone ?? "Asia/Kolkata");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [modality, setModality] = useState("");
  const [doctor, setDoctor] = useState("");
  const [department, setDepartment] = useState("");
  const [diagnosis, setDiagnosis] = useState("");

  const { data: diagnosisOptions } = useQuery({
    queryKey: ["insights-cardiology-diagnoses"], queryFn: () => insightsApi.cardiologyDiagnoses(), retry: false,
  });

  const filters = { from, to, modality, doctor, department, diagnosis };
  const { data: rows, isLoading } = useQuery({
    queryKey: ["insights-cardiology-list", from, to, modality, doctor, department, diagnosis],
    queryFn: () => insightsApi.cardiologyList(filters),
    retry: false,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">ECG / ECHO / TMT / Holter / ABP — with Diagnosis</h3>
        <Button size="sm" variant="outline" className="h-9 gap-1.5 shrink-0" onClick={() => printCardiologyList(rows ?? [], filters)}>
          <Printer className="h-4 w-4" /> Print
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" className="h-8 w-40 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="date" className="h-8 w-40 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />

        <Select value={modality || "__all"} onValueChange={(v) => setModality(v === "__all" ? "" : v)}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Modality" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Modalities</SelectItem>
            {MODALITIES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>

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

      <ReportTable
        columns={[
          { key: "patientName", label: "Patient" },
          { key: "test", label: "Test", align: "center" },
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
