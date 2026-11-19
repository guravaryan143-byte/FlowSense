# Hero artwork

The two images behind the landing page's spotlight are **generated from FlowSense's own simulated road network**, not stock photos:

| Layer | What it shows |
|---|---|
| `*-street.webp` | The fictional city at dusk. Vehicle density on every road follows the busiest moment in the simulated history. |
| `*-signal.webp` | The same streets as FlowSense reads them: congestion ribbons (the app's own colour ramp), heat, and signal nodes. |

Both layers use one projection, so the cursor spotlight reveals exactly the same streets. Nothing here is real traffic.

## Regenerate

`network.json` is a snapshot already committed here, so you can re-render without a database:

```bash
pip install pillow numpy
python docs/hero-art/render_hero.py all          # writes docs/hero-art/out/*.webp  (about 10 s)
cp docs/hero-art/out/hero-*.webp frontend/src/assets/hero/
```

To take a fresh snapshot from your own seeded database first (needs the backend environment, `DATABASE_URL` set):

```bash
cd backend && python ../docs/hero-art/export_network.py
```

Tweak framing in the `render(...)` calls at the bottom of `render_hero.py`. If you move the artwork, update the focal points
(`FOCUS` in `frontend/src/components/landing/Hero.tsx`): they are fractions of the image where several ribbons meet.
