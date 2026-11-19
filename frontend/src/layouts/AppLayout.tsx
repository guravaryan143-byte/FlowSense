import { Activity, AlertTriangle, BrainCircuit, LayoutDashboard, LogIn, LogOut, Map, Menu, Radio, Settings, Siren, TrafficCone, X } from "lucide-react";
import { Suspense, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { LoadingBlock, Pill } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { useTrafficStream } from "../hooks/useTrafficStream";

export const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/traffic", label: "Traffic Monitoring", icon: Activity },
  { to: "/predictions", label: "AI Predictions", icon: BrainCircuit },
  { to: "/signals", label: "Signal Optimization", icon: TrafficCone },
  { to: "/emergency", label: "Emergency Routes", icon: Siren },
  { to: "/accidents", label: "Accident Analytics", icon: Map },
  { to: "/incidents", label: "Incidents", icon: AlertTriangle },
  { to: "/settings", label: "Settings", icon: Settings },
];

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-2" aria-label="FlowSense home">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 text-ink-950"><Radio className="h-4.5 w-4.5" aria-hidden /></span>
      <span className="text-base font-semibold tracking-tight text-slate-50">Flow<span className="text-accent">Sense</span></span>
    </Link>
  );
}

function StreamChip() {
  const s = useTrafficStream();
  if (!s.connected) return <Pill tone="amber">Live stream offline · polling</Pill>;
  return s.running ? <Pill tone="green">● Live simulation</Pill> : <Pill>Stream connected · simulation idle</Pill>;
}

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const title = NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))?.label ?? "FlowSense";

  const nav = (
    <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-0.5 px-2">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
          className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${isActive ? "bg-accent/10 font-medium text-accent" : "text-slate-400 hover:bg-ink-800 hover:text-slate-100"}`}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden />{label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex h-full bg-gradient-to-b from-ink-900 to-ink-950">
      <aside className="hidden w-60 shrink-0 flex-col gap-6 border-r border-line bg-ink-950/60 py-5 lg:flex">
        <Logo />{nav}
        <div className="px-4">
          <p className="text-[11px] leading-relaxed text-slate-500">All traffic data is simulated.<br />Fictional road network.</p>
          <Link to="/welcome" className="mt-2 inline-block text-[11px] text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline">Project overview</Link>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-[1000] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-64 flex-col gap-6 border-r border-line bg-ink-950 py-5">
            <button className="absolute right-3 top-3 text-slate-400" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
            <Logo />{nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-ink-900/80 px-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-1.5 text-slate-300 hover:bg-ink-800 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
            <span className="text-sm font-medium text-slate-300">{title}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block"><StreamChip /></div>
            {user ? (
              <div className="flex items-center gap-2">
                <div className="hidden text-right leading-tight sm:block">
                  <div className="text-sm text-slate-100">{user.name}</div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">{user.role}</div>
                </div>
                <button onClick={logout} className="rounded-lg p-2 text-slate-400 hover:bg-ink-800 hover:text-slate-100" aria-label="Sign out" title="Sign out"><LogOut className="h-4 w-4" /></button>
              </div>
            ) : (
              <Link to="/login" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-slate-200 hover:bg-ink-800"><LogIn className="h-4 w-4" />Sign in</Link>
            )}
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
          <Suspense fallback={<LoadingBlock height={300} />}><div className="fade-in mx-auto max-w-[1400px]"><Outlet /></div></Suspense>
        </main>
      </div>
    </div>
  );
}
