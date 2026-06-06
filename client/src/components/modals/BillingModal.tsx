import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { billing as billingApi, users as usersApi } from "@/lib/api";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Plus, Trash2, IndianRupee, Stethoscope, Printer, CheckCircle2 } from "lucide-react";
import { printBill } from "@/lib/print";

const BILL_TYPES    = ["OPD", "IPD", "Emergency", "Lab", "Pharmacy"] as const;
const PAYMENT_MODES = ["Cash", "Card", "UPI", "Insurance", "Online"] as const;
const CATEGORIES    = ["Consultation", "Lab", "Pharmacy", "Procedure", "Room", "Bed Charges", "Nursing", "Other"] as const;
const PAYERS        = ["Self","Star Health","New India","United India","Max Bupa","HDFC Ergo","Medi Assist","CGHS","ESI","Other"];

interface BillItem { description: string; category: string; quantity: number; unitPrice: number; total: number; }
const emptyItem = (): BillItem => ({ description: "", category: "Consultation", quantity: 1, unitPrice: 0, total: 0 });

interface Props {
  open: boolean;
  onClose: () => void;
  existing?: any;
  payOnly?: boolean;
  prefill?: { patientId?: string; patientName?: string; type?: string; doctor?: string; };
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}

export default function BillingModal({ open, onClose, existing, payOnly = false, prefill }: Props) {
  const qc     = useQueryClient();
  const isEdit = !!existing;

  // ── form state ─────────────────────────────────────────────────────────────
  const [patientId,   setPatientId]   = useState("");
  const [patientName, setPatientName] = useState("");
  const [type,        setType]        = useState("OPD");
  const [doctorName,  setDoctorName]  = useState("__none__");
  const [items,       setItems]       = useState<BillItem[]>([emptyItem()]);
  const [discount,    setDiscount]    = useState(0);
  const [paid,        setPaid]        = useState(0);
  const [payer,       setPayer]       = useState("Self");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [notes,       setNotes]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  // success state — shown INSIDE the same Dialog, no component-swap
  const [savedBill,   setSavedBill]   = useState<any>(null);

  // ── doctors (for consulting fee) ──────────────────────────────────────────
  const { data: doctorsRaw } = useQuery({
    queryKey: ["doctors"],
    queryFn:  () => usersApi.doctors(),
    retry: false,
    enabled: open,                 // only fetch when modal is open
  });
  const doctors: any[] = Array.isArray(doctorsRaw) ? doctorsRaw : [];

  // ── reset / populate on open ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setError("");
      setSavedBill(null);
      return;
    }
    // populate from existing or prefill
    setPatientId(existing?.patientId   ?? prefill?.patientId   ?? "");
    setPatientName(existing?.patientName ?? prefill?.patientName ?? "");
    setType(existing?.type ?? prefill?.type ?? "OPD");
    setDoctorName(existing?.doctor ?? prefill?.doctor ?? "__none__");
    setItems(existing?.items?.length ? existing.items : [emptyItem()]);
    setDiscount(existing?.discount ?? 0);
    setPaid(existing?.paid ?? 0);
    setPayer(existing?.payer ?? "Self");
    setPaymentMode(existing?.paymentMode ?? "Cash");
    setNotes(existing?.notes ?? "");
    setSavedBill(null);
    setError("");
  }, [open]);                     // only key on `open` — avoids stale-ref issues

  // ── doctor → auto-fill consulting fee ────────────────────────────────────
  const handleDoctorChange = (name: string) => {
    setDoctorName(name);
    if (!name || name === "__none__") return;
    const doc = doctors.find((d) => d.name === name);
    if (!doc?.consultingFee) return;

    setItems((prev) => {
      const idx = prev.findIndex((it) => it.category === "Consultation");
      const fee = doc.consultingFee as number;
      const newRow: BillItem = {
        description: `Consultation — Dr. ${doc.name}`,
        category: "Consultation",
        quantity: 1,
        unitPrice: fee,
        total: fee,
      };
      if (idx === -1) {
        return [newRow, ...prev.filter((it) => it.description !== "")];
      }
      return prev.map((it, i) => i !== idx ? it : { ...it, description: newRow.description, unitPrice: fee, total: fee });
    });
  };

  const updateItem = (idx: number, field: keyof BillItem, value: any) => {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, [field]: value };
      next.total = Number((next.quantity * next.unitPrice).toFixed(2));
      return next;
    }));
  };

  const subtotal    = items.reduce((s, it) => s + (it.total || 0), 0);
  const totalAmount = Math.max(0, subtotal - discount);
  const balance     = totalAmount - paid;

  // ── submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName.trim()) { setError("Patient name is required"); return; }
    if (!payOnly && items.some((it) => !it.description.trim())) {
      setError("All items need a description");
      return;
    }

    setLoading(true); setError("");
    try {
      let result: any;

      if (payOnly) {
        // payment-only: only update paid amount and mode — don't touch items/amount
        result = await billingApi.update(existing._id || existing.id, {
          paid,
          paymentMode,
          payer,
          notes: notes || existing?.notes,
        });
      } else {
        const payload = {
          patientId, patientName, type,
          doctor: (doctorName && doctorName !== "__none__") ? doctorName : undefined,
          items: items.map((it) => ({
            ...it,
            quantity:  Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            total:     Number(it.total),
          })),
          amount: totalAmount,
          discount,
          paid,
          payer,
          paymentMode,
          notes,
        };
        result = isEdit
          ? await billingApi.update(existing._id || existing.id, payload)
          : await billingApi.create(payload);
      }

      qc.invalidateQueries({ queryKey: ["billing"] });
      setSavedBill({
        billId:      result?.billId,
        patientName: patientName || existing?.patientName,
        amount:      payOnly ? existing?.amount : totalAmount,
        paid:        paid,
        balance:     payOnly ? (existing?.amount ?? 0) - paid : balance,
        ...result,
      });
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSavedBill(null);
    onClose();
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">

        {/* ── Success screen (inside same Dialog) ── */}
        {savedBill ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-5 w-5" />
                {payOnly ? "Payment Recorded" : isEdit ? "Bill Updated" : "Bill Generated"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2 text-sm">
                {savedBill.billId && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bill ID</span>
                    <span className="font-mono font-bold">{savedBill.billId}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Patient</span>
                  <span className="font-semibold">{savedBill.patientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-bold">₹{(savedBill.amount || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="font-bold text-green-600">₹{(savedBill.paid || 0).toLocaleString()}</span>
                </div>
                {(savedBill.balance ?? 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Balance</span>
                    <span className="font-bold text-amber-600">₹{savedBill.balance.toLocaleString()}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-2"
                  onClick={() => { printBill(savedBill); handleClose(); }}
                >
                  <Printer className="h-4 w-4" /> Print Receipt
                </Button>
                <Button variant="outline" className="flex-1" onClick={handleClose}>
                  Close
                </Button>
              </div>
            </div>
          </>
        ) : (

        /* ── Main form ── */
        <>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-teal-600" />
              {isEdit ? (payOnly ? "Record Payment" : "Edit Bill") : "Generate Bill"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Patient + type */}
            {!payOnly && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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

            {/* Pay-only patient info (read-only) */}
            {payOnly && (
              <div className="bg-muted/40 rounded-xl p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Patient</span>
                  <span className="font-semibold">{existing?.patientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bill Total</span>
                  <span className="font-bold">₹{(existing?.amount || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Already Paid</span>
                  <span className="text-green-600 font-semibold">₹{(existing?.paid || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t pt-1 mt-1">
                  <span className="text-muted-foreground font-medium">Balance Due</span>
                  <span className="text-amber-600 font-bold">₹{(existing?.balance || 0).toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Doctor picker */}
            {!payOnly && (type === "OPD" || type === "IPD" || type === "Emergency") && (
              <div className="flex items-end gap-3 p-3 bg-teal-50 border border-teal-100 rounded-xl">
                <Stethoscope className="h-4 w-4 text-teal-600 mb-2 shrink-0" />
                <div className="flex-1">
                  <Label className="text-xs text-teal-700 font-semibold">Consulting Doctor</Label>
                  <Select value={doctorName} onValueChange={handleDoctorChange}>
                    <SelectTrigger className="mt-1 h-8 text-sm bg-white">
                      <SelectValue placeholder="Select doctor (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— No doctor —</SelectItem>
                      {doctors.map((d) => (
                        <SelectItem key={d._id} value={d.name}>
                          {d.name}
                          {d.consultingFee > 0 && (
                            <span className="ml-2 text-xs text-muted-foreground">· ₹{d.consultingFee.toLocaleString()}</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {doctorName && doctorName !== "__none__" && doctors.find((d) => d.name === doctorName)?.consultingFee > 0 && (
                  <Badge className="bg-teal-100 text-teal-700 text-xs shrink-0 mb-0.5">
                    Fee: ₹{doctors.find((d) => d.name === doctorName)?.consultingFee?.toLocaleString()}
                  </Badge>
                )}
              </div>
            )}

            {/* Line items */}
            {!payOnly && (
              <div className="space-y-2">
                <div className="grid grid-cols-[2fr_1.2fr_52px_88px_70px_32px] gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 border-b pb-1.5">
                  <span>Description</span>
                  <span>Category</span>
                  <span className="text-center">Qty</span>
                  <span className="text-right">Unit Price</span>
                  <span className="text-right">Total</span>
                  <span />
                </div>
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[2fr_1.2fr_52px_88px_70px_32px] gap-1.5 items-center">
                    <Input className="h-7 text-xs" placeholder="e.g. Consultation, CBC test"
                      value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} />
                    <select value={item.category} onChange={(e) => updateItem(idx, "category", e.target.value)}
                      className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <Input className="h-7 text-xs text-center" type="number" min={1}
                      value={item.quantity} onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 1)} />
                    <Input className="h-7 text-xs text-right" type="number" min={0} placeholder="₹"
                      value={item.unitPrice || ""} onChange={(e) => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)} />
                    <div className="text-xs text-right font-semibold pr-1">₹{(item.total || 0).toLocaleString()}</div>
                    {items.length > 1 ? (
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                        onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : <div />}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="gap-1 text-xs h-7 mt-1"
                  onClick={() => setItems((p) => [...p, emptyItem()])}>
                  <Plus className="h-3 w-3" /> Add Item
                </Button>
              </div>
            )}

            {/* Summary + payment */}
            <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
              {!payOnly && (
                <div className="grid grid-cols-2 gap-3 pb-2 border-b">
                  <F label="Discount (₹)">
                    <Input className="h-8 text-sm" type="number" min={0} value={discount || ""}
                      onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} />
                  </F>
                  <div className="flex items-end">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Net Total</div>
                      <div className="text-xl font-bold text-teal-700">₹{totalAmount.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <F label={payOnly ? `Amount to Pay (₹) — balance ₹${(existing?.balance || 0).toLocaleString()}` : "Amount Paid Now (₹)"}>
                  <Input className="h-8 text-sm" type="number" min={0}
                    max={payOnly ? existing?.balance : undefined}
                    value={paid || ""}
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

              {!payOnly && (
                <div className="flex gap-5 text-sm pt-1 border-t flex-wrap">
                  <span>Total: <strong>₹{totalAmount.toLocaleString()}</strong></span>
                  <span>Paid: <strong className="text-green-600">₹{paid.toLocaleString()}</strong></span>
                  {balance > 0  && <span>Balance: <strong className="text-red-500">₹{balance.toLocaleString()}</strong></span>}
                  {balance < 0  && <span className="text-green-600">Overpaid: <strong>₹{Math.abs(balance).toLocaleString()}</strong></span>}
                  {balance === 0 && paid > 0 && <span className="text-green-600 font-medium">✓ Fully paid</span>}
                </div>
              )}
            </div>

            <F label="Notes">
              <Textarea className="h-14 text-sm resize-none" placeholder="Any billing notes…"
                value={notes} onChange={(e) => setNotes(e.target.value)} />
            </F>

            {error && <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>}

            <div className="flex justify-end gap-2 pt-1 border-t">
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={loading} className="gap-2 min-w-[150px]">
                <IndianRupee className="h-3.5 w-3.5" />
                {loading ? "Saving…" : isEdit ? (payOnly ? "Record Payment" : "Update Bill") : "Generate Bill"}
              </Button>
            </div>
          </form>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
