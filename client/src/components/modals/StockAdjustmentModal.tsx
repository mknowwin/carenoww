import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw } from "lucide-react";
import { pharmacy as pharmApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

type AdjustmentType = "Damage" | "Expiry-Writeoff" | "Theft" | "Count-Correction" | "Return-to-Supplier" | "Opening-Stock";

const ADJUSTMENT_TYPES: AdjustmentType[] = [
  "Damage", "Expiry-Writeoff", "Theft", "Count-Correction", "Return-to-Supplier", "Opening-Stock",
];

const SIGNED_TYPES: AdjustmentType[] = ["Damage", "Expiry-Writeoff", "Theft", "Return-to-Supplier"];

interface Props {
  open: boolean;
  onClose: () => void;
  drug: { _id: string; name: string; stock: number; unit: string; isBatchTracked?: boolean } | null;
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

export default function StockAdjustmentModal({ open, onClose, drug }: Props) {
  const qc = useQueryClient();

  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>("Count-Correction");
  const [quantity, setQuantity] = useState("");
  const [batchId, setBatchId] = useState("");
  const [reason, setReason] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const { data: batches = [] } = useQuery({
    queryKey: ["pharmacy-batches", drug?._id],
    queryFn: () => pharmApi.batches.list(drug!._id),
    enabled: open && !!drug?._id,
  });

  const isReduction = SIGNED_TYPES.includes(adjustmentType);
  const signedQty = isReduction ? -Math.abs(Number(quantity)) : Math.abs(Number(quantity));
  const projectedStock = drug ? Math.max(0, drug.stock + signedQty) : 0;
  // Adding stock with no batch picked, on a drug that's already batch-tracked,
  // needs a real batch behind it — otherwise it's silently discarded the next
  // time stock is resynced from batches (see stockAdjustmentService.ts).
  const needsOpeningExpiry = !isReduction && !batchId && !!drug?.isBatchTracked;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quantity || Number(quantity) <= 0) { setError("Quantity must be greater than 0."); return; }
    if (!reason.trim()) { setError("Reason is required."); return; }
    if (needsOpeningExpiry && !expiryDate) {
      setError(`"${drug!.name}" is batch-tracked. Provide an expiry date for this added stock.`);
      return;
    }
    setLoading(true); setError("");
    try {
      await pharmApi.adjustments.create({
        drugId: drug!._id,
        batchId: batchId || undefined,
        adjustmentType,
        quantityAdjusted: signedQty,
        reason: reason.trim(),
        expiryDate: needsOpeningExpiry ? expiryDate : undefined,
      });
      qc.invalidateQueries({ queryKey: ["pharmacy-inventory"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-adjustments"] });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Failed to record adjustment.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAdjustmentType("Count-Correction"); setQuantity(""); setBatchId("");
    setReason(""); setExpiryDate(""); setError(""); setSuccess(false);
    onClose();
  };

  if (!drug) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Stock Adjustment</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="text-center py-6 space-y-3">
            <div className="text-green-600 font-semibold">Adjustment Recorded</div>
            <p className="text-sm text-muted-foreground">
              {drug.name} — stock updated to {projectedStock} {drug.unit}.
            </p>
            <Button onClick={handleClose}>Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

            {/* Drug info */}
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <div className="font-semibold">{drug.name}</div>
              <div className="text-muted-foreground text-xs mt-0.5">Current stock: {drug.stock} {drug.unit}</div>
            </div>

            <F label="Adjustment Type *">
              <select
                className="w-full h-9 text-sm border rounded-md px-3 bg-background"
                value={adjustmentType}
                onChange={(e) => setAdjustmentType(e.target.value as AdjustmentType)}
              >
                {ADJUSTMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace("-", " ")}</option>
                ))}
              </select>
            </F>

            {batches.length > 0 && (
              <F label="Batch (optional)">
                <select
                  className="w-full h-9 text-sm border rounded-md px-3 bg-background"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                >
                  <option value="">All batches (adjust total stock)</option>
                  {batches.map((b: any) => (
                    <option key={b._id} value={b._id}>
                      {b.batchNo} — {b.quantityRemaining} {drug.unit} (exp: {new Date(b.expiryDate).toLocaleDateString("en-IN")})
                    </option>
                  ))}
                </select>
              </F>
            )}

            <F label={`Quantity ${isReduction ? "(to write off)" : "(to add)"} *`}>
              <Input
                type="number" min={1} className="h-9"
                placeholder="Enter quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </F>

            {needsOpeningExpiry && (
              <F label="Opening Stock Expiry *">
                <div className="space-y-1.5">
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    "{drug.name}" is batch-tracked. Enter an expiry for this added stock so it's tracked as a
                    real batch. If you're not sure of the real expiry, enter today's date so this stock is used
                    up first.
                  </p>
                  <Input
                    type="date" className="h-9"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                </div>
              </F>
            )}

            {quantity && Number(quantity) > 0 && (
              <div className={`text-xs rounded px-3 py-2 ${isReduction ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                {isReduction ? "−" : "+"}{Math.abs(signedQty)} {drug.unit} → projected stock: <strong>{projectedStock} {drug.unit}</strong>
              </div>
            )}

            <F label="Reason *">
              <Input className="h-9" placeholder="e.g. Damaged in storage, expired batch removed…" value={reason} onChange={(e) => setReason(e.target.value)} />
            </F>

            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={loading} variant={isReduction ? "destructive" : "default"} className="gap-1.5">
                {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                {loading ? "Saving…" : "Record Adjustment"}
              </Button>
              <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
