import type { CongestionLevel, Severity } from "../types";

export const LEVEL_ORDER: CongestionLevel[] = ["free_flow", "moderate", "heavy", "severe", "closed"];
export const LEVEL_LABEL: Record<CongestionLevel, string> = {
  free_flow: "Free flow", moderate: "Moderate", heavy: "Heavy", severe: "Severe", closed: "Closed",
};
export const LEVEL_COLOR: Record<CongestionLevel, string> = {
  free_flow: "#22c55e", moderate: "#eab308", heavy: "#f97316", severe: "#ef4444", closed: "#64748b",
};
export const SEVERITY_COLOR: Record<Severity, string> = { low: "#38bdf8", medium: "#eab308", high: "#f97316", critical: "#ef4444" };
export const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

export const levelColor = (level: string): string => LEVEL_COLOR[level as CongestionLevel] ?? "#64748b";
export const levelLabel = (level: string): string => LEVEL_LABEL[level as CongestionLevel] ?? level;
/** Numeric rank so lists can be sorted worst-first. */
export const levelRank = (level: string): number => ({ free_flow: 0, moderate: 1, heavy: 2, severe: 3, closed: -1 })[level as CongestionLevel] ?? 0;
