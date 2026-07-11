import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pharmacy as pharmApi, describeStockError } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

interface Props { open: boolean; onClose: () => void; existing?: any; mode?: "order" | "inventory"; }

// Module-scope — stable identity across re-renders
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

export default function PharmacyModal({ open, onClose, existing, mode = "order" }: Props) {
  const qc = useQueryClient();
  const isEdit = !!(existing?._id);

  const [orderForm, setOrderForm] = useState({
    patientId:   existing?.patientId   ?? "",
    patientName: existing?.patientName ?? "",
    drug:        existing?.drug        ?? "",
    qty:         existing?.qty         ?? "1",
    unit:        existing?.unit        ?? "Tabs",
    type:        existing?.type        ?? "OPD",
    doctor:      existing?.doctor      ?? "",
    status:      existing?.status      ?? "Pending",
    time:        existing?.time        ?? new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
  });

  const [invForm, setInvForm] = useState({
    name:         existing?.name         ?? "",
    stock:        existing?.stock        ?? "0",
    unit:         existing?.unit         ?? "Tabs",
    reorderLevel: existing?.reorderLevel ?? "100",
    expiryDate:   existing?.expiryDate   ? new Date(existing.expiryDate).toISOString().split("T")[0] : "",
    supplier:     existing?.supplier     ?? "",
    status:       existing?.status       ?? "OK",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const setO = (k: string, v: string) => setOrderForm((f) => ({ ...f, [k]: v }));
  const setI = (k: string, v: string) => setInvForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      if (mode === "order") {
        const payload = { ...orderForm, qty: parseInt(orderForm.qty) };
        if (isEdit) await pharmApi.orders.update(existing._id, payload);
        else await pharmApi.orders.create(payload);
        qc.invalidateQueries({ queryKey: ["pharmacy-orders"] });
      } else {
        const payload = { ...invForm, stock: parseInt(invForm.stock), reorderLevel: parseInt(invForm.reorderLevel) };
        if (isEdit) await pharmApi.inventory.update(existing._id, payload);
        else await pharmApi.inventory.create(payload);
        qc.invalidateQueries({ queryKey: ["pharmacy-inventory"] });
      }
      onClose();
    } catch (err: any) {
      setError(describeStockError(err));
    } finally {
      setLoading(false);
    }
  };



  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "order"
              ? isEdit ? "Update Prescription" : "Dispense / New Order"
              : isEdit ? "Update Drug Stock" : "Add Drug to Inventory"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "order" ? (
            <div className="grid grid-cols-2 gap-3">
              <F label="Patient UHID *"><Input value={orderForm.patientId} onChange={(e) => setO("patientId", e.target.value)} placeholder="UHID-001" className="h-8 text-sm" required /></F>
              <F label="Patient Name *"><Input value={orderForm.patientName} onChange={(e) => setO("patientName", e.target.value)} placeholder="Name" className="h-8 text-sm" required /></F>
              <F label="Drug / Medicine *"><Input value={orderForm.drug} onChange={(e) => setO("drug", e.target.value)} placeholder="Amlodipine 5mg" className="h-8 text-sm" required /></F>
              <F label="Qty *"><Input type="number" value={orderForm.qty} onChange={(e) => setO("qty", e.target.value)} className="h-8 text-sm" required /></F>
              <F label="Unit">
                <select value={orderForm.unit} onChange={(e) => setO("unit", e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {["Tabs","Caps","Vials","Syrup","Inj","Sachet","Drops"].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </F>
              <F label="Type">
                <select value={orderForm.type} onChange={(e) => setO("type", e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {["OPD","IPD","ICU"].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </F>
              <F label="Doctor"><Input value={orderForm.doctor} onChange={(e) => setO("doctor", e.target.value)} placeholder="Dr. Name" className="h-8 text-sm" /></F>
              <F label="Status">
                <select value={orderForm.status} onChange={(e) => setO("status", e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {["Pending","Verified","Dispensed"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </F>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <F label="Drug Name *"><Input value={invForm.name} onChange={(e) => setI("name", e.target.value)} placeholder="Paracetamol 500mg" className="h-8 text-sm" required /></F>
              <F label="Unit">
                <select value={invForm.unit} onChange={(e) => setI("unit", e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {["Tabs","Caps","Vials","Syrup","Inj","Sachet","Drops"].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </F>
              <F label="Stock *"><Input type="number" value={invForm.stock} onChange={(e) => setI("stock", e.target.value)} className="h-8 text-sm" required /></F>
              <F label="Reorder Level *"><Input type="number" value={invForm.reorderLevel} onChange={(e) => setI("reorderLevel", e.target.value)} className="h-8 text-sm" required /></F>
              <F label="Expiry Date *"><Input type="date" value={invForm.expiryDate} onChange={(e) => setI("expiryDate", e.target.value)} className="h-8 text-sm" required /></F>
              <F label="Supplier"><Input value={invForm.supplier} onChange={(e) => setI("supplier", e.target.value)} placeholder="Cipla" className="h-8 text-sm" /></F>
            </div>
          )}

          {error && <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : isEdit ? "Update" : mode === "order" ? "Create Order" : "Add Drug"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
