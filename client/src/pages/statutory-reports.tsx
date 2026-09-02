import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { FileCheck2, Printer, Loader2, CheckCircle2, ChevronDown, X } from "lucide-react";
import { govReports as govReportsApi, ratemaster as ratemasterApi } from "@/lib/api";
import { printGovernmentReport } from "@/lib/print";
import { useAuth } from "@/contexts/AuthContext";
import { todayInTz } from "@/lib/utils";

const REPORT_TYPES = [
  { value: "HMIS-Monthly", label: "HMIS Monthly Return (Investigations)" },
  { value: "PharmacyAudit", label: "Pharmacy Audit (Drug Control)" },
];

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-700",
  Finalized: "bg-blue-100 text-blue-700",
  Submitted: "bg-green-100 text-green-700",
};

function ReferenceInput({ onConfirm }: { onConfirm: (refNo: string) => void }) {
  const [open, setOpen] = useState(false);
  const [refNo, setRefNo] = useState("");
  if (!open) {
    return (
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(true)}>
        Mark Submitted
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Input
        className="h-7 text-xs w-32"
        placeholder="Reference No."
        value={refNo}
        onChange={(e) => setRefNo(e.target.value)}
      />
      <Button size="sm" className="h-7 text-xs" disabled={!refNo.trim()} onClick={() => onConfirm(refNo.trim())}>
        Confirm
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}

export default function StatutoryReportsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = todayInTz(user?.timezone ?? "Asia/Kolkata");
  const canManage = user?.role === "admin" || user?.role === "finance";

  const [reportType, setReportType] = useState<"HMIS-Monthly" | "PharmacyAudit">("HMIS-Monthly");
  const [periodFrom, setPeriodFrom] = useState(today.slice(0, 8) + "01"); // first of this month
  const [periodTo, setPeriodTo] = useState(today);
  const [investigationTypes, setInvestigationTypes] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["gov-reports"],
    queryFn: () => govReportsApi.list({ limit: "100" }),
    retry: false,
    enabled: canManage,
  });
  const submissions = data?.submissions ?? [];

  // Investigation catalog for the HMIS-Monthly dropdown — the clinic's configured
  // billable Lab services, not just investigations that happen to have history.
  const { data: labServices } = useQuery({
    queryKey: ["ratemaster-lab"],
    queryFn: () => ratemasterApi.list({ category: "Lab" }),
    retry: false,
    enabled: canManage && reportType === "HMIS-Monthly",
  });

  const toggleInvestigation = (name: string) => {
    setInvestigationTypes((prev) => prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]);
  };

  const handleGenerate = async () => {
    setGenerating(true); setError("");
    try {
      await govReportsApi.generate({
        reportType, periodFrom, periodTo,
        ...(reportType === "HMIS-Monthly" ? { investigationTypes } : {}),
      });
      qc.invalidateQueries({ queryKey: ["gov-reports"] });
    } catch (e: any) {
      setError(e.message || "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = async (id: string) => {
    const submission = await govReportsApi.get(id);
    printGovernmentReport(submission);
  };

  const handleFinalize = async (id: string) => {
    await govReportsApi.finalize(id);
    qc.invalidateQueries({ queryKey: ["gov-reports"] });
  };

  const handleSubmit = async (id: string, refNo: string) => {
    await govReportsApi.submit(id, refNo);
    qc.invalidateQueries({ queryKey: ["gov-reports"] });
  };

  if (!canManage) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Statutory reports are available to admin and finance roles only.
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      <div>
        <h2 className="text-lg font-bold">Statutory Reports</h2>
        <p className="text-sm text-muted-foreground">Generate government report submissions and track their status</p>
      </div>

      {/* Generate panel */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <FileCheck2 className="h-4 w-4 text-teal-600" />
            <span className="text-sm font-semibold">Generate New Report</span>
          </div>
          <div className="grid sm:grid-cols-4 gap-3 items-end">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Report Type</Label>
              <Select value={reportType} onValueChange={(v) => setReportType(v as any)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Period From</Label>
              <Input type="date" className="h-9 text-sm" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Period To</Label>
              <Input type="date" className="h-9 text-sm" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
            </div>
          </div>

          {reportType === "HMIS-Monthly" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Investigations</Label>
              <div className="flex items-center gap-2 flex-wrap">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 shrink-0">
                      {investigationTypes.length > 0 ? `${investigationTypes.length} selected` : "All investigations"}
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-60 max-h-72 overflow-y-auto">
                    <DropdownMenuLabel className="text-xs">Select investigations (none = all)</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {(labServices ?? []).length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground italic">No Lab services configured in Rate Master yet</div>
                    )}
                    {(labServices ?? []).map((s: any) => (
                      <DropdownMenuCheckboxItem
                        key={s._id}
                        className="text-xs"
                        checked={investigationTypes.includes(s.name)}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={() => toggleInvestigation(s.name)}
                      >
                        {s.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Selected investigations as removable snippets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {investigationTypes.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">All investigations included</span>
                  ) : (
                    <>
                      {investigationTypes.map((name) => (
                        <Badge key={name} variant="secondary" className="gap-1 pr-1 font-normal">
                          {name}
                          <button type="button" onClick={() => toggleInvestigation(name)} className="hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                      <button className="text-xs text-primary hover:underline" onClick={() => setInvestigationTypes([])}>Clear</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button size="sm" disabled={generating} onClick={handleGenerate} className="gap-1.5">
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCheck2 className="h-3.5 w-3.5" />}
            {generating ? "Generating…" : "Generate Report"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Assembled from existing Insights/Pharmacy data as a frozen snapshot — this exact snapshot stays reprintable
            unchanged even if underlying records are edited later.
          </p>
        </CardContent>
      </Card>

      {/* Submission history */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Submission History</h3>
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
        ) : submissions.length === 0 ? (
          <Card><CardContent className="py-10 text-center">
            <FileCheck2 className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No submissions generated yet</p>
          </CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      {["Submission ID", "Type", "Period", "Status", "Generated", "Actions"].map((h) => (
                        <th key={h} className="py-2.5 px-4 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((s: any) => (
                      <tr key={s._id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="py-2.5 px-4 font-medium">{s.submissionId}</td>
                        <td className="py-2.5 px-4">{s.reportType}</td>
                        <td className="py-2.5 px-4 text-muted-foreground">{s.periodFrom} — {s.periodTo}</td>
                        <td className="py-2.5 px-4">
                          <Badge className={STATUS_COLORS[s.status] || ""}>{s.status}</Badge>
                          {s.referenceNo && <span className="text-xs text-muted-foreground ml-2">Ref: {s.referenceNo}</span>}
                        </td>
                        <td className="py-2.5 px-4 text-xs text-muted-foreground">
                          {new Date(s.generatedAt).toLocaleDateString("en-IN")} by {s.generatedBy}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handlePrint(s._id)}>
                              <Printer className="h-3 w-3" /> Print
                            </Button>
                            {s.status === "Draft" && (
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleFinalize(s._id)}>
                                <CheckCircle2 className="h-3 w-3" /> Finalize
                              </Button>
                            )}
                            {s.status !== "Submitted" && (
                              <ReferenceInput onConfirm={(refNo) => handleSubmit(s._id, refNo)} />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
