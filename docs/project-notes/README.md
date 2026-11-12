# NOSE project notes

Copies of the 12 docs from the NOSE project on claude.ai, plus the 2 longer Claude Docs they point to (14 files in all), taken 2026-11-11, so Claude Code can read them from inside the repo.

**Three of them are kept on the local computer only and are not on GitHub**, because this repository is public and they list open weaknesses with file and line numbers: `nose-security-audit-2026-10-15.md`, `nose-site-code-audit-pitch-readiness-2026-10-26.md` and `nose-b2b-readiness-audit-2026-10-26.md`. `.gitignore` names all three. A fresh clone won't have them.

They are dated snapshots (2026-09-23 to 2026-10-27), not live instructions. Before running any prompt in them, check `PARSER-HANDOFF.md` §13 and §14 (and `docs/handoff/` if the M7 split has run) to see what has already been built. Per the 2026-10-27 doc, M4 to M7 had not run at that point.

The docs refer to each other by their old Project paths, such as `claude/nose-architecture-review-2026-10-15.md`. Each of those is a file in this folder, with the `claude/` prefix dropped.

| File | What it is |
|---|---|
| `nose-review-2026-09-23.md` | Review of the storage build, plus eight follow-up prompts |
| `nose-b2b-build-prompts-2026-10-05.md` | Ten prompts that build the dispensary (B2B) module |
| `nose-flmedicaltrees-research-2026-10-07.md` | Research findings from five r/FLMedicalTrees threads |
| `nose-research-build-prompts-2026-10-07.md` | Prompts R1 to R8, built from that research |
| `nose-b2b-tested-day-prompt-2026-10-14.md` | One prompt that carries `testedOn` into dispensary catalogs |
| `nose-security-audit-2026-10-15.md` | Security audit, 17 findings |
| `nose-architecture-review-2026-10-15.md` | Architecture review and refactoring roadmap |
| `nose-xs-cleanup-prompts-2026-10-15.md` | Four extra-small cleanup prompts |
| `nose-s-cleanup-prompts-2026-10-15.md` | Three small cleanup prompts |
| `nose-m-cleanup-prompts-2026-10-15.md` | Seven medium cleanup prompts (M1 to M7) |
| `nose-b2b-readiness-audit-2026-10-26.md` | Site, code and B2B readiness audit, with seven pitch blockers |
| `nose-blocker-prompts-2026-10-27.md` | Index of the blocker prompts B1 to B7 |
| `nose-blocker-prompts-FULL-2026-10-27.md` | The full blocker prompts B1 to B7, with the preamble (the longer doc the index above links to) |
| `nose-site-code-audit-pitch-readiness-2026-10-26.md` | The full readiness audit write-up (the longer doc the readiness audit above links to): verdict, live site audit, code review findings 1 to 10, handoff notes, pitch checklists, iPhone test and coverage-report steps |

## Notes on the two longer docs

- `nose-blocker-prompts-FULL-2026-10-27.md` is an exact Markdown export of the Claude Doc.
- `nose-site-code-audit-pitch-readiness-2026-10-26.md` was rebuilt from the doc's PDF export, so the tables were re-typed as Markdown. Wording follows the original; check the Claude Doc if an exact figure matters: https://claude.ai/artifact/HoTkHXDzorBj1J5jecXRTV
- Original blocker prompts doc: https://claude.ai/artifact/225JcjoPK4VBvjZJUBTo3o

## Not included

The Project's 21 screenshots (`2.1.jpg`, `3.1.PNG` and so on) are not in this folder.
