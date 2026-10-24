import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, FileText, Pill, FlaskConical, Paperclip, Receipt, Printer, Download, Hash,
} from "lucide-react";
import { reports as reportsApi, billing as billingApi } from "@/lib/api";
import { printPrescription, printLabReport, printBill } from "@/lib/print";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

// GET /api/billing returns every bill only to admin/finance; other billing roles get
// just the bills they created, so the visit's auto-bill would be missing for them.
const BILLING_ROLES = ["admin", "finance"];

const LAB_STATUS_COLOR: Record<string, string> = {
  Pending:    "bg-amber-100 text-amber-700",
  Collected:  "bg-blue-100 text-blue-700",
  Processing: "bg-violet-100 text-violet-700",
  Completed:  "bg-teal-100 text-teal-700",
  Cancelled:  "bg-red-100 text-red-600",
};

const VITALS: [key: string, label: string, unit: string][] = [
  ["bp", "BP", "mmHg"], ["pulse", "Pulse", "bpm"], ["temp", "Temp", "°F"],
  ["spo2", "SpO2", "%"], ["weight", "Weight", "kg"], ["height", "Height", "cm"],
];

const SOAP: [key: string, label: string][] = [
  ["subjective", "S — Subjective"], ["objective", "O — Objective"],
  ["assessment", "A — Assessment / Diagnosis"], ["plan", "P — Plan"],
];

const inr = (n: number | undefined) => `₹${(n ?? 0).toLocaleString("en-IN")}`;

// "70-110", "< 200", "> 40" → true when a numeric value falls outside the range.
function isAbnormal(value: string, range: string) {
  const v = parseFloat(value);
  if (!range || isNaN(v)) return false;
  const between = range.match(/(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)/);
  if (between) return v < parseFloat(between[1]) || v > parseFloat(between[2]);
  const lt = range.match(/^\s*(?:<|up to)\s*=?\s*(\d+(?:\.\d+)?)/i);
  if (lt) return v > parseFloat(lt[1]);
  const gt = range.match(/^\s*>\s*=?\s*(\d+(?:\.\d+)?)/);
  if (gt) return v < parseFloat(gt[1]);
  return false;
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" /> {title}
      </h4>
      {children}
    </section>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  visit: any;
  labs: any[];
  scripts: any[];
}

