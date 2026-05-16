import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ipd as ipdApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { BedDouble } from "lucide-react";

const CONDITIONS = ["Improved", "Same", "Deteriorated", "Expired", "LAMA"] as const;

interface Props {
  admission: any;
  onClose: () => void;
  onDischarged: () => void;
}

export default function DischargeModal({ admission, onClose, onDischarged }: Props) {
  const [condition,       setCondition]       = useState("Improved");
  const [finalDiagnosis,  setFinalDiagnosis]  = useState(admission?.provisionalDiagnosis ?? "");
  const [treatment,       setTreatment]       = useState("");
  const [medications,     setMedications]     = useState("");
  const [followUp,        setFollowUp]        = useState("");
  const [notes,           setNotes]           = useState("");
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState("");

  const handleDischarge = async () => {
    if (!finalDiagnosis || !condition) { setError("Final diagnosis and condition are required"); return; }
    setSaving(true); setError("");
    try {
      await ipdApi.discharge(admission._id, { finalDiagnosis, treatment, medications, followUp, condition, notes });
      onDischarged();
    } catch (e: any) {
      setError(e.message || "Failed to discharge");
      setSaving(false);
    }
  };

  const days = Math.floor((Date.now() - new Date(admission?.admissionDate).getTime()) / 86400000) + 1;

  return (
    <Dialog open={!!admission} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Discharge Summary</DialogTitle>
        </DialogHeader>

        {/* Patient info */}
        <div className="bg-blue-50 rounded-lg px-4 py-3 flex items-center gap-3">
          <BedDouble className="h-5 w-5 text-blue-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold">{admission?.patientName}</p>
            <p className="text-xs text-muted-foreground">
              {admission?.admissionId} · {admission?.ward} Bed {admission?.bedNumber} · {days} day{days !== 1 ? "s" : ""} stay
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label>Final Diagnosis <span className="text-destructive">*</span></Label>
            <Textarea className="mt-1 h-16" value={finalDiagnosis}
              onChange={(e) => setFinalDiagnosis(e.target.value)} />
          </div>

          <div>
            <Label>Treatment Summary</Label>
            <Textarea className="mt-1 h-16" placeholder="Procedures done, surgeries, key treatments..."
              value={treatment} onChange={(e) => setTreatment(e.target.value)} />
          </div>

          <div>
            <Label>Discharge Medications</Label>
            <Textarea className="mt-1 h-16" placeholder="e.g. Tab Amox 500mg BD x7 days..."
              value={medications} onChange={(e) => setMedications(e.target.value)} />
          </div>

          <div>
            <Label>Follow-up Instructions</Label>
            <Textarea className="mt-1 h-12" placeholder="Review after 7 days, repeat CBC..."
              value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          </div>

          <div>
            <Label>Patient Condition at Discharge <span className="text-destructive">*</span></Label>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Additional Notes</Label>
            <Textarea className="mt-1 h-12" placeholder="Any special instructions..."
              value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="default" disabled={saving} onClick={handleDischarge}
              className="bg-amber-600 hover:bg-amber-700">
              {saving ? "Discharging..." : "Confirm Discharge"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
