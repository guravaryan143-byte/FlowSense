import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { CSS_MASK, coverPoint, driftPosition, lerp, maskAlpha, RevealLayer, smoothing, spotlightDiameter, type FocusPoint } from "./RevealLayer";

/* ------------------------------------------------------------------ pure helpers */

describe("spotlight maths", () => {
  it("lerp moves a fraction of the way", () => {
    expect(lerp(0, 100, 0)).toBe(0);
    expect(lerp(0, 100, 0.25)).toBe(25);
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it("smoothing is frame-rate independent: two 8 ms steps close the same gap as one 16 ms step", () => {
    const one = lerp(0, 100, smoothing(16, 7));
    const two = lerp(lerp(0, 100, smoothing(8, 7)), 100, smoothing(8, 7));
    expect(two).toBeCloseTo(one, 6);
    expect(smoothing(0, 7)).toBe(0);
    expect(smoothing(10_000, 7)).toBeCloseTo(1, 6);
  });

  it("spotlight diameter follows the hero but stays between 260 and 640 px", () => {
    expect(spotlightDiameter(390, 844)).toBe(260); // phone: never tiny
    expect(spotlightDiameter(1440, 900)).toBe(558);
    expect(spotlightDiameter(3840, 2160)).toBe(640); // huge screen: capped
  });

  it("mask alpha is a solid core that eases smoothly to nothing", () => {
    expect(maskAlpha(0)).toBe(1);
    expect(maskAlpha(0.18)).toBe(1);
    expect(maskAlpha(1)).toBeCloseTo(0, 10);
    let prev = 1;
    for (let t = 0.2; t <= 1; t += 0.05) {
      const a = maskAlpha(t);
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
  });

  it("coverPoint reproduces object-fit: cover (centred crop)", () => {
    // 2560x1440 art in a 1440x900 box is scaled by 0.625 -> 1600x900, so 80 px is cropped from each side.
    const p = coverPoint(0.77, 0.689, 2560, 1440, 1440, 900);
    expect(p.x).toBeCloseTo(-80 + 0.77 * 1600, 6);
    expect(p.y).toBeCloseTo(0.689 * 900, 6);
    // the exact centre of the image is always the centre of the box
    const c = coverPoint(0.5, 0.5, 1200, 1800, 390, 844);
    expect(c.x).toBeCloseTo(195, 6);
    expect(c.y).toBeCloseTo(422, 6);
  });

  it("drift wanders around a centre and never leaves the hero", () => {
    const centre = { x: 700, y: 400 };
    const xs: number[] = [];
    for (let t = 0; t < 120_000; t += 500) {
      const p = driftPosition(t, 1000, 600, centre);
      expect(p.x).toBeGreaterThanOrEqual(80);
      expect(p.x).toBeLessThanOrEqual(920);
      expect(p.y).toBeGreaterThanOrEqual(60);
      expect(p.y).toBeLessThanOrEqual(540);
      xs.push(p.x);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(100); // it really moves
  });
});

/* ------------------------------------------------------------------ component behaviour */

const BOX = { width: 1000, height: 600, left: 0, top: 0, right: 1000, bottom: 600, x: 0, y: 0, toJSON() {} };
const LANDSCAPE: FocusPoint = { x: 0.77, y: 0.689, imageWidth: 2560, imageHeight: 1440 };
const PORTRAIT: FocusPoint = { x: 0.374, y: 0.304, imageWidth: 1200, imageHeight: 1800 };

let frames: FrameRequestCallback[] = [];
let clock = 0;
let styles: Map<string, string>;
let ctx: { createRadialGradient: ReturnType<typeof vi.fn>; clearRect: ReturnType<typeof vi.fn>; fillRect: ReturnType<typeof vi.fn>; fillStyle: unknown };
let rafSpy: MockInstance<typeof window.requestAnimationFrame>;
let cafSpy: MockInstance<typeof window.cancelAnimationFrame>;

function media(flags: { hoverNone?: boolean; reduced?: boolean; portrait?: boolean } = {}) {
  window.matchMedia = ((q: string) => ({
    matches: (q.includes("hover: none") && !!flags.hoverNone) || (q.includes("prefers-reduced-motion") && !!flags.reduced) || (q.includes("max-aspect-ratio") && !!flags.portrait),
    media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

/** Run n animation frames, `dt` ms apart. */
function run(n: number, dt = 16) {
  for (let i = 0; i < n; i += 1) {
    const due = frames;
    frames = [];
    clock += dt;
    due.forEach((cb) => cb(clock));
  }
}

const num = (v: string | undefined) => (v ?? "").split(" ").map((p) => parseFloat(p));
/** Centre of the lens in hero pixels, read from the mask the component last wrote. */
function lens() {
  const [w] = num(styles.get("mask-size"));
  const [x, y] = num(styles.get("mask-position"));
  return { x: x + w / 2, y: y + w / 2, size: w };
}

function pointer(host: Element, type: "pointermove" | "pointerleave" | "pointerdown", x: number, y: number, pointerType = "mouse") {
  host.dispatchEvent(Object.assign(new Event(type), { clientX: x, clientY: y, pointerType }));
}

function mount(props: Partial<Parameters<typeof RevealLayer>[0]> = {}) {
  const view = render(<section data-testid="host"><RevealLayer src="/street.webp" portraitSrc="/port.webp" {...props} /></section>);
  return { ...view, host: view.getByTestId("host"), layer: view.getByTestId("reveal-layer") };
}

beforeEach(() => {
  frames = [];
  clock = 0;
  styles = new Map();
  media();
  const gradient = { addColorStop: vi.fn() };
  ctx = { createRadialGradient: vi.fn(() => gradient), clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: "" };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AAAA");
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(BOX as DOMRect);
  vi.spyOn(CSSStyleDeclaration.prototype, "setProperty").mockImplementation((prop: string, value: string | null) => { styles.set(prop, String(value)); });
  rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { frames.push(cb); return frames.length; });
  cafSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("RevealLayer", () => {
  it("is purely decorative and offers a portrait framing to phones", () => {
    const { layer } = mount();
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(layer.querySelector("img")).toHaveAttribute("alt", "");
    expect(layer.querySelector("source")).toHaveAttribute("srcset", "/port.webp");
  });

  it("paints the soft mask once, then only moves it", () => {
    const { host } = mount();
    run(5);
    pointer(host, "pointermove", 700, 300);
    run(30);
    pointer(host, "pointermove", 200, 450);
    run(30);
    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(1);
    expect(styles.get("mask-image")).toMatch(/^url\(/);
    expect(styles.get("-webkit-mask-image")).toBe(styles.get("mask-image")); // Safari still needs the prefix
    expect(styles.get("-webkit-mask-position")).toBe(styles.get("mask-position"));
    expect(styles.get("mask-repeat")).toBe("no-repeat");
  });

  it("trails the cursor smoothly and settles on it", () => {
    const { host } = mount();
    run(120); // intro peek fully grown, resting at the default spot (640, 300)
    pointer(host, "pointermove", 900, 100);
    run(1);
    const first = lens();
    expect(first.x).toBeGreaterThan(640);
    expect(first.x).toBeLessThan(900); // eased, not a jump
    run(200);
    const end = lens();
    expect(end.x).toBeCloseTo(900, 0);
    expect(end.y).toBeCloseTo(100, 0);
  });

  it("stops its own animation loop once nothing is moving", () => {
    const { host } = mount();
    pointer(host, "pointermove", 500, 300);
    run(400);
    expect(frames).toHaveLength(0); // no frames queued: zero idle cost
    const calls = rafSpy.mock.calls.length;
    pointer(host, "pointermove", 520, 310); // and it wakes up again on demand
    expect(rafSpy.mock.calls.length).toBe(calls + 1);
  });

  it("fades the lens away when the mouse leaves", () => {
    const { host } = mount();
    pointer(host, "pointermove", 500, 300);
    run(100);
    expect(lens().size).toBeGreaterThan(300);
    pointer(host, "pointerleave", 500, 300);
    run(200);
    expect(lens().size).toBeLessThan(1);
  });

  it("a lifted finger leaves the lens where it is", () => {
    const { host } = mount();
    pointer(host, "pointermove", 500, 300, "touch");
    run(100);
    const before = lens().size;
    pointer(host, "pointerleave", 500, 300, "touch");
    run(100);
    expect(lens().size).toBeCloseTo(before, 0);
  });

  it("touch-first screens drift on their own, and a real mouse takes over for good", () => {
    media({ hoverNone: true });
    const { host } = mount();
    run(30);
    const a = lens();
    run(200);
    const b = lens();
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(5); // drifting without any input

    pointer(host, "pointermove", 200, 200, "mouse"); // e.g. a hybrid laptop
    run(300);
    expect(lens().x).toBeCloseTo(200, 0);
    run(900); // fifteen more seconds of idle mouse: the lens must NOT wander off
    expect(lens().x).toBeCloseTo(200, 0);
    expect(lens().y).toBeCloseTo(200, 0);
  });

  it("reduced motion: a still lens with no animation loop, and 1:1 pointer movement", () => {
    media({ reduced: true });
    const { host } = mount();
    expect(frames).toHaveLength(0);
    expect(lens().size).toBe(spotlightDiameter(1000, 600)); // already fully open
    pointer(host, "pointermove", 321, 123);
    run(1);
    expect(lens().x).toBeCloseTo(321, 5); // no easing at all
    expect(lens().y).toBeCloseTo(123, 5);
  });

  it("rests on the artwork's focal feature, whatever the crop", () => {
    media({ reduced: true });
    mount({ focus: { landscape: LANDSCAPE, portrait: PORTRAIT } });
    const want = coverPoint(LANDSCAPE.x, LANDSCAPE.y, LANDSCAPE.imageWidth, LANDSCAPE.imageHeight, 1000, 600);
    expect(lens().x).toBeCloseTo(want.x, 1);
    expect(lens().y).toBeCloseTo(want.y, 1);
  });

  it("uses the portrait focal point on tall screens", () => {
    media({ reduced: true, portrait: true });
    mount({ focus: { landscape: LANDSCAPE, portrait: PORTRAIT } });
    const want = coverPoint(PORTRAIT.x, PORTRAIT.y, PORTRAIT.imageWidth, PORTRAIT.imageHeight, 1000, 600);
    expect(lens().x).toBeCloseTo(want.x, 1);
    expect(lens().y).toBeCloseTo(want.y, 1);
  });

  it("falls back to a CSS-only gradient mask if canvas is unavailable", () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    mount();
    run(3);
    expect(styles.get("mask-image")).toBe(CSS_MASK);
    expect(styles.get("-webkit-mask-image")).toBe(CSS_MASK);
  });

  it("removes its listeners and cancels animation frames on unmount", () => {
    const { host, unmount } = mount();
    expect(frames.length).toBeGreaterThan(0); // the intro peek is animating
    unmount();
    expect(cafSpy).toHaveBeenCalled();
    const calls = rafSpy.mock.calls.length;
    pointer(host, "pointermove", 400, 400);
    pointer(host, "pointerdown", 400, 400);
    expect(rafSpy.mock.calls.length).toBe(calls); // nothing is listening any more
  });
});
