import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useSuperAdmin } from "../../contexts/SuperAdminContext";
import { superadmin as saApi } from "../../lib/api";
import {
  Building2, Plus, Search, ChevronRight, Shield, LogOut,
  CheckCircle2, XCircle, Clock, AlertTriangle, Users, Database
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { confirm } from "@/hooks/use-confirm";

export default function TenantsPage() {
  const { superAdmin, logout } = useSuperAdmin();
  const [tenants, setTenants] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: "50" };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const data = await saApi.listTenants(params);
      setTenants(data.tenants || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [search, statusFilter]);

  const handleSuspend = async (id: string) => {
    const ok = await confirm({
      title: "Suspend this tenant?",
      description: "Their users will be locked out immediately.",
      confirmText: "Suspend",
      variant: "destructive",
    });
    if (!ok) return;
    setActionLoading(id);
    try {
      await saApi.suspendTenant(id);
      await load();
    } finally {
      setActionLoading(null);
    }
  };

  const handleActivate = async (id: string) => {
    setActionLoading(id);
    try {
      await saApi.activateTenant(id);
      await load();
    } finally {
      setActionLoading(null);
    }
  };

  const handleSeed = async (id: string) => {
    const ok = await confirm({
      title: "Seed demo data for this tenant?",
      description: "Existing data will be replaced.",
      confirmText: "Seed",
      variant: "destructive",
    });
    if (!ok) return;
    setActionLoading(id);
    try {
      await saApi.seedTenant(id);
      toast({ title: "Demo data seeded successfully!" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Seed failed", description: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { icon: any; cls: string }> = {
      active:    { icon: CheckCircle2,  cls: "text-green-400 bg-green-900/30" },
      trial:     { icon: Clock,         cls: "text-yellow-400 bg-yellow-900/30" },
      suspended: { icon: XCircle,       cls: "text-red-400 bg-red-900/30" },
      cancelled: { icon: AlertTriangle, cls: "text-slate-400 bg-slate-700" },
    };
    const { icon: Icon, cls } = map[s] || map.cancelled;
    return (
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
        <Icon className="w-3 h-3" />{s}
      </span>
    );
  };

  const planBadge = (p: string) => {
    const colors: Record<string, string> = {
      enterprise: "text-purple-400", professional: "text-blue-400",
      starter: "text-cyan-400", trial: "text-slate-400",
    };
    return <span className={`text-xs font-semibold uppercase ${colors[p] || "text-slate-400"}`}>{p}</span>;
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="border-b border-slate-700 bg-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <span className="font-bold">Carenoww</span>
            <span className="text-slate-400 text-sm">Superadmin</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">{superAdmin?.email}</span>
            <button onClick={logout} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <nav className="border-b border-slate-700 bg-slate-800/50 px-6">
        <div className="max-w-7xl mx-auto flex gap-6">
          <Link href="/superadmin/dashboard" className="py-3 text-sm font-medium text-slate-400 hover:text-white border-b-2 border-transparent">
            Dashboard
          </Link>
          <Link href="/superadmin/tenants" className="py-3 text-sm font-medium text-white border-b-2 border-red-500">
            Tenants
          </Link>
          <Link href="/superadmin/backup" className="py-3 text-sm font-medium text-slate-400 hover:text-white border-b-2 border-transparent">
            Backup
          </Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Tenants</h1>
            <p className="text-slate-400 text-sm mt-1">{total} hospital{total !== 1 ? "s" : ""} on the platform</p>
          </div>
          <Link
            href="/superadmin/tenants/new"
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> New Tenant
          </Link>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search hospitals..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="suspended">Suspended</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase">
                <th className="text-left px-6 py-3">Hospital</th>
                <th className="text-left px-4 py-3">Plan</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Users</th>
                <th className="text-left px-4 py-3">Patients</th>
                <th className="text-left px-4 py-3">Created</th>
                <th className="text-right px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">Loading...</td></tr>
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    No tenants found.{" "}
                    <Link href="/superadmin/tenants/new" className="text-red-400 hover:underline">Create one</Link>
                  </td>
                </tr>
              ) : tenants.map((t) => (
                <tr key={t._id} className="hover:bg-slate-700/40 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center text-xs font-bold text-slate-300">
                        {t.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-white">{t.name}</p>
                        <p className="text-xs text-slate-400">{t.slug} · {t.contact?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">{planBadge(t.plan)}</td>
                  <td className="px-4 py-4">{statusBadge(t.status)}</td>
                  <td className="px-4 py-4">
                    <span className="flex items-center gap-1 text-slate-300">
                      <Users className="w-3.5 h-3.5 text-slate-500" />{t.userCount ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="flex items-center gap-1 text-slate-300">
                      <Building2 className="w-3.5 h-3.5 text-slate-500" />{t.patientCount ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-400 text-xs">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {t.status !== "suspended" && t.status !== "cancelled" ? (
                        <button
                          onClick={() => handleSuspend(t._id)}
                          disabled={actionLoading === t._id}
                          className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                        >
                          Suspend
                        </button>
                      ) : (
                        <button
                          onClick={() => handleActivate(t._id)}
                          disabled={actionLoading === t._id}
                          className="text-xs text-green-400 hover:text-green-300 disabled:opacity-50"
                        >
                          Activate
                        </button>
                      )}
                      <button
                        onClick={() => handleSeed(t._id)}
                        disabled={actionLoading === t._id}
                        className="text-xs text-slate-400 hover:text-white disabled:opacity-50 flex items-center gap-1"
                        title="Seed demo data"
                      >
                        <Database className="w-3 h-3" />
                      </button>
                      <Link
                        href={`/superadmin/tenants/${t._id}`}
                        className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                      >
                        Edit <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
