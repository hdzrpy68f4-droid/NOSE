#!/usr/bin/env node
'use strict';
/* NOSE - one header and one footer, stamped into every page. PARSER-HANDOFF
 * s13, "One header and one footer".
 *
 *   node test/page-chrome-test.js     -> "page-chrome clean", or FAIL lines and exit 1
 *
 * Reads the pages as the build leaves them, offline. It checks:
 *   - every page but b2b/demo carries each marker once, and b2b/demo none
 *   - between the markers sits exactly the partial, aria-current aside
 *   - aria-current is right for each page's address: "page" on its own link,
 *     "true" on its section's, nothing else; none on the app header
 *   - every footer links Privacy and Terms; the nav is in one order
 *   - scripts/stamp-chrome.js refuses a page with a marker missing, doubled
 *     or unclosed, and --check catches a page edited between its markers
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const S = require(path.join(ROOT, 'scripts/stamp-chrome.js'));

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual).slice(0, 600)}\n        want ${JSON.stringify(expected).slice(0, 600)}`}`);
}
const between = (html, open, close) => { const a = html.search(open); if (a < 0) return null; const s = html.indexOf('-->', a) + 3; const e = html.indexOf(close, s); return e < 0 ? null : html.slice(s, e).trim(); };
const noCurrent = h => h.replace(/ aria-current="[^"]*"/g, '');
const P = S.readPartials();
const pages = S.pages();

check('26 pages in the tree, b2b/demo, /account/reset/, /account/confirmed/ and /dispensaries/ among them', [pages.length, pages.includes('account/confirmed/index.html'), pages.includes('b2b/demo/index.html'), pages.includes('account/reset/index.html'), pages.includes('dispensaries/index.html')], [26, true, true, true, true]);
const marked = pages.filter(p => !S.NO_CHROME.has(p));
const counts = p => { const h = fs.readFileSync(path.join(ROOT, p), 'utf8'); return [/<!-- nose:header (static|app) -->/g, /<!-- \/nose:header -->/g, /<!-- nose:footer -->/g, /<!-- \/nose:footer -->/g].map(re => (h.match(re) || []).length); };
check('every page but b2b/demo carries each marker once', marked.filter(p => JSON.stringify(counts(p)) !== '[1,1,1,1]'), []);
check('b2b/demo carries none', counts('b2b/demo/index.html'), [0, 0, 0, 0]);

const kinds = {};
const wrongBody = [], wrongCurrent = [], noLegal = [];
for (const p of marked) {
  const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const kind = (html.match(/<!-- nose:header (static|app) -->/) || [])[1];
  kinds[p] = kind;
  const header = between(html, /<!-- nose:header (static|app) -->/, '<!-- /nose:header -->');
  const footer = between(html, /<!-- nose:footer -->/, '<!-- /nose:footer -->');
  const want = kind === 'app' ? P.headerApp : P.header;
  if (noCurrent(header) !== want.trim() || footer !== P.footer.trim()) wrongBody.push(p);
  const at = S.addressOf(p);
  const cur = [...header.matchAll(/href="([^"]+)" aria-current="([^"]+)"/g)].map(m => `${m[1]}=${m[2]}`);
  const once = !at ? [] : ['/aromas/', '/learn/', '/methodology/', '/about/', '/account/', '/app']
    .map(h => (h === at ? `${h}=page` : h.endsWith('/') && at.startsWith(h) ? `${h}=true` : null)).filter(Boolean);
  const expect = kind === 'app' || !at ? [] : [...once, ...once];   // the links row, then the phone menu (since 2026-11-19)
  if (JSON.stringify(cur) !== JSON.stringify(expect)) wrongCurrent.push([p, cur, expect]);
  if (!/href="\/privacy\/">Privacy</.test(footer) || !/href="\/terms\/">Terms</.test(footer)) noLegal.push(p);
}
check('between the markers sits exactly the partial, aria-current aside', wrongBody, []);
check('aria-current: "page" on the page\'s own link, "true" on its section\'s, none on the app header or the 404', wrongCurrent, []);
check('every footer links Privacy and Terms', noLegal, []);
check('the home page and /app take the app header, every other page the static one',
  Object.entries(kinds).filter(([p, k]) => (k === 'app') !== ['index.html', 'app.html'].includes(p)).map(([p]) => p), []);
check('some pages it decides by hand: /aromas/earthy/ marks Aroma families "true", /account/ marks Account "page", a guide marks Learn "true"',
  [S.withCurrent(P.header, '/aromas/earthy/'), S.withCurrent(P.header, '/account/'), S.withCurrent(P.header, '/learn/how-to-read-a-coa/')]
    .map(h => [...h.matchAll(/href="([^"]+)" aria-current="([^"]+)"/g)].map(m => `${m[1]}=${m[2]}`)),
  [['/aromas/=true', '/aromas/=true'], ['/account/=page', '/account/=page'], ['/learn/=true', '/learn/=true']]);
const navOrder = h => [...h.matchAll(/<a (?:class="nav-cta" )?href="([^"]+)">/g)].map(m => m[1]).filter(h => h !== '/');
check('one nav order, in both headers and in both phone menus: Aroma families, Learn, Methodology, About, Account, Match a jar',
  [P.header, P.headerApp].flatMap(h => [navOrder(h.split('mobile-menu')[0]), navOrder(h.split('mobile-menu')[1])]),
  Array(4).fill(['/aromas/', '/learn/', '/methodology/', '/about/', '/account/', '/app']));
check('the footer lists Account once and holds no route-link class', [(P.footer.match(/href="\/account\/"/g) || []).length, /route-link/.test(P.footer + P.header + P.headerApp)], [1, false]);
/* Every page has the phone menu since 2026-11-19 ("Every page gets the phone
   menu"): both headers carry what js/menu drives, and every page with the
   header loads js/menu. Until then only the app header had a menu. */
