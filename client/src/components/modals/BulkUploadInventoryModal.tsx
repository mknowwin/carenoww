import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { pharmacy as pharmacyApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import {
  Download, Upload, CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet,
} from "lucide-react";

interface ParsedRow {
  name: string;
  category: string;
  supplier: string;
  hsnCode: string;
  unit: string;
  stock: number;
  reorderLevel: number;
  mrpPerUnit: number;
  purchasePricePerUnit: number;
  _validationError?: string;
}

type RowResult =
  | { status: "success"; name: string }
  | { status: "duplicate"; name: string }
  | { status: "error"; name: string; message: string };

interface UploadSummary {
  success: number;
  duplicates: number;
  errors: number;
  results: RowResult[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const TEMPLATE_HEADERS = [
  "name", "category", "supplier", "hsnCode",
  "unit", "stock", "reorderLevel", "mrpPerUnit", "purchasePricePerUnit",
];

function computeStatus(stock: number, reorderLevel: number): "OK" | "Low" | "Critical" {
  if (stock <= 0) return "Critical";
  const ratio = reorderLevel > 0 ? stock / reorderLevel : 2;
  return ratio <= 0.5 ? "Critical" : ratio <= 1 ? "Low" : "OK";
}

export default function BulkUploadInventoryModal({ open, onClose }: Props) {
  const [phase, setPhase] = useState<"idle" | "preview" | "uploading" | "done">("idle");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  function downloadTemplate() {
    const sample1 = ["Metformin 500mg", "Diabetes", "MedPharma", "30049099", "Tab", 500, 100, 2.5, 1.8];
    const sample2 = ["Amoxicillin 250mg", "Antibiotic", "", "", "Cap", 200, 50, 5.0, 3.5];
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, sample1, sample2]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Drug Inventory");
    XLSX.writeFile(wb, "drug_inventory_template.xlsx");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "xlsx" && ext !== "xls") {
      setParseError("Only .xlsx and .xls files are accepted.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
          defval: "",
        });

        if (rawRows.length === 0) {
          setParseError("The sheet is empty or has no data rows.");
          return;
        }

        const seenNames = new Set<string>();
        const parsed: ParsedRow[] = rawRows.map((raw) => {
          const name = String(raw["name"] ?? "").trim();
          const unit = String(raw["unit"] ?? "").trim() || "Tab";

          let _validationError: string | undefined;
          if (!name) {
            _validationError = "Name is required";
          } else if (seenNames.has(name.toLowerCase())) {
            _validationError = "Duplicate name in file";
          }
          if (name) seenNames.add(name.toLowerCase());

          return {
            name,
            category: String(raw["category"] ?? "").trim(),
            supplier: String(raw["supplier"] ?? "").trim(),
            hsnCode: String(raw["hsnCode"] ?? "").trim(),
            unit,
            stock: Number(raw["stock"]) || 0,
            reorderLevel: Number(raw["reorderLevel"]) || 0,
            mrpPerUnit: Number(raw["mrpPerUnit"]) || 0,
            purchasePricePerUnit: Number(raw["purchasePricePerUnit"]) || 0,
            _validationError,
          };
        });

        setRows(parsed);
        setParseError("");
        setPhase("preview");
      } catch {
        setParseError("Failed to parse the file. Make sure it is a valid .xlsx or .xls file.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleUpload() {
    const validRows = rows.filter((r) => !r._validationError);
    if (validRows.length === 0) return;

    setPhase("uploading");
    const results: RowResult[] = [];
    let successCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      try {
        await pharmacyApi.inventory.create({
          name: row.name,
          category: row.category,
          supplier: row.supplier,
          hsnCode: row.hsnCode,
          unit: row.unit,
          stock: row.stock,
          reorderLevel: row.reorderLevel,
          mrpPerUnit: row.mrpPerUnit,
          purchasePricePerUnit: row.purchasePricePerUnit,
          status: computeStatus(row.stock, row.reorderLevel),
        });
        successCount++;
        results.push({ status: "success", name: row.name });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        if (message === "Drug already exists in inventory") {
          duplicateCount++;
          results.push({ status: "duplicate", name: row.name });
        } else {
          errorCount++;
          results.push({ status: "error", name: row.name, message });
        }
      }
      setProgress(Math.round(((i + 1) / validRows.length) * 100));
    }

    if (successCount > 0) {
      qc.invalidateQueries({ queryKey: ["pharmacy-inventory"] });
    }

    setSummary({ success: successCount, duplicates: duplicateCount, errors: errorCount, results });
    setPhase("done");
  }

  function handleClose() {
    setPhase("idle");
    setRows([]);
    setParseError("");
    setProgress(0);
    setSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClose();
  }

  const validRows = rows.filter((r) => !r._validationError);
  const invalidRows = rows.filter((r) => r._validationError);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-teal-600" />
            Bulk Upload Drug Inventory
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">

          {/* ── Phase: idle ──────────────────────────────────────────────── */}
          {phase === "idle" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload an Excel file (.xlsx or .xls) to import multiple drugs at once.
                Medicine names must be unique — duplicates will be reported without failing the batch.
              </p>

              <div className="rounded-lg border border-dashed p-6 space-y-3 text-center bg-muted/30">
                <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Download the template first</p>
                  <p className="text-xs text-muted-foreground">
                    Fill in the columns: name, category, supplier, hsnCode, unit, stock, reorderLevel, mrpPerUnit, purchasePricePerUnit
                  </p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadTemplate}>
                  <Download className="h-4 w-4" /> Download Template
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Then upload your filled file</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  variant="outline"
                  className="w-full h-10 gap-2 border-dashed"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" /> Choose Excel File (.xlsx / .xls)
                </Button>
                {parseError && (
                  <p className="text-sm text-destructive flex items-center gap-1.5">
                    <XCircle className="h-4 w-4 shrink-0" /> {parseError}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Phase: preview ───────────────────────────────────────────── */}
          {phase === "preview" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium">{rows.length} rows parsed</span>
                {validRows.length > 0 && (
                  <Badge className="bg-green-100 text-green-800">{validRows.length} valid</Badge>
                )}
                {invalidRows.length > 0 && (
                  <Badge className="bg-red-100 text-red-800">{invalidRows.length} invalid (will be skipped)</Badge>
                )}
              </div>

              <div className="rounded-md border overflow-hidden">
                <div className="overflow-x-auto max-h-80">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="px-2 py-2 text-left font-medium w-6">#</th>
                        <th className="px-2 py-2 text-left font-medium">Name</th>
                        <th className="px-2 py-2 text-left font-medium">Category</th>
                        <th className="px-2 py-2 text-left font-medium">Supplier</th>
                        <th className="px-2 py-2 text-left font-medium">Unit</th>
                        <th className="px-2 py-2 text-right font-medium">Stock</th>
                        <th className="px-2 py-2 text-right font-medium">Reorder</th>
                        <th className="px-2 py-2 text-right font-medium">MRP ₹</th>
                        <th className="px-2 py-2 text-right font-medium">Cost ₹</th>
                        <th className="px-2 py-2 text-left font-medium">Issue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((row, idx) => (
                        <tr
                          key={idx}
                          className={row._validationError ? "bg-red-50" : ""}
                        >
                          <td className="px-2 py-1.5 text-muted-foreground">{idx + 1}</td>
                          <td className="px-2 py-1.5 font-medium">{row.name || <span className="text-muted-foreground italic">—</span>}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{row.category || "—"}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{row.supplier || "—"}</td>
                          <td className="px-2 py-1.5">{row.unit}</td>
                          <td className="px-2 py-1.5 text-right">{row.stock}</td>
                          <td className="px-2 py-1.5 text-right">{row.reorderLevel}</td>
                          <td className="px-2 py-1.5 text-right">{row.mrpPerUnit || "—"}</td>
                          <td className="px-2 py-1.5 text-right">{row.purchasePricePerUnit || "—"}</td>
                          <td className="px-2 py-1.5">
                            {row._validationError && (
                              <Badge className={
                                row._validationError === "Duplicate name in file"
                                  ? "bg-amber-100 text-amber-800 text-xs"
                                  : "bg-red-100 text-red-800 text-xs"
                              }>
                                {row._validationError}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPhase("idle");
                    setRows([]);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  Choose Different File
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={validRows.length === 0}
                  onClick={handleUpload}
                >
                  <Upload className="h-4 w-4" />
                  Upload {validRows.length} Valid Row{validRows.length !== 1 ? "s" : ""}
                </Button>
              </div>
            </div>
          )}

          {/* ── Phase: uploading ─────────────────────────────────────────── */}
          {phase === "uploading" && (
            <div className="space-y-4 py-4">
              <p className="text-sm font-medium text-center">Uploading… {progress}%</p>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                Please wait while drugs are being added to inventory.
              </p>
            </div>
          )}

          {/* ── Phase: done ──────────────────────────────────────────────── */}
          {phase === "done" && summary && (
            <div className="space-y-4">
              <div className="flex gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 rounded-md border px-3 py-2 bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800">{summary.success} added</span>
                </div>
                <div className="flex items-center gap-1.5 rounded-md border px-3 py-2 bg-amber-50">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">{summary.duplicates} duplicate{summary.duplicates !== 1 ? "s" : ""} skipped</span>
                </div>
                {summary.errors > 0 && (
                  <div className="flex items-center gap-1.5 rounded-md border px-3 py-2 bg-red-50">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-medium text-red-800">{summary.errors} error{summary.errors !== 1 ? "s" : ""}</span>
                  </div>
                )}
              </div>

              <div className="rounded-md border max-h-64 overflow-y-auto divide-y">
                {summary.results.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-3 py-2 text-sm">
                    {r.status === "success" && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                    {r.status === "duplicate" && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
                    {r.status === "error" && <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                    <span className="flex-1 font-medium truncate">{r.name}</span>
                    {r.status === "duplicate" && (
                      <span className="text-xs text-muted-foreground">already exists</span>
                    )}
                    {r.status === "error" && (
                      <span className="text-xs text-red-600 truncate max-w-48">{r.message}</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button size="sm" onClick={handleClose}>Close</Button>
              </div>
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
