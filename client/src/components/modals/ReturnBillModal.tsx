import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RefreshCw, Undo2 } from "lucide-react";
import { billing as billingApi } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const REFUND_MODES = ["Cash", "Card", "UPI", "Online", "Adjustment"] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  bill: any | null;
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

export default function ReturnBillModal({ open, onClose, bill }: Props) {
  const qc = useQueryClient();

  const [selected, setSelected] = useState<Record<string, string>>({}); // itemId -> quantity string
  const [reason, setReason] = useState("");
  const [refundMode, setRefundMode] = useState<(typeof REFUND_MODES)[number]>("Cash");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) { setSelected({}); setReason(""); setRefundMode("Cash"); setError(""); setSuccess(false); }
  }, [open, bill?._id]);

  const { data: creditNotes = [] } = useQuery({
    queryKey: ["credit-notes", bill?._id],
    queryFn: () => billingApi.creditNotes(bill._id || bill.id),
    enabled: open && !!bill?._id,
  });

  if (!bill) return null;

  const alreadyReturnedByItem = new Map<string, number>();
  let alreadyRefunded = 0;
  for (const cn of creditNotes) {
    alreadyRefunded += Math.abs(cn.paid ?? 0);
    for (const it of cn.items ?? []) {
      if (!it.itemId) continue;
      alreadyReturnedByItem.set(it.itemId, (alreadyReturnedByItem.get(it.itemId) ?? 0) + it.quantity);
    }
  }

  const rows = (bill.items ?? []).map((item: any) => {
    const alreadyReturned = alreadyReturnedByItem.get(item._id) ?? 0;
    const remaining = item.quantity - alreadyReturned;
    return { item, remaining };
  }).filter((r: any) => r.remaining > 0);

  const returnAmount = rows.reduce((sum: number, { item }: any) => {
    const qty = Number(selected[item._id] || 0);
    return sum + qty * item.unitPrice;
  }, 0);

  const refundCap = Math.max(0, (bill.paid ?? 0) - alreadyRefunded);
  const refundAmount = Math.min(returnAmount, refundCap);

  const toggleItem = (itemId: string, remaining: number) => {
    setSelected((s) => {
      const next = { ...s };
      if (next[itemId] !== undefined) delete next[itemId];
      else next[itemId] = String(remaining);
      return next;
    });
  };

  const setQty = (itemId: string, value: string, remaining: number) => {
    if (value === "") { setSelected((s) => ({ ...s, [itemId]: value })); return; }
    const clamped = Math.min(Math.max(1, Math.floor(Number(value)) || 0), remaining);
    setSelected((s) => ({ ...s, [itemId]: String(clamped) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = Object.entries(selected)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([itemId, qty]) => ({ itemId, quantity: Number(qty) }));

    if (!items.length) { setError("Select at least one item to return."); return; }
    if (!reason.trim()) { setError("Reason is required."); return; }

    for (const { itemId, quantity } of items) {
      const row = rows.find((r: any) => r.item._id === itemId);
      if (row && quantity > row.remaining) {
        setError(`Cannot return ${quantity} of "${row.item.description}" — only ${row.remaining} remaining.`);
        return;
      }
    }

    setLoading(true); setError("");
    try {
      await billingApi.returnItems(bill._id || bill.id, { items, reason: reason.trim(), refundMode });
      qc.invalidateQueries({ queryKey: ["billing"] });
      qc.invalidateQueries({ queryKey: ["credit-notes", bill._id] });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Failed to process return.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => { onClose(); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Undo2 className="h-4 w-4" /> Return Items — {bill.billId || bill.id}</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="text-center py-6 space-y-3">
            <div className="text-green-600 font-semibold">Return Processed</div>
            <p className="text-sm text-muted-foreground">
              ₹{returnAmount.toLocaleString()} returned{refundAmount > 0 ? `, ₹${refundAmount.toLocaleString()} refunded via ${refundMode}` : ""}.
            </p>
            <Button onClick={handleClose}>Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">All items on this bill have already been returned.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {rows.map(({ item, remaining }: any) => {
                  const checked = selected[item._id] !== undefined;
                  return (
                    <div key={item._id} className="flex items-center gap-2 border border-border rounded-lg p-2">
                      <Checkbox checked={checked} onCheckedChange={() => toggleItem(item._id, remaining)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.category}
                          {item.batchNo && <> · Batch {item.batchNo}</>}
                          {" "}· Billed {item.quantity} · Remaining {remaining} · ₹{item.unitPrice}/unit
                        </p>
                      </div>
                      {checked && (
                        <Input
                          type="number" min={1} max={remaining} className="h-8 w-20 text-sm"
                          value={selected[item._id]}
                          onChange={(e) => setQty(item._id, e.target.value, remaining)}
                          onBlur={(e) => setQty(item._id, e.target.value || "1", remaining)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {returnAmount > 0 && (
              <div className="text-xs rounded px-3 py-2 bg-amber-50 text-amber-700 space-y-0.5">
                <div>Return amount: <strong>₹{returnAmount.toLocaleString()}</strong></div>
                <div>Refund due: <strong>₹{refundAmount.toLocaleString()}</strong> {refundCap < returnAmount && "(capped to amount paid)"}</div>
              </div>
            )}

            {refundAmount > 0 && (
              <F label="Refund Mode">
                <select
                  className="w-full h-9 text-sm border rounded-md px-3 bg-background"
                  value={refundMode}
                  onChange={(e) => setRefundMode(e.target.value as (typeof REFUND_MODES)[number])}
                >
                  {REFUND_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </F>
            )}

            <F label="Reason *">
              <Input className="h-9" placeholder="e.g. Patient returned unused medicine" value={reason} onChange={(e) => setReason(e.target.value)} />
            </F>

            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={loading || rows.length === 0} className="gap-1.5">
                {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                {loading ? "Processing…" : "Process Return"}
              </Button>
              <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
