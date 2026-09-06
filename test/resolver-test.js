'use strict';
/* NOSE — viewer-page resolver test.
 *
 *   node test/resolver-test.js
 *
 * The four other harnesses cover the parser. Nothing covered coa.js, and the
 * resolver failed three separate ways on one real portal before this existed:
 * unmatched candidate patterns, a one-hop limit, and a 400KB markup slice that
 * silently hid the link on any large page.
 *
 * Offline by design. The saved pages are the record of what the portal looked
 * like; a live fetch would test the portal, not this code.
 */
const fs = require('fs');
const path = require('path');
const { _resolvePdfFromPage: resolve } = require('../netlify/functions/coa');

const DIR = path.join(__dirname, 'fixtures/pages');
const CASES = [
  { file: 'coaportal-listings.html',
    from: 'https://coaportal.com/sunburn/listings/?search=5637041429622699',
    want: 'https://coaportal.com/sunburn/report/?search=Sunburn-5637041429622699-2608CBR0160-002',
    why:  'listings page must reach the report page' },
  { file: 'coaportal-report.html',
    from: 'https://coaportal.com/sunburn/report/?search=Sunburn-5637041429622699-2608CBR0160-002',
    want: 'https://coaportal.com/sunburn/report/?search=Sunburn-5637041429622699-2608CBR0160-002&pdf=6',
    why:  'report page must reach the PDF, with the ampersand decoded' }
];

let failed = 0;
for (const c of CASES){
  const buf = fs.readFileSync(path.join(DIR, c.file));
  const got = resolve(buf, new URL(c.from));
  const s = got ? got.toString() : null;
  const ok = s === c.want;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${c.why}`);
  if (!ok) console.log(`        want ${c.want}\n        got  ${s}`);
  /* An entity left undecoded turns the query into a fragment, so the link
     refetches the page instead of the file. It looks right and is not. */
  if (s && /&#0*38;|&amp;/.test(s)){ failed++; console.log('FAIL  html entity survived into the URL'); }
}

/* A page with no report link must return null rather than a wrong guess. */
if (resolve(Buffer.from('<html><body><a href="/about">About</a></body></html>'),
            new URL('https://coaportal.com/sunburn/listings/?search=1')) !== null){
  failed++; console.log('FAIL  a page with no report link should resolve to null');
} else console.log('ok    a page with no report link resolves to null');

console.log(`\n${failed === 0 ? 'resolver clean' : failed + ' FAILURES'}`);
process.exit(failed === 0 ? 0 : 1);
