import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ipd as ipdApi } from "@/lib/api";
import { confirm } from "@/hooks/use-confirm";
import SoapTextarea from "@/components/SoapTextarea";

const CONDITIONS = ["Improved", "Same", "Deteriorated", "Expired", "LAMA"] as const;
const BACKDATE_DAYS = 7;   // mirrors ipdService BACKDATE_DAYS

// <input type="datetime-local"> works in the device's local time
export const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface Props {
  admission: any;
  role?: string;
  suggestedMedications?: string;   // e.g. the stay's active prescriptions, offered as a starting point
  onOpenBill?: () => void;         // admin/finance: jump to the Bill tab to settle a balance
  onDischarged: (admission: any) => void;
}

export default function DischargeForm({ admission, role, suggestedMedications, onOpenBill, onDischarged }: Props) {
  const now = new Date();
  const earliest = new Date(Math.max(new Date(admission.admissionDate).getTime(), now.getTime() - BACKDATE_DAYS * 86400000));

  const [condition,      setCondition]      = useState<string>("Improved");
  const [dischargeAt,    setDischargeAt]    = useState(toLocalInput(now));
  const [deathAt,        setDeathAt]        = useState("");
  const [lamaReason,     setLamaReason]     = useState("");
  const [finalDiagnosis, setFinalDiagnosis] = useState(admission.provisionalDiagnosis ?? "");
  const [treatment,      setTreatment]      = useState("");
  const [medications,    setMedications]    = useState("");
  const [followUp,       setFollowUp]       = useState("");
  const [notes,          setNotes]          = useState("");
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState("");
  const [unpaid,         setUnpaid]         = useState<number | null>(null);   // server held discharge for this balance
  const [balanceNote,    setBalanceNote]    = useState("");

  const handleDischarge = async () => {
    if (!finalDiagnosis.trim()) { setError("Final diagnosis is required"); return; }
    if (condition === "Expired" && !deathAt) { setError("Enter the time of death"); return; }
    if (condition === "LAMA" && !lamaReason.trim()) { setError("Enter the LAMA reason / consent note"); return; }

    if (condition === "Expired" || condition === "LAMA") {
      const ok = await confirm({
        title: condition === "Expired" ? `Record ${admission.patientName} as expired?` : `Discharge ${admission.patientName} against medical advice?`,
        description: condition === "Expired"
          ? `Time of death ${new Date(deathAt).toLocaleString("en-IN")}. This closes the admission and cannot be undone here.`
          : "The patient is leaving against medical advice. Make sure the LAMA consent form is signed.",
        confirmText: condition === "Expired" ? "Record death" : "Discharge (LAMA)",
        variant: "destructive",
      });
      if (!ok) return;
    }

    await submit();
  };

  const submit = async (withBalance = false) => {
    setSaving(true); setError("");
    try {
      const result = await ipdApi.discharge(admission._id, {
        finalDiagnosis, treatment, medications, followUp, condition, notes,
        dischargeDate: new Date(dischargeAt).toISOString(),
        ...(condition === "Expired" ? { deathAt: new Date(deathAt).toISOString() } : {}),
        ...(condition === "LAMA" ? { lamaReason } : {}),
        ...(withBalance ? { allowBalance: true, balanceNote } : {}),
      });
      onDischarged(result);
    } catch (e: any) {
      if (e.details?.reason === "UNPAID_BALANCE") setUnpaid(e.details.balance);
      else setError(e.message || "Failed to discharge");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label>Condition at Discharge <span className="text-destructive">*</span></Label>
          <Select value={condition} onValueChange={setCondition}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c === "LAMA" ? "LAMA (against medical advice)" : c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Discharge Time</Label>
          <Input className="mt-1" type="datetime-local" value={dischargeAt}
            min={toLocalInput(earliest)} max={toLocalInput(now)} onChange={(e) => setDischargeAt(e.target.value)} />
        </div>
      </div>

      {condition === "Expired" && (
        <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
          <Label>Time of Death <span className="text-destructive">*</span></Label>
          <Input className="mt-1 max-w-xs" type="datetime-local" value={deathAt}
            min={toLocalInput(earliest)} max={toLocalInput(now)} onChange={(e) => setDeathAt(e.target.value)} />
        </div>
      )}
      {condition === "LAMA" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <Label>LAMA Reason / Consent Note <span className="text-destructive">*</span></Label>
          <Textarea className="mt-1 h-16" placeholder="Reason given, who signed the consent, advice explained..."
            value={lamaReason} onChange={(e) => setLamaReason(e.target.value)} />
        </div>
      )}

      <div>
        <Label>Final Diagnosis <span className="text-destructive">*</span></Label>
        <SoapTextarea field="assessment" className="mt-1" value={finalDiagnosis} onChange={setFinalDiagnosis}
          placeholder="Type a diagnosis or ICD-10 code" />
      </div>

      <div>
        <Label>Treatment Summary</Label>
        <Textarea className="mt-1 h-20" placeholder="Procedures done, surgeries, key treatments..."
          value={treatment} onChange={(e) => setTreatment(e.target.value)} />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label>Discharge Medications</Label>
          {suggestedMedications && !medications && (
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setMedications(suggestedMedications)}>
              Copy from this stay's prescriptions
            </button>
          )}
        </div>
        <Textarea className="mt-1 h-20" placeholder="e.g. Tab Amox 500mg BD x7 days..."
          value={medications} onChange={(e) => setMedications(e.target.value)} />
      </div>

      <div>
        <Label>Follow-up Instructions</Label>
        <Textarea className="mt-1 h-16" placeholder="Review after 7 days, repeat CBC..."
          value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
      </div>

      <div>
        <Label>Additional Notes</Label>
        <Textarea className="mt-1 h-16" placeholder="Any special instructions..."
          value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {unpaid !== null && (
        <div className="rounded-lg border border-red-200 bg-red-50/60 p-3 space-y-2">
          <p className="text-sm font-medium text-red-800">
            Unpaid IPD balance of ₹{unpaid.toLocaleString("en-IN")} (bed charges included up to the discharge time).
          </p>
          {onOpenBill && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onOpenBill}>Open Bill to collect payment</Button>
          )}
          {role === "admin" ? (
            <div className="space-y-2">
              <Label className="text-xs">Discharge anyway — reason</Label>
              <Textarea className="h-14" placeholder="e.g. Insurance claim pending, approved by MD, will pay at follow-up"
                value={balanceNote} onChange={(e) => setBalanceNote(e.target.value)} />
              <Button size="sm" variant="destructive" disabled={saving || !balanceNote.trim()} onClick={() => submit(true)}>
                Discharge with balance
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Ask the billing desk to settle it, or an admin to discharge with a balance note.</p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end pt-1">
        <Button disabled={saving} onClick={handleDischarge}
          className={condition === "Expired" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"}>
          {saving ? "Discharging..." : condition === "Expired" ? "Record Death & Close Admission" : "Confirm Discharge"}
        </Button>
      </div>
    </div>
  );
}
