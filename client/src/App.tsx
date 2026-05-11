import { Switch, Route, Redirect } from "wouter";
import { useAuth } from "./contexts/AuthContext";
import { useSuperAdmin } from "./contexts/SuperAdminContext";
import AdminLayout from "./components/layout";
import LoginPage from "./pages/login";
import DashboardPage from "./pages/dashboard";
import PatientsPage from "./pages/patients";
import AppointmentsPage from "./pages/appointments";
import OPDPage from "./pages/opd";
import IPDPage from "./pages/ipd";
import PharmacyPage from "./pages/pharmacy";
import LabPage from "./pages/lab";
import BillingPage from "./pages/billing";
import AnalyticsPage from "./pages/analytics";
import SettingsPage from "./pages/settings";
import NotFound from "./pages/not-found";
// Superadmin pages
import SuperAdminLoginPage from "./pages/superadmin/login";
import SuperAdminDashboard from "./pages/superadmin/dashboard";
import TenantsPage from "./pages/superadmin/tenants";
import TenantFormPage from "./pages/superadmin/tenant-form";

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary animate-pulse" />
        <p className="text-muted-foreground text-sm">Loading Carenoww HMS...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!user) return <Redirect to="/login" />;
  return (
    <AdminLayout>
      <Component />
    </AdminLayout>
  );
}

function SuperAdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { superAdmin, isLoading } = useSuperAdmin();
  if (isLoading) return <LoadingScreen />;
  if (!superAdmin) return <Redirect to="/superadmin/login" />;
  return <Component />;
}

export default function App() {
  const { user } = useAuth();
  const { superAdmin } = useSuperAdmin();

  return (
    <Switch>
      {/* ── Public routes ─────────────────────────────── */}
      <Route path="/login">
        {user ? <Redirect to="/" /> : <LoginPage />}
      </Route>

      {/* ── Superadmin routes ─────────────────────────── */}
      <Route path="/superadmin/login">
        {superAdmin ? <Redirect to="/superadmin/dashboard" /> : <SuperAdminLoginPage />}
      </Route>
      <Route path="/superadmin/dashboard" component={() => <SuperAdminRoute component={SuperAdminDashboard} />} />
      <Route path="/superadmin/tenants/new"  component={() => <SuperAdminRoute component={TenantFormPage} />} />
      <Route path="/superadmin/tenants/:id"  component={() => <SuperAdminRoute component={TenantFormPage} />} />
      <Route path="/superadmin/tenants"      component={() => <SuperAdminRoute component={TenantsPage} />} />
      <Route path="/superadmin">
        {superAdmin ? <Redirect to="/superadmin/dashboard" /> : <Redirect to="/superadmin/login" />}
      </Route>

      {/* ── HMS protected routes ───────────────────────── */}
      <Route path="/"             component={() => <ProtectedRoute component={DashboardPage} />} />
      <Route path="/patients"     component={() => <ProtectedRoute component={PatientsPage} />} />
      <Route path="/appointments" component={() => <ProtectedRoute component={AppointmentsPage} />} />
      <Route path="/opd"          component={() => <ProtectedRoute component={OPDPage} />} />
      <Route path="/ipd"          component={() => <ProtectedRoute component={IPDPage} />} />
      <Route path="/pharmacy"     component={() => <ProtectedRoute component={PharmacyPage} />} />
      <Route path="/lab"          component={() => <ProtectedRoute component={LabPage} />} />
      <Route path="/billing"      component={() => <ProtectedRoute component={BillingPage} />} />
      <Route path="/analytics"    component={() => <ProtectedRoute component={AnalyticsPage} />} />
      <Route path="/settings"     component={() => <ProtectedRoute component={SettingsPage} />} />
      <Route component={NotFound} />
    </Switch>
  );
}
