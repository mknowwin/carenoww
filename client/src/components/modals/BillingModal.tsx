import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { billing as billingApi, users as usersApi, ratemaster as ratemasterApi, pharmacy as pharmacyApi, patients as patientsApi } from "@/lib/api";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Plus, Trash2, IndianRupee, Stethoscope, Printer, CheckCircle2, Search, Pill, Loader2, UserCheck } from "lucide-react";
import { printBill } from "@/lib/print";

const BILL_TYPES    = ["OPD", "IPD", "Emergency", "Lab", "Pharmacy"] as const;
const PAYMENT_MODES = ["Cash", "Card", "UPI", "Insurance", "Online"] as const;
const CATEGORIES    = ["Consultation", "Diagnosis", "Lab", "Pharmacy", "Procedure", "Room", "Bed Charges", "Nursing", "Other"] as const;
const PAYERS        = ["Self","Star Health","New India","United India","Max Bupa","HDFC Ergo","Medi Assist","CGHS","ESI","Other"];

// Rate categories shown per bill type in the service charge panel
const BILL_RATE_CATEGORIES: Record<string, string[]> = {
  OPD:       ["Consultation", "Diagnosis", "Lab", "Procedure", "Other"],
  IPD:       ["Consultation", "Procedure", "Room", "Bed Charges", "Nursing", "Other"],
  Emergency: ["Consultation", "Procedure", "Other"],
  Lab:       ["Lab"],
};

