import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard, Users, CalendarDays, Stethoscope, BedDouble,
  FlaskConical, Pill, CreditCard, BarChart3, Settings, ChevronLeft,
  Activity, LogOut, Heart, UserCheck, X, FileCheck2,
} from "lucide-react";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { MODULE_KEYS, type ModuleKey } from "@/lib/modules";

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  roles: UserRole[];
  module?: ModuleKey;
}

const NAV_ITEMS: NavItem[] = [
  { id: "/",             label: "Dashboard",    icon: LayoutDashboard, description: "Hospital overview & KPIs",      roles: ["admin","doctor","nurse","receptionist","finance"], module: "dashboard" },
  { id: "/patients",     label: "Patients",     icon: Users,           description: "Patient registry & UHID",       roles: ["admin","doctor","nurse","receptionist"], module: "patients" },
  { id: "/appointments", label: "Appointments", icon: CalendarDays,    description: "Scheduling & queue management", roles: ["admin","doctor","receptionist"], module: "appointments" },
  { id: "/reception",    label: "Reception",    icon: UserCheck,       description: "Check-in & token management",   roles: ["admin","receptionist","nurse"] },
  { id: "/opd",          label: "OPD / Queue",  icon: Stethoscope,     description: "Consultation, queue & clinical notes", roles: ["admin","doctor","nurse"], module: "opd" },
  { id: "/ipd",          label: "IPD & Wards",  icon: BedDouble,       description: "Inpatient ward management",     roles: ["admin","doctor","nurse"], module: "ipd" },
  { id: "/lab",          label: "Laboratory",   icon: FlaskConical,    description: "Tests, samples & reports",      roles: ["admin","doctor","nurse","lab_tech"], module: "lab" },
  { id: "/pharmacy",     label: "Pharmacy",     icon: Pill,            description: "Dispensing & drug inventory",   roles: ["admin","pharmacist","pharmacy_admin","nurse"], module: "pharmacy" },
  { id: "/billing",      label: "Billing & RCM",icon: CreditCard,      description: "Revenue cycle & insurance",     roles: ["admin","finance","receptionist","pharmacist","pharmacy_admin"], module: "billing" },
  { id: "/analytics",    label: "Analytics",    icon: BarChart3,       description: "Clinical & business insights",  roles: ["admin","finance"], module: "analytics" },
  { id: "/statutory-reports", label: "Statutory Reports", icon: FileCheck2, description: "Government report submissions", roles: ["admin","finance"] },
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin:        "Hospital Admin",
  doctor:       "Physician",
  nurse:        "Nursing Staff",
  receptionist: "Front Desk",
  pharmacist:   "Pharmacist",
  pharmacy_admin: "Pharmacy Admin",
  lab_tech:     "Lab Technician",
  finance:      "Finance Officer",
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin:        "bg-teal-100 text-teal-700",
  doctor:       "bg-blue-100 text-blue-700",
  nurse:        "bg-emerald-100 text-emerald-700",
  receptionist: "bg-violet-100 text-violet-700",
  pharmacist:   "bg-amber-100 text-amber-700",
  pharmacy_admin: "bg-amber-200 text-amber-800",
  lab_tech:     "bg-indigo-100 text-indigo-700",
  finance:      "bg-rose-100 text-rose-700",
};

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onHover?: (v: boolean) => void;
  sidebarHovered?: boolean;
  isMobile?: boolean;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({
  isCollapsed, onToggleCollapse, onHover, sidebarHovered = false,
  isMobile = false, isMobileOpen = false, onMobileClose,
}: SidebarProps) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const expanded = !isCollapsed || sidebarHovered;
  const role = user?.role ?? "admin";
  // Fall back to "all modules enabled" when the user record predates the modules
  // field (e.g. a session stored before this feature shipped) — fail open, not closed.
  const enabledModules = user?.modules ?? [...MODULE_KEYS];
  const visibleItems = NAV_ITEMS.filter(
    (item) => item.roles.includes(role) && (!item.module || enabledModules.includes(item.module))
  );
  const isActive = (id: string) => id === "/" ? location === "/" : location.startsWith(id);

  const handleLogout = () => {
    logout();
    setLocation("/login");
    onMobileClose?.();
  };

  const handleNavigate = (id: string) => {
    setLocation(id);
    if (isMobile) onMobileClose?.();
  };

  // Full nav content shared between the desktop expanded rail and the mobile drawer.
  const fullContent = (
    <>
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-sm shrink-0">
              <Heart className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground leading-tight">Carenoww</h1>
              <p className="text-xs text-muted-foreground">AI Hospital System</p>
            </div>
          </div>
          {isMobile ? (
            <Button variant="ghost" size="sm" onClick={onMobileClose} className="h-7 w-7 p-0 shrink-0">
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onToggleCollapse} className="h-7 w-7 p-0 shrink-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Live Status */}
      <div className="px-3 py-2">
        <div className="bg-emerald-50 rounded-xl px-3 py-2 flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-xs text-emerald-700 font-medium">System Live · 99.9% uptime</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto scrollbar-hide">
        {visibleItems.map((item) => (
          <Button
            key={item.id}
            variant={isActive(item.id) ? "default" : "ghost"}
            className="w-full justify-start text-left h-auto p-3 rounded-xl transition-all duration-150 hover:scale-[1.01]"
            onClick={() => handleNavigate(item.id)}
          >
            <item.icon className="h-4 w-4 shrink-0 mr-3" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{item.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate opacity-80">
                {item.description}
              </div>
            </div>
          </Button>
        ))}
      </nav>

      <Separator />

      {/* Settings */}
      <div className="p-3">
        <Button
          variant={location === "/settings" ? "default" : "ghost"}
          className="w-full justify-start p-3 rounded-xl"
          onClick={() => handleNavigate("/settings")}
        >
          <Settings className="h-4 w-4 mr-3" />
          <span className="text-sm font-medium">Settings</span>
        </Button>
      </div>

      {/* User footer */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-3 px-1 py-1.5">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-primary font-bold text-sm">{user?.name?.[0] ?? "U"}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate leading-tight">{user?.name}</div>
            <Badge className={`text-xs mt-0.5 px-1.5 py-0 ${ROLE_COLORS[role]}`}>
              {ROLE_LABELS[role]}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
            onClick={handleLogout}
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );

  // Mobile: overlay drawer that doesn't occupy in-flow layout width.
  if (isMobile) {
    return (
      <>
        {isMobileOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onMobileClose}
            aria-hidden="true"
          />
        )}
        <div
          className={cn(
            "fixed left-0 top-0 h-full w-72 max-w-[80vw] bg-card border-r border-border flex flex-col z-50 transition-transform duration-300",
            isMobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {fullContent}
        </div>
      </>
    );
  }

  // Desktop: collapsed icon rail
  if (!expanded) {
    return (
      <div
        className="w-16 h-full bg-card border-r border-border flex flex-col"
        onMouseEnter={() => onHover?.(true)}
        onMouseLeave={() => onHover?.(false)}
      >
        <div className="p-2 border-b border-border h-16 flex items-center justify-center">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-sm">
            <Heart className="h-5 w-5 text-primary-foreground" />
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1 mt-2 overflow-y-auto scrollbar-hide">
          {visibleItems.map((item) => (
            <Button
              key={item.id}
              variant={isActive(item.id) ? "default" : "ghost"}
              size="sm"
              className="w-full h-10 p-0"
              onClick={() => handleNavigate(item.id)}
              title={item.label}
            >
              <item.icon className="h-4 w-4" />
            </Button>
          ))}
        </nav>
        <div className="p-2 border-t border-border">
          <Button variant="ghost" size="sm" className="w-full h-10 p-0" onClick={() => handleNavigate("/settings")} title="Settings">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Desktop: expanded rail
  return (
    <div
      className={cn(
        "w-64 h-full bg-card border-r border-border flex flex-col transition-all duration-300",
        isCollapsed && sidebarHovered && "absolute left-0 top-0 shadow-xl z-50"
      )}
      onMouseEnter={() => isCollapsed && onHover?.(true)}
      onMouseLeave={() => isCollapsed && onHover?.(false)}
    >
      {fullContent}
    </div>
  );
}
