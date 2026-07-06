import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, RefreshCw, X, Loader2 } from "lucide-react";
import { pharmacy as pharmApi, suppliers as suppliersApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { DRUG_UNITS } from "@/lib/constants";

interface GRNItem {
  drugName: string;
  drugId: string;
  unit: string;
  batchNo: string;
  expiryDate: string;
  quantityReceived: number;
  purchasePricePerUnit: number;
  mrpPerUnit: number;
  totalCost: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  inventory: Array<{ _id: string; name: string; unit: string }>;
  existing?: any;
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

const emptyItem = (): GRNItem => ({
  drugName: "", drugId: "", unit: "Tab", batchNo: "", expiryDate: "",
  quantityReceived: 0, purchasePricePerUnit: 0, mrpPerUnit: 0, totalCost: 0,
});

const toDateInput = (val: string | undefined) => {
  if (!val) return "";
  return val.slice(0, 10);
};

export default function GRNModal({ open, onClose, inventory, existing }: Props) {
  const qc = useQueryClient();
  const isEdit = !!(existing?._id);

  const [supplierName, setSupplierName] = useState("");
  const [supplierSelected, setSupplierSelected] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierResults, setSupplierResults] = useState<any[]>([]);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierCreating, setSupplierCreating] = useState(false);

  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<GRNItem[]>([emptyItem()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [drugSearch, setDrugSearch] = useState<string[]>([""]);
  const [openDrugIdx, setOpenDrugIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      const name = existing.supplierName ?? "";
      setSupplierName(name);
      setSupplierSelected(!!name);
      setInvoiceNo(existing.invoiceNo ?? "");
      setInvoiceDate(toDateInput(existing.invoiceDate));
      setNotes(existing.notes ?? "");
      const loadedItems = (existing.items ?? []).map((it: any) => ({
        drugName:            it.drugName ?? "",
        drugId:              it.drugId ?? "",
        unit:                it.unit ?? "Tab",
        batchNo:             it.batchNo ?? "",
        expiryDate:          toDateInput(it.expiryDate),
        quantityReceived:    it.quantityReceived ?? 0,
        purchasePricePerUnit: it.purchasePricePerUnit ?? 0,
        mrpPerUnit:          it.mrpPerUnit ?? 0,
        totalCost:           it.totalCost ?? 0,
      }));
      setItems(loadedItems.length ? loadedItems : [emptyItem()]);
      setDrugSearch((loadedItems.length ? loadedItems : [emptyItem()]).map(() => ""));
    } else {
      setSupplierName(""); setSupplierSelected(false); setSupplierSearch("");
      setInvoiceNo(""); setInvoiceDate(""); setNotes("");
      setItems([emptyItem()]);
      setDrugSearch([""]);
    }
    setOpenDrugIdx(null);
    setError(""); setSuccess(false);
  }, [open, existing]);

  // Debounced supplier search
  useEffect(() => {
    if (supplierSearch.length < 2) { setSupplierResults([]); setSupplierOpen(false); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await suppliersApi.search(supplierSearch);
        setSupplierResults(res ?? []);
        setSupplierOpen(true);
      } catch {
        setSupplierResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [supplierSearch]);

  const selectSupplier = (name: string) => {
    setSupplierName(name);
    setSupplierSelected(true);
    setSupplierSearch("");
    setSupplierResults([]);
    setSupplierOpen(false);
  };

  const clearSupplier = () => {
    setSupplierName("");
    setSupplierSelected(false);
    setSupplierSearch("");
    setSupplierResults([]);
    setSupplierOpen(false);
  };

  const addSupplier = async () => {
    if (!supplierSearch.trim()) return;
    setSupplierCreating(true);
    try {
      const doc = await suppliersApi.create({ name: supplierSearch.trim() });
      selectSupplier(doc.name);
    } catch {
      selectSupplier(supplierSearch.trim());
    } finally {
      setSupplierCreating(false);
    }
  };

  const hasExactSupplierMatch = supplierResults.some(
    (s) => s.name.toLowerCase() === supplierSearch.trim().toLowerCase()
  );

  const setItem = (idx: number, field: keyof GRNItem, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      if (field === "quantityReceived" || field === "purchasePricePerUnit") {
        const qty   = field === "quantityReceived"   ? Number(value) : next[idx].quantityReceived;
        const price = field === "purchasePricePerUnit" ? Number(value) : next[idx].purchasePricePerUnit;
        next[idx].totalCost = qty * price;
      }
      return next;
    });
  };

  const pickDrug = (idx: number, drugId: string) => {
    const drug = inventory.find((d) => d._id === drugId);
    setItems((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        drugId,
        drugName: drug?.name ?? "",
        unit:     drug?.unit ?? next[idx].unit,
      };
      return next;
    });
    setOpenDrugIdx(null);
  };

  const clearDrug = (idx: number) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], drugId: "", drugName: "" };
      return next;
    });
    setDrugSearch((prev) => {
      const next = [...prev];
      next[idx] = "";
      return next;
    });
  };

  const addRow = () => {
    setItems((p) => [...p, emptyItem()]);
    setDrugSearch((p) => [...p, ""]);
  };

  const removeRow = (idx: number) => {
    setItems((p) => p.filter((_, i) => i !== idx));
    setDrugSearch((p) => p.filter((_, i) => i !== idx));
  };

  const totalValue = items.reduce((s, it) => s + it.totalCost, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim()) { setError("Supplier name is required."); return; }
    if (items.some((it) => !it.drugId || !it.batchNo || !it.expiryDate || !it.quantityReceived)) {
      setError("All rows need a drug, batch no, expiry date, and quantity.");
      return;
    }
    setLoading(true); setError("");
    try {
      const payload = {
        supplierName: supplierName.trim(),
        invoiceNo:    invoiceNo.trim(),
        invoiceDate:  invoiceDate || undefined,
        items,
        totalValue,
        notes,
        status: "Received",
      };
      if (isEdit) {
        await pharmApi.grn.update(existing._id, payload);
      } else {
        await pharmApi.grn.create(payload);
      }
      qc.invalidateQueries({ queryKey: ["pharmacy-inventory"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-grn"] });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || `Failed to ${isEdit ? "update" : "create"} GRN.`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSupplierName(""); setSupplierSelected(false); setSupplierSearch("");
    setSupplierResults([]); setSupplierOpen(false);
    setInvoiceNo(""); setInvoiceDate(""); setNotes("");
    setItems([emptyItem()]); setError(""); setSuccess(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit GRN" : "Receive Stock (GRN)"}</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="text-center py-8 space-y-3">
            <div className="text-green-600 font-semibold text-lg">{isEdit ? "GRN Updated" : "Stock Received"}</div>
            <p className="text-sm text-muted-foreground">
              {isEdit ? "GRN record has been updated." : "GRN created and inventory updated with batch information."}
            </p>
            <Button onClick={handleClose}>Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

            {/* Header fields */}
            <div className="grid grid-cols-3 gap-3">
              <F label="Supplier Name *">
                {supplierSelected ? (
                  <div className="flex items-center gap-2 h-8 border rounded-md px-3 bg-background text-sm">
                    <span className="flex-1 truncate">{supplierName}</span>
                    <button type="button" onClick={clearSupplier} className="shrink-0 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      className="h-8 text-sm"
                      placeholder="Search or type supplier name…"
                      value={supplierSearch}
                      onChange={(e) => setSupplierSearch(e.target.value)}
                      onFocus={() => { if (supplierResults.length > 0) setSupplierOpen(true); }}
                      onBlur={() => setTimeout(() => setSupplierOpen(false), 150)}
                    />
                    {supplierOpen && (supplierResults.length > 0 || supplierSearch.trim().length >= 2) && (
                      <div className="absolute z-50 top-full mt-1 w-full border rounded-lg bg-background shadow-md divide-y">
                        {supplierResults.map((s) => (
                          <button
                            key={s._id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                            onMouseDown={(e) => { e.preventDefault(); selectSupplier(s.name); }}
                          >
                            {s.name}
                            {s.gstNo && <span className="text-xs text-muted-foreground ml-2">GST: {s.gstNo}</span>}
                          </button>
                        ))}
                        {!hasExactSupplierMatch && supplierSearch.trim().length >= 2 && (
                          <button
                            type="button"
                            disabled={supplierCreating}
                            className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5 transition-colors flex items-center gap-1.5"
                            onMouseDown={(e) => { e.preventDefault(); addSupplier(); }}
                          >
                            {supplierCreating
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <span className="font-medium">+ Add "{supplierSearch.trim()}"</span>
                            }
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </F>
              <F label="Invoice No">
                <Input className="h-8 text-sm" placeholder="INV-2026-001" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
              </F>
              <F label="Invoice Date">
                <Input type="date" className="h-8 text-sm" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </F>
            </div>

            {/* Line items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Drug Items *</Label>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addRow}>
                  <Plus className="h-3 w-3" /> Add Row
                </Button>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[2fr_0.9fr_1.5fr_1fr_0.7fr_0.8fr_0.8fr_32px] gap-1.5 text-xs font-medium text-muted-foreground px-1">
                <span>Drug</span><span>Unit</span><span>Batch No</span><span>Expiry</span>
                <span>Qty</span><span>Purchase ₹</span><span>MRP ₹</span><span></span>
              </div>

              {items.map((item, idx) => {
                const search = drugSearch[idx] ?? "";
                const filteredDrugs = search.trim().length > 0
                  ? inventory.filter((d) => d.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 50)
                  : inventory.slice(0, 50);
                return (
                <div key={idx} className="grid grid-cols-[2fr_0.9fr_1.5fr_1fr_0.7fr_0.8fr_0.8fr_32px] gap-1.5 items-center">
                  {item.drugId ? (
                    <div className="flex items-center gap-1.5 h-8 border rounded-md px-2 bg-background text-xs">
                      <span className="flex-1 truncate">{item.drugName}</span>
                      <button type="button" onClick={() => clearDrug(idx)} className="shrink-0 text-muted-foreground hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Input
                        className="h-8 text-xs"
                        placeholder="Search drug…"
                        value={search}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDrugSearch((prev) => { const next = [...prev]; next[idx] = val; return next; });
                        }}
                        onFocus={() => setOpenDrugIdx(idx)}
                        onBlur={() => setTimeout(() => setOpenDrugIdx((cur) => (cur === idx ? null : cur)), 150)}
                      />
                      {openDrugIdx === idx && (
                        <div className="absolute z-50 top-full mt-1 w-56 max-h-56 overflow-y-auto border rounded-lg bg-background shadow-md divide-y">
                          {filteredDrugs.length > 0 ? (
                            filteredDrugs.map((d) => (
                              <button
                                key={d._id}
                                type="button"
                                className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors truncate"
                                onMouseDown={(e) => { e.preventDefault(); pickDrug(idx, d._id); }}
                              >
                                {d.name}
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-xs text-muted-foreground">No matching drugs</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <Select value={item.unit} onValueChange={(v) => setItem(idx, "unit", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{DRUG_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input className="h-8 text-xs" placeholder="BT-001" value={item.batchNo} onChange={(e) => setItem(idx, "batchNo", e.target.value)} />
                  <Input type="date" className="h-8 text-xs" value={item.expiryDate} onChange={(e) => setItem(idx, "expiryDate", e.target.value)} />
                  <Input type="number" min={1} className="h-8 text-xs" placeholder="0" value={item.quantityReceived || ""} onChange={(e) => setItem(idx, "quantityReceived", Number(e.target.value))} />
                  <Input type="number" min={0} step="0.01" className="h-8 text-xs" placeholder="0.00" value={item.purchasePricePerUnit || ""} onChange={(e) => setItem(idx, "purchasePricePerUnit", Number(e.target.value))} />
                  <Input type="number" min={0} step="0.01" className="h-8 text-xs" placeholder="0.00" value={item.mrpPerUnit || ""} onChange={(e) => setItem(idx, "mrpPerUnit", Number(e.target.value))} />
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-600" disabled={items.length === 1} onClick={() => removeRow(idx)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );})}
            </div>

            {/* Notes + Total */}
            <div className="grid grid-cols-2 gap-3 items-end">
              <F label="Notes">
                <Input className="h-8 text-sm" placeholder="Optional remarks" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </F>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Total Invoice Value</div>
                <div className="text-xl font-bold">₹{totalValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={loading} className="gap-1.5">
                {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                {loading ? "Saving…" : isEdit ? "Save Changes" : "Receive Stock"}
              </Button>
              <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
