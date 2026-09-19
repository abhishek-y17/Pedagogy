# Pedagogy logo assets

Generated from the high-resolution PNG Abhi supplied (1448×1086, already
transparent). The previous `pedagogy-logo.svg` in the repo was a 180×75 raster
wrapped in an SVG `<pattern>` fill — no vector data at all. These replace it.

**What these are:** a vector *trace* of the supplied raster, colour-separated
into the two brand inks and refitted as real paths. At every size the app uses
it is indistinguishable from the source (see the comparison sheet). It is not
the original master artwork — if Pedagogy can supply the true AI/EPS/PDF, swap
these out. Nothing was redrawn or restyled by hand; shapes and colours are the
client's.

Brand inks measured from the source:

| | hex |
|---|---|
| Pedagogy blue | `#2053AE` |
| Pedagogy black | `#141414` |

## Files

| file | use |
|---|---|
| `pedagogy-logo.svg` | full lockup, two-colour, transparent. Default. |
| `pedagogy-logo-mono.svg` | full lockup, `currentColor`. For the green band and any reversed context. |
| `pedagogy-mark.svg` | emblem only, two-colour. Small sizes. |
| `pedagogy-mark-mono.svg` | emblem only, `currentColor`. |
| `pedagogy-wordmark.svg` | wordmark only, if the emblem is already on screen. |
| `pedagogy-wordmark-mono.svg` | wordmark only, `currentColor`. |
| `pedagogy-logo.png` / `@2x` / `@3x` | transparent raster fallback (320 / 640 / 960 wide). |
| `pedagogy-mark.png` / `@2x` / `@3x` | transparent raster fallback (96 / 192 / 288). |
| `pedagogy-logo-white@2x.png` | pre-rendered white lockup, if a raster is needed on dark. |
| `favicon.svg` | mark, transparent. |
| `favicon-16/32/48.png` | raster favicons. |
| `apple-touch-icon.png` | 180×180, opaque white background — iOS composites it, so it needs one. |

Every SVG has a tight `viewBox`, no `width`/`height` attributes, and no
background rect. Size them in CSS.

## Size rules — measured, not guessed

- **Lockup is legible down to ~180px wide.** At 130px the "EDUCATION" subline
  starts to break up.
- **Below ~150px, switch to the mark.**
- **The mark needs 32px minimum.** Below that the P/E/S counters fill in and it
  turns into a blob. It is a detailed emblem; it does not survive 16px, which
  is why `favicon-16.png` is soft. That is inherent to the artwork, not the
  trace.
- In the dark-green footer band, prefer `pedagogy-logo-mono.svg` over the mark
  alone — the lockup reads better at band height than a small emblem does.

## Clear space

Keep padding equal to the emblem's radius on all sides. No border, no backing
plate, no rounded container.

## Sign-off note

The mono variants are derivatives of the client's mark. They are the standard
single-colour treatment and nothing was reshaped, but flag them to Pedagogy for
approval before the event.
