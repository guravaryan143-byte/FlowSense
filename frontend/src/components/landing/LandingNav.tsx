import { Menu, Radio, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

const LINKS = [
  { href: "#modules", label: "Modules" },
  { href: "#live", label: "Live data" },
  { href: "#how", label: "How it works" },
] as const;

const CTA = "inline-flex min-h-11 items-center justify-center rounded-full bg-paper px-5 text-sm font-medium text-ink-950 transition hover:bg-white active:scale-[.97]";

function Brand() {
  return (
    <Link to="/welcome" className="flex min-h-11 items-center gap-2.5" aria-label="FlowSense home">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 text-ink-950"><Radio className="h-[18px] w-[18px]" aria-hidden /></span>
      <span className="text-[17px] font-semibold tracking-tight text-slate-50">Flow<span className="text-accent">Sense</span></span>
    </Link>
  );
}

export function LandingNav() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);

  // The bar is clear over the hero and gains a blurred backing once the page scrolls under it.
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Open menu: Escape closes it and the page behind it does not scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.documentElement.style.overflow = prev; };
  }, [open]);

  const linkClass = "inline-flex min-h-11 items-center rounded-full px-4 text-sm text-slate-300 transition hover:text-white";

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${solid || open ? "border-b border-white/5 bg-ink-950/80 backdrop-blur-md" : "border-b border-transparent"}`}>
      <div className="mx-auto grid h-16 max-w-[1400px] grid-cols-[1fr_auto] items-center gap-4 px-5 sm:px-8 lg:grid-cols-[1fr_auto_1fr] lg:px-12">
        <div className="justify-self-start"><Brand /></div>

        <nav aria-label="Page sections" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => <a key={l.href} href={l.href} className={linkClass}>{l.label}</a>)}
        </nav>

        <div className="hidden items-center justify-self-end gap-2 lg:flex">
          {!user && <Link to="/login" className={linkClass}>Sign in</Link>}
          <Link to="/dashboard" className={CTA}>Open dashboard</Link>
        </div>

        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="landing-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="-mr-2 grid h-11 w-11 place-items-center justify-self-end rounded-full text-slate-100 transition hover:bg-white/10 lg:hidden">
          {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
      </div>

      <div id="landing-menu" data-open={open} className="menu-sheet absolute inset-x-0 top-16 h-[calc(100dvh-4rem)] overflow-y-auto bg-ink-950/95 backdrop-blur-xl lg:hidden">
        <nav aria-label="Mobile" className="mx-auto flex max-w-md flex-col gap-1 px-5 pb-10 pt-6">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}
              className="flex min-h-14 items-center border-b border-white/5 text-2xl font-medium tracking-tight text-slate-100">{l.label}</a>
          ))}
          <div className="mt-6 flex flex-col gap-3">
            <Link to="/dashboard" onClick={() => setOpen(false)} className={`${CTA} min-h-12 text-base`}>Open dashboard</Link>
            {!user && <Link to="/login" onClick={() => setOpen(false)} className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 text-base text-slate-100">Sign in</Link>}
          </div>
        </nav>
      </div>
    </header>
  );
}
