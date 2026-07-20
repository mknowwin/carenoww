import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { pharmacy as pharmacyApi } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  drug: any;
}

const TYPE_BADGE: Record<string, string> = {
  GRN:        "bg-green-100 text-green-700",
  Adjustment: "bg-orange-100 text-orange-700",
  Edit:       "bg-blue-100 text-blue-700",
};

export default function HistoryModal({ open, onClose, drug }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["pharmacy-inventory-history", drug?._id],
    queryFn: () => pharmacyApi.inventory.history(drug._id),
    enabled: open && !!drug,
  });

  const history: any[] = data?.history ?? [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>History — {drug?.name}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading history…</div>
        ) : history.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No history recorded for this item yet.</div>
        ) : (
          <div className="space-y-2">
            {history.map((entry, i) => (
              <div key={i} className="border rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Badge className={`text-xs ${TYPE_BADGE[entry.type] ?? ""}`}>{entry.type}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {entry.date ? new Date(entry.date).toLocaleString("en-IN") : ""}
                  </span>
                </div>

                {entry.type === "GRN" && (
                  <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                    <div>GRN {entry.grnId} · {entry.grnStatus}{entry.receivedBy ? ` · by ${entry.receivedBy}` : ""}</div>
                    <div>Batch: {entry.batchNo} · Qty: {entry.quantityReceived}</div>
                    <div>Purchase ₹{entry.purchasePricePerUnit} · MRP ₹{entry.mrpPerUnit}</div>
                  </div>
                )}

                {entry.type === "Adjustment" && (
                  <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                    <div>{entry.adjustmentType?.replace("-", " ")} · {entry.reason} · by {entry.adjustedBy}</div>
                    <div>
                      <span className={entry.quantityAdjusted < 0 ? "text-red-600" : "text-green-600"}>
                        {entry.quantityAdjusted > 0 ? "+" : ""}{entry.quantityAdjusted}
                      </span>
                      {" "}({entry.quantityBefore} → {entry.quantityAfter})
                    </div>
                  </div>
                )}

                {entry.type === "Edit" && (
                  <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                    <div>{entry.action} · by {entry.performedBy}</div>
                    {entry.changes?.length > 0 && (
                      <ul className="list-disc list-inside">
                        {entry.changes.map((c: any, j: number) => (
                          <li key={j}>{c.field}: {String(c.oldValue)} → {String(c.newValue)}</li>
                        ))}
                      </ul>
                    )}
                    {entry.notes && <div className="italic">{entry.notes}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
