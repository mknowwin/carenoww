import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FlaskConical, Plus, X } from "lucide-react";
import { lab as labApi } from "@/lib/api";

const COMMON_TESTS = [
  "CBC", "CRP", "ESR", "Blood Culture", "Urine R/E",
  "Random Blood Sugar", "Fasting Blood Sugar", "HbA1c",
  "Lipid Profile", "LFT", "RFT", "Thyroid Profile (TSH)",
  "ECG", "Chest X-Ray", "USG Abdomen", "Urine Culture",
  "PT/INR", "Serum Electrolytes", "Uric Acid", "Dengue NS1",
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  doctor?: string;
}

export default function LabOrderModal({ open, onClose, onSaved, patientId, patientName, appointmentId, doctor }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [custom,   setCustom]   = useState("");
  const [priority, setPriority] = useState("Routine");
  const [notes,    setNotes]    = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  const toggle = (test: string) => {
    setSelected((prev) => prev.includes(test) ? prev.filter((t) => t !== test) : [...prev, test]);
  };

  const addCustom = () => {
    const t = custom.trim();
    if (t && !selected.includes(t)) setSelected((p) => [...p, t]);
    setCustom("");
  };

  const handleSave = async () => {
    if (!selected.length) { setError("Select at least one test"); return; }
    setSaving(true); setError("");
    try {
      await labApi.create({
        patientId, patientName,
        appointmentId: appointmentId || "",
        test:     selected.join(", "),
        priority,
        doctor:   doctor || "",
        notes,
      });
      setSelected([]); setCustom(""); setNotes(""); setPriority("Routine");
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to place order");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-blue-600" />
            Lab Order — {patientName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs mb-2 block">Common Tests</Label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_TESTS.map((t) => (
                <button key={t} onClick={() => toggle(t)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    selected.includes(t)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Add Custom Test</Label>
            <div className="flex gap-2 mt-1">
              <Input className="h-8 text-sm flex-1" placeholder="Type test name..."
                value={custom} onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} />
              <Button variant="outline" size="sm" className="h-8 gap-1" onClick={addCustom}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
          </div>

          {selected.length > 0 && (
            <div>
              <Label className="text-xs">Selected ({selected.length})</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {selected.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full border border-blue-200">
                    {t}
                    <button onClick={() => toggle(t)}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Routine">Routine</SelectItem>
                <SelectItem value="Urgent">Urgent</SelectItem>
                <SelectItem value="STAT">STAT (Immediate)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Clinical Notes</Label>
            <Textarea className="mt-1 h-14 text-sm" placeholder="Clinical history, suspected diagnosis..."
              value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={saving || !selected.length} onClick={handleSave}>
              {saving ? "Ordering..." : `Order ${selected.length || ""} Test${selected.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
