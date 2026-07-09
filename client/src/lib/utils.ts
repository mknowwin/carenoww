import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "INR"): string {
  if (currency === "INR") {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
    return `₹${amount}`;
  }
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount);
}

/** Same as formatCurrency but never abbreviates (no K/L/Cr) — full digit-grouped amount. */
export function formatCurrencyFull(amount: number, currency = "INR"): string {
  if (currency === "INR") return `₹${Math.round(amount).toLocaleString("en-IN")}`;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount);
}

/** Returns "YYYY-MM-DD" in the given IANA timezone (uses Intl, no packages needed). */
export function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

/** Returns "YYYY-MM" in the given IANA timezone. */
export function currentMonthInTz(tz: string): string {
  return todayInTz(tz).slice(0, 7);
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

export function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function getAgeFromDOB(dob: string): number {
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
