import { AlertTriangle, AlertOctagon } from "lucide-react";
import type { VitalFlag } from "@/lib/ipd";

// Status colours are reserved for vitals flags and always carry an icon + label
const LEVEL_STYLES = {
  warning:  { cls: "bg-amber-50 border-amber-300 text-amber-800", Icon: AlertTriangle },
  critical: { cls: "bg-red-50 border-red-300 text-red-800",       Icon: AlertOctagon },
} as const;

export default function VitalFlags({ flags, className = "" }: { flags: VitalFlag[]; className?: string }) {
  if (flags.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {flags.map((f) => {
        const { cls, Icon } = LEVEL_STYLES[f.level];
        return (
          <span key={f.vital} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
            <Icon className="h-3 w-3" /> {f.label} · {f.value}
          </span>
        );
      })}
    </div>
  );
}
