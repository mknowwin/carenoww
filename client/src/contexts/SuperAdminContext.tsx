import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { superadmin as saApi, registerUnauthorizedHandler } from "../lib/api";
import { toast } from "../hooks/use-toast";

export interface SuperAdmin {
  email: string;
  role: "superadmin";
  token: string;
}

interface SuperAdminContextType {
  superAdmin: SuperAdmin | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const SuperAdminContext = createContext<SuperAdminContextType | null>(null);
const SA_STORAGE_KEY = "carenoww_superadmin";

export function SuperAdminProvider({ children }: { children: ReactNode }) {
  const [superAdmin, setSuperAdmin] = useState<SuperAdmin | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(SA_STORAGE_KEY);
    if (stored) {
      try { setSuperAdmin(JSON.parse(stored)); } catch { localStorage.removeItem(SA_STORAGE_KEY); }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const data = await saApi.login(email, password);
    const sa: SuperAdmin = { email: data.email, role: "superadmin", token: data.token };
    setSuperAdmin(sa);
    localStorage.setItem(SA_STORAGE_KEY, JSON.stringify(sa));
  };

  const logout = () => {
    setSuperAdmin(null);
    localStorage.removeItem(SA_STORAGE_KEY);
  };

  useEffect(() => {
    registerUnauthorizedHandler("superadmin", () => {
      logout();
      toast({ variant: "destructive", title: "Session expired", description: "Please log in again." });
    });
    return () => registerUnauthorizedHandler("superadmin", null);
  }, []);

  return (
    <SuperAdminContext.Provider value={{ superAdmin, isLoading, login, logout }}>
      {children}
    </SuperAdminContext.Provider>
  );
}

export function useSuperAdmin() {
  const ctx = useContext(SuperAdminContext);
  if (!ctx) throw new Error("useSuperAdmin must be used within SuperAdminProvider");
  return ctx;
}
