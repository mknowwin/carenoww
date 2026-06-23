import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, RefreshCw } from "lucide-react";
import { pharmacy as pharmApi } from "@/lib/api";
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
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<GRNItem[]>([emptyItem()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setSupplierName(existing.supplierName ?? "");
      setInvoiceNo(existing.invoiceNo ?? "");
      setInvoiceDate(toDateInput(existing.invoiceDate));
      setNotes(existing.notes ?? "");
      setItems(
        (existing.items ?? []).map((it: any) => ({
          drugName:            it.drugName ?? "",
          drugId:              it.drugId ?? "",
          unit:                it.unit ?? "Tab",
          batchNo:             it.batchNo ?? "",
          expiryDate:          toDateInput(it.expiryDate),
          quantityReceived:    it.quantityReceived ?? 0,
          purchasePricePerUnit: it.purchasePricePerUnit ?? 0,
          mrpPerUnit:          it.mrpPerUnit ?? 0,
          totalCost:           it.totalCost ?? 0,
        }))
      );
    } else {
      setSupplierName(""); setInvoiceNo(""); setInvoiceDate(""); setNotes("");
      setItems([emptyItem()]);
    }
    setError(""); setSuccess(false);
  }, [open, existing]);

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
    setSupplierName(""); setInvoiceNo(""); setInvoiceDate(""); setNotes("");
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
                <Input className="h-8 text-sm" placeholder="e.g. Medline Pharma" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
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
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setItems((p) => [...p, emptyItem()])}>
                  <Plus className="h-3 w-3" /> Add Row
                </Button>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[2fr_0.9fr_1fr_1fr_0.7fr_0.8fr_0.8fr_32px] gap-1.5 text-xs font-medium text-muted-foreground px-1">
                <span>Drug</span><span>Unit</span><span>Batch No</span><span>Expiry</span>
                <span>Qty</span><span>Purchase ₹</span><span>MRP ₹</span><span></span>
              </div>

              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[2fr_0.9fr_1fr_1fr_0.7fr_0.8fr_0.8fr_32px] gap-1.5 items-center">
                  <select
                    className="h-8 text-xs border rounded-md px-2 bg-background"
                    value={item.drugId}
                    onChange={(e) => pickDrug(idx, e.target.value)}
                  >
                    <option value="">Select drug…</option>
                    {inventory.map((d) => (
                      <option key={d._id} value={d._id}>{d.name}</option>
                    ))}
                  </select>
                  <Select value={item.unit} onValueChange={(v) => setItem(idx, "unit", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{DRUG_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input className="h-8 text-xs" placeholder="BT-001" value={item.batchNo} onChange={(e) => setItem(idx, "batchNo", e.target.value)} />
                  <Input type="date" className="h-8 text-xs" value={item.expiryDate} onChange={(e) => setItem(idx, "expiryDate", e.target.value)} />
                  <Input type="number" min={1} className="h-8 text-xs" placeholder="0" value={item.quantityReceived || ""} onChange={(e) => setItem(idx, "quantityReceived", Number(e.target.value))} />
                  <Input type="number" min={0} step="0.01" className="h-8 text-xs" placeholder="0.00" value={item.purchasePricePerUnit || ""} onChange={(e) => setItem(idx, "purchasePricePerUnit", Number(e.target.value))} />
                  <Input type="number" min={0} step="0.01" className="h-8 text-xs" placeholder="0.00" value={item.mrpPerUnit || ""} onChange={(e) => setItem(idx, "mrpPerUnit", Number(e.target.value))} />
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-600" disabled={items.length === 1} onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
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
