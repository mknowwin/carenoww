import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useSuperAdmin } from "../../contexts/SuperAdminContext";
import { superadmin as saApi } from "../../lib/api";
import { Shield, LogOut, ArrowLeft, Save, Loader2, Database, Users, CheckCircle2, XCircle } from "lucide-react";
import { confirm } from "@/hooks/use-confirm";

const PLANS = ["trial", "starter", "professional", "enterprise"];
const STATUSES = ["trial", "active", "suspended", "cancelled"];

// Defined outside component to keep stable identity across renders (avoids focus loss)
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function FormInput({
  value, onChange, placeholder, type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500"
    />
  );
}

export default function TenantFormPage() {
  const { superAdmin, logout } = useSuperAdmin();
  const [, navigate] = useLocation();
  const params = useParams<{ id?: string }>();
  const isNew = !params.id || params.id === "new";

  const [form, setForm] = useState({
    name: "", slug: "", plan: "trial", status: "trial",
    contactEmail: "", contactPhone: "", contactAddress: "", contactCity: "", contactState: "", contactCountry: "India",
    maxUsers: "10", maxPatients: "1000",
    adminName: "", adminEmail: "", adminPassword: "",
  });
  const [tenant, setTenant] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew && params.id) {
      Promise.all([saApi.getTenant(params.id), saApi.getTenantUsers(params.id)])
        .then(([t, u]) => {
          setTenant(t);
          setUsers(u);
          setForm({
            name: t.name || "", slug: t.slug || "", plan: t.plan || "trial", status: t.status || "trial",
            contactEmail: t.contact?.email || "", contactPhone: t.contact?.phone || "",
            contactAddress: t.contact?.address || "", contactCity: t.contact?.city || "",
            contactState: t.contact?.state || "", contactCountry: t.contact?.country || "India",
            maxUsers: String(t.settings?.maxUsers || 10), maxPatients: String(t.settings?.maxPatients || 1000),
            adminName: "", adminEmail: "", adminPassword: "",
          });
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [params.id]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = {
        name: form.name, slug: form.slug, plan: form.plan, status: form.status,
        contact: { email: form.contactEmail, phone: form.contactPhone, address: form.contactAddress, city: form.contactCity, state: form.contactState, country: form.contactCountry },
        settings: { maxUsers: parseInt(form.maxUsers), maxPatients: parseInt(form.maxPatients) },
        ...(isNew ? { adminName: form.adminName, adminEmail: form.adminEmail, adminPassword: form.adminPassword } : {}),
      };
      if (isNew) {
        await saApi.createTenant(payload);
        setSuccess("Tenant created successfully!");
        setTimeout(() => navigate("/superadmin/tenants"), 1500);
      } else {
        await saApi.updateTenant(params.id!, payload);
        setSuccess("Tenant updated successfully!");
      }
    } catch (err: any) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSeed = async () => {
    if (!params.id) return;
    const ok = await confirm({
      title: "Seed demo data?",
      description: "Existing data for this tenant will be replaced.",
      confirmText: "Seed",
      variant: "destructive",
    });
    if (!ok) return;
    setActionLoading("seed");
    try {
      await saApi.seedTenant(params.id);
      setSuccess("Demo data seeded!");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuspend = async () => {
    if (!params.id) return;
    const ok = await confirm({ title: "Suspend this tenant?", confirmText: "Suspend", variant: "destructive" });
    if (!ok) return;
    setActionLoading("suspend");
    try {
      await saApi.suspendTenant(params.id);
      setTenant((t: any) => ({ ...t, status: "suspended" }));
      setForm((f) => ({ ...f, status: "suspended" }));
      setSuccess("Tenant suspended.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleActivate = async () => {
    if (!params.id) return;
    setActionLoading("activate");
    try {
      await saApi.activateTenant(params.id);
      setTenant((t: any) => ({ ...t, status: "active" }));
      setForm((f) => ({ ...f, status: "active" }));
      setSuccess("Tenant activated.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="border-b border-slate-700 bg-slate-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center"><Shield className="w-4 h-4" /></div>
            <span className="font-bold">Carenoww</span>
            <span className="text-slate-400 text-sm">Superadmin</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">{superAdmin?.email}</span>
            <button onClick={logout} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/superadmin/tenants" className="text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold">{isNew ? "Create New Tenant" : `Edit: ${tenant?.name || "..."}`}</h1>
        </div>

        {error && <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        {success && <div className="bg-green-900/30 border border-green-700 text-green-400 rounded-lg px-4 py-3 mb-4 text-sm">{success}</div>}

        {loading ? (
          <div className="text-center py-16 text-slate-500">Loading tenant...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main form */}
            <div className="lg:col-span-2 space-y-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Info */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
                  <h2 className="font-semibold text-sm text-slate-300 uppercase tracking-wider">Hospital Info</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Hospital Name *"><FormInput value={form.name} onChange={(v) => set("name", v)} placeholder="City General Hospital" /></Field>
                    <Field label="Slug (unique ID) *"><FormInput value={form.slug} onChange={(v) => set("slug", v)} placeholder="city-general" /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Plan">
                      <select value={form.plan} onChange={(e) => set("plan", e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500">
                        {PLANS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                      </select>
                    </Field>
                    <Field label="Status">
                      <select value={form.status} onChange={(e) => set("status", e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500">
                        {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                      </select>
                    </Field>
                  </div>
                </div>

                {/* Contact */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
                  <h2 className="font-semibold text-sm text-slate-300 uppercase tracking-wider">Contact</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Email *"><FormInput value={form.contactEmail} onChange={(v) => set("contactEmail", v)} placeholder="admin@hospital.com" type="email" /></Field>
                    <Field label="Phone"><FormInput value={form.contactPhone} onChange={(v) => set("contactPhone", v)} placeholder="+91 9999999999" /></Field>
                  </div>
                  <Field label="Address"><FormInput value={form.contactAddress} onChange={(v) => set("contactAddress", v)} placeholder="123 Main Street" /></Field>
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="City"><FormInput value={form.contactCity} onChange={(v) => set("contactCity", v)} placeholder="Chennai" /></Field>
                    <Field label="State"><FormInput value={form.contactState} onChange={(v) => set("contactState", v)} placeholder="Tamil Nadu" /></Field>
                    <Field label="Country"><FormInput value={form.contactCountry} onChange={(v) => set("contactCountry", v)} placeholder="India" /></Field>
                  </div>
                </div>

                {/* Settings */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
                  <h2 className="font-semibold text-sm text-slate-300 uppercase tracking-wider">Limits</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Max Users"><FormInput value={form.maxUsers} onChange={(v) => set("maxUsers", v)} type="number" /></Field>
                    <Field label="Max Patients"><FormInput value={form.maxPatients} onChange={(v) => set("maxPatients", v)} type="number" /></Field>
                  </div>
                </div>

                {/* Admin user (new only) */}
                {isNew && (
                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
                    <h2 className="font-semibold text-sm text-slate-300 uppercase tracking-wider">Admin Account</h2>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Admin Name *"><FormInput value={form.adminName} onChange={(v) => set("adminName", v)} placeholder="Dr. Admin" /></Field>
                      <Field label="Admin Email *"><FormInput value={form.adminEmail} onChange={(v) => set("adminEmail", v)} placeholder="admin@hospital.com" type="email" /></Field>
                    </div>
                    <Field label="Admin Password *"><FormInput value={form.adminPassword} onChange={(v) => set("adminPassword", v)} placeholder="••••••••" type="password" /></Field>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-lg text-sm font-medium transition-colors"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isNew ? "Create Tenant" : "Save Changes"}
                  </button>
                  <Link href="/superadmin/tenants" className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors">
                    Cancel
                  </Link>
                </div>
              </form>
            </div>

            {/* Sidebar: actions + users */}
            {!isNew && (
              <div className="space-y-4">
                {/* Quick actions */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
                  <h3 className="font-semibold text-sm text-slate-300">Actions</h3>
                  <button
                    onClick={handleSeed}
                    disabled={actionLoading === "seed"}
                    className="w-full flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors disabled:opacity-50"
                  >
                    {actionLoading === "seed" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4 text-blue-400" />}
                    Seed Demo Data
                  </button>

                  {tenant?.status !== "suspended" ? (
                    <button
                      onClick={handleSuspend}
                      disabled={actionLoading === "suspend"}
                      className="w-full flex items-center gap-2 px-4 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-800 rounded-lg text-sm text-red-400 transition-colors disabled:opacity-50"
                    >
                      {actionLoading === "suspend" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      Suspend Tenant
                    </button>
                  ) : (
                    <button
                      onClick={handleActivate}
                      disabled={actionLoading === "activate"}
                      className="w-full flex items-center gap-2 px-4 py-2 bg-green-900/30 hover:bg-green-900/50 border border-green-800 rounded-lg text-sm text-green-400 transition-colors disabled:opacity-50"
                    >
                      {actionLoading === "activate" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Activate Tenant
                    </button>
                  )}
                </div>

                {/* Users list */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="w-4 h-4 text-slate-400" />
                    <h3 className="font-semibold text-sm text-slate-300">Users ({users.length})</h3>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {users.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-4">No users yet</p>
                    ) : users.map((u) => (
                      <div key={u._id} className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0">
                        <div>
                          <p className="text-xs font-medium text-white">{u.name}</p>
                          <p className="text-xs text-slate-400">{u.email}</p>
                        </div>
                        <span className="text-xs px-2 py-0.5 bg-slate-700 rounded text-slate-300">{u.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
