# Product

<!-- impeccable:product-schema 1 -->

Written 2026-11-16 with Impeccable's `init` playbook for the redesign on branch `redesign`. Product truth only: the visual world is chosen later, in Phase 2. Where this file and `CLAUDE.md` or `PARSER-HANDOFF.md` disagree, those files win.

## Platform

web

## Users

- **Primary: the shopper.** An adult (21+) in a legal market who buys cannabis flower and has stopped trusting strain names. They often use NOSE **on a phone, at the counter or in the aisle**, scanning the QR code on a jar's lab report or pasting its link. Their job: "Will this jar smell and taste like the ones I already liked?" (confirmed 2026-11-16: shoppers first, phone first).
- **Secondary: the dispensary.** A store's owner, marketing lead or web team deciding whether to put the `<nose-matches>` widget on their menu and run the pilot. They read on a desktop, weigh compliance and integration cost, and need to trust the method before they trust the product.

## Product Purpose

NOSE reads the terpene panel on a jar's certificate of analysis (COA), turns it into an aroma fingerprint, builds a palate from jars a person liked, and scores other jars by how alike their aroma is. Success for a shopper is a confident next purchase made from the lab report, not the name. Success for a store is a pilot that is pre-registered, read once and published whatever it shows.

## Positioning

- It compares **the lab report for that exact batch**, never the strain name.
- It compares **shape, not loudness**: each panel is converted to shares of its own total, with total terpenes kept as a separate intensity axis.
- It **refuses to predict effects**, and says so. Competitors sell outcomes; NOSE sells only what a report can support.
- It **says its uncertainty out loud**: the match score is a hypothesis that has not been validated at scale.

## Operating Context

- Shoppers arrive with a jar in hand, a COA QR code, a COA link or PDF, or typed values. Sample profiles let a first-time visitor try a match without a report.
- A palate stays in the browser unless the person exports it or saves it to an account.
- Dispensaries embed a pinned, hash-checked script release, upload a catalog from their server, and send a compliance kit to their regulator (Florida wording supported).
- Pages are reached from search (learn guides, aroma family pages) as well as from in-store scans.

## Capabilities and Constraints

- **Stack (existing):** hand-written static HTML at the repo root, plain CSS and JS bundles with content-hash names (`build.sh` renames them and rewrites references), Netlify Functions on Node 24, Supabase Postgres. No framework, no bundler.
- **Security policy:** `_headers` CSP is `'self'` only for scripts, styles, images and connections. No inline scripts, no inline styles, no third-party fonts or CDNs. Any font or library must be self-hosted and, for scripts, pinned by hash.
- **Gates:** `bash scripts/gates.sh` (41 gates) must end `ALL GATES GREEN`; `bash build.sh` must end `OK — ready to deploy`. Copy is tested for effect words; the six family colours are tested against `css/tokens.*.css` and for 4.5:1 contrast.
- **Deploy:** a push to `main` deploys. Redesign work stays on `redesign` until a coherent set of pages is ready.
- **Terminology:** COA / lab report, terpene panel, palate, jar, aroma family, match. The six families are citrus, earthy, spice, pine, floral, herbal. Match bands as users see them: Close match (≥ 0.90), Related profile (≥ 0.75), Partial overlap (≥ 0.55), Different profile.
- **Surfaces:** home, `/app` matcher, aroma families (index plus six), learn (index plus six guides), methodology, about, dispensaries, B2B demo, account (sign-in, confirmed, reset), privacy, terms, 404, and the 21+ age gate.

## Brand Commitments

- **Aroma and flavour only. Never claim or imply effects.** No words about relaxing, energising, focus, calm, sleep or the high. The only allowed mentions are refusals: "NOSE compares aroma, not your high" and "We won't predict your high" (decided 2026-11-14).
- **Nothing made up.** No fabricated statistics, user counts, ratings, testimonials, customer logos, credentials or case studies.
- **Say uncertainty out loud.** The match score is labelled a hypothesis wherever it appears.
- **Strain names are unreliable**; only the batch's lab report is trusted.
- **AI-generated imagery:** no cannabis leaves, and no text baked into an image.
- **The six family colours** in `css/tokens.*.css` are the brand's own and stay. Their inks hold 4.5:1.
- **Voice:** plain, first-person-plural, dry, specific. Explains the method instead of selling. Refuses claims calmly. Run by Chris Carreon; contact@nose-app.com.
- **Name and mark:** "NOSE", with the six-bar spectrum mark (one bar per family). The mark may be refined, but not replaced without a decision.

## Evidence on Hand

- **Real:** third-party lab reports (56 parsed fixtures across many labs), a published methodology (`/methodology/`), six learn guides, a working matcher with sample profiles, a working widget demo on a made-up test store whose every terpene panel is a real report (`/b2b/demo/`), widget screenshots (`images/dispensaries/`), and six family photographs (`images/families/`).
- **Absent, and must not be invented (confirmed 2026-11-16):** user counts, ratings, testimonials, press, customer or dispensary logos, pilot results, lab partnerships or endorsements. A premium look has to come from craft, the method and the live product, not from proof that doesn't exist.

## Product Principles

1. **The lab report is the authority.** Every screen traces a claim back to a measured panel.
2. **Show the product, not the promise.** The live match is the best argument NOSE has.
3. **Refuse in plain sight.** A stated refusal (effects, guesses, missing panels) builds more trust than a hidden one.
4. **Uncertainty is part of the answer.** Confidence and limits sit next to every score.
5. **Private by default.** Nothing about a person is needed to use it.

## Accessibility & Inclusion

- WCAG 2.2 AA: text at 4.5:1, focus indicators at 3:1, visible keyboard focus everywhere.
- Usable one-handed on a phone in a bright store: touch targets of 44px or more, no hover-only information.
- `prefers-reduced-motion` respected; content readable with scripts off where the page isn't the app itself.
- 21+ only, enforced by the age gate; the site is educational, not medical advice.
