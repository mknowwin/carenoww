import { useEffect, useState, useRef } from "react";
import { publicApi } from "@/lib/api";
import { Heart, Clock, Monitor, Wifi, WifiOff } from "lucide-react";

interface ConsultEntry {
  token: string;
  tokenNumber: number;
  doctor: string;
  department: string;
  patientName: string;
  calledAt: string;
}

interface DisplayData {
  date: string;
  inConsult: ConsultEntry[];
  waitingByDoctor: Record<string, number>;
}

const DEPT_COLORS: Record<string, { bg: string; ring: string; text: string }> = {
  Cardiology:   { bg: "from-red-500 to-rose-600",    ring: "ring-red-400",    text: "text-red-50" },
  Orthopedics:  { bg: "from-orange-500 to-amber-600",ring: "ring-orange-400", text: "text-orange-50" },
  Neurology:    { bg: "from-violet-600 to-purple-700",ring:"ring-violet-400", text: "text-violet-50" },
  Obstetrics:   { bg: "from-pink-500 to-rose-500",   ring: "ring-pink-400",   text: "text-pink-50" },
  Nephrology:   { bg: "from-blue-500 to-indigo-600", ring: "ring-blue-400",   text: "text-blue-50" },
  Oncology:     { bg: "from-teal-600 to-cyan-700",   ring: "ring-teal-400",   text: "text-teal-50" },
  Emergency:    { bg: "from-red-600 to-red-700",     ring: "ring-red-400",    text: "text-red-50" },
  General:      { bg: "from-slate-600 to-gray-700",  ring: "ring-slate-400",  text: "text-slate-50" },
};

function getColor(dept: string) {
  return DEPT_COLORS[dept] ?? { bg: "from-teal-600 to-cyan-700", ring: "ring-teal-400", text: "text-teal-50" };
}

function getTimeSince(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "Just now";
  return `${diff}m ago`;
}

function NowServingCard({ entry, waitingCount }: { entry: ConsultEntry; waitingCount: number }) {
  const c = getColor(entry.department);
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${c.bg} p-6 shadow-xl ring-2 ${c.ring}`}>
      <div className="absolute top-3 right-3 opacity-20">
        <div className="w-24 h-24 rounded-full bg-white" />
      </div>
      <div className="absolute bottom-2 left-2 opacity-10">
        <div className="w-32 h-32 rounded-full bg-white" />
      </div>

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className={`text-xs font-bold uppercase tracking-widest ${c.text} opacity-80`}>Now Serving</p>
            <p className={`text-sm font-medium ${c.text} opacity-90 mt-0.5`}>{entry.department}</p>
          </div>
          <div className={`w-3 h-3 rounded-full bg-white animate-pulse`} />
        </div>

        <div className={`text-7xl font-black ${c.text} tracking-tight leading-none mb-4`}>
          {entry.token}
        </div>

        <div className={`border-t border-white/20 pt-3 space-y-1`}>
          <p className={`text-sm font-semibold ${c.text}`}>{entry.doctor}</p>
          <div className="flex items-center justify-between">
            <p className={`text-xs ${c.text} opacity-80`}>
              {entry.calledAt ? getTimeSince(entry.calledAt) : ""}
            </p>
            {waitingCount > 0 && (
              <p className={`text-xs ${c.text} opacity-80`}>
                {waitingCount} waiting
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyDeptCard({ doctor, department, waitingCount }: { doctor: string; department?: string; waitingCount: number }) {
  const dept = department || doctor;
  const c = getColor(dept);
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${c.bg} p-5 opacity-60`}>
      <div className="relative z-10">
        <p className={`text-xs font-bold uppercase tracking-widest ${c.text} opacity-80`}>{dept}</p>
        <p className={`text-4xl font-black ${c.text} mt-2 mb-3`}>—</p>
        <p className={`text-xs ${c.text} opacity-80`}>{doctor.replace("Dr. ", "Dr. ")}</p>
        <p className={`text-xs ${c.text} opacity-60 mt-0.5`}>{waitingCount} waiting</p>
      </div>
    </div>
  );
}

