import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ipd as ipdApi } from "@/lib/api";
import { vitalFlags } from "@/lib/ipd";
import VitalFlags from "@/components/ipd/VitalFlags";

interface Props {
  admission: any;
  onClose: () => void;
  onSaved: () => void;
}

const num = (v: string) => (v ? parseFloat(v) : undefined);

export default function NursingRoundModal({ admission, onClose, onSaved }: Props) {
  const [v, setV] = useState({ bp: "", pulse: "", temp: "", spo2: "", respRate: "", weight: "", intake: "", output: "" });
  const [notes,  setNotes]  = useState("");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  const flags = vitalFlags({ bp: v.bp, pulse: num(v.pulse), temp: num(v.temp), spo2: num(v.spo2), respRate: num(v.respRate) });

  const handleSave = async () => {
    if (!Object.values(v).some(Boolean) && !notes.trim()) {
      setError("Enter at least one vital or note"); return;
    }
    if (v.bp && !/^\s*\d{2,3}\s*\/\s*\d{2,3}\s*$/.test(v.bp)) { setError("BP should look like 120/80"); return; }
    setSaving(true); setError("");
    try {
      await ipdApi.addRound(admission._id, {
        bp:       v.bp.replace(/\s/g, ""),
        pulse:    num(v.pulse) ?? 0,
        temp:     num(v.temp) ?? 0,
        spo2:     num(v.spo2) ?? 0,
        respRate: num(v.respRate),
        weight:   num(v.weight),
        intake:   num(v.intake),
        output:   num(v.output),
        notes,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to save round");
      setSaving(false);
    }
  };

  const field = (k: keyof typeof v, label: string, placeholder: string, type = "number") => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input className="mt-1 h-8 text-sm" type={type} inputMode={type === "number" ? "decimal" : undefined}
        placeholder={placeholder} value={v[k]} onChange={set(k)} />
    </div>
  );

  return (
    <Dialog open={!!admission} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nursing Round — {admission?.patientName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {admission?.ward} · Bed {admission?.bedNumber}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {field("bp", "BP (mmHg)", "120/80", "text")}
            {field("pulse", "Pulse (bpm)", "72")}
            {field("temp", "Temp (°F)", "98.6")}
            {field("spo2", "SpO₂ (%)", "98")}
            {field("respRate", "Resp. rate (/min)", "16")}
            {field("weight", "Weight (kg)", "Optional")}
            {field("intake", "Intake (ml)", "Optional")}
            {field("output", "Output (ml)", "Optional")}
          </div>

          <VitalFlags flags={flags} />

          <div>
            <Label className="text-xs">Round Notes</Label>
            <Textarea className="mt-1 h-20 text-sm" placeholder="Patient status, complaints, nurse observations..."
              value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={saving} onClick={handleSave}>
              {saving ? "Saving..." : "Save Round"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
