# Design baseline — the look being replaced

Recorded 2026-11-16 on branch `redesign`, before the redesign (Phase 1). It follows Impeccable's `document`, `critique` and `audit` playbooks, run by hand from its reference files. Its launcher was not run, because it downloads a binary. This file is the **incumbent system as evidence and anti-reference**, not a guide. The new `DESIGN.md` at the repo root is written in Phase 2, once a direction is chosen.

Screenshots: `docs/design/baseline/*-fold.png` (first screen of 10 pages at 390×844 and 1440×900, Chromium, age gate dismissed).

## What stays

- **The six family colours and their inks** (`css/tokens.*.css`), tested by `colour-tokens-test` for 4.5:1. They are the brand's own.
- **The six-bar spectrum mark** (may be refined).
- **The live comparison** as the home page's proof: the strongest thing on the page.
- **The family photographs** (`images/families/`): real, on-brand, no leaves, no text.
- **The focus ring** decision (solid, 6.47:1 on paper) and every copy rule in `PRODUCT.md`.

## The incumbent system, as extracted

```yaml
colors:            # css/shell.*.css :root, plus literals
  paper: "#F3F3EE"
  surface: "#FFFFFF"
  surface-2: "#E9ECE6"
  ink: "#18211B"
  muted: "#536057"
  quiet: "#707B72"
  green: "#2F6144"        # the only accent; 17 literal uses besides the token
  green-dark: "#214A33"
  dark: "#141C17"         # footer, position band
  hero-field: "#0F150F"   # css/hero.*.css
  hero-accent: "#82C59A"
typography:
  family: "Inter, ui-sans-serif, system-ui, …"   # declared, never loaded: no @font-face, CSP blocks Google Fonts
  rendered: "the OS fallback (Segoe UI-like on Windows, SF on Apple)"
  mono: "ui-monospace stack — eyebrows, kickers, meta lines"
  account-page: "Space Grotesk / Space Mono"       # a second type system, also not loaded
  display: "clamp(3rem, 7.4vw, 5.25rem), weight 800, tracking -.045em"
  section-title: "clamp(2rem, 5vw, 3.625rem), line-height 1.03"
  sizes-in-use: 25 distinct font-size values; weights 500/600/650/700/750/800/850
rounded: "12 distinct radii: 3, 10, 11, 12, 13, 14, 16, 18, 20px, .4rem, 50%, 999px"
elevation: "one soft shadow (--shadow) plus a heavy hero-card shadow; mostly 1px borders"
layout: "max 1160px, 86px section padding, ~16 ad-hoc breakpoints between 390 and 900px"
```

## AI tells found (frontend-design and Hallmark lists)

| Tell | Where | Count |
|---|---|---|
| Tracked all-caps mono eyebrow above headings | almost every section, every page | 72 `.eyebrow` uses |
| Middle-dot meta strings ("A · B · C") | hero note, footer, cards | 66 |
| `→` glued to link text | "Learn more →", app tabs | 23 |
| The SaaS card kit: identical rounded white cards for everything | steps, families, dispensaries (six identical text cards), learn | 74 `.card` uses |
| 01/02/03 numbered markers | home steps (a real sequence, so acceptable); "Guide 01" (not a sequence) | 2 places |
| Near-black field with one bright green accent | hero, position band, final CTA | 3 bands |
| Glyph-as-icon tiles (⌁ ◌ ≠) | trust strip | 3 |
| Big number + small label + gradient | demo card score | 1 (earned: it is the real product) |

## Critique (Impeccable, Nielsen heuristics 0–4)

**Home** (Persuade; 7 and 10 n/a): visibility 3, real-world match 2 ("How loud is it?" sells loudness, but the product compares shape and keeps loudness separate), control 3, consistency 2, error prevention 3, recognition 3, minimalism 2, error recovery 3 — **21/32 (66%), Acceptable.**

**App `/app`** (Operate): 3, 3, 3, 2, 3, 3, flexibility 2, minimalism 2, 3, 3 — **27/40, Acceptable.** On a phone, "Add a report", the saved palate and the account controls all come before "Try a sample" and the result. The page is one 3,336px column, and the sample pickers and the family table scroll sideways with clipped edges.

**Dispensaries** (Persuade; 7, 9, 10 n/a): 3, 3, 3, 2, 3, 3, minimalism 2 — **19/28 (68%), Acceptable.** Six equal-weight text cards give no order of argument; the strongest facts (the panel is the shopper's browser, the pilot is pre-registered) are buried at card level. The widget pictures are small and the vote card is mostly empty.

**Read pages** (learn, aromas, methodology, about): the type does the work, and they are the most finished surfaces. The weak spots are the mono labels and the card-boxed "In short".

## Audit (Impeccable, 0–4 per dimension)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Focus and contrast are tested and strong. Nav and tab targets are 38–40px against the 44px phone goal; 17 text runs under 12px on the home page. |
| 2 | Performance | 4 | Home is under 40 KB transferred; AVIF/WebP photos; no web font cost (because there is no web font). |
| 3 | Theming | 2 | Family colours have one home, but there is no type, spacing, radius or elevation scale: about 40 literal hexes, 12 radii, 25 font sizes, two font systems. |
| 4 | Responsive | 2 | **24 of 26 pages have no mobile menu**: on a phone the nav wraps into a block about 160px tall above the content (home and `/app` use the menu header). |
| 5 | Implementation integrity | 2 | Coherent and careful, but generic: it reads as the template described in the tells table, not as NOSE. |
| **Total** | | **13/20** | **Acceptable: significant work needed** |

**Issues by severity:** P0 none. P1 ×3: no mobile menu on 24 pages; no loaded typeface (the brand renders in whatever the OS has); phone order of `/app`. P2 ×4: template chrome (eyebrows, dots, arrows); the card kit; no scale tokens; sub-12px text. P3 ×2: glyph icons; "Guide 01" numbering.

## Constraints the replacement must meet

- CSP `'self'` only: fonts self-hosted in the repo (open licence, `font-src` falls under `default-src 'self'`), no CDN, no inline styles or scripts.
- `gates.sh` green: the colour-token test, effect-word tests and `page-chrome-test` (the shared header and footer).
- Phone first, 44px targets, reduced motion, 4.5:1 text.
- No invented proof of any kind (`PRODUCT.md`, Evidence on Hand).
