import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { wards as wardsApi, type BedView, type WardView } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export function useWards() {
  return useQuery({ queryKey: ["wards"], queryFn: () => wardsApi.list(), refetchInterval: 30000 });
}

// Why a bed can't be picked right now, or null when it is free
export function bedBlocker(b: BedView, currentBedId?: string): string | null {
  if (b._id === currentBedId) return "current bed";
  if (b.occupant) return b.occupant.patientName;
  if (b.status !== "Available") return b.status.toLowerCase();
  return null;
}

export function findBed(wardList: WardView[] | undefined, bedId: string) {
  for (const w of wardList ?? []) {
    const bed = w.beds.find((b) => b._id === bedId);
    if (bed) return { ward: w, bed };
  }
  return null;
}

// Free beds grouped by ward; busy beds stay visible (disabled) so staff see why
export default function BedPicker({ value, onChange, currentBedId, className }: {
  value: string;
  onChange: (bedId: string) => void;
  currentBedId?: string;    // transfer: the patient's bed, shown but not selectable
  className?: string;
}) {
  const { user } = useAuth();
  const { data: wardList, isLoading } = useWards();
  const free = (wardList ?? []).reduce((n, w) => n + w.beds.filter((b) => !bedBlocker(b, currentBedId)).length, 0);

  if (!isLoading && (wardList ?? []).length === 0) {
    return (
      <p className={`text-xs text-muted-foreground border rounded-md px-3 py-2 ${className ?? ""}`}>
        No wards set up yet.{" "}
        {user?.role === "admin" ? "Add wards and beds in Settings → Wards & Beds." : "Ask an admin to add wards and beds in Settings."}
      </p>
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={isLoading ? "Loading beds…" : free ? `Select bed (${free} free)` : "No free beds"} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {(wardList ?? []).map((w) => (
          <SelectGroup key={w._id}>
            <SelectLabel className="text-xs text-muted-foreground">
              {w.name} · {w.counts.available} free / {w.counts.total}
            </SelectLabel>
            {w.beds.map((b) => {
              const blocker = bedBlocker(b, currentBedId);
              return (
                <SelectItem key={b._id} value={b._id} disabled={!!blocker}>
                  {w.name} — {b.number}{blocker ? ` (${blocker})` : ""}
                </SelectItem>
              );
            })}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
