# NOSE for dispensaries — pinned widget releases

Every release of `<nose-matches>` a store's page can pin, one row each.
`scripts/b2b-release.js` writes a row after it has uploaded a release and read
it back; nothing else writes here, and a row is never changed. Commit and push
this file straight after a release.

- **version** — the release's number, from 1, never reused.
- **commit** — the commit it was built from, on `origin/main`.
- **nose-matches.js** and **nose-matches.css** — each file's `sha384`, as a
  page's `integrity` attribute takes it.

A release is served at `https://nose-app.com/b2b/releases/<version>/nose-matches.js`
and `.../nose-matches.css`. A store's page names the first file's hash
(`docs/B2B-INTEGRATION.md`); the widget inside names the second's.

Git holds no built release: `node scripts/b2b-release-check.js` builds each one
again from its commit, downloads both files from the store (and, with
`--site https://nose-app.com`, from the site), and checks every byte against
this table. PARSER-HANDOFF.md §14, "Pinned releases".

| version | commit | nose-matches.js | nose-matches.css |
|---|---|---|---|
