import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { auth as authApi } from "../lib/api";

export type UserRole = "admin" | "doctor" | "nurse" | "receptionist" | "pharmacist" | "pharmacy_admin" | "lab_tech" | "finance";

export interface User {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  organization: string;
  timezone: string;
  token: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = "carenoww_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    const userWithToken: User = { ...data.user, token: data.token };
    setUser(userWithToken);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userWithToken));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
