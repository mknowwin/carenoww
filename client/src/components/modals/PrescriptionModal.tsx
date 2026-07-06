import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pill, Printer, Package, AlertTriangle } from "lucide-react";
import { prescriptions as rxApi, pharmacy as pharmacyApi } from "@/lib/api";
import { printPrescription } from "@/lib/print";

const ROUTES    = ["Oral", "IV", "IM", "SC", "Topical", "Inhaled", "Rectal", "SL"] as const;
const FREQS     = ["OD", "BD", "TID", "QID", "SOS", "Stat", "HS", "Q4H", "Q6H", "Q8H"] as const;
const DURATIONS = ["1 day", "3 days", "5 days", "7 days", "10 days", "14 days", "1 month", "Ongoing"] as const;

interface RxItem {
  drug: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
  quantity: number;
}

interface InventoryDrug {
  _id: string;
  name: string;
  stock: number;
  unit: string;
  status: "OK" | "Low" | "Critical";
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  admissionId?: string;
  type?: "OPD" | "IPD";
}

const emptyItem = (): RxItem => ({
  drug: "", dose: "", route: "Oral", frequency: "OD", duration: "5 days", instructions: "", quantity: 1,
});

// ── Extract dose from drug name (e.g. "Paracetamol 500mg" → "500mg") ─────────
function parseDoseFromName(name: string): string {
  const m = name.match(/(\d+\s*(?:mg|mcg|g|ml|IU|MIU|%|mmol)(?:\/(?:\d+\s*)?(?:ml|L|dose))?)/i);
  return m ? m[1].replace(/\s+/g, "") : "";
}

// ── Stock badge ───────────────────────────────────────────────────────────────
function StockBadge({ status, stock, unit }: { status: string; stock: number; unit: string }) {
  const cfg = status === "OK"
    ? "bg-green-100 text-green-700"
    : status === "Low"
    ? "bg-amber-100 text-amber-700"
    : "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${cfg}`}>
      {status === "Critical" && <AlertTriangle className="h-2.5 w-2.5" />}
      {stock} {unit}
    </span>
  );
}

