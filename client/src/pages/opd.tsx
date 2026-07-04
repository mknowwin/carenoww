import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Stethoscope, Mic, MicOff, Brain, Pill, FlaskConical, FileText,
  CheckCircle2, Clock, Activity, Thermometer, Heart, User, Upload,
  Download, Trash2, Loader2, Eye, CalendarDays, Hash, Paperclip, X, BedDouble,
} from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { patients as patientsApi, appointments as apptApi, reports as reportsApi, lab as labApi, prescriptions as rxApi, auth as authApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import LabOrderModal from "@/components/modals/LabOrderModal";
import PrescriptionModal from "@/components/modals/PrescriptionModal";
import AdmitModal from "@/components/modals/AdmitModal";
import { toast } from "@/hooks/use-toast";

// ── DICOM Renderer ────────────────────────────────────────────────────────────
async function renderDicom(base64: string, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;

  const showError = (msg: string) => {
    canvas.width = 480; canvas.height = 160;
    ctx.fillStyle = "#111"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f87171"; ctx.font = "13px monospace"; ctx.textAlign = "center";
    ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
  };

  try {
    const { default: dicomParser } = await import("dicom-parser");
    const binary = atob(base64);
    const byteArr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) byteArr[i] = binary.charCodeAt(i);

    const dataSet = dicomParser.parseDicom(byteArr);

    const rows         = dataSet.uint16("x00280010") || 0;
    const cols         = dataSet.uint16("x00280011") || 0;
    const bitsAlloc    = dataSet.uint16("x00280100") || 16;
    const pixelRep     = dataSet.uint16("x00280103") || 0;
    const samplesPerPx = dataSet.uint16("x00280002") || 1;
    if (!rows || !cols) { showError("DICOM: no image dimensions"); return; }

    const pixelEl = dataSet.elements["x7fe00010"];
    if (!pixelEl) { showError("DICOM: no pixel data element"); return; }

    // ── Encapsulated (compressed) pixel data — e.g. JPEG Baseline, JPEG-LS ──
    if (pixelEl.hadUndefinedLength) {
      try {
        const frame = dicomParser.readEncapsulatedImageFrame(dataSet, pixelEl, 0);
        const frameBytes = frame instanceof Uint8Array ? frame : new Uint8Array((frame as any).buffer ?? frame);
        // Use browser native image decoder (works for JPEG Baseline / JPEG Extended)
        const blob = new Blob([frameBytes]);
        const url  = URL.createObjectURL(blob);
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            canvas.width  = img.naturalWidth  || cols;
            canvas.height = img.naturalHeight || rows;
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            resolve();
          };
          img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
          img.src = url;
        });
      } catch {
        showError("DICOM: compressed format not supported by browser");
      }
      return;
    }

    // ── Uncompressed (raw) pixel data ─────────────────────────────────────────
    // Copy to fresh aligned buffer (Uint16Array requires 2-byte alignment)
    const byteLen  = pixelEl.length;
    const pixelBuf = new ArrayBuffer(byteLen + (byteLen % 2));
    const pixelU8  = new Uint8Array(pixelBuf);
    for (let i = 0; i < byteLen; i++) pixelU8[i] = byteArr[pixelEl.dataOffset + i];

    const totalSamples = rows * cols * samplesPerPx;
    let pixels: number[];
    if (bitsAlloc <= 8) {
      pixels = Array.from(new Uint8Array(pixelBuf, 0, totalSamples));
    } else if (pixelRep === 1) {
      pixels = Array.from(new Int16Array(pixelBuf, 0, totalSamples));   // signed (CT HU)
    } else {
      pixels = Array.from(new Uint16Array(pixelBuf, 0, totalSamples));  // unsigned
    }

    // Window/Level from DICOM tags (CT WindowCenter/Width), fallback to min/max
    const wCenter = dataSet.floatString("x00281050");
    const wWidth  = dataSet.floatString("x00281051");
    let lo: number, hi: number;
    if (wCenter != null && wWidth != null && wWidth > 0) {
      lo = wCenter - wWidth / 2;
      hi = wCenter + wWidth / 2;
    } else {
      lo = Infinity; hi = -Infinity;
      for (const v of pixels) { if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    const range = hi - lo || 1;
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const norm  = (v: number) => clamp(((v - lo) / range) * 255);

    canvas.width  = cols;
    canvas.height = rows;
    const imgData = ctx.createImageData(cols, rows);

    for (let i = 0; i < rows * cols; i++) {
      const base = i * 4;
      if (samplesPerPx === 3) {
        imgData.data[base]     = norm(pixels[i * 3]);
        imgData.data[base + 1] = norm(pixels[i * 3 + 1]);
        imgData.data[base + 2] = norm(pixels[i * 3 + 2]);
      } else {
        const g = norm(pixels[i]);
        imgData.data[base] = imgData.data[base + 1] = imgData.data[base + 2] = g;
      }
      imgData.data[base + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  } catch (e) {
    console.error("[DICOM] render failed:", e);
    showError("DICOM: failed to parse file");
  }
}

// ── AI Scribe helpers ─────────────────────────────────────────────────────────
const COMMON_LABS = ["CBC","CRP","ESR","HbA1c","blood glucose","urine","LFT","KFT","lipid","TSH","T3","T4","blood culture","ECG","echo","MRI","CT scan","X-ray","creatinine","sodium","potassium","bilirubin","albumin"];
const DRUG_PATTERNS = [/(\w+)\s+\d+\s*mg/gi, /(\w+)\s+\d+\s*ml/gi, /(?:tab|cap|syrup|injection|IV)\s+(\w+)/gi];

function detectFromTranscript(text: string): { drugs: string[]; labs: string[] } {
  const drugs: string[] = [];
  const labs: string[] = [];
  const lower = text.toLowerCase();
  COMMON_LABS.forEach(lab => { if (lower.includes(lab.toLowerCase())) labs.push(lab); });
  DRUG_PATTERNS.forEach(pattern => {
    let m; pattern.lastIndex = 0;
    while ((m = pattern.exec(text)) !== null) { if (m[1] && m[1].length > 2) drugs.push(m[1]); }
  });
  return { drugs: [...new Set(drugs)], labs: [...new Set(labs)] };
}

function parseSoapIntoSections(transcript: string): { subjective: string; objective: string; assessment: string; plan: string } {
  const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 3);
  const result = { subjective: "", objective: "", assessment: "", plan: "" };

  sentences.forEach(sentence => {
    const s = sentence.toLowerCase();
    if (/complain|report|present|chief complaint|patient says|he says|she says|pain|fever|cough|nausea|vomit|diarrhea|headache|dizzy|weakness|fatigue/i.test(s)) {
      result.subjective += sentence.trim() + ". ";
    } else if (/bp|blood pressure|pulse|temperature|spo2|oxygen|weight|height|examination|look|appear|auscult|palpat|vital/i.test(s)) {
      result.objective += sentence.trim() + ". ";
    } else if (/diagnos|impression|assess|likely|consistent|rule out|suspect|indicate/i.test(s)) {
      result.assessment += sentence.trim() + ". ";
    } else if (/prescri|treat|plan|follow|refer|order|give|start|continue|stop|discharge|admit|review/i.test(s)) {
      result.plan += sentence.trim() + ". ";
    } else {
      result.subjective += sentence.trim() + ". ";
    }
  });

  return result;
}

// ── Vitals ────────────────────────────────────────────────────────────────────
const BLANK_VITALS = { bp: "", pulse: "", temp: "", spo2: "", weight: "", height: "" };
const BLANK_SOAP   = { subjective: "", objective: "", assessment: "", plan: "" };

function bmi(weight: string, height: string): string {
  const w = parseFloat(weight);
  const h = parseFloat(height) / 100;
  if (!w || !h) return "—";
  return (w / (h * h)).toFixed(1);
}

function vitalStatus(label: string, val: string) {
  if (!val) return "";
  if (label === "BP") {
    const sys = parseInt(val.split("/")[0] ?? "0");
    if (sys >= 140) return "High";
    if (sys < 90)   return "Low";
  }
  if (label === "SpO2" && parseInt(val) < 94) return "Low";
  if (label === "Pulse") {
    const p = parseInt(val);
    if (p > 100) return "High";
    if (p < 60)  return "Low";
  }
  return "Normal";
}

// ── File size formatter ───────────────────────────────────────────────────────
function fmtSize(bytes: number) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── DocViewerModal ────────────────────────────────────────────────────────────
function DocViewerModal({ report, onClose }: { report: any; onClose: () => void }) {
  const [fileData, setFileData] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isDicom = (name: string) => !!name?.toLowerCase().endsWith(".dcm");
  const isPdf   = (type: string) => type?.includes("pdf");
  const isImage = (type: string) => type?.startsWith("image/");

  // Step 1: fetch file data (don't touch canvas here — it's not in DOM yet)
  useEffect(() => {
    reportsApi.download(report._id)
      .then((data: any) => { setFileData(data.fileData); setLoading(false); })
      .catch(() => setLoading(false));
  }, [report._id]);

  // Step 2: render DICOM *after* the canvas appears in the DOM (next render cycle)
  useEffect(() => {
    if (loading || !fileData) return;
    if (!isDicom(report.fileName)) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderDicom(fileData, canvas);
  }, [loading, fileData, report.fileName]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold text-sm">{report.fileName}</h3>
            <p className="text-xs text-muted-foreground">{report.fileType} · {report.notes}</p>
          </div>
          <div className="flex gap-2">
            {fileData && (
              <a href={`data:${report.fileType};base64,${fileData}`} download={report.fileName}>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                  <Download className="h-3 w-3" /> Download
                </Button>
              </a>
            )}
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-gray-50 dark:bg-gray-900 min-h-64">
          {loading && <p className="text-muted-foreground text-sm">Loading file...</p>}
          {!loading && fileData && (
            <>
              {isImage(report.fileType) && (
                <img src={`data:${report.fileType};base64,${fileData}`} alt={report.fileName}
                  className="max-w-full max-h-[70vh] object-contain rounded-lg" />
              )}
              {isPdf(report.fileType) && (
                <iframe
                  src={`data:application/pdf;base64,${fileData}`}
                  className="w-full h-[70vh] rounded-lg border"
                  title={report.fileName}
                />
              )}
              {isDicom(report.fileName) && (
                <div className="text-center">
                  <canvas ref={canvasRef} className="max-w-full max-h-[65vh] rounded-lg bg-black" />
                  <p className="text-xs text-muted-foreground mt-2">DICOM Viewer — Window/Level rendering</p>
                </div>
              )}
              {!isImage(report.fileType) && !isPdf(report.fileType) && !isDicom(report.fileName) && (
                <div className="text-center text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Preview not available for this file type.</p>
                  <p className="text-xs mt-1">Use Download button above.</p>
                </div>
              )}
            </>
          )}
          {!loading && !fileData && (
            <div className="text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Failed to load file.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ReportsTab ────────────────────────────────────────────────────────────────
function ReportsTab({ patient, activeAppt }: { patient: any; patientId: string; activeAppt: any }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [notes, setNotes]         = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote]   = useState("");
  const [viewingReport, setViewingReport] = useState<any>(null);

  const pid = patient?.uhid || patient?.id || patient?._id;

  const { data: reportList = [], isLoading } = useQuery({
    queryKey: ["reports", pid],
    queryFn:  () => reportsApi.list(pid),
    enabled:  !!pid,
    retry: false,
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setUploadErr("File is too large. Maximum allowed size is 8 MB.");
      return;
    }

    setUploading(true); setUploadErr("");
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        await reportsApi.upload({
          patientId:     pid,
          patientName:   patient?.name ?? "",
          appointmentId: activeAppt?._id ?? "",
          fileName:      file.name,
          fileType:      file.type || "application/octet-stream",
          fileData:      base64,
          fileSize:      file.size,
          notes,
        });
        qc.invalidateQueries({ queryKey: ["reports", pid] });
        setNotes("");
        if (fileRef.current) fileRef.current.value = "";
      };
      reader.onerror = () => setUploadErr("Failed to read file.");
      reader.readAsDataURL(file);
    } catch (err: any) {
      setUploadErr(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (report: any) => {
    try {
      const res = await reportsApi.download(report._id);
      const link = document.createElement("a");
      link.href = `data:${res.fileType};base64,${res.fileData}`;
      link.download = res.fileName;
      link.click();
    } catch (err: any) {
      alert(err.message || "Download failed");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this report?")) return;
    try {
      await reportsApi.remove(id);
      qc.invalidateQueries({ queryKey: ["reports", pid] });
    } catch (err: any) {
      alert(err.message || "Delete failed");
    }
  };

  const handleSaveNote = async (id: string) => {
    try {
      await reportsApi.updateNotes(id, editNote);
      qc.invalidateQueries({ queryKey: ["reports", pid] });
      setEditingId(null);
    } catch (err: any) {
      alert(err.message || "Failed to save note");
    }
  };

  const iconForType = (ft: string) => {
    if (ft.includes("pdf"))   return "📄";
    if (ft.includes("image")) return "🖼️";
    if (ft.includes("word") || ft.includes("doc")) return "📝";
    return "📎";
  };

  return (
    <div className="space-y-4">
      {/* Upload form */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Upload className="h-4 w-4" /> Upload Physical Report / Document
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}>
            <Paperclip className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Click to select a file</p>
            <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG, DOCX — max 8 MB</p>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept="image/*,application/pdf,.dcm,application/dicom,.doc,.docx,.txt"
              onChange={handleFileChange}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes / Description</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. CBC report from City Lab, dated 14 May 2026..."
              rows={2}
              className="text-sm resize-none"
            />
          </div>
          {uploading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading...
            </div>
          )}
          {uploadErr && (
            <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{uploadErr}</p>
          )}
        </CardContent>
      </Card>

      {/* Uploaded reports */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" /> Uploaded Reports ({(reportList as any[]).length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && (reportList as any[]).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No reports uploaded yet.</p>
          )}
          {viewingReport && (
            <DocViewerModal report={viewingReport} onClose={() => setViewingReport(null)} />
          )}
          {(reportList as any[]).map((r: any) => (
            <div key={r._id} className="border rounded-xl p-3 space-y-2 hover:shadow-sm transition-shadow">
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0">{iconForType(r.fileType)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.fileName}</p>
                  <div className="flex flex-wrap gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{fmtSize(r.fileSize)}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    <span className="text-xs text-muted-foreground">· by {r.uploadedBy}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewingReport(r)} title="View">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownload(r)} title="Download">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {(user?.role === "admin" || user?.role === "doctor") && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(r._id)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {/* Notes */}
              {editingId === r._id ? (
                <div className="space-y-1.5">
                  <Textarea value={editNote} onChange={(e) => setEditNote(e.target.value)}
                    rows={2} className="text-xs resize-none" />
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-6 text-xs px-3" onClick={() => handleSaveNote(r._id)}>Save</Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <p className={`text-xs flex-1 ${r.notes ? "text-muted-foreground" : "text-muted-foreground/40 italic"}`}>
                    {r.notes || "No notes — click to add"}
                  </p>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground shrink-0"
                    onClick={() => { setEditingId(r._id); setEditNote(r.notes ?? ""); }}>
                    <FileText className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── ActiveOrdersPanel — lab orders + prescriptions for current appointment ────
function ActiveOrdersPanel({ patientId, appointmentId }: { patientId: string; appointmentId: string }) {
  const { data: labOrders = [] } = useQuery({
    queryKey: ["lab-orders-appt", appointmentId],
    queryFn:  () => labApi.list({ appointmentId }),
    enabled:  !!appointmentId,
    refetchInterval: 15000,
    retry: false,
  });

  const { data: rxList = [] } = useQuery({
    queryKey: ["rx-appt", appointmentId],
    queryFn:  () => rxApi.list({ appointmentId }),
    enabled:  !!appointmentId,
    refetchInterval: 15000,
    retry: false,
  });

  const orders: any[]  = Array.isArray(labOrders) ? labOrders : (labOrders as any)?.orders ?? [];
  const scripts: any[] = Array.isArray(rxList)    ? rxList    : [];

  if (orders.length === 0 && scripts.length === 0) return null;

  const LAB_STATUS_COLOR: Record<string, string> = {
    Pending:    "bg-amber-100 text-amber-700",
    Collected:  "bg-blue-100 text-blue-700",
    Processing: "bg-violet-100 text-violet-700",
    Completed:  "bg-teal-100 text-teal-700",
    Cancelled:  "bg-red-100 text-red-600",
  };
  const RX_STATUS_COLOR: Record<string, string> = {
    Active:    "bg-blue-100 text-blue-700",
    Dispensed: "bg-teal-100 text-teal-700",
    Cancelled: "bg-red-100 text-red-600",
  };

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {orders.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-teal-600" /> Lab Orders ({orders.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {orders.map((o: any) => (
              <div key={o._id} className="rounded-lg border px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{o.test}</span>
                  <Badge className={`text-xs shrink-0 ${LAB_STATUS_COLOR[o.status] ?? "bg-gray-100 text-gray-600"}`}>{o.status}</Badge>
                </div>
                {o.priority !== "Routine" && (
                  <Badge className="text-xs bg-red-50 text-red-600 mt-1">{o.priority}</Badge>
                )}
                {o.result && (
                  <p className="text-muted-foreground mt-1 bg-muted/40 rounded px-2 py-1 leading-snug">{o.result}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {scripts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Pill className="h-4 w-4 text-amber-600" /> Prescriptions ({scripts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {scripts.map((rx: any) => (
              <div key={rx._id} className="rounded-lg border px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono font-medium">{rx.rxId}</span>
                  <Badge className={`text-xs ${RX_STATUS_COLOR[rx.status] ?? "bg-gray-100 text-gray-600"}`}>{rx.status}</Badge>
                </div>
                {rx.items?.map((it: any, idx: number) => (
                  <div key={idx} className="text-muted-foreground leading-relaxed">
                    {it.drug} {it.dose} — {it.frequency}{it.duration ? ` × ${it.duration}` : ""}
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── HistoryTab ────────────────────────────────────────────────────────────────
function HistoryTab({ patientId }: { patientId: string }) {
  const { data: histData, isLoading } = useQuery({
    queryKey: ["appt-history", patientId],
    queryFn:  () => apptApi.list({ patientId, limit: "50" }),
    enabled:  !!patientId,
    retry: false,
  });

  const history = (histData?.appointments ?? [])
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Loading visit history...</div>;
  }
  if (history.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
        No past visit records found.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {history.map((a: any) => (
        <div key={a._id || a.id} className="border rounded-xl p-3 hover:shadow-sm transition-shadow">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 flex flex-col items-center justify-center shrink-0">
                <Hash className="h-3 w-3 text-teal-500" />
                <span className="text-xs font-bold text-teal-700 font-mono leading-tight">{a.token || "—"}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{a.date}</span>
                  <Badge className={`text-xs ${
                    a.status === "Completed" ? "bg-teal-100 text-teal-700" :
                    a.status === "Cancelled" ? "bg-red-100 text-red-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>{a.status}</Badge>
                  <Badge className="text-xs bg-gray-100 text-gray-600">{a.type}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{a.doctor} · {a.department} · {a.time}</p>
                {/* Vitals recorded at check-in or during consultation */}
                {a.vitals && Object.values(a.vitals).some(Boolean) && (
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {a.vitals.bp     && <Badge className="text-xs bg-blue-50 text-blue-700 border border-blue-200">BP {a.vitals.bp}</Badge>}
                    {a.vitals.pulse  && <Badge className="text-xs bg-green-50 text-green-700 border border-green-200">P {a.vitals.pulse} bpm</Badge>}
                    {a.vitals.temp   && <Badge className="text-xs bg-orange-50 text-orange-700 border border-orange-200">T {a.vitals.temp}°F</Badge>}
                    {a.vitals.spo2   && <Badge className="text-xs bg-purple-50 text-purple-700 border border-purple-200">SpO2 {a.vitals.spo2}%</Badge>}
                    {a.vitals.weight && <Badge className="text-xs bg-muted text-muted-foreground">Wt {a.vitals.weight} kg</Badge>}
                    {a.vitals.height && <Badge className="text-xs bg-muted text-muted-foreground">Ht {a.vitals.height} cm</Badge>}
                  </div>
                )}
                {/* SOAP notes */}
                {(a.soap?.assessment || a.soap?.plan) && (
                  <div className="text-xs text-muted-foreground mt-2 space-y-0.5 bg-muted/40 rounded px-2 py-1.5">
                    {a.soap.assessment && <p><span className="font-semibold text-foreground">A:</span> {a.soap.assessment}</p>}
                    {a.soap.plan      && <p><span className="font-semibold text-foreground">P:</span> {a.soap.plan}</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main OPD Page ─────────────────────────────────────────────────────────────
export default function OPDPage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [isRecording, setIsRecording] = useState(false);
  const [selectedApptId, setSelectedApptId] = useState<string | null>(null);
  const [signing, setSigning]   = useState(false);
  const [labModalOpen,   setLabModalOpen]   = useState(false);
  const [rxModalOpen,    setRxModalOpen]    = useState(false);
  const [admitModalOpen, setAdmitModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"consult" | "history" | "reports">("consult");
  const [vitals, setVitals]     = useState(BLANK_VITALS);
  const [soapNote, setSoapNote] = useState(BLANK_SOAP);

  // AI Scribe state
  const [scribeTranscript, setScribeTranscript] = useState("");
  const [scribeDetected, setScribeDetected] = useState<{ drugs: string[]; labs: string[] }>({ drugs: [], labs: [] });
  const wsRef        = useRef<WebSocket | null>(null);
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);

  // Queue: all active (Waiting + In Consult) appointments — no date filter
  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ["opd-queue"],
    queryFn:  () => apptApi.queue(user?.role === "doctor" ? { doctor: user.name } : {}),
    refetchInterval: 10000,
    retry: false,
  });

  const queue: any[] = queueData ?? [];

  const activeAppt = queue.find((a) => a._id === selectedApptId) ?? queue.find((a) => a.status === "In Consult") ?? queue[0] ?? null;

  // Load patient record for active appointment
  const { data: activePatient } = useQuery({
    queryKey: ["patient", activeAppt?.patientId],
    queryFn:  () => patientsApi.get(activeAppt!.patientId),
    enabled:  !!activeAppt?.patientId,
    retry: false,
  });

  // Load vitals + SOAP from appointment (pre-filled at check-in), reset on patient change
  useEffect(() => {
    setVitals(activeAppt?.vitals ? { ...BLANK_VITALS, ...activeAppt.vitals } : BLANK_VITALS);
    setSoapNote(activeAppt?.soap ? { ...BLANK_SOAP, ...activeAppt.soap } : BLANK_SOAP);
    setActiveTab("consult");
  }, [activeAppt?._id]);

  const setV = (k: keyof typeof BLANK_VITALS, v: string) => setVitals((f) => ({ ...f, [k]: v }));

  const handleCompleteSign = async () => {
    setSigning(true);
    try {
      if (activeAppt) {
        await apptApi.update(activeAppt._id, {
          status: "Completed",
          vitals,
          soap: soapNote,
        });
        qc.invalidateQueries({ queryKey: ["opd-queue"] });
        qc.invalidateQueries({ queryKey: ["appointments"] });
        qc.invalidateQueries({ queryKey: ["queue"] });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Sign-off failed", description: err.message || "Failed to complete and sign consultation." });
    } finally {
      setSigning(false);
    }
  };

  const handleCallIn = async (apt: any) => {
    try {
      await apptApi.call(apt._id);
      qc.invalidateQueries({ queryKey: ["opd-queue"] });
      setSelectedApptId(apt._id);
    } catch (e: any) { alert(e.message || "Failed to call patient"); }
  };

  const handleComplete = async (apt: any) => {
    try {
      await apptApi.update(apt._id, { status: "Completed" });
      qc.invalidateQueries({ queryKey: ["opd-queue"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
    } catch (e: any) { alert(e.message || "Failed to complete"); }
  };

  const stopScribe = useCallback(() => {
    processorRef.current?.disconnect();
    audioCtxRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    wsRef.current?.close();
    wsRef.current = null;
    setIsRecording(false);
    setScribeTranscript(prev => {
      if (prev) {
        const sections = parseSoapIntoSections(prev);
        setSoapNote(s => ({
          subjective: s.subjective || sections.subjective,
          objective:  s.objective  || sections.objective,
          assessment: s.assessment || sections.assessment,
          plan:       s.plan       || sections.plan,
        }));
      }
      return prev;
    });
  }, []);

  const startScribe = async () => {
    try {
      const me = await authApi.me();
      if (!me.aiScribeEnabled || !me.aiScribeApiKey) {
        alert("AI Scribe not configured. Go to Settings → AI Features to add your API key.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const wsUrl = `wss://api.deepgram.com/v1/listen?model=${me.aiScribeModel || "nova-2-medical"}&encoding=linear16&sample_rate=16000&language=en&smart_format=true&interim_results=true`;
      const ws = new WebSocket(wsUrl, ["token", me.aiScribeApiKey]);
      wsRef.current = ws;

      ws.onopen = () => {
        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const input = e.inputBuffer.getChannelData(0);
          const buf = new ArrayBuffer(input.length * 2);
          const view = new DataView(buf);
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
          }
          ws.send(buf);
        };
        source.connect(processor);
        processor.connect(audioCtx.destination);
      };

      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        const t = data.channel?.alternatives?.[0]?.transcript;
        if (t && data.is_final) {
          setScribeTranscript(prev => prev ? prev + " " + t : t);
          const detected = detectFromTranscript(t);
          setScribeDetected(prev => ({
            drugs: [...new Set([...prev.drugs, ...detected.drugs])],
            labs:  [...new Set([...prev.labs,  ...detected.labs])],
          }));
        }
      };

      ws.onerror = () => stopScribe();
      setIsRecording(true);
    } catch (err: any) {
      alert("Microphone access denied or connection failed: " + err.message);
    }
  };

  const TABS = [
    { id: "consult", label: "Consultation" },
    { id: "history", label: "History" },
    { id: "reports", label: "Reports & Files" },
  ] as const;

  const patientId = activePatient?.uhid || activeAppt?.patientId || "";

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">OPD Consultation — EMR</h2>
          <p className="text-sm text-muted-foreground">AI Clinical Co-Pilot active · Ambient Scribe ready</p>
        </div>
        <div className="flex gap-2">
          <Button variant={isRecording ? "destructive" : "outline"} size="sm" className="gap-2"
            onClick={() => isRecording ? stopScribe() : startScribe()}>
            {isRecording ? <><MicOff className="h-4 w-4" /> Stop Scribe</> : <><Mic className="h-4 w-4" /> AI Scribe</>}
          </Button>
          <Button size="sm" className="gap-2 bg-teal-600 hover:bg-teal-700" disabled={signing || !activeAppt}
            onClick={handleCompleteSign}>
            <CheckCircle2 className="h-4 w-4" /> {signing ? "Signing..." : "Complete & Sign"}
          </Button>
        </div>
      </div>

      {isRecording && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-3">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <Brain className="h-4 w-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700 font-medium">
            Ambient AI Scribe recording — speak naturally. SOAP notes will auto-generate in real-time.
          </p>
        </div>
      )}

      {(scribeTranscript || scribeDetected.drugs.length > 0 || scribeDetected.labs.length > 0) && (
        <Card className="border-teal-200 bg-teal-50/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-teal-700">AI Scribe Output</span>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setScribeTranscript(""); setScribeDetected({ drugs: [], labs: [] }); }}>Clear</Button>
            </div>
            {scribeTranscript && (
              <div className="bg-white rounded-lg p-3 text-xs text-muted-foreground max-h-24 overflow-y-auto border">
                {scribeTranscript}
              </div>
            )}
            {scribeDetected.labs.length > 0 && (
              <div>
                <p className="text-xs font-medium text-teal-700 mb-1">Detected Lab Tests — click to add order:</p>
                <div className="flex flex-wrap gap-1.5">
                  {scribeDetected.labs.map(lab => (
                    <button key={lab} className="text-xs bg-teal-100 text-teal-700 rounded-full px-2.5 py-1 hover:bg-teal-200 transition-colors"
                      onClick={() => setLabModalOpen(true)}>
                      + {lab}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {scribeDetected.drugs.length > 0 && (
              <div>
                <p className="text-xs font-medium text-amber-700 mb-1">Detected Drugs — click to add prescription:</p>
                <div className="flex flex-wrap gap-1.5">
                  {scribeDetected.drugs.map(drug => (
                    <button key={drug} className="text-xs bg-amber-100 text-amber-700 rounded-full px-2.5 py-1 hover:bg-amber-200 transition-colors"
                      onClick={() => setRxModalOpen(true)}>
                      + {drug}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-4 gap-4">
        {/* ── Left: Queue + Patient Info ────────────────────── */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span>Queue ({queue.length})</span>
                {queueLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-2">
              {queue.length === 0 && !queueLoading && (
                <p className="text-xs text-muted-foreground text-center py-4">No active patients in queue.</p>
              )}
              {queue.map((apt: any) => {
                const isActive = activeAppt?._id === apt._id;
                const statusLabel = apt.status === "In Consult" ? "In Room" : apt.status === "Waiting" ? "Waiting" : "Confirmed";
                return (
                  <div key={apt._id} className={`p-2 rounded-lg transition-all ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                    <button
                      onClick={() => setSelectedApptId(apt._id)}
                      className="w-full flex items-center gap-2 text-left"
                    >
                      <div className={`w-8 h-8 rounded-lg flex flex-col items-center justify-center text-xs font-bold shrink-0 ${
                        isActive ? "bg-white/20 text-white" : "bg-teal-50 border border-teal-200 text-teal-700"
                      }`}>
                        <Hash className="h-2.5 w-2.5" />
                        <span className="font-mono text-xs leading-tight">{apt.token?.replace(/[A-Z]+-/, "") ?? "—"}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate">{apt.patientName}</div>
                        <div className={`text-xs truncate ${isActive ? "text-white/70" : "text-muted-foreground"}`}>
                          {statusLabel} · {apt.time}
                        </div>
                      </div>
                      {apt.status === "In Consult" && (
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? "bg-white" : "bg-blue-500"} animate-pulse`} />
                      )}
                    </button>
                    {(apt.status === "Waiting" || apt.status === "Confirmed") && (
                      <Button size="sm" className="h-6 text-xs mt-1 w-full bg-teal-600 hover:bg-teal-700"
                        onClick={(e) => { e.stopPropagation(); handleCallIn(apt); }}>
                        <Stethoscope className="h-3 w-3 mr-1" /> Start Consulting
                      </Button>
                    )}
                    {apt.status === "In Consult" && !isActive && (
                      <Button size="sm" variant="outline" className="h-6 text-xs mt-1 w-full text-blue-700 border-blue-300 hover:bg-blue-50"
                        onClick={(e) => { e.stopPropagation(); setSelectedApptId(apt._id); }}>
                        Resume Consultation
                      </Button>
                    )}
                    {apt.status === "In Consult" && isActive && (
                      <Button size="sm" variant="outline" className="h-6 text-xs mt-1 w-full text-teal-700 border-teal-300"
                        onClick={(e) => { e.stopPropagation(); handleComplete(apt); }}>
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Patient summary card */}
          {activeAppt && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" /> Patient
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                    {activeAppt.patientName?.[0] ?? "?"}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{activeAppt.patientName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{activeAppt.patientId}</div>
                  </div>
                </div>
                {activePatient && (
                  <div className="text-xs space-y-1.5">
                    {[
                      ["Age/Gender", `${activePatient.age ?? "—"}y · ${activePatient.gender === "M" ? "Male" : activePatient.gender === "F" ? "Female" : activePatient.gender ?? "—"}`],
                      ["Blood Group", activePatient.bloodGroup || "—"],
                      ["Insurance",   activePatient.insurance || "None"],
                      ["Risk",        activePatient.riskLevel || "—"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-1">
                        <span className="text-muted-foreground shrink-0">{k}</span>
                        <span className="font-medium text-right truncate">{v}</span>
                      </div>
                    ))}
                    {activePatient.diagnosis && (
                      <div className="bg-blue-50 rounded px-2 py-1.5 mt-1">
                        <p className="text-xs text-blue-700 font-medium">Last Diagnosis</p>
                        <p className="text-xs text-blue-600 mt-0.5">{activePatient.diagnosis}</p>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-1 flex-wrap">
                  <Badge className={`text-xs ${
                    activeAppt.status === "In Consult" ? "bg-blue-100 text-blue-700" :
                    activeAppt.status === "Waiting"    ? "bg-amber-100 text-amber-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>{activeAppt.status}</Badge>
                  <Badge className="text-xs bg-teal-50 text-teal-700 font-mono">{activeAppt.token}</Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Right: Tabs ───────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">
          {!activeAppt && !queueLoading && (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border-2 border-dashed border-border rounded-xl">
              <Stethoscope className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">No active patients in queue</p>
              <p className="text-xs mt-1">Patients appear here once checked in via Reception.</p>
            </div>
          )}

          {activeAppt && (
            <>
              {/* Tabs */}
              <div className="flex gap-1 bg-muted/40 p-1 rounded-xl w-fit">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      activeTab === t.id
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── Consultation Tab ─────────────────────────── */}
              {activeTab === "consult" && (
                <div className="space-y-4">
                  {/* Vitals — editable */}
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">Vital Signs</CardTitle>
                        <span className="text-xs text-muted-foreground">
                          {activeAppt?.vitals && Object.values(activeAppt.vitals).some(Boolean)
                            ? "Pre-filled at check-in — edit if needed"
                            : "Enter readings below"}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
                        {([
                          { key: "bp",    label: "BP",     unit: "mmHg",  placeholder: "120/80" },
                          { key: "pulse", label: "Pulse",  unit: "bpm",   placeholder: "72" },
                          { key: "temp",  label: "Temp",   unit: "°F",    placeholder: "98.6" },
                          { key: "spo2",  label: "SpO2",   unit: "%",     placeholder: "98" },
                          { key: "weight",label: "Weight", unit: "kg",    placeholder: "70" },
                          { key: "height",label: "Height", unit: "cm",    placeholder: "170" },
                        ] as const).map((v) => {
                          const status = vitalStatus(v.label, vitals[v.key]);
                          return (
                            <div key={v.key} className={`rounded-xl p-2 border ${
                              status === "High" || status === "Low" ? "bg-red-50 border-red-200" : "bg-muted/30 border-transparent"
                            }`}>
                              <p className="text-xs text-muted-foreground mb-1">{v.label}</p>
                              <Input
                                value={vitals[v.key]}
                                onChange={(e) => setV(v.key, e.target.value)}
                                placeholder={v.placeholder}
                                className="h-7 text-sm p-1 font-mono border-0 bg-transparent focus-visible:ring-0 p-0"
                              />
                              <p className="text-xs text-muted-foreground mt-0.5">{v.unit}</p>
                              {(status === "High" || status === "Low") && (
                                <Badge className="text-xs mt-1 bg-red-100 text-red-700 px-1">{status}</Badge>
                              )}
                            </div>
                          );
                        })}
                        {/* BMI — computed */}
                        <div className={`rounded-xl p-2 border ${
                          parseFloat(bmi(vitals.weight, vitals.height)) > 25 ? "bg-amber-50 border-amber-200" : "bg-muted/30 border-transparent"
                        }`}>
                          <p className="text-xs text-muted-foreground mb-1">BMI</p>
                          <p className="text-sm font-bold font-mono mt-1">{bmi(vitals.weight, vitals.height)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">kg/m²</p>
                          {parseFloat(bmi(vitals.weight, vitals.height)) > 25 && (
                            <Badge className="text-xs mt-1 bg-amber-100 text-amber-700 px-1">High</Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* SOAP Notes */}
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-semibold">SOAP Clinical Notes</CardTitle>
                        {isRecording && <Badge className="bg-red-100 text-red-700 text-xs animate-pulse">AI Generating...</Badge>}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {(["subjective","objective","assessment","plan"] as const).map((key) => (
                          <div key={key}>
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                              {key === "subjective" ? "S — Subjective" :
                               key === "objective"  ? "O — Objective"  :
                               key === "assessment" ? "A — Assessment" : "P — Plan"}
                            </label>
                            <Textarea
                              value={soapNote[key]}
                              onChange={(e) => setSoapNote((p) => ({ ...p, [key]: e.target.value }))}
                              rows={4}
                              className="text-xs resize-none"
                              placeholder={
                                key === "subjective" ? "Chief complaint, history of present illness..." :
                                key === "objective"  ? "Vitals, physical exam findings..." :
                                key === "assessment" ? "Diagnoses (ICD codes)..." :
                                "Treatment plan, orders, follow-up..."
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Active Orders for this patient */}
                  <ActiveOrdersPanel patientId={activeAppt.patientId} appointmentId={activeAppt._id} />

                  {/* AI DDx + Orders */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <Brain className="h-4 w-4 text-primary" />
                          <CardTitle className="text-sm font-semibold">AI Differential Diagnosis</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <p className="text-xs text-muted-foreground">Fill vitals and SOAP notes to enable AI suggestions.</p>
                        {[
                          { rank: 1, diagnosis: "Based on Chief Complaint", icd: "—", confidence: 0, evidence: "Enter patient data to generate suggestions" },
                        ].map((d) => (
                          <div key={d.rank} className="border rounded-xl p-3 opacity-40">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">{d.diagnosis}</span>
                              <Badge className="text-xs font-mono bg-muted text-muted-foreground">{d.icd}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{d.evidence}</p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <Pill className="h-4 w-4 text-amber-600" />
                          <CardTitle className="text-sm font-semibold">Orders</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <Button variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={() => setLabModalOpen(true)}>
                          <FlaskConical className="h-3.5 w-3.5 text-teal-600" /> Order Lab Test
                        </Button>
                        <Button variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={() => setRxModalOpen(true)}>
                          <Pill className="h-3.5 w-3.5 text-amber-600" /> Write Prescription
                        </Button>
                        <Button variant="outline" size="sm" className="w-full gap-2 text-xs text-blue-700 border-blue-300 hover:bg-blue-50"
                          onClick={() => setAdmitModalOpen(true)}>
                          <BedDouble className="h-3.5 w-3.5 text-blue-600" /> Admit to Ward
                        </Button>
                        <Button size="sm" className="w-full gap-2 text-xs bg-teal-600 hover:bg-teal-700"
                          disabled={signing} onClick={handleCompleteSign}>
                          <FileText className="h-3.5 w-3.5" /> {signing ? "Signing..." : "Complete & Sign Note"}
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {/* ── History Tab ──────────────────────────────── */}
              {activeTab === "history" && (
                <HistoryTab patientId={patientId} />
              )}

              {/* ── Reports Tab ──────────────────────────────── */}
              {activeTab === "reports" && (
                <ReportsTab
                  patient={activePatient ?? { name: activeAppt.patientName, uhid: activeAppt.patientId }}
                  patientId={patientId}
                  activeAppt={activeAppt}
                />
              )}
            </>
          )}
        </div>
      </div>

      <LabOrderModal
        open={labModalOpen}
        onClose={() => setLabModalOpen(false)}
        onSaved={() => {}}
        patientId={activeAppt?.patientId ?? ""}
        patientName={activeAppt?.patientName ?? ""}
        appointmentId={activeAppt?._id}
        doctor={activeAppt?.doctor}
      />
      <PrescriptionModal
        open={rxModalOpen}
        onClose={() => setRxModalOpen(false)}
        onSaved={() => {}}
        patientId={activeAppt?.patientId ?? ""}
        patientName={activeAppt?.patientName ?? ""}
        appointmentId={activeAppt?._id}
        type="OPD"
      />
      <AdmitModal
        open={admitModalOpen}
        onClose={() => setAdmitModalOpen(false)}
        onAdmitted={() => setAdmitModalOpen(false)}
        patientId={activeAppt?.patientId}
        patientName={activeAppt?.patientName}
        appointmentId={activeAppt?._id}
        fromDoctor={activeAppt?.doctor}
      />
    </div>
  );
}
