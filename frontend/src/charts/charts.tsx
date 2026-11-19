import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HistoryPoint, HourlyPoint, TrendsResult } from "../types";
import { LEVEL_COLOR, LEVEL_LABEL, LEVEL_ORDER } from "../utils/congestion";
import { fmtTime } from "../utils/format";

const AXIS = { stroke: "#334155", tick: { fill: "#8b9ab5", fontSize: 11 } };
const TIP = { contentStyle: { background: "#0f1830", border: "1px solid #25345a", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "#cbd5e1" }, itemStyle: { color: "#e2e8f0" } };
const GRID = <CartesianGrid stroke="#1f2d4b" strokeDasharray="3 3" vertical={false} />;

function Box({ height, label, children }: { height: number; label: string; children: React.ReactElement }) {
  return <div style={{ height }} role="img" aria-label={label}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>;
}

/** City-wide average speed (left axis) and density (right axis) over time. */
export function TrendChart({ series, height = 240 }: { series: TrendsResult["series"]; height?: number }) {
  const data = series.map((p) => ({ t: fmtTime(p.time), speed: p.average_speed, density: p.average_density }));
  return (
    <Box height={height} label="City traffic trend: average speed and density">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        {GRID}
        <XAxis dataKey="t" {...AXIS} interval="preserveStartEnd" minTickGap={40} />
        <YAxis yAxisId="l" {...AXIS} />
        <YAxis yAxisId="r" orientation="right" {...AXIS} />
        <Tooltip {...TIP} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line yAxisId="l" type="monotone" dataKey="speed" name="Avg speed (km/h)" stroke="#22d3ee" dot={false} strokeWidth={2} />
        <Line yAxisId="r" type="monotone" dataKey="density" name="Avg density (veh/km/lane)" stroke="#f97316" dot={false} strokeWidth={2} />
      </LineChart>
    </Box>
  );
}

export function HistoryChart({ points, height = 220 }: { points: HistoryPoint[]; height?: number }) {
  const data = points.map((p) => ({ t: fmtTime(p.recorded_at), speed: p.average_speed, density: p.density }));
  return (
    <Box height={height} label="Road history: speed and density">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        {GRID}
        <XAxis dataKey="t" {...AXIS} interval="preserveStartEnd" minTickGap={40} />
        <YAxis yAxisId="l" {...AXIS} />
        <YAxis yAxisId="r" orientation="right" {...AXIS} />
        <Tooltip {...TIP} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line yAxisId="l" type="monotone" dataKey="speed" name="Speed (km/h)" stroke="#22d3ee" dot={false} strokeWidth={2} />
        <Line yAxisId="r" type="monotone" dataKey="density" name="Density (veh/km/lane)" stroke="#f97316" dot={false} strokeWidth={2} />
      </LineChart>
    </Box>
  );
}

/** Average density by hour of day: last 24 h versus the same 24 h one week earlier. */
export function HourlyComparisonChart({ current, previous, height = 240 }: { current: HourlyPoint[]; previous: HourlyPoint[]; height?: number }) {
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const data = hours.map((h) => ({
    hour: `${String(h).padStart(2, "0")}:00`,
    now: current.find((p) => p.hour === h)?.average_density ?? null,
    before: previous.find((p) => p.hour === h)?.average_density ?? null,
  }));
  return (
    <Box height={height} label="Hourly density: now versus previous week">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        {GRID}
        <XAxis dataKey="hour" {...AXIS} interval={3} />
        <YAxis {...AXIS} />
        <Tooltip {...TIP} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="now" name="Last 24 h" stroke="#22d3ee" dot={false} strokeWidth={2} connectNulls />
        {previous.length > 0 && <Line type="monotone" dataKey="before" name="Same day, previous week" stroke="#64748b" strokeDasharray="5 4" dot={false} strokeWidth={2} connectNulls />}
      </LineChart>
    </Box>
  );
}

export function LevelDonut({ counts }: { counts: Record<string, number> }) {
  const data = LEVEL_ORDER.map((l) => ({ level: l, name: LEVEL_LABEL[l], value: counts[l] ?? 0 })).filter((d) => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-36 w-36 shrink-0" role="img" aria-label="Congestion distribution">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={44} outerRadius={64} paddingAngle={2} stroke="none">
              {data.map((d) => <Cell key={d.level} fill={LEVEL_COLOR[d.level]} />)}
            </Pie>
            <Tooltip {...TIP} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums text-slate-50">{total}</span>
          <span className="text-[10px] uppercase tracking-wide text-slate-400">roads</span>
        </div>
      </div>
      <ul className="space-y-1.5 text-sm">
        {LEVEL_ORDER.map((l) => (
          <li key={l} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: LEVEL_COLOR[l] }} />
            <span className="text-slate-300">{LEVEL_LABEL[l]}</span>
            <span className="ml-auto pl-4 tabular-nums text-slate-100">{counts[l] ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface BarDatum { label: string; value: number; color?: string }
export function BarsChart({ data, color = "#22d3ee", height = 200, horizontal = false, label }: {
  data: BarDatum[]; color?: string; height?: number; horizontal?: boolean; label: string;
}) {
  return (
    <Box height={height} label={label}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 8, left: horizontal ? 40 : -16, bottom: 0 }}>
        {GRID}
        {horizontal ? <><XAxis type="number" {...AXIS} /><YAxis type="category" dataKey="label" width={110} {...AXIS} /></>
                    : <><XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" /><YAxis {...AXIS} allowDecimals={false} /></>}
        <Tooltip {...TIP} cursor={{ fill: "rgba(34,211,238,0.06)" }} />
        <Bar dataKey="value" name="Count" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.color ?? color} />)}
        </Bar>
      </BarChart>
    </Box>
  );
}

/** Total queued vehicles over the simulated hour, fixed-time versus adaptive. */
export function QueueChart({ fixed, adaptive, height = 220 }: { fixed: Record<string, number>[]; adaptive: Record<string, number>[]; height?: number }) {
  const data = fixed.map((p, i) => ({ min: Math.round(p.t / 60), fixed: p.queue, adaptive: adaptive[i]?.queue ?? null }));
  return (
    <Box height={height} label="Queue length over time: fixed versus adaptive">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        {GRID}
        <XAxis dataKey="min" {...AXIS} unit=" min" />
        <YAxis {...AXIS} />
        <Tooltip {...TIP} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="fixed" name="Fixed-time" stroke="#f97316" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="adaptive" name="Adaptive" stroke="#22d3ee" dot={false} strokeWidth={2} />
      </LineChart>
    </Box>
  );
}

/** Two bars per road: current vs forecast density. */
export function CompareBarsChart({ data, height = 260 }: { data: { label: string; now: number; forecast: number }[]; height?: number }) {
  return (
    <Box height={height} label="Current versus forecast density by road">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        {GRID}
        <XAxis dataKey="label" {...AXIS} interval={0} tick={{ fill: "#8b9ab5", fontSize: 10 }} height={44} angle={-20} textAnchor="end" />
        <YAxis {...AXIS} />
        <Tooltip {...TIP} cursor={{ fill: "rgba(34,211,238,0.06)" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="now" name="Now" fill="#64748b" radius={[3, 3, 0, 0]} />
        <Bar dataKey="forecast" name="Forecast" fill="#22d3ee" radius={[3, 3, 0, 0]} />
      </BarChart>
    </Box>
  );
}
