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
| 1 | 77f96a89aa35c3e8cf393c368555b44ebcd05f43 | sha384-suJ0VaeiOSOCl4dkl3RGcgkgkgx2Q/x2l7JZZlO6ecVdOS6DS70MTdcMolJWRW2l | sha384-+XwTP39J7VPdIIBaJs/ypa2cFnJ3Y048Vp1faabsNCwHMkduDlB/PnOa6cD9HZhn |
| 2 | c96b15ad1002f53942e0dd7ae61fbb3d5b370fa6 | sha384-ria5Ei+NaS29qm0wrTCxfib/zOXnVZvEeAwaKZBRnHYcfTKIYBaFMkVUs/ZgAUa8 | sha384-R2Sxy67O6gPnbBB7Gx4hwPTj/C85nqi1xO/mthRYsfhTTYCfCtkAk+5tc5nVWLNW |
| 3 | a429e244412e1f258de51d3e2fe1ae3c8ee31f75 | sha384-n4aXIwLMO7wGi7tOODJiTx+GhzMUQuR/eVIl243UHcqJ15+vQnd3iD6h1CLx5STk | sha384-R2Sxy67O6gPnbBB7Gx4hwPTj/C85nqi1xO/mthRYsfhTTYCfCtkAk+5tc5nVWLNW |
| 4 | f25c774f89d8cb6c006d261fdaec85e0df0501a1 | sha384-u7RGpaF9SCA7ZDyoBzxiONRnelY+17zt1bX6w64Y13c6KnyAn58JwyY3nd26A9Bf | sha384-FHoLtEdOd4o3BKUO9DTaeOURmTEkcGU40gJodX37kt/YItFTg5hIYtYnJs89vJhj |
| 5 | cc2ab9b87fa4eabf3063bd730fc4e09157002ae3 | sha384-D9tKcPPjSRprERb335fpu1otzBsYuFvKXhxSr02yRDgpEd2rmqWeNv4EhEqJcUkk | sha384-DMBtvtrfQUfMs7vf4xFa2+HLnnEjKZN3H8HA5XlPsG1dRmPmsXegZM540E/SKE+c |