interface BillItem { description: string; category: string; quantity: number; unitPrice: number; total: number; batchNo?: string; expiryDate?: string; drugId?: string; availableQty?: number; }
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
  const [patientId,       setPatientId]       = useState("");
  const [patientName,     setPatientName]     = useState("");
  const [type,            setType]            = useState("OPD");
  const [doctorName,      setDoctorName]      = useState("__none__");
  const [items,           setItems]           = useState<BillItem[]>([emptyItem()]);
  const [discountType,    setDiscountType]    = useState<"Flat" | "Percent">("Flat");
  const [discount,        setDiscount]        = useState(0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [paid,            setPaid]            = useState(0);
  const [payer,           setPayer]           = useState("Self");
  const [paymentMode,     setPaymentMode]     = useState("Cash");
  const [transactionRef,  setTransactionRef]  = useState("");
  const [insurer,         setInsurer]         = useState({ tpaName: "", policyNo: "", memberNo: "" });
  const [notes,           setNotes]           = useState("");
  const [rateNameFilter,  setRateNameFilter]  = useState("");
  const [drugSearch,      setDrugSearch]      = useState("");
  const [manualPharmacy,  setManualPharmacy]  = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState("");
  const [savedBill,       setSavedBill]       = useState<any>(null);
  const [uhidStatus,      setUhidStatus]      = useState<"idle" | "loading" | "found" | "not-found">("idle");

  // ── doctors ────────────────────────────────────────────────────────────────
  const { data: doctorsRaw } = useQuery({ queryKey: ["doctors"], queryFn: () => usersApi.doctors(), retry: false, enabled: open });
  const doctors: any[] = Array.isArray(doctorsRaw) ? doctorsRaw : [];

  // ── service rate master ────────────────────────────────────────────────────
  const { data: rates = [] } = useQuery({ queryKey: ["ratemaster"], queryFn: () => ratemasterApi.list(), retry: false, enabled: open && !payOnly });

  // Filter to categories relevant for the current bill type, then by name search
  const allowedCats: string[] = BILL_RATE_CATEGORIES[type] ?? [];
  const relevantRates = (rates as any[]).filter((r) =>
    allowedCats.includes(r.category) &&
    (!rateNameFilter || r.name.toLowerCase().includes(rateNameFilter.toLowerCase()))
  );
  // Group by category, preserving the order defined in allowedCats
  const groupedRates = allowedCats.reduce<Record<string, any[]>>((acc, cat) => {
    const catRates = relevantRates.filter((r) => r.category === cat);
    if (catRates.length > 0) acc[cat] = catRates;
    return acc;
  }, {});

  // ── drug inventory search (pharmacy bills) ─────────────────────────────────
  const isPharmacyBill = type === "Pharmacy" && !payOnly && !manualPharmacy;
  const { data: drugResults = [] } = useQuery({
    queryKey: ["inventory-search", drugSearch],
    queryFn:  () => pharmacyApi.inventory.list({ search: drugSearch }),
    enabled:  open && isPharmacyBill && drugSearch.length >= 1,
    retry:    false,
  });
  const drugList: any[] = Array.isArray(drugResults) ? drugResults : (drugResults as any)?.drugs ?? [];

  const qtyInputRef = useRef<HTMLInputElement | null>(null);
  const [justAddedItem, setJustAddedItem] = useState<BillItem | null>(null);
  useEffect(() => {
    if (justAddedItem) {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }
  }, [justAddedItem]);

  const addDrugItem = async (drug: any) => {
    let unitPrice = drug.mrpPerUnit ?? 0;
    let batchNo: string | undefined;
    let expiryDate: string | undefined;
    let availableQty: number = drug.stock ?? 0;
    try {
      const batches: any[] = await pharmacyApi.batches.list(drug._id);
      const activeBatches = batches
        .filter((b) => b.status === "Active" && b.quantityRemaining > 0)
        .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
      if (activeBatches.length > 0) {
        if (activeBatches[0].mrpPerUnit != null) unitPrice = activeBatches[0].mrpPerUnit;
        batchNo      = activeBatches[0].batchNo;
        expiryDate   = activeBatches[0].expiryDate;
        availableQty = activeBatches.reduce((s, b) => s + b.quantityRemaining, 0);
      }
    } catch {
      // fall back to inventory-level values
    }
    const newItem: BillItem = { description: drug.name, category: "Pharmacy", quantity: 1, unitPrice, total: unitPrice, batchNo, expiryDate, drugId: drug._id, availableQty };
    setItems((prev) => [
      ...prev.filter((it) => it.description !== "" || it.unitPrice > 0),
      newItem,
    ]);
    setDrugSearch("");
    setJustAddedItem(newItem);
  };

  // ── reset / populate on open ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) { setError(""); setSavedBill(null); return; }
    // Store only the numeric portion; strip "UHID-" prefix from existing/prefill values.
    const rawId = existing?.patientId ?? prefill?.patientId ?? "";
    setPatientId(rawId.replace(/^UHID-/, ""));
    setPatientName(existing?.patientName ?? prefill?.patientName ?? "");
    setType(existing?.type ?? prefill?.type ?? "OPD");
    setDoctorName(existing?.doctor ?? prefill?.doctor ?? "__none__");
    setItems(existing?.items?.length ? existing.items : [emptyItem()]);
    setDiscountType(existing?.discountType ?? "Flat");
    setDiscount(existing?.discount ?? 0);
    setDiscountPercent(existing?.discountPercent ?? 0);
    setPaid(existing?.paid ?? 0);
    setPayer(existing?.payer ?? "Self");
    setPaymentMode(existing?.paymentMode ?? "Cash");
    setTransactionRef("");
    setInsurer({ tpaName: existing?.insurance?.tpaName ?? "", policyNo: existing?.insurance?.policyNo ?? "", memberNo: existing?.insurance?.memberNo ?? "" });
    setNotes(existing?.notes ?? "");
    setRateNameFilter("");
    setDrugSearch("");
    setManualPharmacy(false);
    setJustAddedItem(null);
    setSavedBill(null); setError(""); setUhidStatus("idle");
  }, [open]);

  // patientId holds only the numeric portion typed by the user; UHID- prefix is added here.
  const effectiveUhid = patientId ? `UHID-${patientId.padStart(3, "0")}` : "";

  // ── UHID → auto-fill patient name ─────────────────────────────────────────
  useEffect(() => {
    if (!effectiveUhid || isEdit) { setUhidStatus("idle"); return; }
    setUhidStatus("loading");
    const timer = setTimeout(async () => {
      try {
        const res = await patientsApi.list({ search: effectiveUhid });
        const match = (res.patients ?? []).find((p: any) => p.uhid === effectiveUhid);
        if (match) {
          setPatientName(match.name);
          setUhidStatus("found");
        } else {
          setUhidStatus("not-found");
        }
      } catch {
        setUhidStatus("idle");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [effectiveUhid]);

  // ── doctor → auto-fill consulting fee ─────────────────────────────────────
  const handleDoctorChange = (name: string) => {
    setDoctorName(name);
    if (!name || name === "__none__") return;
    const doc = doctors.find((d) => d.name === name);
    if (!doc) return;
    const fee = (doc.consultingFee as number) ?? 0;
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.category === "Consultation");
      const newRow: BillItem = { description: `Consultation — Dr. ${doc.name}`, category: "Consultation", quantity: 1, unitPrice: fee, total: fee };
      if (idx === -1) return [newRow, ...prev.filter((it) => it.description !== "")];
      return prev.map((it, i) => i !== idx ? it : { ...it, description: newRow.description, unitPrice: fee, total: fee });
    });
  };

  // ── rate master quick-pick ─────────────────────────────────────────────────
  const addRateItem = (rate: any) => {
    setItems((prev) => [...prev.filter((it) => it.description !== ""), {
      description: rate.name,
      category:    rate.category,
      quantity:    1,
      unitPrice:   rate.defaultRate,
      total:       rate.defaultRate,
    }]);
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
  const discountAmt = discountType === "Percent" ? Math.round((subtotal * discountPercent) / 100) : discount;
  const totalAmount = Math.max(0, subtotal - discountAmt);
  const balance     = totalAmount - paid;

  // ── submit ─────────────────────────────────────────────────────────────────
  // isDraft-in-progress (existing.status === "Draft") never disappears just because
  // the user is now filling in more fields — only the button clicked decides whether
  // this save stays a Draft or finalizes it.
  const handleSubmit = async (e: React.SyntheticEvent, opts: { asDraft?: boolean } = {}) => {
    e.preventDefault();
    if (loading) return;
    const asDraft = opts.asDraft ?? false;
    if (!patientName.trim()) { setError("Patient name is required"); return; }
    if (!asDraft && !payOnly && items.some((it) => !it.description.trim())) { setError("All items need a description"); return; }
    const overStock = !asDraft && !payOnly && items.find((it) => it.availableQty != null && it.quantity > it.availableQty);
    if (overStock) { setError(`Quantity for "${overStock.description}" exceeds available stock (${overStock.availableQty})`); return; }

    setLoading(true); setError("");
    try {
      let result: any;

      if (payOnly) {
        // Use the dedicated payment endpoint to preserve audit trail
        result = await billingApi.postPayment(existing._id || existing.id, {
          amount:       paid,
          paymentMode,
          payer,
          transactionRef,
          notes,
        });
      } else {
        const payload: any = {
          patientId: effectiveUhid, patientName, type,
          doctor: (doctorName && doctorName !== "__none__") ? doctorName : undefined,
          items:  items.map((it) => ({ ...it, quantity: Number(it.quantity), unitPrice: Number(it.unitPrice), total: Number(it.total) })),
          amount: totalAmount,
          discount: discountAmt,
          discountType,
          discountPercent,
          paid: asDraft ? 0 : paid, payer, paymentMode, notes,
          // Omitted (not "Draft") when finalizing — the server then always
          // recomputes a real Paid/Partial/Pending status from amount vs paid.
          status: asDraft ? "Draft" : undefined,
        };
        // Attach insurance info when mode is Insurance
        if (paymentMode === "Insurance") {
          payload.insurance = { ...insurer };
        }
        result = isEdit
          ? await billingApi.update(existing._id || existing.id, payload)
          : await billingApi.create(payload);
      }

      qc.invalidateQueries({ queryKey: ["billing"] });
      if (type === "Pharmacy") qc.invalidateQueries({ queryKey: ["pharmacy-inventory"] });
      setSavedBill({
        billId:      result?.billId,
        patientName: patientName || existing?.patientName,
        amount:      payOnly ? existing?.amount : totalAmount,
        paid:        payOnly ? (existing?.paid ?? 0) + paid : (asDraft ? 0 : paid),
        balance:     payOnly ? Math.max(0, (existing?.balance ?? 0) - paid) : (asDraft ? totalAmount : balance),
        ...result, // includes the server-authoritative `status` (e.g. "Draft")
      });
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => { setSavedBill(null); onClose(); };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">

        {/* ── Success screen ── */}
        {savedBill ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-5 w-5" />
                {payOnly ? "Payment Recorded" : savedBill.status === "Draft" ? "Draft Saved" : isEdit ? "Bill Updated" : "Bill Generated"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2 text-sm">
                {savedBill.billId && <div className="flex justify-between"><span className="text-muted-foreground">Bill ID</span><span className="font-mono font-bold">{savedBill.billId}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Patient</span><span className="font-semibold">{savedBill.patientName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-bold">₹{(savedBill.amount || 0).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="font-bold text-green-600">₹{(savedBill.paid || 0).toLocaleString()}</span></div>
                {(savedBill.balance ?? 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Balance</span><span className="font-bold text-amber-600">₹{savedBill.balance.toLocaleString()}</span></div>}
              </div>
              <div className="flex gap-2">
                {savedBill.status !== "Draft" && (
                  <Button className="flex-1 gap-2" onClick={() => { printBill(savedBill); handleClose(); }}>
                    <Printer className="h-4 w-4" /> Print Receipt
                  </Button>
                )}
                <Button variant="outline" className="flex-1" onClick={handleClose}>Close</Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-teal-600" />
                {isEdit ? (payOnly ? "Record Payment" : existing?.status === "Draft" ? "Complete Draft" : "Edit Bill") : "Generate Bill"}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Patient + type */}
              {!payOnly && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <F label="Patient UHID">
                    <div className="relative flex items-center h-8 border rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-ring">
                      <span className="px-2 text-xs text-muted-foreground bg-muted border-r h-full flex items-center select-none shrink-0">UHID-</span>
                      <Input
                        className="border-0 h-full text-sm pr-7 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
                        value={patientId}
                        placeholder="001"
                        inputMode="numeric"
                        onChange={(e) => { setPatientId(e.target.value.replace(/\D/g, "")); setUhidStatus("idle"); }}
                      />
                      {uhidStatus === "loading"   && <Loader2   className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      {uhidStatus === "found"     && <UserCheck  className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-green-600" />}
                      {uhidStatus === "not-found" && <span       className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-destructive">?</span>}
                    </div>
                  </F>
                  <F label="Patient Name *"><Input className="h-8 text-sm" value={patientName} placeholder="Full name" required onChange={(e) => setPatientName(e.target.value)} /></F>
                  <F label="Bill Type">
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{BILL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </F>
                </div>
              )}

              {/* Pay-only info */}
              {payOnly && (
                <div className="bg-muted/40 rounded-xl p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Patient</span><span className="font-semibold">{existing?.patientName}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Bill Total</span><span className="font-bold">₹{(existing?.amount || 0).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Already Paid</span><span className="text-green-600 font-semibold">₹{(existing?.paid || 0).toLocaleString()}</span></div>
                  <div className="flex justify-between border-t pt-1 mt-1"><span className="text-muted-foreground font-medium">Balance Due</span><span className="text-amber-600 font-bold">₹{(existing?.balance || 0).toLocaleString()}</span></div>
                </div>
              )}

              {/* Doctor picker */}
              {!payOnly && (type === "OPD" || type === "IPD" || type === "Emergency") && (
                <div className="flex items-end gap-3 p-3 bg-teal-50 border border-teal-100 rounded-xl">
                  <Stethoscope className="h-4 w-4 text-teal-600 mb-2 shrink-0" />
                  <div className="flex-1">
                    <Label className="text-xs text-teal-700 font-semibold">Consulting Doctor</Label>
                    <Select value={doctorName} onValueChange={handleDoctorChange}>
                      <SelectTrigger className="mt-1 h-8 text-sm bg-white"><SelectValue placeholder="Select doctor (optional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— No doctor —</SelectItem>
                        {doctors.map((d) => (
                          <SelectItem key={d._id} value={d.name}>{d.name}{d.consultingFee > 0 && <span className="ml-2 text-xs text-muted-foreground">· ₹{d.consultingFee.toLocaleString()}</span>}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Service charge panel — categorised by bill type */}
              {!payOnly && type !== "Pharmacy" && allowedCats.length > 0 && (rates as any[]).length > 0 && (
                <div className="border rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Service Charges</span>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                      <Input
                        className="h-6 pl-6 text-xs w-80 bg-background"
                        placeholder="Filter charges…"
                        value={rateNameFilter}
                        onChange={(e) => setRateNameFilter(e.target.value)}
                      />
                    </div>
                  </div>

                  {rateNameFilter.trim().length === 0 ? (
                    <p className="text-xs text-muted-foreground px-3 py-3">Type to search service charges…</p>
                  ) : Object.keys(groupedRates).length === 0 ? (
                    <p className="text-xs text-muted-foreground px-3 py-3">No charges match "{rateNameFilter}".</p>
                  ) : (
                    <div className="max-h-56 overflow-y-auto divide-y">
                      {allowedCats.filter((cat) => groupedRates[cat]).map((cat) => (
                        <div key={cat}>
                          <div className="px-3 py-1 bg-muted/20 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            {cat}
                          </div>
                          {groupedRates[cat].map((r: any) => (
                            <div key={r._id} className="flex items-center justify-between px-3 py-1.5 hover:bg-accent/50 transition-colors group">
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium truncate">{r.name}</span>
                                {r.unit && <span className="text-xs text-muted-foreground ml-2">{r.unit}</span>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0 ml-2">
                                <span className="text-sm font-semibold">₹{r.defaultRate.toLocaleString()}</span>
                                <button
                                  type="button"
                                  onClick={() => addRateItem(r)}
                                  className="h-6 w-6 flex items-center justify-center rounded-md border border-primary/30 bg-primary/5 text-primary hover:bg-primary hover:text-primary-foreground transition-colors text-xs font-bold opacity-0 group-hover:opacity-100"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Pharmacy drug search (replaces manual line items when type=Pharmacy) */}
              {!payOnly && isPharmacyBill && (
                <div className="space-y-3">
                  <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl space-y-2">
                    <div className="flex items-center gap-2">
                      <Pill className="h-4 w-4 text-purple-600 shrink-0" />
                      <Label className="text-xs text-purple-700 font-semibold">Search Drug Inventory</Label>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input className="h-8 pl-8 text-sm" placeholder="Type drug name to search…" value={drugSearch} onChange={(e) => setDrugSearch(e.target.value)} />
                    </div>
                    {drugSearch.length >= 1 && drugList.length > 0 && (
                      <div className="border rounded-md divide-y bg-white max-h-40 overflow-y-auto">
                        {drugList.slice(0, 10).map((d: any) => (
                          <button key={d._id} type="button" onClick={() => addDrugItem(d)}
                            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-accent transition-colors">
                            <div>
                              <span className="text-sm font-medium">{d.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{d.unit} · Stock: {d.stock}</span>
                            </div>
                            <span className="text-sm font-semibold text-purple-700 shrink-0 ml-2">₹{(d.mrpPerUnit ?? 0).toLocaleString()}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {drugSearch.length >= 1 && drugList.length === 0 && (
                      <p className="text-xs text-muted-foreground">No drugs found for "{drugSearch}".</p>
                    )}
                  </div>

                  {/* Added drugs table */}
                  {items.some((it) => it.description !== "" || it.unitPrice > 0) && (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[2fr_72px_88px_70px_32px] gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 border-b pb-1.5">
                        <span>Drug</span><span className="text-center">Qty</span><span className="text-right">MRP/Unit</span><span className="text-right">Total</span><span />
                      </div>
                      {items.filter((it) => it.description !== "" || it.unitPrice > 0).map((item, idx) => {
                        const overStock = item.availableQty != null && item.quantity > item.availableQty;
                        return (
                          <div key={idx} className="space-y-0.5">
                            <div className="grid grid-cols-[2fr_72px_88px_70px_32px] gap-1.5 items-center">
                              <span className="text-sm pl-1 leading-tight">
                                <span className="truncate block">{item.description}</span>
                                {item.batchNo && (
                                  <span className="block text-[10px] text-muted-foreground">
                                    Batch: {item.batchNo}{item.expiryDate ? ` · Exp: ${new Date(item.expiryDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}` : ""}
                                  </span>
                                )}
                              </span>
                              <Input ref={item === justAddedItem ? qtyInputRef : undefined} className={`h-7 text-xs text-center ${overStock ? "border-red-400 focus-visible:ring-red-400" : ""}`} type="number" min={1} step={1} value={item.quantity} onFocus={(e) => e.target.select()} onChange={(e) => updateItem(items.indexOf(item), "quantity", parseInt(e.target.value) || 1)} />
                              <Input className="h-7 text-xs text-right" type="number" min={0} step="0.01" value={item.unitPrice || ""} onChange={(e) => updateItem(items.indexOf(item), "unitPrice", parseFloat(e.target.value) || 0)} />
                              <div className="text-xs text-right font-semibold pr-1">₹{(item.total || 0).toLocaleString()}</div>
                              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                onClick={() => setItems((p) => p.filter((_, i) => i !== items.indexOf(item)))}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            {overStock && (
                              <p className="text-[10px] text-red-600 pl-1">Only {item.availableQty} in stock</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <button type="button" className="text-xs text-muted-foreground underline underline-offset-2"
                    onClick={() => setManualPharmacy(true)}>
                    Add item manually (not in inventory)
                  </button>
                </div>
              )}

              {/* Line items (non-pharmacy or manual pharmacy mode) */}
              {!payOnly && !isPharmacyBill && (
                <div className="space-y-2">
                  <div className="grid grid-cols-[2fr_1.2fr_72px_88px_70px_32px] gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 border-b pb-1.5">
                    <span>Description</span><span>Category</span><span className="text-center">Qty</span><span className="text-right">Unit Price</span><span className="text-right">Total</span><span />
                  </div>
                  {items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-[2fr_1.2fr_72px_88px_70px_32px] gap-1.5 items-center">
                      <Input className="h-7 text-xs" placeholder="e.g. Consultation, CBC test" value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} />
                      <select value={item.category} onChange={(e) => updateItem(idx, "category", e.target.value)} className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <Input className="h-7 text-xs text-center" type="number" min={1} step={1} value={item.quantity} onFocus={(e) => e.target.select()} onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)} />
                      <Input className="h-7 text-xs text-right" type="number" min={0} step="0.01" placeholder="₹" value={item.unitPrice || ""} onChange={(e) => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)} />
                      <div className="text-xs text-right font-semibold pr-1">₹{(item.total || 0).toLocaleString()}</div>
                      {items.length > 1 ? (
                        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : <div />}
                    </div>
                  ))}
                  <div className="flex gap-2 flex-wrap">
                    <Button type="button" variant="outline" size="sm" className="gap-1 text-xs h-7 mt-1" onClick={() => setItems((p) => [...p, emptyItem()])}>
                      <Plus className="h-3 w-3" /> Add Item
                    </Button>
                    {manualPharmacy && (
                      <button type="button" className="text-xs text-muted-foreground underline underline-offset-2 mt-1"
                        onClick={() => { setManualPharmacy(false); setItems([emptyItem()]); }}>
                        ← Back to drug search
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Summary + payment */}
              <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
                {!payOnly && (
                  <div className="grid grid-cols-2 gap-3 pb-2 border-b">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Discount</Label>
                      <div className="flex gap-1.5">
                        <div className="flex rounded-md border border-input overflow-hidden text-xs">
                          {(["Flat", "Percent"] as const).map((t) => (
                            <button key={t} type="button"
                              className={`px-2.5 py-1 ${discountType === t ? "bg-primary text-primary-foreground" : "bg-background"}`}
                              onClick={() => setDiscountType(t)}>
                              {t === "Flat" ? "₹" : "%"}
                            </button>
                          ))}
                        </div>
                        {discountType === "Flat" ? (
                          <Input className="h-7 text-sm flex-1" type="number" min={0} step="0.01" value={discount || ""} onChange={(e) => setDiscount(Math.round(parseFloat(e.target.value || "0") * 100) / 100)} />
                        ) : (
                          <Input className="h-7 text-sm flex-1" type="number" min={0} max={100} step="0.01" value={discountPercent || ""} onChange={(e) => setDiscountPercent(Math.round(parseFloat(e.target.value || "0") * 100) / 100)} />
                        )}
                        {discountAmt > 0 && <span className="text-xs text-muted-foreground self-center whitespace-nowrap">= ₹{discountAmt.toLocaleString()}</span>}
                      </div>
                    </div>
                    <div className="flex items-end">
                      <div><div className="text-xs text-muted-foreground mb-1">Net Total</div><div className="text-xl font-bold text-teal-700">₹{totalAmount.toLocaleString()}</div></div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <F label={payOnly ? `Amount to Pay (balance ₹${(existing?.balance || 0).toLocaleString()})` : "Amount Paid Now (₹)"}>
                    <Input className="h-8 text-sm" type="number" min={0} max={payOnly ? existing?.balance : undefined} value={paid || ""} onChange={(e) => setPaid(parseFloat(e.target.value) || 0)} />
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

                {/* Insurance sub-form */}
                {paymentMode === "Insurance" && (
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                    <F label="TPA Name"><Input className="h-7 text-xs" placeholder="e.g. Medi Assist" value={insurer.tpaName} onChange={(e) => setInsurer((p) => ({ ...p, tpaName: e.target.value }))} /></F>
                    <F label="Policy No"><Input className="h-7 text-xs" value={insurer.policyNo} onChange={(e) => setInsurer((p) => ({ ...p, policyNo: e.target.value }))} /></F>
                    <F label="Member No"><Input className="h-7 text-xs" value={insurer.memberNo} onChange={(e) => setInsurer((p) => ({ ...p, memberNo: e.target.value }))} /></F>
                  </div>
                )}

                {/* Transaction ref for Card/UPI */}
                {(paymentMode === "Card" || paymentMode === "UPI" || paymentMode === "Online") && (
                  <F label="Transaction / Reference No">
                    <Input className="h-7 text-sm" placeholder="Auth code / UPI ref" value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} />
                  </F>
                )}

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
                <Textarea className="h-14 text-sm resize-none" placeholder="Any billing notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </F>

              {error && <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>}

              <div className="flex justify-end gap-2 pt-1 border-t">
                <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                {!payOnly && (!isEdit || existing?.status === "Draft") && (
                  <Button type="button" variant="secondary" disabled={loading} className="gap-2"
                    onClick={(e) => handleSubmit(e, { asDraft: true })}>
                    Save as Draft
                  </Button>
                )}
                <Button type="submit" disabled={loading} className="gap-2 min-w-[150px]">
                  <IndianRupee className="h-3.5 w-3.5" />
                  {loading ? "Saving…" : isEdit ? (payOnly ? "Record Payment" : existing?.status === "Draft" ? "Generate Bill" : "Update Bill") : "Generate Bill"}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
