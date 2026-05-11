import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bell, LogOut, Settings, PanelLeft, ChevronDown, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { AI_ALERTS } from "@/lib/mock-data";

const PAGE_TITLES: Record<string, { title: string; description: string }> = {
  "/":             { title: "Hospital Dashboard",      description: "Real-time overview of hospital operations and clinical metrics" },
  "/patients":     { title: "Patient Registry",        description: "Patient registration, UHID management and medical records" },
  "/appointments": { title: "Appointment & Scheduling",description: "OPD scheduling, queue management and doctor availability" },
  "/opd":          { title: "OPD / Electronic Medical Records", description: "Outpatient consultations, SOAP notes and e-prescriptions" },
  "/ipd":          { title: "IPD & Ward Management",   description: "Inpatient admissions, bed management and nursing care" },
  "/lab":          { title: "Laboratory Information System", description: "Lab orders, sample tracking and result reporting" },
  "/pharmacy":     { title: "Pharmacy Management",     description: "Prescription dispensing, drug inventory and MAR" },
  "/billing":      { title: "Billing & Revenue Cycle", description: "Patient billing, insurance claims and financial management" },
  "/analytics":    { title: "Clinical & Business Analytics", description: "Hospital performance metrics and AI-generated insights" },
  "/settings":     { title: "Settings",                description: "Account, system and notification preferences" },
};

const ROLE_BADGE: Record<UserRole, { label: string; color: string }> = {
  admin:        { label: "Admin",      color: "bg-teal-100 text-teal-700" },
  doctor:       { label: "Physician",  color: "bg-blue-100 text-blue-700" },
  nurse:        { label: "Nurse",      color: "bg-emerald-100 text-emerald-700" },
  receptionist: { label: "Front Desk", color: "bg-violet-100 text-violet-700" },
  pharmacist:   { label: "Pharmacist", color: "bg-amber-100 text-amber-700" },
  lab_tech:     { label: "Lab Tech",   color: "bg-indigo-100 text-indigo-700" },
  finance:      { label: "Finance",    color: "bg-rose-100 text-rose-700" },
};

interface TopNavProps { onToggleSidebar: () => void; }

export default function TopNav({ onToggleSidebar }: TopNavProps) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();

  const matchedKey = Object.keys(PAGE_TITLES).find((k) =>
    k === "/" ? location === "/" : location.startsWith(k)
  ) ?? "/";
  const page = PAGE_TITLES[matchedKey];
  const roleBadge = user?.role ? ROLE_BADGE[user.role] : null;
  const criticalCount = AI_ALERTS.filter((a) => a.type === "critical").length;

  const handleLogout = () => { logout(); setLocation("/login"); };

  return (
    <header className="h-14 bg-card border-b border-border flex items-center px-4 gap-3 shrink-0">
      <Button variant="ghost" size="sm" onClick={onToggleSidebar} className="h-8 w-8 p-0 shrink-0">
        <PanelLeft className="h-4 w-4" />
      </Button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground leading-tight truncate">{page.title}</h2>
        </div>
        <p className="text-xs text-muted-foreground truncate hidden sm:block">{page.description}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Critical AI Alert indicator */}
        {criticalCount > 0 && (
          <Button variant="ghost" size="sm" className="h-8 px-2 gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-bold hidden sm:block">{criticalCount} Critical</span>
          </Button>
        )}

        {/* Notification bell */}
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 relative">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full" />
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 px-2 gap-2 rounded-xl">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                  {user?.name?.[0] ?? "U"}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:flex flex-col items-start">
                <span className="text-xs font-medium leading-tight">{user?.name?.split(" ")[0]}{user?.name?.split(" ")[1] ? " " + user.name.split(" ")[1] : ""}</span>
                {roleBadge && (
                  <Badge className={`text-[10px] px-1 py-0 leading-tight mt-0.5 ${roleBadge.color}`}>
                    {roleBadge.label}
                  </Badge>
                )}
              </div>
              <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <div className="px-3 py-2">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
              <p className="text-xs text-muted-foreground">{user?.department} · {user?.organization}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setLocation("/settings")}>
              <Settings className="h-4 w-4 mr-2" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive">
              <LogOut className="h-4 w-4 mr-2" /> Switch Role / Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
