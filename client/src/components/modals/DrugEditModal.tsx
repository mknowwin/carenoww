import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw } from "lucide-react";
import { pharmacy as pharmacyApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { DRUG_UNITS } from "@/lib/constants";

interface Props {
  open: boolean;
  onClose: () => void;
  drug: any;
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

export default function DrugEditModal({ open, onClose, drug }: Props) {
  const qc = useQueryClient();

  const [name, setName]                           = useState("");
  const [category, setCategory]                   = useState("");
  const [supplier, setSupplier]                   = useState("");
  const [hsnCode, setHsnCode]                     = useState("");
  const [unit, setUnit]                           = useState("Tab");
  const [stock, setStock]                         = useState("");
  const [reorderLevel, setReorderLevel]           = useState("");
  const [mrpPerUnit, setMrpPerUnit]               = useState("");
  const [purchasePricePerUnit, setPurchasePrice]  = useState("");
  const [loading, setLoading]                     = useState(false);
  const [error, setError]                         = useState("");

  useEffect(() => {
    if (!open || !drug) return;
    setName(drug.name ?? "");
    setCategory(drug.category ?? "");
    setSupplier(drug.supplier ?? "");
    setHsnCode(drug.hsnCode ?? "");
    setUnit(drug.unit ?? "Tab");
    setStock(drug.stock != null ? String(drug.stock) : "");
    setReorderLevel(drug.reorderLevel != null ? String(drug.reorderLevel) : "");
    setMrpPerUnit(drug.mrpPerUnit != null ? String(drug.mrpPerUnit) : "");
    setPurchasePrice(drug.purchasePricePerUnit != null ? String(drug.purchasePricePerUnit) : "");
    setError("");
  }, [open, drug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required."); return; }
    setLoading(true); setError("");
    try {
      await pharmacyApi.inventory.update(drug._id, {
        name:                 name.trim(),
        category:             category.trim(),
        supplier:             supplier.trim(),
        hsnCode:              hsnCode.trim(),
        unit,
        stock:                parseFloat(stock) || 0,
        reorderLevel:         parseFloat(reorderLevel) || 0,
        mrpPerUnit:           parseFloat(mrpPerUnit) || 0,
        purchasePricePerUnit: parseFloat(purchasePricePerUnit) || 0,
      });
      qc.invalidateQueries({ queryKey: ["pharmacy-inventory"] });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to update drug.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Drug</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <F label="Name *">
                <Input className="h-8 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
              </F>
            </div>

            <F label="Category">
              <Input className="h-8 text-sm" placeholder="e.g. Antibiotic" value={category} onChange={(e) => setCategory(e.target.value)} />
            </F>

            <F label="Unit">
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{DRUG_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </F>

            <F label="Supplier">
              <Input className="h-8 text-sm" placeholder="e.g. Medline Pharma" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </F>

            <F label="HSN Code">
              <Input className="h-8 text-sm" placeholder="e.g. 30049099" value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} />
            </F>

            <F label="Reorder Level">
              <Input type="number" min={0} className="h-8 text-sm" placeholder="0" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} />
            </F>

            <F label="Stock">
              <Input
                type="number"
                min={0}
                className="h-8 text-sm"
                placeholder="0"
                value={stock}
                disabled={!!drug?.isBatchTracked}
                onChange={(e) => setStock(e.target.value)}
              />
              {drug?.isBatchTracked && (
                <p className="text-[11px] text-muted-foreground">Derived from batch quantities — use GRN or Stock Adjustment.</p>
              )}
            </F>

            <F label="MRP / Unit (₹)">
              <Input type="number" min={0} step="0.01" className="h-8 text-sm" placeholder="0.00" value={mrpPerUnit} onChange={(e) => setMrpPerUnit(e.target.value)} />
            </F>

            <div className="col-span-2">
              <F label="Purchase Price / Unit (₹)">
                <Input type="number" min={0} step="0.01" className="h-8 text-sm" placeholder="0.00" value={purchasePricePerUnit} onChange={(e) => setPurchasePrice(e.target.value)} />
              </F>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={loading} className="gap-1.5">
              {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              {loading ? "Saving…" : "Save Changes"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
