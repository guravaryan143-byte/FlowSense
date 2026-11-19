import { AlertTriangle, Inbox, Loader2, LogIn } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { Role } from "../types";
import { levelColor, levelLabel } from "../utils/congestion";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export function Card({ title, subtitle, actions, children, className, padded = true }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean;
}) {
  return (
    <section className={cx("rounded-xl border border-line bg-ink-850 shadow-card", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="truncate text-sm font-semibold text-slate-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function KpiCard({ label, value, unit, hint, icon, tone = "default" }: {
  label: string; value: ReactNode; unit?: string; hint?: ReactNode; icon?: ReactNode; tone?: "default" | "warn" | "bad" | "good";
}) {
  const toneCls = { default: "text-accent", warn: "text-amber-400", bad: "text-red-400", good: "text-emerald-400" }[tone];
  return (
    <div className="rounded-xl border border-line bg-ink-850 p-4 shadow-card" data-testid="kpi">
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-400">
        <span>{label}</span>
        {icon && <span className={toneCls}>{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums text-slate-50">{value}</span>
        {unit && <span className="text-xs text-slate-400">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function LevelBadge({ level }: { level: string }) {
  const c = levelColor(level);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium" style={{ borderColor: c + "66", color: c, background: c + "1a" }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {levelLabel(level)}
    </span>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "cyan" | "green" | "amber" | "red" }) {
  const t = {
    neutral: "border-line text-slate-300", cyan: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
    green: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300", amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    red: "border-red-500/40 bg-red-500/10 text-red-300",
  }[tone];
  return <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", t)}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("animate-spin text-accent", className ?? "h-5 w-5")} aria-hidden />;
}

export function LoadingBlock({ label = "Loading…", height = 120 }: { label?: string; height?: number }) {
  return (
    <div className="flex items-center justify-center gap-2 text-sm text-slate-400" style={{ minHeight: height }} role="status" aria-live="polite">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center">
      <AlertTriangle className="h-6 w-6 text-red-400" aria-hidden />
      <p className="max-w-md text-sm text-red-200">{message}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-slate-400">
      <Inbox className="h-6 w-6" aria-hidden />
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {hint && <p className="max-w-md text-xs">{hint}</p>}
    </div>
  );
}

/** Renders loading → error → empty → data, so every widget handles all four states the same way. */
export function DataBoundary<T>({ loading, error, data, onRetry, isEmpty, emptyTitle = "No data yet", emptyHint, height, children }: {
  loading: boolean; error: string | null; data: T | null; onRetry?: () => void; isEmpty?: (d: T) => boolean;
  emptyTitle?: string; emptyHint?: ReactNode; height?: number; children: (d: T) => ReactNode;
}) {
  if (data === null && loading) return <LoadingBlock height={height} />;
  if (error && data === null) return <ErrorState message={error} onRetry={onRetry} />;
  if (data === null) return <EmptyState title={emptyTitle} hint={emptyHint} />;
  if (isEmpty?.(data)) return <EmptyState title={emptyTitle} hint={emptyHint} />;
  return <>{children(data)}</>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-50">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Always visible reminder that nothing here is real-world traffic. */
export function SimBanner({ asOf }: { asOf?: string | null }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-200" data-testid="sim-banner">
      <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 font-semibold uppercase tracking-wide">Simulated data</span>
      <span>Generated by FlowSense's traffic simulator on a fictional road network, not real-world live traffic.</span>
      {asOf && <span className="text-cyan-300/70">Latest reading: {asOf}</span>}
    </div>
  );
}

const BTN = {
  primary: "bg-accent text-ink-950 hover:bg-cyan-300 disabled:bg-accent/40",
  secondary: "border border-line bg-ink-800 text-slate-200 hover:bg-ink-700 disabled:opacity-50",
  danger: "bg-red-500/90 text-white hover:bg-red-500 disabled:opacity-50",
  ghost: "text-slate-300 hover:bg-ink-700 disabled:opacity-50",
};
export function Button({ variant = "primary", loading, className, children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BTN; loading?: boolean;
}) {
  return (
    <button {...rest} disabled={disabled || loading}
      className={cx("inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed", BTN[variant], className)}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

const CONTROL = "w-full rounded-lg border border-line bg-ink-900 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-accent disabled:opacity-50";
export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-400">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(CONTROL, p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(CONTROL, p.className)} />;

/** Shows children only if the user has the role; otherwise explains what is needed and links to sign-in. */
export function RoleGate({ min, action, children }: { min: Role; action: string; children: ReactNode }) {
  const { hasRole, user } = useAuth();
  if (hasRole(min)) return <>{children}</>;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-line bg-ink-800/60 p-3 text-sm text-slate-300" data-testid="role-gate">
      <LogIn className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
      <p>
        {user ? <>Your role is <b>{user.role}</b>; you need <b>{min}</b> access to {action}.</>
              : <><Link to="/login" className="font-medium text-accent hover:underline">Sign in</Link> as {min === "viewer" ? "any user" : `an ${min}`} to {action}.</>}
      </p>
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("overflow-x-auto", className)}><table className="w-full text-left text-sm">{children}</table></div>;
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th scope="col" className={cx("whitespace-nowrap border-b border-line px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-400", className)}>{children}</th>
);
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <td className={cx("border-b border-line/60 px-3 py-2 text-slate-200", className)}>{children}</td>
);
export { cx };
