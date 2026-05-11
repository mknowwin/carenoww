import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { billing as billingApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

interface Props { open: boolean; onClose: () => void; existing?: any; }

const BILL_TYPES = ["OPD", "IPD Advance", "IPD Final", "ICU Daily", "OT Package", "Pharmacy", "Lab", "Radiology"];
const PAYERS = ["Cash", "UPI", "Card", "Star Health", "New India", "United India", "Oriental", "Max Bupa", "HDFC Ergo", "Medi Assist", "TPA Corp", "CGHS", "ESI"];

// Module-scope — stable identity across re-renders
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

export default function BillingModal({ open, onClose, existing }: Props) {
  const qc = useQueryClient();
  const isEdit = !!existing;

  const [form, setForm] = useState({
    patientId:   existing?.patientId   ?? "",
    patientName: existing?.patientName ?? "",
    amount:      existing?.amount      ?? "",
    paid:        existing?.paid        ?? "0",
    payer:       existing?.payer       ?? "Cash",
    type:        existing?.type        ?? "OPD",
    date:        existing?.date        ? new Date(existing.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
  });

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const payload = {
        ...form,
        amount: parseFloat(form.amount as string),
        paid: parseFloat(form.paid as string),
      };
      if (isEdit) {
        await billingApi.update(existing._id || existing.id, payload);
      } else {
        await billingApi.create(payload);
      }
      qc.invalidateQueries({ queryKey: ["billing"] });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save bill");
    } finally {
      setLoading(false);
    }
  };

  const amount = parseFloat(form.amount as string) || 0;
  const paid   = parseFloat(form.paid as string)   || 0;
  const balance = amount - paid;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Update Bill / Record Payment" : "Generate New Bill"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <F label="Patient UHID *">
              <Input value={form.patientId} onChange={(e) => set("patientId", e.target.value)} placeholder="UHID-001" className="h-8 text-sm" required />
            </F>
            <F label="Patient Name *">
              <Input value={form.patientName} onChange={(e) => set("patientName", e.target.value)} placeholder="Name" className="h-8 text-sm" required />
            </F>
            <F label="Bill Type">
              <select value={form.type} onChange={(e) => set("type", e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {BILL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </F>
            <F label="Date">
              <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className="h-8 text-sm" />
            </F>
            <F label="Total Amount (₹) *">
              <Input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" className="h-8 text-sm" required />
            </F>
            <F label="Amount Paid (₹)">
              <Input type="number" value={form.paid} onChange={(e) => set("paid", e.target.value)} placeholder="0.00" className="h-8 text-sm" />
            </F>
            <F label="Payer / Insurance">
              <select value={form.payer} onChange={(e) => set("payer", e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {PAYERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </F>
          </div>

          {amount > 0 && (
            <div className="bg-muted rounded-lg p-3 text-sm flex gap-6">
              <span>Total: <strong>₹{amount.toLocaleString()}</strong></span>
              <span>Paid: <strong className="text-green-600">₹{paid.toLocaleString()}</strong></span>
              <span>Balance: <strong className={balance > 0 ? "text-red-600" : "text-green-600"}>₹{balance.toLocaleString()}</strong></span>
            </div>
          )}

          {error && <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : isEdit ? "Record Payment" : "Generate Bill"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