// Full record of one OPD visit, opened from the patient history list.
export default function VisitDetailModal({ open, onClose, visit, labs, scripts }: Props) {
  const { user } = useAuth();
  const visitId = String(visit?._id || visit?.id || "");
  const canSeeBills = BILLING_ROLES.includes(user?.role ?? "");

  const { data: reportList = [] } = useQuery({
    queryKey: ["reports", visit?.patientId],
    queryFn:  () => reportsApi.list(visit.patientId),
    enabled:  open && !!visit?.patientId,
    retry: false,
  });
  const attachments = (Array.isArray(reportList) ? reportList : []).filter((r: any) => String(r.appointmentId) === visitId);

  const { data: billData } = useQuery({
    queryKey: ["bills-patient", visit?.patientId],
    queryFn:  () => billingApi.list({ patientId: visit.patientId, limit: "100" }),
    enabled:  open && canSeeBills && !!visit?.patientId,
    retry: false,
  });
  const bills: any[] = ((billData as any)?.bills ?? []).filter((b: any) => String(b.appointmentId) === visitId);

  const download = async (r: any) => {
    try {
      const res = await reportsApi.download(r._id);
      const link = document.createElement("a");
      link.href = `data:${res.fileType};base64,${res.fileData}`;
      link.download = res.fileName;
      link.click();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Download failed", description: err.message || "Failed to download file." });
    }
  };

  if (!visit) return null;
  const vitals = VITALS.filter(([k]) => visit.vitals?.[k]);
  const soap = SOAP.filter(([k]) => visit.soap?.[k]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Visit — {visit.date}
            <Badge className={`text-xs ${
              visit.status === "Completed" ? "bg-teal-100 text-teal-700" :
              visit.status === "Cancelled" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
            }`}>{visit.status}</Badge>
            {visit.type && <Badge className="text-xs bg-gray-100 text-gray-600">{visit.type}</Badge>}
          </DialogTitle>
          <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
            <span>{visit.patientName} · <span className="font-mono">{visit.patientId}</span></span>
            <span>·</span>
            <span>{[visit.doctor, visit.department, visit.time].filter(Boolean).join(" · ")}</span>
            {visit.token && <span className="inline-flex items-center gap-0.5 font-mono"><Hash className="h-3 w-3" />{visit.token}</span>}
          </p>
        </DialogHeader>

        <div className="space-y-5">
          {/* Vitals */}
          <Section icon={Activity} title="Vitals">
            {vitals.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No vitals recorded.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {vitals.map(([k, label, unit]) => (
                  <div key={k} className="bg-muted/40 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
                    <p className="text-sm font-semibold">{visit.vitals[k]} <span className="text-[10px] font-normal text-muted-foreground">{unit}</span></p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Notes */}
          <Section icon={FileText} title="Clinical Notes">
            {visit.notes && (
              <p className="text-sm"><span className="font-semibold">Reason for visit:</span> {visit.notes}</p>
            )}
            {soap.length === 0 && !visit.notes ? (
              <p className="text-xs text-muted-foreground italic">No clinical notes recorded.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {soap.map(([k, label]) => (
                  <div key={k} className="border rounded-lg p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
                    <p className="text-sm whitespace-pre-wrap">{visit.soap[k]}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Prescriptions */}
          <Section icon={Pill} title="Prescriptions">
            {scripts.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No prescriptions for this visit.</p>
            ) : scripts.map((rx) => (
              <div key={rx._id} className="border rounded-lg">
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                  <div className="text-xs">
                    <span className="font-mono font-semibold">{rx.rxId}</span>
                    <span className="text-muted-foreground"> · {rx.prescribedBy}</span>
                    {rx.status && <Badge className="ml-2 text-[10px] bg-gray-100 text-gray-600">{rx.status}</Badge>}
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => printPrescription(rx)}>
                    <Printer className="h-3 w-3" /> Print
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="text-left">
                        {["Drug", "Dose", "Route", "Frequency", "Duration", "Qty", "Instructions"].map((h) => (
                          <th key={h} className="px-3 py-1.5 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(rx.items ?? []).map((it: any, i: number) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 font-medium">{it.drug}</td>
                          <td className="px-3 py-1.5">{it.dose}</td>
                          <td className="px-3 py-1.5">{it.route}</td>
                          <td className="px-3 py-1.5">{it.frequency}</td>
                          <td className="px-3 py-1.5">{it.duration}</td>
                          <td className="px-3 py-1.5">{it.quantity}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{it.instructions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rx.notes && <p className="px-3 py-2 text-xs text-muted-foreground border-t">{rx.notes}</p>}
              </div>
            ))}
          </Section>

          {/* Lab results */}
          <Section icon={FlaskConical} title="Lab Tests">
            {labs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No lab tests for this visit.</p>
            ) : labs.map((o) => (
              <div key={o._id} className="border rounded-lg">
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 gap-2">
                  <div className="text-xs flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{o.test}</span>
                    <span className="font-mono text-muted-foreground">{o.labId}</span>
                    <Badge className={`text-[10px] ${LAB_STATUS_COLOR[o.status] ?? "bg-gray-100 text-gray-600"}`}>{o.status}</Badge>
                    {o.priority && o.priority !== "Routine" && <Badge className="text-[10px] bg-red-100 text-red-700">{o.priority}</Badge>}
                  </div>
                  {o.status === "Completed" && (
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => printLabReport(o)}>
                      <Printer className="h-3 w-3" /> Print
                    </Button>
                  )}
                </div>
                {o.parameters?.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="text-left">
                        <th className="px-3 py-1.5 font-medium">Parameter</th>
                        <th className="px-3 py-1.5 font-medium">Result</th>
                        <th className="px-3 py-1.5 font-medium">Reference range</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {o.parameters.map((p: any, i: number) => {
                        const abnormal = isAbnormal(p.value, p.referenceRange);
                        return (
                          <tr key={i}>
                            <td className="px-3 py-1.5">{p.name}</td>
                            <td className={`px-3 py-1.5 font-semibold ${abnormal ? "text-red-600" : ""}`}>
                              {p.value} {p.unit && <span className="font-normal text-muted-foreground">{p.unit}</span>}
                              {abnormal && <span className="ml-1">⚠</span>}
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground">{p.referenceRange}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    {o.result ? <>Result: <span className="text-foreground">{o.result}</span></> : "Result not entered yet."}
                  </p>
                )}
                {(o.diagnosis || o.notes) && (
                  <p className="px-3 py-2 text-xs text-muted-foreground border-t">{[o.diagnosis, o.notes].filter(Boolean).join(" · ")}</p>
                )}
              </div>
            ))}
          </Section>

          {/* Attachments */}
          {attachments.length > 0 && (
            <Section icon={Paperclip} title="Attachments">
              <div className="border rounded-lg divide-y">
                {attachments.map((r: any) => (
                  <div key={r._id} className="flex items-center justify-between px-3 py-2 gap-2">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{r.fileName}</p>
                      {r.notes && <p className="text-xs text-muted-foreground truncate">{r.notes}</p>}
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs shrink-0" onClick={() => download(r)}>
                      <Download className="h-3 w-3" /> Download
                    </Button>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Billing */}
          {bills.length > 0 && (
            <Section icon={Receipt} title="Bill">
              <div className="border rounded-lg divide-y">
                {bills.map((b) => (
                  <div key={b._id} className="flex items-center justify-between px-3 py-2 gap-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold">{b.billId}</span>
                      <Badge className="text-[10px] bg-gray-100 text-gray-600">{b.status}</Badge>
                      <span>Amount {inr(b.amount)}</span>
                      <span className="text-muted-foreground">Paid {inr(b.paid)}</span>
                      {b.balance > 0 && <span className="text-red-600">Balance {inr(b.balance)}</span>}
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => printBill(b)}>
                      <Printer className="h-3 w-3" /> Print
                    </Button>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
