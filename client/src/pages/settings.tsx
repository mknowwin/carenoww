import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Settings, User, Bell, Shield, Brain, Building2,
  Monitor, Globe, Key, Database, CheckCircle2, Users, Plus, Trash2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { auth as authApi, users as usersApi } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const ROLES = ["admin", "doctor", "nurse", "pharmacist", "lab_tech", "finance", "receptionist"];

export default function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [notifications, setNotifications] = useState({
    aiAlerts: true, criticalValues: true, appointmentReminders: true,
    lowStock: true, claimAlerts: true, ewsAlerts: true,
  });
  const [aiSettings, setAiSettings] = useState({
    ambientScribe: true, ddxEngine: true, ewsMonitor: true,
    claimsScrubbing: true, stockPredictor: true, burnoutDetector: false,
  });

  // Profile form
  const [profileForm, setProfileForm] = useState({ name: user?.name ?? "", department: user?.department ?? "" });
  const [profileMsg, setProfileMsg] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);

  // Password form
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  // User management
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "doctor", department: "" });
  const [userMsg, setUserMsg] = useState("");
  const [userError, setUserError] = useState("");
  const [userLoading, setUserLoading] = useState(false);

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: usersApi.list,
    retry: false,
    enabled: user?.role === "admin",
  });
  const userList: any[] = usersData ?? [];

  const toggleNotif = (key: keyof typeof notifications) =>
    setNotifications((p) => ({ ...p, [key]: !p[key] }));
  const toggleAI = (key: keyof typeof aiSettings) =>
    setAiSettings((p) => ({ ...p, [key]: !p[key] }));

  const sections = [
    { id: "profile",  label: "Profile",       icon: User },
    { id: "hospital", label: "Hospital",      icon: Building2 },
    { id: "notif",    label: "Notifications", icon: Bell },
    { id: "ai",       label: "AI Features",   icon: Brain },
    { id: "security", label: "Security",      icon: Shield },
    ...(user?.role === "admin" ? [{ id: "users", label: "User Management", icon: Users }] : []),
    { id: "system",   label: "System",        icon: Monitor },
  ];
  const [active, setActive] = useState("profile");

  const saveProfile = async () => {
    setProfileLoading(true); setProfileMsg("");
    try {
      await authApi.updateProfile({ name: profileForm.name, department: profileForm.department });
      setProfileMsg("Profile updated successfully.");
    } catch (err: any) {
      setProfileMsg(err.message || "Failed to update profile");
    } finally {
      setProfileLoading(false);
    }
  };

  const changePassword = async () => {
    setPwLoading(true); setPwMsg(""); setPwError("");
    if (pwForm.next !== pwForm.confirm) { setPwError("Passwords do not match"); setPwLoading(false); return; }
    if (pwForm.next.length < 6) { setPwError("Password must be at least 6 characters"); setPwLoading(false); return; }
    try {
      await authApi.changePassword(pwForm.current, pwForm.next);
      setPwMsg("Password changed successfully.");
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (err: any) {
      setPwError(err.message || "Failed to change password");
    } finally {
      setPwLoading(false);
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserLoading(true); setUserMsg(""); setUserError("");
    try {
      await usersApi.create(newUser);
      qc.invalidateQueries({ queryKey: ["users"] });
      setUserMsg(`User ${newUser.name} created.`);
      setNewUser({ name: "", email: "", password: "", role: "doctor", department: "" });
    } catch (err: any) {
      setUserError(err.message || "Failed to create user");
    } finally {
      setUserLoading(false);
    }
  };

  const deactivateUser = async (id: string, name: string) => {
    if (!confirm(`Deactivate ${name}?`)) return;
    try {
      await usersApi.deactivate(id);
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (err: any) {
      alert(err.message || "Failed to deactivate");
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      <div>
        <h2 className="text-lg font-bold">Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your account and hospital system preferences</p>
      </div>

      <div className="grid lg:grid-cols-4 gap-4">
        {/* Sidebar nav */}
        <Card className="h-fit">
          <CardContent className="p-3 space-y-0.5">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all text-sm ${
                  active === s.id ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <s.icon className="h-4 w-4 shrink-0" />
                {s.label}
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Content */}
        <div className="lg:col-span-3 space-y-4">
          {active === "profile" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" /> Profile Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                    {user?.name?.[0] ?? "U"}
                  </div>
                  <div>
                    <div className="font-semibold">{user?.name}</div>
                    <div className="text-sm text-muted-foreground">{user?.email}</div>
                    <Badge className="mt-1 text-xs bg-teal-100 text-teal-700">{user?.role}</Badge>
                  </div>
                </div>
                <Separator />
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Full Name</Label>
                    <Input value={profileForm.name} onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email</Label>
                    <Input value={user?.email ?? ""} disabled className="h-9 opacity-60" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Department</Label>
                    <Input value={profileForm.department} onChange={(e) => setProfileForm((f) => ({ ...f, department: e.target.value }))} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Organization</Label>
                    <Input value={user?.organization ?? ""} disabled className="h-9 opacity-60" />
                  </div>
                </div>
                {profileMsg && (
                  <p className={`text-xs px-3 py-2 rounded ${profileMsg.includes("success") ? "bg-green-50 text-green-700" : "bg-destructive/10 text-destructive"}`}>{profileMsg}</p>
                )}
                <Button size="sm" onClick={saveProfile} disabled={profileLoading}>
                  {profileLoading ? "Saving..." : "Save Profile"}
                </Button>
              </CardContent>
            </Card>
          )}

          {active === "hospital" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Hospital Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    { label: "Hospital Name",     value: user?.organization ?? "Carenoww City Hospital" },
                    { label: "Registration No.",  value: "MCI-2019-TN-0421" },
                    { label: "NABH Accredited",   value: "Yes (2023–2026)" },
                    { label: "Total Beds",         value: "188" },
                    { label: "Data Residency",     value: "AWS Mumbai (ap-south-1)" },
                  ].map((f) => (
                    <div key={f.label} className="space-y-1.5">
                      <Label className="text-xs">{f.label}</Label>
                      <Input defaultValue={f.value} className="h-9" />
                    </div>
                  ))}
                </div>
                <div className="bg-teal-50 rounded-xl p-3 flex items-center gap-2 text-xs text-teal-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  HIPAA Compliant · HL7 FHIR R4 Native · ABDM API-Ready · ISO 27001 Roadmap Q3 2026
                </div>
                <Button size="sm">Save Configuration</Button>
              </CardContent>
            </Card>
          )}

          {active === "notif" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Bell className="h-4 w-4" /> Notification Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { key: "aiAlerts",              label: "AI Clinical Alerts",         sub: "Sepsis, EWS, deterioration alerts" },
                  { key: "criticalValues",         label: "Critical Lab Values",        sub: "Immediate notification for critical results" },
                  { key: "appointmentReminders",   label: "Appointment Reminders",      sub: "24h and 2h before scheduled appointments" },
                  { key: "lowStock",               label: "Drug Stock Alerts",          sub: "Low and critical pharmacy stock notifications" },
                  { key: "claimAlerts",            label: "Insurance Claim Alerts",     sub: "Claim status, denials, and approvals" },
                  { key: "ewsAlerts",              label: "Early Warning Score Alerts", sub: "EWS threshold breach notifications" },
                ].map((n) => (
                  <div key={n.key} className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{n.label}</div>
                      <div className="text-xs text-muted-foreground">{n.sub}</div>
                    </div>
                    <Switch
                      checked={notifications[n.key as keyof typeof notifications]}
                      onCheckedChange={() => toggleNotif(n.key as keyof typeof notifications)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {active === "ai" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Brain className="h-4 w-4" /> AI Feature Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  All AI outputs are advisory only. Human-in-the-loop is mandatory per HIPAA and MedCore AI governance policy.
                </div>
                {[
                  { key: "ambientScribe",    label: "Ambient AI Scribe",              sub: "Real-time voice → SOAP note generation during consultations" },
                  { key: "ddxEngine",        label: "Differential Diagnosis Engine",  sub: "AI-ranked differential diagnoses based on clinical data" },
                  { key: "ewsMonitor",       label: "EWS / Sepsis Monitor",           sub: "Continuous ICU vitals monitoring and sepsis early detection" },
                  { key: "claimsScrubbing",  label: "AI Claims Scrubbing",            sub: "Pre-submission insurance claim validation" },
                  { key: "stockPredictor",   label: "Drug Stock Predictor",           sub: "ML-based drug consumption forecasting" },
                  { key: "burnoutDetector",  label: "Staff Burnout Predictor",        sub: "Shift pattern analysis for burnout risk (Beta)" },
                ].map((f) => (
                  <div key={f.key} className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{f.label}</div>
                      <div className="text-xs text-muted-foreground">{f.sub}</div>
                    </div>
                    <Switch
                      checked={aiSettings[f.key as keyof typeof aiSettings]}
                      onCheckedChange={() => toggleAI(f.key as keyof typeof aiSettings)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {active === "security" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Change Password
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Current Password</Label>
                    <Input type="password" value={pwForm.current} onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))} placeholder="Enter current password" className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">New Password</Label>
                    <Input type="password" value={pwForm.next} onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))} placeholder="Enter new password" className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Confirm New Password</Label>
                    <Input type="password" value={pwForm.confirm} onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))} placeholder="Confirm new password" className="h-9" />
                  </div>
                </div>
                {pwMsg && <p className="text-xs bg-green-50 text-green-700 px-3 py-2 rounded">{pwMsg}</p>}
                {pwError && <p className="text-xs bg-destructive/10 text-destructive px-3 py-2 rounded">{pwError}</p>}
                <Button size="sm" onClick={changePassword} disabled={pwLoading || !pwForm.current || !pwForm.next || !pwForm.confirm}>
                  {pwLoading ? "Updating..." : "Update Password"}
                </Button>
                <Separator />
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <div className="text-sm font-medium">Multi-Factor Authentication</div>
                    <div className="text-xs text-muted-foreground">Mandatory for all clinical roles</div>
                  </div>
                  <Badge className="bg-green-100 text-green-700 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Session Timeout</div>
                    <div className="text-xs text-muted-foreground">Auto-logout after inactivity</div>
                  </div>
                  <select className="text-xs border rounded-lg px-2 py-1.5 bg-background">
                    <option>30 minutes</option>
                    <option>1 hour</option>
                    <option>4 hours</option>
                  </select>
                </div>
              </CardContent>
            </Card>
          )}

          {active === "users" && user?.role === "admin" && (
            <div className="space-y-4">
              {/* Create user */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Plus className="h-4 w-4" /> Add New User
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={createUser} className="space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Full Name *</Label>
                        <Input value={newUser.name} onChange={(e) => setNewUser((f) => ({ ...f, name: e.target.value }))} placeholder="Dr. Name" className="h-8 text-sm" required />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Email *</Label>
                        <Input type="email" value={newUser.email} onChange={(e) => setNewUser((f) => ({ ...f, email: e.target.value }))} placeholder="user@hospital.com" className="h-8 text-sm" required />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Password *</Label>
                        <Input type="password" value={newUser.password} onChange={(e) => setNewUser((f) => ({ ...f, password: e.target.value }))} placeholder="Min 6 characters" className="h-8 text-sm" required />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Role *</Label>
                        <select value={newUser.role} onChange={(e) => setNewUser((f) => ({ ...f, role: e.target.value }))}
                          className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Department</Label>
                        <Input value={newUser.department} onChange={(e) => setNewUser((f) => ({ ...f, department: e.target.value }))} placeholder="Cardiology" className="h-8 text-sm" />
                      </div>
                    </div>
                    {userMsg && <p className="text-xs bg-green-50 text-green-700 px-3 py-2 rounded">{userMsg}</p>}
                    {userError && <p className="text-xs bg-destructive/10 text-destructive px-3 py-2 rounded">{userError}</p>}
                    <Button type="submit" size="sm" disabled={userLoading}>
                      {userLoading ? "Creating..." : "Create User"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* User list */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4" /> Active Users ({userList.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {userList.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">No users found or API not connected</p>
                  )}
                  {userList.map((u: any) => (
                    <div key={u._id || u.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {u.name?.[0] ?? "U"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </div>
                      <Badge className="text-xs bg-teal-50 text-teal-700 shrink-0">{u.role}</Badge>
                      <span className="text-xs text-muted-foreground shrink-0">{u.department}</span>
                      {u._id !== user?.id && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0"
                          onClick={() => deactivateUser(u._id || u.id, u.name)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {active === "system" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Monitor className="h-4 w-4" /> System Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  ["Platform",        "Carenoww HMS v1.0"],
                  ["Tech Stack",      "React / Node.js / MongoDB"],
                  ["AI Engine",       "Claude / GPT-4-class LLM + Custom ML"],
                  ["Infrastructure",  "AWS (ap-south-1) · Kubernetes EKS"],
                  ["Compliance",      "HIPAA · HL7 FHIR R4 · ABDM · GDPR"],
                  ["Uptime (30d)",    "99.97%"],
                  ["API Version",     "REST v2"],
                  ["Last Deploy",     "May 11, 2026"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center py-1.5 border-b border-border last:border-0">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium text-xs text-right">{v}</span>
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Database className="h-4 w-4" /> Export Data
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Key className="h-4 w-4" /> API Keys
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
