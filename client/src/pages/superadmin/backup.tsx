import { useRef, useState } from "react";
import { Link } from "wouter";
import { useSuperAdmin } from "../../contexts/SuperAdminContext";
import { superadmin as saApi } from "../../lib/api";
import { Shield, LogOut, DatabaseBackup, Download, Upload, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { confirm } from "@/hooks/use-confirm";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export default function SuperAdminBackupPage() {
  const { superAdmin, logout } = useSuperAdmin();
  const [generating, setGenerating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastBackup, setLastBackup] = useState<{
    fileName: string; sizeBytes: number; collectionCount: number; documentCount: number; generatedAt: string;
  } | null>(null);
  const [lastRestore, setLastRestore] = useState<{
    fileName: string; restoredCollections: number; restoredDocuments: number;
  } | null>(null);

  const handleBackup = async () => {
    setGenerating(true);
    try {
      const res = await saApi.backup();
      const link = document.createElement("a");
      link.href = `data:${res.fileType};base64,${res.fileData}`;
      link.download = res.fileName;
      link.click();
      setLastBackup({
        fileName: res.fileName,
        sizeBytes: res.sizeBytes,
        collectionCount: res.collectionCount,
        documentCount: res.documentCount,
        generatedAt: res.generatedAt,
      });
      toast({ title: "Backup ready", description: `${res.fileName} downloaded successfully.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Backup failed", description: err.message || "Failed to generate database backup." });
    } finally {
      setGenerating(false);
    }
  };

  const handleRestoreFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    const ok = await confirm({
      title: "Restore database from this dump?",
      description: `This will permanently delete the current contents of every collection found in "${file.name}" and replace them with the file's data. This cannot be undone.`,
      confirmText: "Restore & overwrite",
      variant: "destructive",
    });
    if (!ok) return;

    setRestoring(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = () => reject(new Error("Failed to read file."));
        reader.readAsDataURL(file);
      });
      const res = await saApi.restoreBackup(base64);
      setLastRestore({
        fileName: file.name,
        restoredCollections: res.restoredCollections,
        restoredDocuments: res.restoredDocuments,
      });
      toast({ title: "Restore complete", description: `${res.restoredDocuments} documents restored across ${res.restoredCollections} collections.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Restore failed", description: err.message || "Failed to restore database from the uploaded file." });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Navbar */}
      <header className="border-b border-slate-700 bg-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white">Carenoww</span>
              <span className="text-slate-400 text-sm ml-2">Superadmin</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">{superAdmin?.email}</span>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Nav tabs */}
      <nav className="border-b border-slate-700 bg-slate-800/50 px-6">
        <div className="max-w-7xl mx-auto flex gap-6">
          <Link href="/superadmin/dashboard" className="py-3 text-sm font-medium text-slate-400 hover:text-white border-b-2 border-transparent">
            Dashboard
          </Link>
          <Link href="/superadmin/tenants" className="py-3 text-sm font-medium text-slate-400 hover:text-white border-b-2 border-transparent">
            Tenants
          </Link>
          <Link href="/superadmin/backup" className="py-3 text-sm font-medium text-white border-b-2 border-red-500">
            Backup
          </Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Database Backup</h1>
          <p className="text-slate-400 text-sm mt-1">Download a full MongoDB dump across all tenants</p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-red-900/30 rounded-xl flex items-center justify-center mb-4">
            <DatabaseBackup className="w-7 h-7 text-red-400" />
          </div>
          <h2 className="font-semibold text-lg mb-1">Take a MongoDB Dump</h2>
          <p className="text-slate-400 text-sm max-w-md mb-6">
            Generates a gzip-compressed export of every collection in the database
            (all tenants) and downloads it to your browser. This may take a moment
            for larger databases.
          </p>
          <button
            onClick={handleBackup}
            disabled={generating}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {generating ? "Generating dump…" : "Download MongoDB Dump"}
          </button>

          {lastBackup && (
            <div className="mt-8 w-full max-w-md bg-slate-900 border border-slate-700 rounded-lg px-5 py-4 text-left text-sm">
              <p className="font-medium mb-2">{lastBackup.fileName}</p>
              <div className="grid grid-cols-2 gap-y-1 text-slate-400 text-xs">
                <span>Size</span><span className="text-slate-200">{formatBytes(lastBackup.sizeBytes)}</span>
                <span>Collections</span><span className="text-slate-200">{lastBackup.collectionCount}</span>
                <span>Documents</span><span className="text-slate-200">{lastBackup.documentCount}</span>
                <span>Generated at</span><span className="text-slate-200">{new Date(lastBackup.generatedAt).toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-800 border border-red-900/50 rounded-xl p-8 flex flex-col items-center text-center mt-6">
          <div className="w-14 h-14 bg-red-900/30 rounded-xl flex items-center justify-center mb-4">
            <Upload className="w-7 h-7 text-red-400" />
          </div>
          <h2 className="font-semibold text-lg mb-1">Restore from Dump</h2>
          <p className="text-slate-400 text-sm max-w-md mb-6">
            Upload a <code>.json.gz</code> file produced by the button above to
            overwrite the current database. Existing data in every affected
            collection is deleted first — this is destructive and cannot be undone.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".gz,application/gzip"
            className="hidden"
            onChange={handleRestoreFileSelected}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={restoring}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
          >
            {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {restoring ? "Restoring…" : "Upload Dump File"}
          </button>

          {lastRestore && (
            <div className="mt-8 w-full max-w-md bg-slate-900 border border-slate-700 rounded-lg px-5 py-4 text-left text-sm">
              <p className="font-medium mb-2">{lastRestore.fileName}</p>
              <div className="grid grid-cols-2 gap-y-1 text-slate-400 text-xs">
                <span>Collections restored</span><span className="text-slate-200">{lastRestore.restoredCollections}</span>
                <span>Documents restored</span><span className="text-slate-200">{lastRestore.restoredDocuments}</span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
