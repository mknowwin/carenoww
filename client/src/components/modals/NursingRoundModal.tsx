import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ipd as ipdApi } from "@/lib/api";

interface Props {
  admission: any;
  onClose: () => void;
  onSaved: () => void;
}

export default function NursingRoundModal({ admission, onClose, onSaved }: Props) {
  const [bp,     setBp]     = useState("");
  const [pulse,  setPulse]  = useState("");
  const [temp,   setTemp]   = useState("");
  const [spo2,   setSpo2]   = useState("");
  const [weight, setWeight] = useState("");
  const [notes,  setNotes]  = useState("");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const handleSave = async () => {
    if (!pulse && !temp && !bp && !spo2 && !notes) {
      setError("Enter at least one vital or note"); return;
    }
    setSaving(true); setError("");
    try {
      await ipdApi.addRound(admission._id, {
        bp:     bp     || "",
        pulse:  pulse  ? parseFloat(pulse)  : 0,
        temp:   temp   ? parseFloat(temp)   : 0,
        spo2:   spo2   ? parseFloat(spo2)   : 0,
        weight: weight ? parseFloat(weight) : undefined,
        notes,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to save round");
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!admission} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nursing Round — {admission?.patientName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {admission?.ward} · Bed {admission?.bedNumber}
          </p>

          {/* Vitals grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">BP (mmHg)</Label>
              <Input className="mt-1 h-8 text-sm" placeholder="120/80" value={bp} onChange={(e) => setBp(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Pulse (bpm)</Label>
              <Input className="mt-1 h-8 text-sm" type="number" placeholder="72" value={pulse} onChange={(e) => setPulse(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Temp (°F)</Label>
              <Input className="mt-1 h-8 text-sm" type="number" placeholder="98.6" value={temp} onChange={(e) => setTemp(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">SpO₂ (%)</Label>
              <Input className="mt-1 h-8 text-sm" type="number" placeholder="98" value={spo2} onChange={(e) => setSpo2(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Weight (kg)</Label>
              <Input className="mt-1 h-8 text-sm" type="number" placeholder="Optional" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
          </div>

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
