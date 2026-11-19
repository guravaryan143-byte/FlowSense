"""
Render the two registered hero layers from FlowSense's own SIMULATED road network.

  layer A  "street"  - the fictional city at dusk: blocks, asphalt, streetlights, headlights.
                       Vehicle density on every road comes from the busiest recorded simulated moment.
  layer B  "signal"  - the same geometry as FlowSense sees it: congestion ribbons, signal nodes, heat.

Both layers use one projection, so the cursor spotlight reveals exactly the same streets.
Nothing here is real traffic; the page says so.
"""
import json, math, pathlib, random, sys
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)
D = json.load(open(HERE / "network.json"))
NODES = {n["id"]: n for n in D["nodes"]}
ROADS = D["roads"]
TRAFFIC = {t["road_id"]: t for t in D["traffic"]}

LAT0 = float(np.mean([n["latitude"] for n in D["nodes"]]))
LON0 = float(np.mean([n["longitude"] for n in D["nodes"]]))
KX, KY = math.cos(math.radians(LAT0)) * 111320.0, 110540.0

# congestion ramp = the app's own flow tokens (tailwind.config.js)
RAMP = {"free_flow": (34, 197, 94), "moderate": (234, 179, 8), "heavy": (249, 115, 22), "severe": (239, 68, 68), "closed": (100, 116, 139)}
WIDTH_PX = {"arterial": 58, "collector": 44, "local": 31}   # stylised, 1x pixels
AMBER, CYAN = (242, 180, 90), (34, 211, 238)


def hexrgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def seg_dist(px, py, ax, ay, bx, by):
    """vectorised distance from points (px,py) to segment a-b"""
    abx, aby = bx - ax, by - ay
    t = np.clip(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby + 1e-9), 0, 1)
    return np.hypot(px - (ax + t * abx), py - (ay + t * aby))


