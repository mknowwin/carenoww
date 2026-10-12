import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, X } from "lucide-react";
import { referralMasters as masterApi, ReferralMasterKind } from "@/lib/api";

// Searchable pick-or-add combobox over a referral master list (Area, VHN, …).
// Mirrors the Referring Doctor combobox in AppointmentModal.
export function ReferralMasterPicker({ kind, value, onChange, placeholder }: {
  kind: ReferralMasterKind;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (search.trim().length < 1) { setResults([]); setOpen(false); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await masterApi.search(kind, search.trim());
        setResults(res ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, kind]);

  const select = (name: string) => {
    onChange(name);
    setSearch("");
    setResults([]);
    setOpen(false);
  };

  const add = async () => {
    if (!search.trim()) return;
    setCreating(true);
    try {
      const m = await masterApi.create(kind, search.trim());
      select(m.name);
    } catch {
      select(search.trim());
    } finally {
      setCreating(false);
    }
  };

  const hasExactMatch = results.some((r) => r.name.toLowerCase() === search.trim().toLowerCase());

  if (value) {
    return (
      <div className="flex items-center gap-2 h-8 border rounded-md px-3 bg-background">
        <span className="text-sm flex-1 truncate">{value}</span>
        <button type="button" onClick={() => onChange("")} className="shrink-0 text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        className="h-8 text-sm"
        placeholder={placeholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (results.length > 0 || search.trim().length >= 1) && (
        <div className="absolute z-50 top-full mt-1 w-full border rounded-lg bg-background shadow-md divide-y max-h-56 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r._id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
              onMouseDown={(e) => { e.preventDefault(); select(r.name); }}
            >
              <span className="font-medium">{r.name}</span>
            </button>
          ))}
          {!hasExactMatch && search.trim().length >= 1 && (
            <button
              type="button"
              disabled={creating}
              className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5 transition-colors flex items-center gap-1.5"
              onMouseDown={(e) => { e.preventDefault(); add(); }}
            >
              {creating
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <span className="font-medium">+ Add "{search.trim()}"</span>
              }
            </button>
          )}
        </div>
      )}
    </div>
  );
}
