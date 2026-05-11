import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useSuperAdmin } from "../../contexts/SuperAdminContext";
import { superadmin as saApi } from "../../lib/api";
import {
  Building2, Users, Activity, AlertTriangle, TrendingUp,
  Shield, LogOut, ChevronRight, Plus, RefreshCw
} from "lucide-react";

interface Stats {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  suspendedTenants: number;
  totalUsers: number;
}

export default function SuperAdminDashboard() {
  const { superAdmin, logout } = useSuperAdmin();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentTenants, setRecentTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [statsData, tenantsData] = await Promise.all([
        saApi.stats(),
        saApi.listTenants({ limit: "5" }),
      ]);
      setStats(statsData);
      setRecentTenants(tenantsData.tenants || []);
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const statusColor = (s: string) =>
    s === "active" ? "text-green-400 bg-green-900/30" :
    s === "trial"  ? "text-yellow-400 bg-yellow-900/30" :
    s === "suspended" ? "text-red-400 bg-red-900/30" : "text-slate-400 bg-slate-700";

  const planColor = (p: string) =>
    p === "enterprise" ? "text-purple-400" :
    p === "professional" ? "text-blue-400" :
    p === "starter" ? "text-cyan-400" : "text-slate-400";

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
          <Link href="/superadmin/dashboard" className="py-3 text-sm font-medium text-white border-b-2 border-red-500">
            Dashboard
          </Link>
          <Link href="/superadmin/tenants" className="py-3 text-sm font-medium text-slate-400 hover:text-white border-b-2 border-transparent">
            Tenants
          </Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Platform Overview</h1>
            <p className="text-slate-400 text-sm mt-1">Manage all hospital tenants on Carenoww HMS</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={load}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <Link
              href="/superadmin/tenants/new"
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> New Tenant
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-lg px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[
            { label: "Total Tenants", value: stats?.totalTenants ?? "—", icon: Building2, color: "text-blue-400" },
            { label: "Active",        value: stats?.activeTenants ?? "—", icon: Activity,  color: "text-green-400" },
            { label: "Trial",         value: stats?.trialTenants ?? "—",  icon: TrendingUp,color: "text-yellow-400" },
            { label: "Suspended",     value: stats?.suspendedTenants ?? "—",icon: AlertTriangle, color: "text-red-400" },
            { label: "Total Users",   value: stats?.totalUsers ?? "—",    icon: Users,     color: "text-purple-400" },
          ].map((s) => (
            <div key={s.label} className="bg-slate-800 border border-slate-700 rounded-xl p-5">
              <div className={`mb-2 ${s.color}`}><s.icon className="w-5 h-5" /></div>
              <div className="text-2xl font-bold">{loading ? "—" : s.value}</div>
              <div className="text-slate-400 text-xs mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Recent tenants */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
            <h2 className="font-semibold">Recent Tenants</h2>
            <Link href="/superadmin/tenants" className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-700">
            {loading ? (
              <div className="px-6 py-8 text-center text-slate-500">Loading...</div>
            ) : recentTenants.length === 0 ? (
              <div className="px-6 py-8 text-center text-slate-500">
                No tenants yet.{" "}
                <Link href="/superadmin/tenants/new" className="text-red-400 hover:underline">Create the first one</Link>
              </div>
            ) : (
              recentTenants.map((t) => (
                <div key={t._id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-700/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 bg-slate-700 rounded-lg flex items-center justify-center text-sm font-bold text-slate-300">
                      {t.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{t.name}</p>
                      <p className="text-xs text-slate-400">{t.contact?.email} · {t.userCount ?? 0} users · {t.patientCount ?? 0} patients</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium ${planColor(t.plan)}`}>{t.plan}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(t.status)}`}>{t.status}</span>
                    <Link
                      href={`/superadmin/tenants/${t._id}`}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      Manage <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
