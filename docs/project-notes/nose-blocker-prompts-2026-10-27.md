# NOSE — Opus prompts for the seven pitch blockers (2026-10-27)

Full prompts, with the preamble, in the Claude Doc: https://claude.ai/artifact/225JcjoPK4VBvjZJUBTo3o

Written at `6f8d83e` (= `live`; no commits since 2026-10-16, so M4–M7 from `claude/nose-m-cleanup-prompts-2026-10-15.md` have not run). Blockers are from `claude/nose-b2b-readiness-audit-2026-10-26.md`.

| Prompt | Blocker | Commits? |
|---|---|---|
| B1 | Terms page: legal identity, governing law, effective date, business customers; "Before launch" box removed | yes |
| B2.1 | Dispensary pilot agreement, draft for counsel | no (document) |
| B2.2 | Privacy page describes the end-of-pilot export; groups sentence reconciled | yes |
| B3 | Florida counsel packet: 64ER25-6 / Rule 64-4.227 text, every Florida string, kit screenshots, questions, firm list | no (document) |
| B4 | Flower score wording (options A–D, user picks), widget-only, shipped as pinned release 2; match-math untouched; vote payload unchanged | yes + release |
| B5 | WebKit and Firefox added to b2b-widget-test and input-paths-test and CI; iPhone check | yes |
| B6 | After M4: privacy-page backups paragraph first, then Supabase paid plan, Netlify usage alert, keep-awake decision | yes |
| B7 | After M6: /dispensaries/ page, demo pitch view (?view=pitch), true About | yes |

**Order:** M4 → B6 → M5 → B5 → B4 → M6 → B7 → B1 → B2.1/B2.2 → B3 last. M7 before everything or after everything.

**User must supply:** B1 legal entity facts; B2.1 pilot fee and signer; B4 option choice and attribution line; B6 plans and spend limit; B7 true About story, names, dispensary contact, price or none.
