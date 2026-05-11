import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { appointments as apptApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onClose: () => void;
  existing?: any;
}

const DEPARTMENTS = ["Cardiology", "Orthopedics", "Neurology", "Obstetrics", "Nephrology", "Oncology", "Emergency", "General"];
const TIMES = ["09:00 AM","09:30 AM","10:00 AM","10:30 AM","11:00 AM","11:30 AM","12:00 PM","02:00 PM","02:30 PM","03:00 PM","03:30 PM","04:00 PM","04:30 PM"];

// ── Module-scope helpers — stable identity across re-renders ──
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function SI({ value, onChange, placeholder, type = "text", required }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <Input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-8 text-sm"
      required={required}
    />
  );
}

function Sel({ value, onChange, opts }: {
  value: string; onChange: (v: string) => void; opts: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export default function AppointmentModal({ open, onClose, existing }: Props) {
  const qc = useQueryClient();
  const isEdit = !!existing;
  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    patientId:   existing?.patientId   ?? "",
    patientName: existing?.patientName ?? "",
    doctor:      existing?.doctor      ?? "",
    department:  existing?.department  ?? "Cardiology",
    date:        existing?.date        ?? today,
    time:        existing?.time        ?? "09:00 AM",
    type:        existing?.type        ?? "New",
    status:      existing?.status      ?? "Scheduled",
    token:       existing?.token       ?? "",
    notes:       existing?.notes       ?? "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      if (isEdit) {
        await apptApi.update(existing._id || existing.id, form);
      } else {
        await apptApi.create(form);
      }
      qc.invalidateQueries({ queryKey: ["appointments"] });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save appointment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Appointment" : "Book Appointment"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <F label="Patient UHID *"><SI value={form.patientId} onChange={(v) => set("patientId", v)} placeholder="UHID-001" required /></F>
            <F label="Patient Name *"><SI value={form.patientName} onChange={(v) => set("patientName", v)} placeholder="Patient name" required /></F>
            <F label="Doctor *"><SI value={form.doctor} onChange={(v) => set("doctor", v)} placeholder="Dr. Name" required /></F>
            <F label="Department"><Sel value={form.department} onChange={(v) => set("department", v)} opts={DEPARTMENTS} /></F>
            <F label="Date *"><SI value={form.date} onChange={(v) => set("date", v)} type="date" required /></F>
            <F label="Time">
              <select value={form.time} onChange={(e) => set("time", e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </F>
            <F label="Type"><Sel value={form.type} onChange={(v) => set("type", v)} opts={["New", "Follow-up", "Emergency", "Teleconsult", "Home Visit"]} /></F>
            <F label="Status"><Sel value={form.status} onChange={(v) => set("status", v)} opts={["Scheduled", "Confirmed", "Waiting", "In Consult", "Completed", "Cancelled"]} /></F>
            <F label="Token"><SI value={form.token} onChange={(v) => set("token", v)} placeholder="C-01" /></F>
            <F label="Notes"><SI value={form.notes} onChange={(v) => set("notes", v)} placeholder="Optional notes" /></F>
          </div>

          {error && <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : isEdit ? "Update" : "Book Appointment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