// ── DrugAutocomplete ──────────────────────────────────────────────────────────
function DrugAutocomplete({
  value, onChange, onSelect, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (drug: InventoryDrug) => void;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<InventoryDrug[]>([]);
  const [open,        setOpen]        = useState(false);
  const [focused,     setFocused]     = useState(false);
  const [activeIdx,   setActiveIdx]   = useState(-1);
  const [dropPos,     setDropPos]     = useState<{ top: number; left: number; width: number } | null>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const dropdownRef  = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback((q: string) => {
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await pharmacyApi.inventory.list({ search: q });
        const items: InventoryDrug[] = (data?.drugs ?? []).slice(0, 10);
        setSuggestions(items);
        if (items.length > 0 && inputRef.current) {
          const r = inputRef.current.getBoundingClientRect();
          setDropPos({ top: r.bottom + 2, left: r.left, width: r.width });
        }
        setOpen(items.length > 0);
        setActiveIdx(-1);
      } catch {
        setSuggestions([]); setOpen(false);
      }
    }, 250);
  }, []);

  useEffect(() => {
    if (focused) fetchSuggestions(value);
  }, [value, focused, fetchSuggestions]);

  // Close on outside click — must check both input and portaled dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!inputRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (drug: InventoryDrug) => {
    onSelect(drug);
    setOpen(false);
    setSuggestions([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); select(suggestions[activeIdx]); }
    if (e.key === "Escape")    { setOpen(false); }
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        className="h-9 text-sm"
        placeholder={placeholder ?? "e.g. Paracetamol 500mg"}
        value={value}
        onChange={(e) => { onChange(e.target.value); }}
        onFocus={() => { setFocused(true); if (value.length >= 2) fetchSuggestions(value); }}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && dropPos && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
        >
          <div className="px-2 py-1 border-b border-gray-100 flex items-center gap-1.5">
            <Package className="h-3 w-3 text-teal-600" />
            <span className="text-[10px] font-semibold text-teal-700 uppercase tracking-wide">Pharmacy Inventory</span>
          </div>
          <ul className="max-h-52 overflow-y-auto">
            {suggestions.map((drug, i) => (
              <li
                key={drug._id}
                onMouseDown={(e) => { e.preventDefault(); select(drug); }}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer text-sm transition-colors ${
                  i === activeIdx ? "bg-teal-50" : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Pill className="h-3.5 w-3.5 text-teal-500 shrink-0" />
                  <span className="truncate font-medium">{drug.name}</span>
                </div>
                <StockBadge status={drug.status} stock={drug.stock} unit={drug.unit} />
              </li>
            ))}
          </ul>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function PrescriptionModal({
  open, onClose, onSaved,
  patientId, patientName, appointmentId, admissionId, type = "OPD",
}: Props) {
  const [items,  setItems]  = useState<RxItem[]>([emptyItem()]);
  const [notes,  setNotes]  = useState("");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  const [savedRx, setSavedRx] = useState<any>(null);

  const updateItem = (idx: number, field: keyof RxItem, value: any) =>
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));

  const removeItem = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleDrugSelect = (idx: number, drug: InventoryDrug) => {
    const dose = parseDoseFromName(drug.name);
    setItems((prev) => prev.map((it, i) =>
      i === idx ? { ...it, drug: drug.name, dose: dose || it.dose } : it
    ));
  };

  const handleSave = async () => {
    const valid = items.filter((it) => it.drug.trim() && it.dose.trim());
    if (!valid.length) { setError("Add at least one medicine with name and dose."); return; }
    setSaving(true); setError("");
    try {
      const result = await rxApi.create({ patientId, patientName, appointmentId, admissionId, type, items: valid, notes });
      setSavedRx({ ...result, patientName, items: valid, notes, type });
      onSaved();
    } catch (e: any) {
      setError(e.message || "Failed to save prescription");
      setSaving(false);
    }
  };

  const handlePrintAndClose = () => {
    if (savedRx) printPrescription(savedRx);
    setSavedRx(null); setItems([emptyItem()]); setNotes("");
    onClose();
  };

  const handleCloseAfterSave = () => {
    setSavedRx(null); setItems([emptyItem()]); setNotes("");
    onClose();
  };

  const medicineCount = items.filter((i) => i.drug.trim()).length;

  // ── Post-save success ─────────────────────────────────────────────────────
  if (savedRx) {
    return (
      <Dialog open={open} onOpenChange={handleCloseAfterSave}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <span className="text-xl">✓</span> Prescription Saved
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Rx ID</span><span className="font-mono font-bold">{savedRx.rxId || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Patient</span><span className="font-semibold">{savedRx.patientName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Medicines</span><span className="font-semibold">{savedRx.items?.length ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{savedRx.type}</span></div>
            </div>
            <p className="text-xs text-muted-foreground">A pharmacy order has been created automatically.</p>
            <div className="flex gap-2">
              <Button className="flex-1 gap-2" onClick={handlePrintAndClose}>
                <Printer className="h-4 w-4" /> Print Prescription
              </Button>
              <Button variant="outline" className="flex-1" onClick={handleCloseAfterSave}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pill className="h-5 w-5 text-teal-600" />
            Prescription — <span className="text-teal-700">{patientName}</span>
            <span className="ml-auto text-xs font-normal text-muted-foreground bg-muted px-2 py-1 rounded-md">{type}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Column headers */}
          <div className="hidden sm:grid grid-cols-[2.5fr_1fr_1fr_1fr_1.2fr_56px_2fr_40px] gap-2 px-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b pb-2">
            <span>Medicine Name <span className="text-destructive">*</span></span>
            <span>Dose <span className="text-destructive">*</span></span>
            <span>Route</span>
            <span>Frequency</span>
            <span>Duration</span>
            <span>Qty</span>
            <span>Instructions</span>
            <span />
          </div>

          {/* Medicine rows */}
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 sm:grid-cols-[2.5fr_1fr_1fr_1fr_1.2fr_56px_2fr_40px] gap-2 items-center p-2 sm:p-0 rounded-xl sm:rounded-none border sm:border-0 bg-muted/20 sm:bg-transparent"
              >
                <div className="sm:hidden text-xs font-semibold text-muted-foreground -mb-1">
                  Medicine {idx + 1}
                </div>

                {/* ── Drug name with autocomplete ── */}
                <DrugAutocomplete
                  value={item.drug}
                  onChange={(v) => updateItem(idx, "drug", v)}
                  onSelect={(drug) => handleDrugSelect(idx, drug)}
                  placeholder="Type to search inventory…"
                />

                <Input
                  className="h-9 text-sm"
                  placeholder="500mg"
                  value={item.dose}
                  onChange={(e) => updateItem(idx, "dose", e.target.value)}
                />
                <Select value={item.route} onValueChange={(v) => updateItem(idx, "route", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{ROUTES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={item.frequency} onValueChange={(v) => updateItem(idx, "frequency", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={item.duration} onValueChange={(v) => updateItem(idx, "duration", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{DURATIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
                <Input
                  className="h-9 text-sm text-center"
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                />
                <Input
                  className="h-9 text-sm"
                  placeholder="After food, at night…"
                  value={item.instructions}
                  onChange={(e) => updateItem(idx, "instructions", e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-10 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={() => removeItem(idx)}
                  disabled={items.length === 1}
                  title="Remove medicine"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-9"
            onClick={() => setItems((p) => [...p, emptyItem()])}
          >
            <Plus className="h-4 w-4" /> Add Medicine
          </Button>

          {/* Notes + summary */}
          <div className="grid sm:grid-cols-2 gap-4 pt-3 border-t">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">Patient Notes / Instructions</Label>
              <Textarea
                className="h-24 text-sm resize-none"
                placeholder="e.g. Rest well, avoid spicy food, return in 5 days if no improvement…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 flex flex-col gap-2">
              <p className="text-xs font-semibold text-teal-800 flex items-center gap-1.5">
                <Pill className="h-3.5 w-3.5" /> Auto Pharmacy Order
              </p>
              <p className="text-xs text-teal-700 leading-relaxed">
                Saving will automatically create a pharmacy dispensing order for all listed medicines.
              </p>
              <div className="mt-auto pt-2 border-t border-teal-200 flex items-center justify-between text-xs">
                <span className="text-teal-600">Medicines listed</span>
                <span className="font-bold text-teal-800 text-base">{medicineCount}</span>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2 min-w-[180px]">
              <Pill className="h-4 w-4" />
              {saving ? "Saving…" : "Save & Send to Pharmacy"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
