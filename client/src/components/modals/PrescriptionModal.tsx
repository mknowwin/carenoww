import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pill } from "lucide-react";
import { prescriptions as rxApi } from "@/lib/api";

const ROUTES    = ["Oral", "IV", "IM", "SC", "Topical", "Inhaled", "Rectal", "SL"] as const;
const FREQS     = ["OD", "BD", "TID", "QID", "SOS", "Stat", "HS", "Q4H", "Q6H", "Q8H"] as const;
const DURATIONS = ["1 day", "3 days", "5 days", "7 days", "10 days", "14 days", "1 month", "Ongoing"] as const;

interface RxItem {
  drug: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
  quantity: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  admissionId?: string;
  type?: "OPD" | "IPD";
}

const emptyItem = (): RxItem => ({
  drug: "", dose: "", route: "Oral", frequency: "OD", duration: "5 days", instructions: "", quantity: 1,
});

export default function PrescriptionModal({ open, onClose, onSaved, patientId, patientName, appointmentId, admissionId, type = "OPD" }: Props) {
  const [items,  setItems]  = useState<RxItem[]>([emptyItem()]);
  const [notes,  setNotes]  = useState("");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const updateItem = (idx: number, field: keyof RxItem, value: any) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    const valid = items.filter((it) => it.drug.trim() && it.dose.trim());
    if (!valid.length) { setError("Add at least one drug with name and dose"); return; }
    setSaving(true); setError("");
    try {
      await rxApi.create({ patientId, patientName, appointmentId, admissionId, type, items: valid, notes });
      setItems([emptyItem()]); setNotes("");
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to save prescription");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-4 w-4 text-teal-600" />
            Prescription — {patientName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {items.map((item, idx) => (
            <div key={idx} className="border rounded-xl p-3 space-y-3 relative">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Drug {idx + 1}</span>
                {items.length > 1 && (
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive"
                    onClick={() => removeItem(idx)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Label className="text-xs">Drug Name <span className="text-destructive">*</span></Label>
                  <Input className="mt-1 h-8 text-sm" placeholder="e.g. Paracetamol 500mg"
                    value={item.drug} onChange={(e) => updateItem(idx, "drug", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Dose <span className="text-destructive">*</span></Label>
                  <Input className="mt-1 h-8 text-sm" placeholder="e.g. 500mg, 1 tab"
                    value={item.dose} onChange={(e) => updateItem(idx, "dose", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Route</Label>
                  <Select value={item.route} onValueChange={(v) => updateItem(idx, "route", v)}>
                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{ROUTES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Frequency</Label>
                  <Select value={item.frequency} onValueChange={(v) => updateItem(idx, "frequency", v)}>
                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{FREQS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Duration</Label>
                  <Select value={item.duration} onValueChange={(v) => updateItem(idx, "duration", v)}>
                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{DURATIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Qty</Label>
                  <Input className="mt-1 h-8 text-sm" type="number" min={1} value={item.quantity}
                    onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Instructions</Label>
                  <Input className="mt-1 h-8 text-sm" placeholder="After food, empty stomach, at night..."
                    value={item.instructions} onChange={(e) => updateItem(idx, "instructions", e.target.value)} />
                </div>
              </div>
            </div>
          ))}

          <Button variant="outline" size="sm" className="gap-1 w-full"
            onClick={() => setItems((p) => [...p, emptyItem()])}>
            <Plus className="h-3.5 w-3.5" /> Add Drug
          </Button>

          <div>
            <Label className="text-xs">General Notes</Label>
            <Textarea className="mt-1 h-16 text-sm" placeholder="Any additional instructions for patient..."
              value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <p className="text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
            Saving will automatically create a pharmacy order for dispensing.
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={saving} onClick={handleSave}>
              {saving ? "Saving..." : "Save & Send to Pharmacy"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
