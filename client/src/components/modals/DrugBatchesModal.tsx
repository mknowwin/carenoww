import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, RefreshCw, X } from "lucide-react";
import { pharmacy as pharmacyApi } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  drug: any;
  canEdit: boolean;
}

const BATCH_STATUSES = ["Active", "Exhausted", "Expired", "Quarantine", "Cancelled"] as const;

const STATUS_BADGE: Record<string, string> = {
  Active:     "bg-green-100 text-green-700",
  Exhausted:  "bg-gray-100 text-gray-700",
  Expired:    "bg-red-100 text-red-700",
  Quarantine: "bg-amber-100 text-amber-700",
  Cancelled:  "bg-gray-100 text-gray-500",
};

const toDateInput = (val: string | undefined) => (val ? val.slice(0, 10) : "");

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-[11px]">{label}</Label>{children}</div>;
}

function EditBatchRow({ batch, onDone, onCancel }: { batch: any; onDone: () => void; onCancel: () => void }) {
  const [batchNo, setBatchNo]           = useState(batch.batchNo ?? "");
  const [lotNo, setLotNo]               = useState(batch.lotNo ?? "");
  const [supplierName, setSupplierName] = useState(batch.supplierName ?? "");
  const [mfgDate, setMfgDate]           = useState(toDateInput(batch.manufacturingDate));
  const [expiryDate, setExpiryDate]     = useState(toDateInput(batch.expiryDate));
  const [purchasePrice, setPurchasePrice] = useState(batch.purchasePricePerUnit != null ? String(batch.purchasePricePerUnit) : "");
  const [mrpPerUnit, setMrpPerUnit]     = useState(batch.mrpPerUnit != null ? String(batch.mrpPerUnit) : "");
  const [status, setStatus]             = useState(batch.status ?? "Active");
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState("");

  const handleSave = async () => {
    if (!batchNo.trim() || !expiryDate) { setError("Batch No and Expiry Date are required."); return; }
    setSaving(true); setError("");
    try {
      await pharmacyApi.batches.update(batch._id, {
        batchNo: batchNo.trim(),
        lotNo: lotNo.trim(),
        supplierName: supplierName.trim(),
        manufacturingDate: mfgDate || undefined,
        expiryDate,
        purchasePricePerUnit: parseFloat(purchasePrice) || 0,
        mrpPerUnit: parseFloat(mrpPerUnit) || 0,
        status,
      });
      onDone();
    } catch (err: any) {
      setError(err.message || "Failed to update batch.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <F label="Batch No *"><Input className="h-8 text-sm" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} /></F>
        <F label="Lot No"><Input className="h-8 text-sm" value={lotNo} onChange={(e) => setLotNo(e.target.value)} /></F>
        <F label="Supplier"><Input className="h-8 text-sm" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} /></F>
        <F label="Mfg Date"><Input type="date" className="h-8 text-sm" value={mfgDate} onChange={(e) => setMfgDate(e.target.value)} /></F>
        <F label="Expiry Date *"><Input type="date" className="h-8 text-sm" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></F>
        <F label="Status">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{BATCH_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </F>
        <F label="Purchase Price/Unit (₹)"><Input type="number" min={0} step="0.01" className="h-8 text-sm" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} /></F>
        <F label="MRP/Unit (₹)"><Input type="number" min={0} step="0.01" className="h-8 text-sm" value={mrpPerUnit} onChange={(e) => setMrpPerUnit(e.target.value)} /></F>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs gap-1" disabled={saving} onClick={handleSave}>
          {saving && <RefreshCw className="h-3 w-3 animate-spin" />} {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export default function DrugBatchesModal({ open, onClose, drug, canEdit }: Props) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => { if (!open) setEditingId(null); }, [open]);

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["pharmacy-batches", drug?._id],
    queryFn: () => pharmacyApi.batches.list(drug._id),
    enabled: open && !!drug,
  });

  const handleSaved = () => {
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ["pharmacy-batches", drug?._id] });
    qc.invalidateQueries({ queryKey: ["pharmacy-inventory"] });
    toast({ title: "Batch updated" });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Batches — {drug?.name}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading batches…</div>
        ) : batches.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No batches recorded for this drug yet.</div>
        ) : (
          <div className="space-y-2">
            {batches.map((batch: any) =>
              editingId === batch._id ? (
                <EditBatchRow key={batch._id} batch={batch} onDone={handleSaved} onCancel={() => setEditingId(null)} />
              ) : (
                <div key={batch._id} className="border rounded-lg p-3 text-sm flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{batch.batchNo}</span>
                      {batch.lotNo && <span className="text-xs text-muted-foreground">Lot: {batch.lotNo}</span>}
                      <Badge className={`text-xs ${STATUS_BADGE[batch.status] ?? "bg-gray-100 text-gray-700"}`}>{batch.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>Supplier: {batch.supplierName || "—"}</span>
                      {batch.manufacturingDate && <span>Mfg: {new Date(batch.manufacturingDate).toLocaleDateString("en-IN")}</span>}
                      <span>Exp: {new Date(batch.expiryDate).toLocaleDateString("en-IN")}</span>
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>Received: {batch.quantityReceived} {drug?.unit}</span>
                      <span>Remaining: {batch.quantityRemaining} {drug?.unit}</span>
                      <span>Purchase ₹{batch.purchasePricePerUnit ?? 0}</span>
                      <span>MRP ₹{batch.mrpPerUnit ?? 0}</span>
                    </div>
                  </div>
                  {canEdit && (
                    <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => setEditingId(batch._id)} title="Edit batch">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )
            )}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={onClose}><X className="h-3.5 w-3.5" /> Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
