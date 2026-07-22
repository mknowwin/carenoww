import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { billing as billingApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const PAYMENT_MODES = ["Cash", "Card", "UPI", "Insurance", "Online"] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  bill: any | null;
}

export default function FullPayModal({ open, onClose, bill }: Props) {
  const qc = useQueryClient();
  const [paymentMode, setPaymentMode] = useState<(typeof PAYMENT_MODES)[number]>("Cash");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (open) setPaymentMode("Cash"); }, [open]);

  const submit = async () => {
    if (!bill) return;
    setLoading(true);
    try {
      await billingApi.postPayment(bill._id || bill.id, { amount: bill.balance, paymentMode });
      qc.invalidateQueries({ queryKey: ["billing"] });
      toast({ title: "Payment recorded" });
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Payment failed", description: err.message || "Failed to record payment." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark {bill?.id} as fully paid?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            ₹{(bill?.balance ?? 0).toLocaleString()} will be recorded as paid in full.
          </p>
          <div className="space-y-1">
            <Label className="text-xs">Payment Method</Label>
            <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as (typeof PAYMENT_MODES)[number])}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={submit} disabled={loading}>
            {loading ? "Saving…" : "Mark Paid"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
