import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, RefreshCw, Package } from "lucide-react";
import { pharmacy as pharmApi, describeStockError } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

type RxSource = "Paper" | "OTC";

interface DrugRow {
  drugId: string;
  drugName: string;
  quantity: number;
  unit: string;
  mrpPerUnit: number;
  totalAmount: number;
  batchId: string;
  batchNo: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  inventory: Array<{ _id: string; name: string; unit: string; stock: number; mrpPerUnit?: number; status: string }>;
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

const emptyRow = (): DrugRow => ({ drugId: "", drugName: "", quantity: 1, unit: "Tab", mrpPerUnit: 0, totalAmount: 0, batchId: "", batchNo: "" });

export default function DispenseCounterModal({ open, onClose, inventory }: Props) {
  const qc = useQueryClient();

  const [patientId,    setPatientId]    = useState("");
  const [patientName,  setPatientName]  = useState("");
  const [doctor,       setDoctor]       = useState("");
  const [type,         setType]         = useState<"OPD" | "IPD" | "ICU">("OPD");
  const [rxSource,     setRxSource]     = useState<RxSource>("OTC");
  const [paperRxNote,  setPaperRxNote]  = useState("");
  const [dispenseNow,  setDispenseNow]  = useState(true);
  const [drugs,        setDrugs]        = useState<DrugRow[]>([emptyRow()]);
  const [batchMap,     setBatchMap]     = useState<Record<string, any[]>>({});
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [result,       setResult]       = useState<{ rxId: string } | null>(null);

  // Fetch batches for a drug and return them (sorted FEFO = expiry asc)
  const fetchBatches = useCallback(async (drugId: string): Promise<any[]> => {
    if (!drugId) return [];
    if (batchMap[drugId]) return batchMap[drugId];
    try {
      const batches = await pharmApi.batches.list(drugId);
      const active = (Array.isArray(batches) ? batches : [])
        .filter((b: any) => b.status === "Active" && b.quantityRemaining > 0)
        .sort((a: any, b: any) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
      setBatchMap((prev) => ({ ...prev, [drugId]: active }));
      return active;
    } catch {
      return [];
    }
  }, [batchMap]);

  const applyBatch = (idx: number, batch: any) => {
    setDrugs((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        batchId:    batch._id,
        batchNo:    batch.batchNo,
        mrpPerUnit: batch.mrpPerUnit ?? next[idx].mrpPerUnit,
        totalAmount: next[idx].quantity * (batch.mrpPerUnit ?? next[idx].mrpPerUnit),
      };
      return next;
    });
  };

  const pickDrug = async (idx: number, drugId: string) => {
    const drug = inventory.find((d) => d._id === drugId);
    setDrugs((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        drugId,
        drugName:   drug?.name ?? "",
        unit:       drug?.unit ?? "Tab",
        mrpPerUnit: drug?.mrpPerUnit ?? 0,
        totalAmount: next[idx].quantity * (drug?.mrpPerUnit ?? 0),
        batchId:    "",
        batchNo:    "",
      };
      return next;
    });

    if (drugId) {
      const batches = await fetchBatches(drugId);
      if (batches.length > 0) {
        // Auto-select FEFO batch (earliest expiry)
        applyBatch(idx, batches[0]);
      }
    }
  };

  const setRow = (idx: number, field: keyof DrugRow, value: string | number) => {
    setDrugs((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      if (field === "quantity" || field === "mrpPerUnit") {
        const qty = field === "quantity"   ? Number(value) : next[idx].quantity;
        const mrp = field === "mrpPerUnit" ? Number(value) : next[idx].mrpPerUnit;
        next[idx].totalAmount = qty * mrp;
      }
      return next;
    });
  };

  const changeBatch = (idx: number, batchId: string) => {
    const drugId = drugs[idx].drugId;
    const batches = batchMap[drugId] ?? [];
    const batch = batches.find((b) => b._id === batchId);
    if (batch) applyBatch(idx, batch);
  };

