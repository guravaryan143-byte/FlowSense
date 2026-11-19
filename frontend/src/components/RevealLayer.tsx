import { useEffect, useRef } from "react";

/* ------------------------------------------------------------------ pure helpers (unit-tested) */

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Frame-rate independent smoothing factor in 0..1. `rate` is how quickly we close the gap (per second);
 * the same movement therefore feels identical on 60 Hz and 144 Hz screens.
 */
export const smoothing = (dtMs: number, rate: number): number => 1 - Math.exp(-rate * (dtMs / 1000));

/** Spotlight diameter in CSS pixels: scales with the hero, never tiny on phones, never huge on wide screens. */
export function spotlightDiameter(width: number, height: number): number {
  return Math.round(Math.min(Math.max(Math.min(width, height) * 0.62, 260), 640));
}

export interface Point { x: number; y: number }

/** A point on the artwork, as fractions (0..1) of the image, plus the image's pixel size (needed to reproduce the crop). */
export interface FocusPoint extends Point { imageWidth: number; imageHeight: number }

/**
 * Where an image-space point lands inside a box when the image is shown with `object-fit: cover`, centred.
 * This is what lets the lens start on a real intersection no matter how the art is cropped on a given screen.
 */
export function coverPoint(fx: number, fy: number, imageWidth: number, imageHeight: number, boxWidth: number, boxHeight: number): Point {
  const scale = Math.max(boxWidth / imageWidth, boxHeight / imageHeight);
  const drawnW = imageWidth * scale;
  const drawnH = imageHeight * scale;
  return { x: (boxWidth - drawnW) / 2 + fx * drawnW, y: (boxHeight - drawnH) / 2 + fy * drawnH };
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** A slow wandering path around `centre` (default: the middle of the box), used where there is no cursor. */
export function driftPosition(tMs: number, width: number, height: number, centre?: Point): Point {
  const t = tMs / 1000;
  const c = centre ?? { x: width * 0.5, y: height * 0.52 };
  return {
    x: clamp(c.x + width * 0.22 * Math.sin(t * 0.23 + 0.6), width * 0.08, width * 0.92),
    y: clamp(c.y + height * 0.17 * Math.sin(t * 0.31), height * 0.1, height * 0.9),
  };
}

/** Alpha at distance `t` (0 centre .. 1 edge): a solid core, then a smoothstep fall to nothing. */
export function maskAlpha(t: number): number {
  const core = 0.18;
  if (t <= core) return 1;
  const u = Math.min(1, (t - core) / (1 - core));
  return 1 - u * u * (3 - 2 * u);
}

/** CSS-only version of the same falloff; used if a canvas is unavailable. */
export const CSS_MASK = `radial-gradient(closest-side, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 18%, rgba(0,0,0,.8) 38%, rgba(0,0,0,.4) 62%, rgba(0,0,0,.1) 84%, rgba(0,0,0,0) 100%)`;

/**
 * Paint the soft circular mask once. Many colour stops keep the edge free of visible rings.
 * Returns a data URL, or null when 2D canvas is not available.
 */
export function paintSoftMask(canvas: HTMLCanvasElement, px: number): string | null {
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const r = px / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  const STOPS = 20;
  for (let i = 0; i <= STOPS; i += 1) gradient.addColorStop(i / STOPS, `rgba(0,0,0,${maskAlpha(i / STOPS).toFixed(4)})`);
  ctx.clearRect(0, 0, px, px);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, px, px);
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** Set a standard CSS property and its -webkit- twin (Safari and older Chromium still want the prefix). */
function setBoth(el: HTMLElement, prop: string, value: string): void {
  el.style.setProperty(prop, value);
  el.style.setProperty(`-webkit-${prop}`, value);
}

/* ------------------------------------------------------------------ components */

/** One hero image. Portrait phones get a framing made for them (same registration as the landscape art). */
export function LayerImage({ src, portraitSrc }: { src: string; portraitSrc?: string }) {
  return (
    <picture>
      {portraitSrc && <source media="(max-aspect-ratio: 4/5)" srcSet={portraitSrc} />}
      <img src={src} alt="" decoding="async" draggable={false} className="hero-zoom absolute inset-0 h-full w-full object-cover" />
    </picture>
  );
}

interface RevealLayerProps {
  src: string;
  portraitSrc?: string;
  /** Where the lens rests and wanders around: a feature on the artwork, per framing. */
  focus?: { landscape: FocusPoint; portrait?: FocusPoint };
}

/**
 * A full-bleed image that is only visible inside a soft circle following the pointer.
 *
 * It listens on its PARENT element (the hero), so place it as a direct child of the section it should react to.
 * - Mouse: the circle trails the cursor with smoothed motion and fades away when the cursor leaves.
 * - Touch (no hover): the circle drifts along a slow path, and follows a finger while one is down.
 * - prefers-reduced-motion: the circle rests in a fixed place and moves 1:1 with the pointer, with no easing or drift.
 *
 * All per-frame work happens in refs and style updates: React never re-renders while the spotlight moves,
 * the mask bitmap is painted once per size bucket, and the loop stops itself as soon as nothing is moving.
 */
export function RevealLayer({ src, portraitSrc, focus }: RevealLayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const host = root?.parentElement;
    if (!root || !host) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const noHover = window.matchMedia("(hover: none)").matches;

    const raw = { x: 0, y: 0 }; // where the pointer is
    const smooth = { x: 0, y: 0 }; // where the spotlight is
    const centre: Point = { x: 0, y: 0 }; // the artwork's focal feature, in hero pixels
    const s = { scale: 0, target: 0, diameter: 300, w: 1, h: 1, running: false, visible: true, lastTs: 0, lastTouch: -1e9, pointerSeen: false, hasMouse: false };
    let raf = 0;
    let introTimer: number | undefined;
    const maskCanvas = document.createElement("canvas");
    let maskImage = "";
    let maskPx = 0;

    const ensureMask = () => {
      const want = Math.min(384, Math.max(256, Math.round(s.diameter * Math.min(window.devicePixelRatio || 1, 2) * 0.5))); // a soft gradient needs few pixels
      if (maskImage && Math.abs(want - maskPx) / maskPx < 0.25) return; // close enough: do not repaint
      const url = paintSoftMask(maskCanvas, want);
      maskPx = want;
      maskImage = url ? `url(${url})` : CSS_MASK;
      setBoth(root, "mask-image", maskImage);
      setBoth(root, "mask-repeat", "no-repeat");
    };

    const apply = () => {
      const d = s.diameter * s.scale;
      setBoth(root, "mask-size", `${d.toFixed(1)}px ${d.toFixed(1)}px`);
      setBoth(root, "mask-position", `${(smooth.x - d / 2).toFixed(1)}px ${(smooth.y - d / 2).toFixed(1)}px`);
      if (root.dataset.ready !== "true") root.dataset.ready = "true";
    };

    // Touch-first screens get a self-moving lens, but the moment a real mouse or pen shows up it takes over for good.
    const drifting = () => noHover && !reduced && !s.hasMouse;

    const schedule = () => {
      s.running = true;
      raf = window.requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!s.running && s.visible) {
        s.lastTs = 0;
        schedule();
      }
    };

    function tick(ts: number) {
      raf = 0;
      if (!s.visible) {
        s.running = false;
        return;
      }
      const dt = s.lastTs ? Math.min(64, ts - s.lastTs) : 16;
      s.lastTs = ts;

      if (drifting() && ts - s.lastTouch > 2500) {
        const p = driftPosition(ts, s.w, s.h, centre);
        raw.x = p.x;
        raw.y = p.y;
        s.target = 1;
      }
      const follow = reduced ? 1 : smoothing(dt, 7);
      smooth.x = lerp(smooth.x, raw.x, follow);
      smooth.y = lerp(smooth.y, raw.y, follow);
      s.scale = lerp(s.scale, s.target, reduced ? 1 : smoothing(dt, 6));
      if (s.target === 0 && s.scale < 0.01) s.scale = 0; // finish the fade-out exactly, so no speck of the layer lingers
      apply();

      const settled = Math.abs(raw.x - smooth.x) < 0.2 && Math.abs(raw.y - smooth.y) < 0.2 && Math.abs(s.target - s.scale) < 0.004;
      if (drifting() || !settled) schedule();
      else s.running = false;
    }

    const measure = () => {
      const r = host.getBoundingClientRect();
      s.w = Math.max(1, r.width);
      s.h = Math.max(1, r.height);
      s.diameter = spotlightDiameter(s.w, s.h);
      const usePortrait = Boolean(portraitSrc && focus?.portrait) && window.matchMedia("(max-aspect-ratio: 4/5)").matches;
      const f = usePortrait ? focus?.portrait : focus?.landscape;
      const c = f ? coverPoint(f.x, f.y, f.imageWidth, f.imageHeight, s.w, s.h) : { x: s.w * 0.64, y: s.h * 0.5 };
      const moved = centre.x !== c.x || centre.y !== c.y;
      centre.x = c.x;
      centre.y = c.y;
      if (moved && !s.pointerSeen) { raw.x = smooth.x = c.x; raw.y = smooth.y = c.y; } // keep the resting lens on the feature after a resize
      ensureMask();
      apply();
    };

    const onPointerMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      raw.x = e.clientX - r.left;
      raw.y = e.clientY - r.top;
      if (e.pointerType === "touch") s.lastTouch = performance.now();
      else s.hasMouse = true;
      if (s.target === 0 && s.scale < 0.02) {
        smooth.x = raw.x; // appear under the pointer instead of flying in from a corner
        smooth.y = raw.y;
      }
      s.pointerSeen = true;
      s.target = 1;
      wake();
    };
    const onPointerLeave = (e: PointerEvent) => {
      if (e.pointerType === "touch") return; // a lifted finger leaves the lens where it is
      s.target = 0;
      wake();
    };

    measure(); // also places the resting lens on the focal feature

    host.addEventListener("pointermove", onPointerMove, { passive: true });
    host.addEventListener("pointerdown", onPointerMove, { passive: true });
    host.addEventListener("pointerleave", onPointerLeave, { passive: true });

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(host);
    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => { s.visible = entry?.isIntersecting ?? true; if (s.visible) wake(); })
      : null;
    io?.observe(host);
    const onVisibility = () => { s.visible = !document.hidden; if (s.visible) wake(); };
    document.addEventListener("visibilitychange", onVisibility);

    if (reduced) {
      s.target = 1; // a still, resting lens: the idea is readable without any motion
      s.scale = 1;
      apply();
    } else if (!noHover) {
      // One short intro "peek" so people discover the interaction; skipped if they already moved the mouse.
      s.target = 1;
      wake();
      introTimer = window.setTimeout(() => {
        if (!s.pointerSeen) { s.target = 0; wake(); }
      }, 1900);
    } else {
      wake(); // touch: the lens drifts on its own
    }

    return () => {
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerdown", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      ro?.disconnect();
      io?.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
      if (introTimer) window.clearTimeout(introTimer);
    };
  }, []);

  return (
    <div ref={rootRef} className="reveal-layer pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" data-testid="reveal-layer">
      <LayerImage src={src} portraitSrc={portraitSrc} />
    </div>
  );
}
