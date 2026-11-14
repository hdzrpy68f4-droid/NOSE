# NOSE

NOSE ([nose-app.com](https://nose-app.com)) matches cannabis jars by aroma. It reads the terpene panel from a jar's lab report (its certificate of analysis), builds a "palate" from jars a person likes, and scores other jars by how alike their terpene profiles are. It is about aroma and flavour only. It says nothing about how a product makes anyone feel.

The match score is a hypothesis. It has not been validated at scale, and the thumbs up and down on every result are how it gets tested. Strain names are not trusted; only the lab report for that jar is.

## Where to read next

- [`CLAUDE.md`](CLAUDE.md): the commands, the deploy model, the architecture and the rules that must hold.
- [`PARSER-HANDOFF.md`](PARSER-HANDOFF.md): the project's full record. It is long; `CLAUDE.md` says which section covers what.
- [`docs/`](docs/): the dispensary (B2B) integration, catalog format and pilot documents.

## Running the checks

Node 24 and bash (on Windows, Git Bash; see the Windows section of `CLAUDE.md`).

```bash
npm ci
node test/extract-dump.js
npm install --no-save playwright@1.64.1 && npx playwright install --with-deps chromium
bash scripts/gates.sh
```

The last command must end `ALL GATES GREEN`. There is no manual deploy: a green run on `main` moves the branch `live`, and the site builds from `live`.

## Licence

No licence has been chosen yet. The code is public so it can be read. That is not a grant to copy or reuse it, so please ask first. `package.json`'s `"ISC"` is npm's default, not a decision. `vendor/html5-qrcode.min.js` is a third-party library under Apache-2.0; its licence is beside it.