  const totalAmount = drugs.reduce((s, d) => s + d.totalAmount, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName.trim()) { setError("Patient name is required."); return; }
    if (drugs.some((d) => !d.drugId || d.quantity < 1)) {
      setError("All drug rows need a drug selected and a quantity ≥ 1."); return;
    }
    setLoading(true); setError("");
    try {
      const order = await pharmApi.orders.create({
        patientId:   patientId.trim() || "OTC",
        patientName: patientName.trim(),
        doctor:      doctor.trim(),
        type,
        rxSource,
        paperRxNote: rxSource === "Paper" ? paperRxNote.trim() : "",
        items: drugs.map((d) => ({
          drugId:      d.drugId,
          drugName:    d.drugName,
          quantity:    d.quantity,
          unit:        d.unit,
          mrpPerUnit:  d.mrpPerUnit,
          totalAmount: d.totalAmount,
          batchId:     d.batchId || undefined,
          batchNo:     d.batchNo || "",
        })),
        drug: drugs.map((d) => d.drugName).join(", "),
        qty:  drugs.reduce((s, d) => s + d.quantity, 0),
        unit: "units",
        status: dispenseNow ? "Dispensed" : "Pending",
      });
      qc.invalidateQueries({ queryKey: ["pharmacy-orders"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-inventory"] });
      setResult({ rxId: order.rxId });
    } catch (err: any) {
      setError(describeStockError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPatientId(""); setPatientName(""); setDoctor(""); setType("OPD");
    setRxSource("OTC"); setPaperRxNote(""); setDispenseNow(true);
    setDrugs([emptyRow()]); setBatchMap({}); setError(""); setResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dispense at Counter</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="text-center py-8 space-y-3">
            <div className="text-green-600 font-semibold text-lg">
              {dispenseNow ? "Dispensed" : "Order Created"}
            </div>
            <p className="text-sm text-muted-foreground">
              Rx ID: <span className="font-mono font-semibold">{result.rxId}</span>
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={handleClose}>Close</Button>
              <Button variant="outline" onClick={() => { setResult(null); setDrugs([emptyRow()]); setBatchMap({}); setPatientId(""); setPatientName(""); setDoctor(""); }}>
                New Dispense
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

            {/* Rx source toggle */}
            <div className="flex gap-2">
              {(["OTC", "Paper"] as RxSource[]).map((s) => (
                <Badge
                  key={s}
                  className={`cursor-pointer text-xs px-3 py-1 ${rxSource === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                  onClick={() => setRxSource(s)}
                >
                  {s === "OTC" ? "Over the Counter" : "Paper Prescription"}
                </Badge>
              ))}
            </div>

            {/* Patient + doctor */}
            <div className="grid grid-cols-2 gap-3">
              <F label="Patient Name *">
                <Input className="h-8 text-sm" placeholder="Full name" value={patientName} onChange={(e) => setPatientName(e.target.value)} />
              </F>
              <F label="Patient UHID (optional)">
                <Input className="h-8 text-sm" placeholder="UHID-xxx" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
              </F>
              <F label="Doctor / Prescriber">
                <Input className="h-8 text-sm" placeholder="Dr. name (free text)" value={doctor} onChange={(e) => setDoctor(e.target.value)} />
              </F>
              <F label="Type">
                <select className="w-full h-8 text-sm border rounded-md px-2 bg-background" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                  <option>OPD</option><option>IPD</option><option>ICU</option>
                </select>
              </F>
            </div>

            {rxSource === "Paper" && (
              <F label="Paper Rx Note">
                <Input className="h-8 text-sm" placeholder="e.g. Written Rx from Dr. Rajan, 14-Jun-2026" value={paperRxNote} onChange={(e) => setPaperRxNote(e.target.value)} />
              </F>
            )}

            {/* Drug rows */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Drugs *</Label>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setDrugs((p) => [...p, emptyRow()])}>
                  <Plus className="h-3 w-3" /> Add Drug
                </Button>
              </div>

              {drugs.map((row, idx) => {
                const batches = batchMap[row.drugId] ?? [];
                return (
                  <div key={idx} className="border rounded-lg p-3 space-y-2">
                    {/* Drug + qty row */}
                    <div className="grid grid-cols-[2fr_0.7fr_0.8fr_32px] gap-1.5 items-center">
                      <select
                        className="h-8 text-xs border rounded-md px-2 bg-background"
                        value={row.drugId}
                        onChange={(e) => pickDrug(idx, e.target.value)}
                      >
                        <option value="">Select drug…</option>
                        {inventory.map((d) => (
                          <option key={d._id} value={d._id} disabled={d.status === "Critical" && d.stock === 0}>
                            {d.name} {d.stock === 0 ? "(Out)" : ""}
                          </option>
                        ))}
                      </select>
                      <Input type="number" min={1} className="h-8 text-xs" placeholder="Qty" value={row.quantity}
                        onChange={(e) => setRow(idx, "quantity", Number(e.target.value))} />
                      <div className="text-xs font-semibold text-right pr-1">
                        {row.totalAmount > 0 ? `₹${row.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : ""}
                      </div>
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-500" disabled={drugs.length === 1}
                        onClick={() => setDrugs((p) => p.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Batch info row */}
                    {row.drugId && (
                      <div className="flex items-center gap-2 pl-0.5">
                        <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {batches.length === 0 ? (
                          <span className="text-xs text-muted-foreground">No active batches — using master price ₹{row.mrpPerUnit}/unit</span>
                        ) : batches.length === 1 ? (
                          <span className="text-xs text-muted-foreground">
                            Batch <span className="font-medium text-foreground">{row.batchNo}</span>
                            {batches[0].expiryDate && <> · Exp {format(new Date(batches[0].expiryDate), "MMM-yyyy")}</>}
                            {" · "}Stock {batches[0].quantityRemaining}
                            {" · "}MRP <span className="font-semibold text-foreground">₹{row.mrpPerUnit}/{row.unit}</span>
                          </span>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground">Batch:</span>
                            <select
                              className="h-6 text-xs border rounded px-1.5 bg-background"
                              value={row.batchId}
                              onChange={(e) => changeBatch(idx, e.target.value)}
                            >
                              {batches.map((b) => (
                                <option key={b._id} value={b._id}>
                                  {b.batchNo} · Exp {b.expiryDate ? format(new Date(b.expiryDate), "MMM-yy") : "?"} · Stock {b.quantityRemaining} · ₹{b.mrpPerUnit}
                                </option>
                              ))}
                            </select>
                            <span className="text-xs font-semibold">₹{row.mrpPerUnit}/{row.unit}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {totalAmount > 0 && (
                <div className="text-right text-sm font-semibold text-foreground pr-1">
                  Total: ₹{totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
              )}
            </div>

            {/* Dispense immediately toggle */}
            <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
              <input type="checkbox" className="h-4 w-4 rounded" checked={dispenseNow} onChange={(e) => setDispenseNow(e.target.checked)} />
              <span>Dispense immediately (mark as Dispensed &amp; deduct stock)</span>
            </label>

            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={loading} className="gap-1.5">
                {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                {loading ? "Processing…" : dispenseNow ? "Dispense Now" : "Create Order"}
              </Button>
              <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