def render(name, W, H, rot_deg, ppm, cx, cy, seed, SS=2):
    rnd = random.Random(seed)
    rng = np.random.default_rng(seed)
    w, h = W * SS, H * SS
    rot = math.radians(rot_deg)
    cs, sn = math.cos(rot), math.sin(rot)

    def m2px(xm, ym):
        xr, yr = xm * cs - ym * sn, xm * sn + ym * cs
        return (cx * SS + xr * ppm * SS, cy * SS + yr * ppm * SS)

    def ll2px(lat, lon): return m2px((lon - LON0) * KX, -(lat - LAT0) * KY)

    # ---- geometry in pixels (supersampled) and meters ------------------------------------------
    roads = []
    for r in ROADS:
        pts_m = [((lon - LON0) * KX, -(lat - LAT0) * KY) for lat, lon in r["geometry"]]
        pts = [m2px(*p) for p in pts_m]
        roads.append({**r, "pts": pts, "pts_m": pts_m, "w": WIDTH_PX[r["road_type"]] * SS, "t": TRAFFIC[r["id"]]})

    # ---- city blocks (shared by both layers so they register) ---------------------------------
    segs_m = []
    for r in roads:
        half_m = r["w"] / SS / ppm / 2
        for a, b in zip(r["pts_m"][:-1], r["pts_m"][1:]):
            segs_m.append((a[0], a[1], b[0], b[1], half_m))
    segs = np.array(segs_m)
    lots = []
    step = 44.0
    span = 3400
    gy = -span
    while gy < span:
        gx = -span
        while gx < span:
            x = gx + rnd.uniform(-5, 5); y = gy + rnd.uniform(-5, 5)
            k = rnd.random(); lo, hi = (14, 24) if k < 0.50 else ((24, 36) if k < 0.88 else (40, 58)); lw, lh = rnd.uniform(lo, hi), rnd.uniform(lo, hi)
            px, py = m2px(x, y)
            if -80 < px < w + 80 and -80 < py < h + 80:
                d = np.min(seg_dist(x, y, segs[:, 0], segs[:, 1], segs[:, 2], segs[:, 3]) - segs[:, 4])
                if d > max(lw, lh) * 0.62 + 3:
                    lots.append((x, y, lw, lh, rnd.random(), rnd.random()))
            gx += step
        gy += step

    def quad(x, y, lw, lh, grow=0.0):
        pts = []
        for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            pts.append(m2px(x + dx * (lw / 2 + grow), y + dy * (lh / 2 + grow)))
        return pts

    def polyline(draw, pts, fill, width):
        draw.line(pts, fill=fill, width=int(width), joint="curve")
        for p in (pts[0], pts[-1]):  # round caps
            draw.ellipse((p[0] - width / 2, p[1] - width / 2, p[0] + width / 2, p[1] + width / 2), fill=fill)

    def along(pts, spacing, offset=0.0):
        """points along a polyline every `spacing` px, with a normal offset"""
        out = []
        for a, b in zip(pts[:-1], pts[1:]):
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            if L < 1: continue
            ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
            nx, ny = -uy, ux
            d = spacing / 2
            while d < L:
                out.append((a[0] + ux * d + nx * offset, a[1] + uy * d + ny * offset, ux, uy, d / L))
                d += spacing
        return out

    nodes_px = {i: ll2px(n["latitude"], n["longitude"]) for i, n in NODES.items()}

    # =================================================================== LAYER A : street at dusk
    base = Image.new("RGB", (w, h))
    bd = ImageDraw.Draw(base)
    top, bot = np.array(hexrgb("#060b17")), np.array(hexrgb("#0c1730"))
    grad = (top[None, :] + (bot - top)[None, :] * np.linspace(0, 1, h)[:, None])[:, None, :].repeat(w, axis=1)
    base = Image.fromarray(grad.astype("uint8"))
    bd = ImageDraw.Draw(base)

    for x, y, lw, lh, a, b in lots:                      # block shadows then roofs
        bd.polygon(quad(x + 4, y + 5, lw, lh), fill=(4, 8, 17))
    for x, y, lw, lh, a, b in lots:
        lift = 3 + int(a * 15)
        roof = (9 + lift // 3, 17 + lift // 3 + 1, 33 + lift)
        bd.polygon(quad(x, y, lw, lh), fill=roof)
        bd.polygon(quad(x, y, lw * 0.62, lh * 0.62), fill=(roof[0] + 2, roof[1] + 3, roof[2] + 5))

    for r in roads:                                      # kerb, asphalt, centre line
        polyline(bd, r["pts"], (30, 44, 78), r["w"] + 7 * SS)
    for r in roads:
        polyline(bd, r["pts"], (8, 13, 27), r["w"])
    for i, p in nodes_px.items():
        bd.ellipse((p[0] - 36 * SS, p[1] - 36 * SS, p[0] + 36 * SS, p[1] + 36 * SS), fill=(9, 15, 30), outline=(30, 44, 78), width=3 * SS)
    for r in roads:
        for x, y, ux, uy, _ in along(r["pts"], 38 * SS):
            bd.line((x - ux * 9 * SS, y - uy * 9 * SS, x + ux * 9 * SS, y + uy * 9 * SS), fill=(44, 62, 104), width=2 * SS)

    glow = Image.new("RGB", (w, h), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    core = Image.new("RGB", (w, h), (0, 0, 0))
    cd = ImageDraw.Draw(core)

    for x, y, lw, lh, a, b in lots:                      # lit windows
        if b < 0.16:
            px, py = m2px(x + rnd.uniform(-6, 6), y + rnd.uniform(-6, 6))
            s = rnd.uniform(1.6, 3.2) * SS
            col = tuple(int(c * (0.35 + 0.5 * a)) for c in AMBER)
            cd.rectangle((px - s, py - s, px + s, py + s), fill=col)

    for r in roads:                                      # sodium light spill
        polyline(gd, r['pts'], (26, 17, 7), r['w'] + 44 * SS)
    for r in roads:                                      # streetlights
        for side in (-1, 1):
            for x, y, ux, uy, _ in along(r["pts"], 46 * SS, side * (r["w"] / 2 + 5 * SS)):
                gd.ellipse((x - 5 * SS, y - 5 * SS, x + 5 * SS, y + 5 * SS), fill=(150, 98, 34))
                cd.ellipse((x - 1.6 * SS, y - 1.6 * SS, x + 1.6 * SS, y + 1.6 * SS), fill=(255, 226, 168))

    for r in roads:                                      # vehicles: count follows the simulated record
        t = r["t"]
        n_dir = int(min(62, max(4, t["vehicle_count"] * 0.7)))
        queued = t["congestion_level"] in ("heavy", "severe")
        for direction, col, lane in ((1, (255, 236, 190), 1), (-1, (255, 74, 62), -1)):
            for _ in range(n_dir):
                u = rnd.random()
                if queued and direction == 1: u = 1 - u ** 2.4 * 0.9      # tail-backs pile up at the downstream node
                pts = r["pts"] if direction == 1 else r["pts"][::-1]
                tot = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts[:-1], pts[1:]))
                target, acc = u * tot, 0.0
                for a, b in zip(pts[:-1], pts[1:]):
                    L = math.hypot(b[0] - a[0], b[1] - a[1])
                    if acc + L >= target and L > 0:
                        f = (target - acc) / L
                        ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
                        nx, ny = -uy, ux
                        off = lane * r["w"] * 0.22
                        x, y = a[0] + (b[0] - a[0]) * f + nx * off, a[1] + (b[1] - a[1]) * f + ny * off
                        ln = 10 * SS
                        gd.line((x, y, x + ux * (36 if direction == 1 else -8) * SS, y + uy * (36 if direction == 1 else -8) * SS), fill=tuple(int(c * 0.34) for c in col), width=int(7 * SS))
                        cd.line((x - ux * ln * 0.5, y - uy * ln * 0.5, x + ux * ln * 0.5, y + uy * ln * 0.5), fill=col, width=int(4 * SS))
                        break
                    acc += L

    for i, p in nodes_px.items():                        # signal heads
        phase = i % 2
        for k, (dx, dy) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1))):
            green = (k % 2 == phase)
            col = (60, 220, 120) if green else (255, 70, 60)
            x, y = p[0] + dx * 28 * SS, p[1] + dy * 28 * SS
            gd.ellipse((x - 6 * SS, y - 6 * SS, x + 6 * SS, y + 6 * SS), fill=tuple(int(c * 0.45) for c in col))
            cd.ellipse((x - 2 * SS, y - 2 * SS, x + 2 * SS, y + 2 * SS), fill=col)

    bloom = ImageChops.add(glow.filter(ImageFilter.GaussianBlur(10 * SS)), glow.filter(ImageFilter.GaussianBlur(34 * SS)))
    imgA = ImageChops.screen(ImageChops.screen(base, bloom), core.filter(ImageFilter.GaussianBlur(0.6 * SS)))

    # =================================================================== LAYER B : signal lens
    bg = np.array(hexrgb("#0a1a38"))
    imgB = Image.new("RGB", (w, h), tuple(bg))
    bd = ImageDraw.Draw(imgB)
    # rotated blueprint grid
    for k in range(-60, 61):
        o = k * 64 * SS
        for (x0, y0, x1, y1) in ((o, -w, o, h + w), (-w, o, w + w, o)):
            a = (x0 - w / 2) * cs - (y0 - h / 2) * sn + w / 2, (x0 - w / 2) * sn + (y0 - h / 2) * cs + h / 2
            b = (x1 - w / 2) * cs - (y1 - h / 2) * sn + w / 2, (x1 - w / 2) * sn + (y1 - h / 2) * cs + h / 2
            bd.line((a, b), fill=(26, 48, 92), width=max(1, int(1.5 * SS)))
    for x, y, lw, lh, a, b in lots:                      # ghosted block outlines
        bd.polygon(quad(x, y, lw, lh), outline=(40, 72, 128), fill=(9, 20, 44))
    for r in roads:                                      # ghosted corridor
        polyline(bd, r["pts"], (34, 62, 112), r["w"] + 6 * SS)
    for r in roads:
        polyline(bd, r["pts"], (7, 15, 33), r["w"] - 2 * SS)

    glowB = Image.new("RGB", (w, h), (0, 0, 0)); gB = ImageDraw.Draw(glowB)
    coreB = Image.new("RGB", (w, h), (0, 0, 0)); cB = ImageDraw.Draw(coreB)
    heat = Image.new("RGB", (w, h), (0, 0, 0)); hd = ImageDraw.Draw(heat)

    gap_px = {"free_flow": 46, "moderate": 28, "heavy": 17, "severe": 9, "closed": 60}
    for r in roads:
        lvl = r["t"]["congestion_level"]; col = RAMP[lvl]
        polyline(gB, r["pts"], tuple(int(c * 0.50) for c in col), 36 * SS)
        # dashed ribbon: tighter dashes = slower, denser traffic
        for x, y, ux, uy, _ in along(r["pts"], gap_px[lvl] * SS):
            cB.line((x - ux * 8 * SS, y - uy * 8 * SS, x + ux * 8 * SS, y + uy * 8 * SS), fill=col, width=int(11 * SS))
            if lvl == 'severe':
                cB.line((x - ux * 8 * SS, y - uy * 8 * SS, x + ux * 8 * SS, y + uy * 8 * SS), fill=(255, 214, 205), width=int(2.5 * SS))
            if lvl in ("free_flow", "moderate"):        # direction chevron
                cB.polygon([(x + ux * 14 * SS, y + uy * 14 * SS), (x + ux * 8 * SS - uy * 5 * SS, y + uy * 8 * SS + ux * 5 * SS), (x + ux * 8 * SS + uy * 5 * SS, y + uy * 8 * SS - ux * 5 * SS)], fill=col)
        if lvl in ("heavy", "severe"):                   # congestion heat at the middle of the road
            mid = r["pts"][len(r["pts"]) // 2]
            rad = (150 if lvl == "heavy" else 230) * SS
            hd.ellipse((mid[0] - rad, mid[1] - rad, mid[0] + rad, mid[1] + rad), fill=tuple(int(c * (0.62 if lvl == "severe" else 0.40)) for c in col))

    for i, p in nodes_px.items():                        # signal nodes: 4 phase arcs
        phase = i % 2
        for k in range(4):
            start = -45 + k * 90
            on = (k % 2 == phase)
            col = CYAN if on else (31, 62, 92)
            gB.arc((p[0] - 46 * SS, p[1] - 46 * SS, p[0] + 46 * SS, p[1] + 46 * SS), start + 6, start + 84, fill=tuple(int(c * 0.5) for c in col), width=int(12 * SS))
            cB.arc((p[0] - 46 * SS, p[1] - 46 * SS, p[0] + 46 * SS, p[1] + 46 * SS), start + 6, start + 84, fill=col, width=int(6 * SS))
        cB.ellipse((p[0] - 6 * SS, p[1] - 5 * SS, p[0] + 6 * SS, p[1] + 6 * SS), fill=(214, 247, 252))

    heat = heat.filter(ImageFilter.GaussianBlur(70 * SS))
    bloomB = ImageChops.add(glowB.filter(ImageFilter.GaussianBlur(9 * SS)), glowB.filter(ImageFilter.GaussianBlur(28 * SS)))
    imgB = ImageChops.screen(imgB, heat)
    imgB = ImageChops.screen(ImageChops.screen(imgB, bloomB), coreB.filter(ImageFilter.GaussianBlur(0.5 * SS)))

    # ---- shared finishing: vignette, tiny grain on A only, downsample ---------------------------
    yy, xx = np.mgrid[0:h, 0:w]
    v = np.clip(1.0 - 0.55 * (((xx - w * 0.55) / (w * 0.75)) ** 2 + ((yy - h * 0.5) / (h * 0.8)) ** 2), 0.25, 1.0)[:, :, None]
    outs = []
    for img, gr in ((imgA, 1.6), (imgB, 0.0)):
        arr = np.asarray(img).astype("float32") * v
        if gr: arr += rng.normal(0, gr, arr.shape[:2])[:, :, None]
        outs.append(Image.fromarray(np.clip(arr, 0, 255).astype("uint8")).resize((W, H), Image.LANCZOS))
    outs[0].save(str(OUT / f"{name}-street.webp"), quality=74, method=6)
    outs[1].save(str(OUT / f"{name}-signal.webp"), quality=76, method=6)
    outs[0].resize((W // 3, H // 3)).save(str(OUT / f"prev-{name}-street.png"))
    outs[1].resize((W // 3, H // 3)).save(str(OUT / f"prev-{name}-signal.png"))
    print(name, "done")


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which in ("land", "all"):
        render("hero-land", 2560, 1440, rot_deg=-14, ppm=1.18, cx=1500, cy=760, seed=11)
    if which in ("port", "all"):
        render("hero-port", 1200, 1800, rot_deg=-62, ppm=0.92, cx=560, cy=1080, seed=11)