export default function TokenDisplayPage() {
  const [data, setData]       = useState<DisplayData | null>(null);
  const [tenantId, setTenantId] = useState<string>("");
  const [error, setError]     = useState<string>("");
  const [online, setOnline]   = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Read tenantId from URL query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tid = params.get("tid") || params.get("tenantId") || "";
    setTenantId(tid);
  }, []);

  const fetchData = async (tid: string) => {
    if (!tid) return;
    try {
      const result = await publicApi.display(tid);
      if (result.error) { setError(result.error); return; }
      setData(result);
      setOnline(true);
      setLastRefresh(new Date());
      setError("");
    } catch {
      setOnline(false);
    }
  };

  useEffect(() => {
    if (!tenantId) return;
    fetchData(tenantId);
    intervalRef.current = setInterval(() => fetchData(tenantId), 10000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [tenantId]);

  // Full-screen display — show setup screen if no tenantId
  if (!tenantId) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-white p-8">
        <div className="w-16 h-16 bg-teal-600 rounded-2xl flex items-center justify-center mb-6">
          <Monitor className="h-8 w-8" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Token Display Screen</h1>
        <p className="text-gray-400 text-center max-w-md mb-8">
          This screen shows live token numbers for the waiting area. Add your Clinic ID to the URL to activate.
        </p>
        <div className="bg-gray-800 rounded-xl px-6 py-4 font-mono text-sm text-gray-300">
          /display?tid=YOUR_TENANT_ID
        </div>
        <p className="text-gray-500 text-xs mt-6">
          Find your Tenant ID in Settings → Clinic Profile
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
        <div className="text-center">
          <p className="text-red-400 text-lg font-semibold">{error}</p>
          <p className="text-gray-500 text-sm mt-2">Check the Clinic ID in the URL and try again.</p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  // All active doctors (in consult or waiting)
  const inConsultDoctors = new Set((data?.inConsult ?? []).map((e) => e.doctor));
  const allActiveDoctors = [
    ...(data?.inConsult ?? []).map((e) => ({ doctor: e.doctor, department: e.department })),
    ...Object.entries(data?.waitingByDoctor ?? {})
      .filter(([doc]) => !inConsultDoctors.has(doc))
      .map(([doc]) => ({ doctor: doc, department: "" })),
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white select-none overflow-hidden">
      {/* Header bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-teal-600 rounded-xl flex items-center justify-center">
            <Heart className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">Carenoww HMS</h1>
            <p className="text-xs text-gray-400">Patient Token Display</p>
          </div>
        </div>

        <div className="text-center">
          <p className="text-3xl font-bold text-white tracking-tight tabular-nums">{timeStr}</p>
          <p className="text-xs text-gray-400 mt-0.5">{dateStr}</p>
        </div>

        <div className="flex items-center gap-2 text-right">
          {online ? (
            <div className="flex items-center gap-1.5 text-green-400 text-xs">
              <Wifi className="h-3.5 w-3.5" />
              <span>Live</span>
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-red-400 text-xs">
              <WifiOff className="h-3.5 w-3.5" />
              <span>Offline</span>
            </div>
          )}
          <p className="text-xs text-gray-500 ml-2">
            Updated {lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
          </p>
        </div>
      </div>

      {/* Main content */}
      <div className="p-8">
        {!data || (data.inConsult.length === 0 && Object.keys(data.waitingByDoctor).length === 0) ? (
          <div className="flex flex-col items-center justify-center h-96 text-gray-500">
            <Clock className="h-16 w-16 mb-4 opacity-30" />
            <p className="text-xl font-semibold">No active consultations</p>
            <p className="text-sm mt-2">Tokens will appear here when patients are called in</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
            {(data?.inConsult ?? []).map((entry) => (
              <NowServingCard
                key={entry.doctor}
                entry={entry}
                waitingCount={data?.waitingByDoctor?.[entry.doctor] ?? 0}
              />
            ))}
            {Object.entries(data?.waitingByDoctor ?? {})
              .filter(([doc]) => !inConsultDoctors.has(doc))
              .map(([doc, count]) => (
                <EmptyDeptCard key={doc} doctor={doc} waitingCount={count} />
              ))
            }
          </div>
        )}
      </div>

      {/* Footer ticker */}
      <div className="fixed bottom-0 left-0 right-0 bg-teal-700 px-6 py-2 flex items-center justify-between">
        <p className="text-xs text-teal-100">Please wait for your token number to be called</p>
        <p className="text-xs text-teal-100">
          {(data?.inConsult?.length ?? 0) > 0
            ? `${data!.inConsult.length} consultation${data!.inConsult.length > 1 ? "s" : ""} active`
            : "No active consultations"}
          {" · "}
          {Object.values(data?.waitingByDoctor ?? {}).reduce((a, b) => a + b, 0)} patients waiting
        </p>
      </div>
    </div>
  );
}
