import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { patients as patientsApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onClose: () => void;
  existing?: any;
}

const DEPARTMENTS = ["Cardiology", "Orthopedics", "Neurology", "Obstetrics", "Nephrology", "Oncology", "Emergency", "General"];
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

// ── These must live at module scope so React sees a stable component identity ──
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

export default function PatientModal({ open, onClose, existing }: Props) {
  const qc = useQueryClient();
  const isEdit = !!(existing?._id);

  const [form, setForm] = useState({
    name:       existing?.name       ?? "",
    age:        existing?.age        ?? "",
    gender:     existing?.gender     ?? "M",
    bloodGroup: existing?.bloodGroup ?? "O+",
    phone:      existing?.phone      ?? "",
    address:    existing?.address    ?? "",
    department: existing?.department ?? "Cardiology",
    status:     existing?.status     ?? "OPD",
    doctor:     existing?.doctor     ?? "",
    diagnosis:  existing?.diagnosis  ?? "",
    insurance:  existing?.insurance  ?? "None",
    riskLevel:  existing?.riskLevel  ?? "Low",
  });

  useEffect(() => {
    if (open) {
      setForm({
        name:       existing?.name       ?? "",
        age:        existing?.age        ?? "",
        gender:     existing?.gender     ?? "M",
        bloodGroup: existing?.bloodGroup ?? "O+",
        phone:      existing?.phone      ?? "",
        address:    existing?.address    ?? "",
        department: existing?.department ?? "Cardiology",
        status:     existing?.status     ?? "OPD",
        doctor:     existing?.doctor     ?? "",
        diagnosis:  existing?.diagnosis  ?? "",
        insurance:  existing?.insurance  ?? "None",
        riskLevel:  existing?.riskLevel  ?? "Low",
      });
      setError("");
    }
  }, [open, existing]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const payload = { ...form, age: parseInt(form.age as string) };
      if (isEdit) {
        await patientsApi.update(existing._id, payload);
      } else {
        await patientsApi.create(payload);
      }
      qc.invalidateQueries({ queryKey: ["patients"] });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save patient");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Patient" : "Register New Patient"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <F label="Full Name *"><SI value={form.name} onChange={(v) => set("name", v)} placeholder="Patient full name" required /></F>
            <F label="Age *"><SI value={String(form.age)} onChange={(v) => set("age", v)} type="number" placeholder="Age" required /></F>
            <F label="Gender"><Sel value={form.gender} onChange={(v) => set("gender", v)} opts={["M", "F", "O"]} /></F>
            <F label="Blood Group"><Sel value={form.bloodGroup} onChange={(v) => set("bloodGroup", v)} opts={BLOOD_GROUPS} /></F>
            <F label="Phone"><SI value={form.phone} onChange={(v) => set("phone", v)} placeholder="9876543210" /></F>
            <F label="Insurance"><SI value={form.insurance} onChange={(v) => set("insurance", v)} placeholder="Star Health / None" /></F>
            <F label="Address"><SI value={form.address} onChange={(v) => set("address", v)} placeholder="City / District" /></F>
            <F label="Department"><Sel value={form.department} onChange={(v) => set("department", v)} opts={DEPARTMENTS} /></F>
            <F label="Status"><Sel value={form.status} onChange={(v) => set("status", v)} opts={["OPD", "IPD", "ICU", "Discharged"]} /></F>
            <F label="Risk Level"><Sel value={form.riskLevel} onChange={(v) => set("riskLevel", v)} opts={["Low", "Medium", "High", "Critical"]} /></F>
            <F label="Consulting Doctor"><SI value={form.doctor} onChange={(v) => set("doctor", v)} placeholder="Dr. Name" /></F>
            <F label="Diagnosis"><SI value={form.diagnosis} onChange={(v) => set("diagnosis", v)} placeholder="Primary diagnosis" /></F>
          </div>

          {error && <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : isEdit ? "Update Patient" : "Register Patient"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
