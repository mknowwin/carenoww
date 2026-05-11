import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { lab as labApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

interface Props { open: boolean; onClose: () => void; existing?: any; }

const COMMON_TESTS = [
  "Complete Blood Count", "Lipid Profile", "Renal Function Tests", "Liver Function Tests",
  "HbA1c", "Thyroid Function Tests", "Urine Routine", "Cardiac Troponin",
  "Blood Culture", "X-Ray Chest", "ECG", "MRI Brain", "CT Scan Abdomen", "Ultrasound",
];

// Module-scope — stable identity across re-renders
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

export default function LabOrderModal({ open, onClose, existing }: Props) {
  const qc = useQueryClient();
  const isEdit = !!(existing?._id);

  const [form, setForm] = useState({
    patientId:   existing?.patientId   ?? "",
    patientName: existing?.patientName ?? "",
    test:        existing?.test        ?? "",
    priority:    existing?.priority    ?? "Routine",
    doctor:      existing?.doctor      ?? "",
    status:      existing?.status      ?? "Pending",
    result:      existing?.result      ?? "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const payload = { ...form, result: form.result || null };
      if (isEdit) {
        await labApi.update(existing._id, payload);
      } else {
        await labApi.create(payload);
      }
      qc.invalidateQueries({ queryKey: ["lab-orders"] });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save lab order");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Update Lab Order" : "New Lab Order"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <F label="Patient UHID *">
              <Input value={form.patientId} onChange={(e) => set("patientId", e.target.value)} placeholder="UHID-001" className="h-8 text-sm" required />
            </F>
            <F label="Patient Name *">
              <Input value={form.patientName} onChange={(e) => set("patientName", e.target.value)} placeholder="Patient name" className="h-8 text-sm" required />
            </F>
          </div>

          <F label="Test *">
            <select value={form.test} onChange={(e) => set("test", e.target.value)}
              className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required>
              <option value="">Select test...</option>
              {COMMON_TESTS.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value="__custom">Other (type below)</option>
            </select>
          </F>
          {(form.test === "__custom" || !COMMON_TESTS.includes(form.test)) && form.test !== "" && (
            <F label="Custom Test Name">
              <Input value={form.test === "__custom" ? "" : form.test} onChange={(e) => set("test", e.target.value)} placeholder="Enter test name" className="h-8 text-sm" />
            </F>
          )}

          <div className="grid grid-cols-2 gap-3">
            <F label="Priority">
              <select value={form.priority} onChange={(e) => set("priority", e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {["Routine", "Urgent", "STAT"].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </F>
            <F label="Status">
              <select value={form.status} onChange={(e) => set("status", e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {["Pending", "Collected", "Processing", "Completed", "Scheduled"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </F>
          </div>

          <F label="Ordering Doctor">
            <Input value={form.doctor} onChange={(e) => set("doctor", e.target.value)} placeholder="Dr. Name" className="h-8 text-sm" />
          </F>

          {(isEdit || form.status === "Completed") && (
            <F label="Result">
              <Textarea value={form.result} onChange={(e) => set("result", e.target.value)} placeholder="Enter test result..." className="text-sm min-h-[60px]" />
            </F>
          )}

          {error && <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : isEdit ? "Update Order" : "Create Order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
