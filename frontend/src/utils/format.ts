const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export const fmtInt = (n: number | null | undefined): string => (n == null ? "—" : nf0.format(n));
export const fmtDec = (n: number | null | undefined): string => (n == null ? "—" : nf1.format(n));

/** 252.4 -> "4 min 12 s" */
export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${s % 60} s`;
}

/** 3943.6 -> "3.94 km", 850 -> "850 m" */
export function fmtDistance(meters: number | null | undefined): string {
  if (meters == null) return "—";
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

export function fmtPct(n: number | null | undefined, signed = true): string {
  if (n == null) return "—";
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${nf1.format(n)}%`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

export const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
};

export const titleCase = (s: string): string => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