check('both headers carry what js/menu drives: the has-menu header, menuButton and mobileMenu',
  [P.header, P.headerApp].map(h => [/class="site-header has-menu"/.test(h), /id="menuButton"/.test(h), /id="mobileMenu"/.test(h)]), [[true, true, true], [true, true, true]]);
check('every page with the header loads js/menu',
  marked.filter(p => !/<script src="\/js\/menu\.[0-9a-f]{8}\.js" defer><\/script>/.test(fs.readFileSync(path.join(ROOT, p), 'utf8'))), []);
check('the tree is as stamped (scripts/stamp-chrome.js --check)', S.main(['--check']), []);

/* Broken copies, in a scratch tree. */
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nose-chrome-'));
  const put = (f, s) => { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.writeFileSync(path.join(tmp, f), s); };
  for (const f of ['header.html', 'header-app.html', 'footer.html']) put(`partials/${f}`, fs.readFileSync(path.join(ROOT, 'partials', f), 'utf8'));
  const page = '<!doctype html>\n  <!-- nose:header static -->\n  <!-- /nose:header -->\n<main></main>\n  <!-- nose:footer -->\n  <!-- /nose:footer -->\n';
  const refuses = html => { put('about/index.html', html); try { S.main([], tmp); return null; } catch (e) { return e.message; } };
  check('the stamp refuses a page with a marker missing, doubled or unclosed',
    [refuses(page.replace('  <!-- nose:footer -->\n', '')), refuses(page.replace('<main>', '<!-- nose:header static --><main>')), refuses(page.replace('  <!-- /nose:header -->\n', ''))].map(m => !!m && /about\/index\.html: expected one/.test(m)),
    [true, true, true]);
  put('about/index.html', page);
  S.main([], tmp);
  const stamped = fs.readFileSync(path.join(tmp, 'about/index.html'), 'utf8');
  check('a scratch page stamps, with About marked "page"', /href="\/about\/" aria-current="page">About</.test(stamped), true);
  put('about/index.html', stamped.replace('>Learn<', '>Learn more<'));
  check('--check names a page edited by hand between its markers', S.main(['--check'], tmp), ['about/index.html']);
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures) { console.log(`\npage-chrome: ${failures} failure${failures === 1 ? '' : 's'}`); process.exit(1); }
console.log('\npage-chrome clean');
