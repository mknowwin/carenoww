import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseBp, vitalFlags, type VitalFlag } from "@/lib/ipd";
import VitalFlags from "./VitalFlags";

// Small multiples — one chart per vital (different units, so never a shared or
// dual axis). Series colours validated for light + dark surfaces; diastolic is
// also dashed so systolic/diastolic never rely on colour alone.
const SERIES = { primary: "#0d9488", secondary: "#6366f1" };
const FLAG_RING = { warning: "#d97706", critical: "#dc2626" } as const;

interface Point {
  t: number;
  label: string;
  sys?: number; dia?: number; pulse?: number; temp?: number; spo2?: number; respRate?: number;
  flags: VitalFlag[];
}

const fmt = (t: number) => new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function toPoints(rounds: any[]): Point[] {
  return [...rounds]
    .sort((a, b) => new Date(a.roundedAt).getTime() - new Date(b.roundedAt).getTime())
    .map((r) => {
      const bp = parseBp(r.bp);
      const t = new Date(r.roundedAt).getTime();
      return {
        t, label: fmt(t),
        sys: bp?.sys, dia: bp?.dia,
        pulse: r.pulse || undefined, temp: r.temp || undefined, spo2: r.spo2 || undefined, respRate: r.respRate || undefined,
        flags: vitalFlags(r),
      };
    })
    .filter((p) => p.sys || p.pulse || p.temp || p.spo2 || p.respRate);
}

// Point marker: ≥8px, surface ring; flagged readings get a status-coloured ring (label in tooltip + table)
function makeDot(flagVital: string, color: string) {
  return (props: any) => {
    const { cx, cy, payload, value } = props;
    if (value == null || cx == null || cy == null) return <g key={`${props.index}`} />;
    const flag = (payload as Point).flags.find((f) => f.vital === flagVital);
    return (
      <g key={`${props.index}`}>
        {flag && <circle cx={cx} cy={cy} r={7} fill="none" stroke={FLAG_RING[flag.level]} strokeWidth={2} />}
        <circle cx={cx} cy={cy} r={4} fill={color} strokeWidth={2} style={{ stroke: "var(--card)" }} />
      </g>
    );
  };
}

function ChartTooltip({ active, payload, unit, flagVital }: any) {
  if (!active || !payload?.length) return null;
  const p: Point = payload[0].payload;
  const flag = p.flags.find((f) => f.vital === flagVital);
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="text-muted-foreground">{p.label}</p>
      {payload.map((s: any) => (
        <p key={s.dataKey} className="font-medium text-foreground">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: s.stroke }} />
          {s.name}: {s.value}{unit}
        </p>
      ))}
      {flag && <p className="mt-0.5 font-medium text-foreground">⚠ {flag.label}</p>}
    </div>
  );
}

function VitalChart({ title, points, unit, flagVital, normal, domain, series }: {
  title: string; points: Point[]; unit: string; flagVital: string;
  normal: [number, number]; domain: [number | "auto", number | "auto"];
  series: { key: keyof Point; name: string; color: string; dashed?: boolean }[];
}) {
  const data = points.filter((p) => series.some((s) => p[s.key] != null));
  const latest = data[data.length - 1];
  return (
    <Card>
      <CardHeader className="pb-1 pt-3 px-4">
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {latest && (
            <span className="text-xs text-muted-foreground">
              Latest <span className="font-semibold text-foreground">{series.map((s) => latest[s.key] ?? "—").join("/")}{unit}</span>
            </span>
          )}
        </div>
        {series.length > 1 && (
          <div className="flex gap-3 text-xs text-muted-foreground pt-0.5">
            {series.map((s) => (
              <span key={String(s.key)} className="flex items-center gap-1.5">
                <svg width="16" height="6" aria-hidden><line x1="0" y1="3" x2="16" y2="3" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "4 3" : undefined} /></svg>
                {s.name}
              </span>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="px-2 pb-2">
        {data.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">Not recorded yet</p>
        ) : (
          <div className="h-44 text-muted-foreground">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -12 }}>
                <ReferenceArea y1={normal[0]} y2={normal[1]} fill="currentColor" fillOpacity={0.06} stroke="none" ifOverflow="hidden" />
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="[&_line]:stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "currentColor" }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis domain={domain} tick={{ fontSize: 10, fill: "currentColor" }} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                <Tooltip content={<ChartTooltip unit={unit} flagVital={flagVital} />} cursor={{ stroke: "currentColor", strokeOpacity: 0.3 }} />
                {series.map((s) => (
                  <Line key={String(s.key)} type="linear" dataKey={s.key as string} name={s.name}
                    stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined}
                    dot={makeDot(flagVital, s.color)} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function VitalsCharts({ rounds }: { rounds: any[] }) {
  const points = toPoints(rounds);
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-10">No vitals recorded yet. Nursing rounds with vitals appear here.</p>;
  }
  const hasRR = points.some((p) => p.respRate);
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Shaded band = typical adult range. Ringed points are outside it (amber = review, red = urgent); hover a point for details.
      </p>
      <div className="grid md:grid-cols-2 gap-3">
        <VitalChart title="Blood Pressure" unit=" mmHg" flagVital="BP" normal={[60, 140]} domain={[40, "auto"]} points={points}
          series={[{ key: "sys", name: "Systolic", color: SERIES.primary }, { key: "dia", name: "Diastolic", color: SERIES.secondary, dashed: true }]} />
        <VitalChart title="Pulse" unit=" bpm" flagVital="Pulse" normal={[60, 100]} domain={[40, "auto"]} points={points}
          series={[{ key: "pulse", name: "Pulse", color: SERIES.primary }]} />
        <VitalChart title="Temperature" unit="°F" flagVital="Temp" normal={[97, 100.4]} domain={[95, 105]} points={points}
          series={[{ key: "temp", name: "Temp", color: SERIES.primary }]} />
        <VitalChart title="SpO₂" unit="%" flagVital="SpO₂" normal={[95, 100]} domain={[80, 100]} points={points}
          series={[{ key: "spo2", name: "SpO₂", color: SERIES.primary }]} />
        {hasRR && (
          <VitalChart title="Respiratory Rate" unit="/min" flagVital="RR" normal={[12, 20]} domain={[0, "auto"]} points={points}
            series={[{ key: "respRate", name: "RR", color: SERIES.primary }]} />
        )}
      </div>

      {/* Table view of the same readings */}
      <Card>
        <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm font-semibold">All readings</CardTitle></CardHeader>
        <CardContent className="px-0 pb-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                {["Time", "BP", "Pulse", "Temp", "SpO₂", "RR", "Flags"].map((h) => <th key={h} className="text-left font-medium px-4 py-1.5 whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.t} className="border-b last:border-0 align-top">
                  <td className="px-4 py-1.5 whitespace-nowrap">{p.label}</td>
                  <td className="px-4 py-1.5">{p.sys ? `${p.sys}/${p.dia}` : "—"}</td>
                  <td className="px-4 py-1.5">{p.pulse ?? "—"}</td>
                  <td className="px-4 py-1.5">{p.temp ? `${p.temp}°F` : "—"}</td>
                  <td className="px-4 py-1.5">{p.spo2 ? `${p.spo2}%` : "—"}</td>
                  <td className="px-4 py-1.5">{p.respRate ?? "—"}</td>
                  <td className="px-4 py-1.5"><VitalFlags flags={p.flags} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
