import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { billing as billingApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, IndianRupee } from "lucide-react";

interface Props { open: boolean; onClose: () => void; existing?: any; payOnly?: boolean; }

const BILL_TYPES     = ["OPD", "IPD", "Emergency", "Lab", "Pharmacy"] as const;
const PAYMENT_MODES  = ["Cash", "Card", "UPI", "Insurance", "Online"] as const;
const CATEGORIES     = ["Consultation", "Lab", "Pharmacy", "Procedure", "Room", "Other"] as const;
const PAYERS         = ["Self","Star Health","New India","United India","Max Bupa","HDFC Ergo","Medi Assist","CGHS","ESI","Other"];

interface BillItem { description: string; category: string; quantity: number; unitPrice: number; total: number; }
const emptyItem = (): BillItem => ({ description: "", category: "Consultation", quantity: 1, unitPrice: 0, total: 0 });

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

export default function BillingModal({ open, onClose, existing, payOnly = false }: Props) {
  const qc      = useQueryClient();
  const isEdit  = !!existing;

  const [patientId,    setPatientId]    = useState(existing?.patientId   ?? "");
  const [patientName,  setPatientName]  = useState(existing?.patientName ?? "");
  const [type,         setType]         = useState<string>(existing?.type ?? "OPD");
  const [items,        setItems]        = useState<BillItem[]>(existing?.items?.length ? existing.items : [emptyItem()]);
  const [discount,     setDiscount]     = useState<number>(existing?.discount ?? 0);
  const [paid,         setPaid]         = useState<number>(existing?.paid ?? 0);
  const [payer,        setPayer]        = useState(existing?.payer ?? "Self");
  const [paymentMode,  setPaymentMode]  = useState<string>(existing?.paymentMode ?? "Cash");
  const [notes,        setNotes]        = useState(existing?.notes ?? "");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");

  useEffect(() => {
    if (!open) { setError(""); }
    if (open && existing) {
      setPatientId(existing.patientId ?? "");
      setPatientName(existing.patientName ?? "");
      setType(existing.type ?? "OPD");
      setItems(existing.items?.length ? existing.items : [emptyItem()]);
      setDiscount(existing.discount ?? 0);
      setPaid(existing.paid ?? 0);
      setPayer(existing.payer ?? "Self");
      setPaymentMode(existing.paymentMode ?? "Cash");
      setNotes(existing.notes ?? "");
    }
  }, [open, existing]);

  const updateItem = (idx: number, field: keyof BillItem, value: any) => {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, [field]: value };
      next.total = Number((next.quantity * next.unitPrice).toFixed(2));
      return next;
    }));
  };

  const subtotal     = items.reduce((s, it) => s + (it.total || 0), 0);
  const totalAmount  = Math.max(0, subtotal - discount);
  const balance      = totalAmount - paid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName) { setError("Patient name is required"); return; }
    if (items.some((it) => !it.description)) { setError("All items need a description"); return; }

    setLoading(true); setError("");
    try {
      const payload = {
        patientId, patientName, type,
        items: items.map((it) => ({ ...it, quantity: Number(it.quantity), unitPrice: Number(it.unitPrice), total: Number(it.total) })),
        amount: totalAmount,
        discount, paid,
        payer, paymentMode, notes,
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? (payOnly ? "Record Payment" : "Update Bill") : "Generate Bill"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Patient */}
          {!payOnly && (
            <div className="grid grid-cols-2 gap-3">
              <F label="Patient UHID">
                <Input className="h-8 text-sm" value={patientId} placeholder="UHID-001"
                  onChange={(e) => setPatientId(e.target.value)} />
              </F>
              <F label="Patient Name *">
                <Input className="h-8 text-sm" value={patientName} placeholder="Full name" required
                  onChange={(e) => setPatientName(e.target.value)} />
              </F>
              <F label="Bill Type">
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{BILL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </F>
            </div>
          )}

          {/* Line items */}
          {!payOnly && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Line Items</Label>
              </div>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-1.5 items-center">
                    <div className="col-span-4">
                      <Input className="h-7 text-xs" placeholder="Description"
                        value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} />
                    </div>
                    <div className="col-span-3">
                      <select value={item.category} onChange={(e) => updateItem(idx, "category", e.target.value)}
                        className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="col-span-1">
                      <Input className="h-7 text-xs text-center" type="number" min={1} placeholder="Qty"
                        value={item.quantity} onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 1)} />
                    </div>
                    <div className="col-span-2">
                      <Input className="h-7 text-xs" type="number" placeholder="Price"
                        value={item.unitPrice || ""} onChange={(e) => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="col-span-1 text-xs text-right font-medium">₹{(item.total || 0).toLocaleString()}</div>
                    <div className="col-span-1">
                      {items.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"
                          onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-2 gap-1 text-xs h-7"
                onClick={() => setItems((p) => [...p, emptyItem()])}>
                <Plus className="h-3 w-3" /> Add Item
              </Button>
            </div>
          )}

          {/* Summary + payment */}
          <div className="bg-muted/40 rounded-lg p-3 space-y-2">
            {!payOnly && (
              <div className="grid grid-cols-2 gap-3">
                <F label="Discount (₹)">
                  <Input className="h-8 text-sm" type="number" min={0} value={discount || ""}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} />
                </F>
                <div className="flex items-end">
                  <div className="text-sm font-bold">Total: ₹{totalAmount.toLocaleString()}</div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <F label="Amount Paid (₹) *">
                <Input className="h-8 text-sm" type="number" min={0} value={paid || ""}
                  onChange={(e) => setPaid(parseFloat(e.target.value) || 0)} />
              </F>
              <F label="Payment Mode">
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label="Payer / Insurance">
                <Select value={payer} onValueChange={setPayer}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </F>
            </div>

            <div className="flex gap-6 text-sm pt-1 border-t">
              <span>Total: <strong>₹{totalAmount.toLocaleString()}</strong></span>
              <span>Paid: <strong className="text-green-600">₹{paid.toLocaleString()}</strong></span>
              {balance !== 0 && <span>Balance: <strong className={balance > 0 ? "text-red-600" : "text-green-600"}>₹{Math.abs(balance).toLocaleString()}{balance < 0 ? " (overpaid)" : ""}</strong></span>}
            </div>
          </div>

          <F label="Notes">
            <Textarea className="h-12 text-sm resize-none" placeholder="Any billing notes..." value={notes}
              onChange={(e) => setNotes(e.target.value)} />
          </F>

          {error && <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : isEdit ? (payOnly ? "Record Payment" : "Update Bill") : "Generate Bill"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
