import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, Eye, EyeOff, Stethoscope, Shield, Activity } from "lucide-react";

// Demo credentials match the seeded demo hospital (run: npm run seed)
const DEMO_ROLES: Array<{ label: string; email: string; password: string; role: UserRole; color: string }> = [
  { label: "Admin",      email: "admin@demo.com",     password: "admin123",   role: "admin",        color: "bg-teal-100 text-teal-700" },
  { label: "Doctor",     email: "doctor@demo.com",    password: "doctor123",  role: "doctor",       color: "bg-blue-100 text-blue-700" },
  { label: "Nurse",      email: "nurse@demo.com",     password: "nurse123",   role: "nurse",        color: "bg-emerald-100 text-emerald-700" },
  { label: "Reception",  email: "reception@demo.com", password: "front123",   role: "receptionist", color: "bg-violet-100 text-violet-700" },
  { label: "Pharmacist", email: "pharmacy@demo.com",  password: "pharma123",  role: "pharmacist",   color: "bg-amber-100 text-amber-700" },
  { label: "Lab Tech",   email: "lab@demo.com",       password: "lab123",     role: "lab_tech",     color: "bg-indigo-100 text-indigo-700" },
  { label: "Finance",    email: "finance@demo.com",   password: "finance123", role: "finance",      color: "bg-rose-100 text-rose-700" },
];

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("admin@demo.com");
  const [password, setPassword] = useState("admin123");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      await login(email, password);
      setLocation("/");
    } catch (err: any) {
      setError(err.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (d: typeof DEMO_ROLES[0]) => { setEmail(d.email); setPassword(d.password); setError(""); };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-600 via-cyan-700 to-teal-800 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-white/5 rounded-full blur-3xl animate-blob" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-cyan-400/10 rounded-full blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-teal-300/10 rounded-full blur-3xl animate-blob animation-delay-4000" />
      </div>

      <div className="relative z-10 w-full max-w-4xl grid lg:grid-cols-2 gap-8 items-center">
        {/* Left branding */}
        <div className="hidden lg:block text-white">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
              <Heart className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Carenoww</h1>
              <p className="text-teal-100 text-sm">AI Hospital Management System</p>
            </div>
          </div>

          <h2 className="text-4xl font-bold leading-tight mb-4">
            Intelligent Healthcare<br />Operations
          </h2>
          <p className="text-teal-100 text-lg mb-8 leading-relaxed">
            AI-first HMS platform serving clinics to mid-size hospitals with embedded intelligence at every layer.
          </p>

          <div className="grid grid-cols-2 gap-4 mb-8">
            {[
              { icon: Stethoscope, label: "14+ Modules",       sub: "Fully integrated" },
              { icon: Shield,      label: "HIPAA Compliant",   sub: "Security by design" },
              { icon: Activity,    label: "25+ AI Features",   sub: "Embedded intelligence" },
              { icon: Heart,       label: "99.9% Uptime",      sub: "Enterprise SLA" },
            ].map((f) => (
              <div key={f.label} className="bg-white/10 backdrop-blur rounded-xl p-4">
                <f.icon className="h-5 w-5 text-teal-200 mb-2" />
                <div className="text-sm font-semibold">{f.label}</div>
                <div className="text-xs text-teal-200">{f.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right login card */}
        <Card className="shadow-2xl border-0 bg-white/95 backdrop-blur">
          <CardContent className="p-8">
            {/* Mobile logo */}
            <div className="flex items-center gap-2 mb-6 lg:hidden">
              <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
                <Heart className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-foreground">Carenoww</h1>
                <p className="text-xs text-muted-foreground">AI Hospital Management System</p>
              </div>
            </div>

            <h3 className="text-xl font-bold text-foreground mb-1">Sign in to your account</h3>
            <p className="text-sm text-muted-foreground mb-6">Use demo credentials or enter your hospital credentials</p>

            {/* Demo role pills */}
            <div className="mb-6">
              <p className="text-xs font-medium text-muted-foreground mb-2">Quick login — select role:</p>
              <div className="flex flex-wrap gap-2">
                {DEMO_ROLES.map((d) => (
                  <button
                    key={d.role}
                    onClick={() => fillDemo(d)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all hover:scale-105 ${d.color} ${email === d.email ? "ring-2 ring-offset-1 ring-primary" : ""}`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="doctor@carenoww.com"
                  required
                  className="h-10"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>
              )}

              <Button type="submit" className="w-full h-10" disabled={loading}>
                {loading ? "Signing in..." : "Sign in to Carenoww"}
              </Button>
            </form>

            <div className="mt-6 p-3 bg-muted rounded-xl">
              <p className="text-xs text-muted-foreground text-center">
                <span className="font-medium">Demo credentials</span> — Current: <span className="font-mono text-foreground">{email}</span>
              </p>
            </div>

            <p className="text-center text-xs text-muted-foreground mt-4">
              HIPAA Compliant · HL7 FHIR R4 · SOC 2 Type II (Roadmap)
            </p>
            <p className="text-center text-xs text-muted-foreground mt-2">
              Platform admin?{" "}
              <a href="/superadmin/login" className="text-teal-600 hover:underline font-medium">
                Superadmin login →
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
