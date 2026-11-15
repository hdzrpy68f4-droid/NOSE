#!/usr/bin/env node
'use strict';
/* NOSE - stamp the one header and the one footer into every page.
 *
 *   node scripts/stamp-chrome.js            build.sh runs it, before the fingerprints
 *   node scripts/stamp-chrome.js --check    changes nothing; exits 1 if a page differs
 *
 * The site header and footer exist once, in partials/ (since 2026-11-14,
 * PARSER-HANDOFF s13, "One header and one footer"). Until then they were
 * copied by hand into 23 pages and had drifted: two nav orders, a footer
 * without Privacy or Terms on seven pages, Account twice on one.
 *
 * Each page carries
 *   <!-- nose:header static --> ... <!-- /nose:header -->   (or "app")
 *   <!-- nose:footer --> ... <!-- /nose:footer -->
 * and this replaces what is between them with partials/header.html (static),
 * partials/header-app.html (app) or partials/footer.html. On a static header
 * it sets aria-current: "page" on the link to the page itself, "true" on the
 * link to the section above it (/learn/ on a guide, /aromas/ on a family
 * page). On the app header js/nose sets it, by path, as it always has.
 *
 * A page with a marker missing, doubled or unclosed fails. b2b/demo, the
 * dispensary demo, has its own head and none of these. The pages are written
 * in place and committed, so the repository holds what deploys; CI's
 * clean-tree check catches a page that was not stamped.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NO_CHROME = new Set(['b2b/demo/index.html']);
const SKIP = new Set(['node_modules', '.git', 'vendor', 'test', 'docs', 'partials', 'scripts', 'netlify', 'supabase', 'b2b-out']);

function pages(root = ROOT) {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) out.push(path.relative(root, p).split(path.sep).join('/'));
    }
  })(root);
  return out.sort();
}

/* The address a page is served at: index.html is /, app.html is /app,
   about/index.html is /about/. 404.html is no address of its own. */
function addressOf(page) {
  if (page === 'index.html') return '/';
  if (page === '404.html') return null;
  if (page.endsWith('/index.html')) return '/' + page.slice(0, -'index.html'.length);
  return '/' + page.replace(/\.html$/, '');
}

/* aria-current on the static header's links, for a page at `at`. */
function withCurrent(header, at) {
  return header.replace(/<a ([^>]*?)href="([^"]+)"([^>]*)>/g, (whole, before, href, after) => {
    if (/class="brand/.test(before + after) || !at) return whole;
    const mark = href === at ? 'page' : (href !== '/' && href.endsWith('/') && at.startsWith(href) ? 'true' : null);
    return mark ? `<a ${before}href="${href}"${after} aria-current="${mark}">` : whole;
  });
}

const MARK = {
  header: { open: /<!-- nose:header (static|app) -->/g, close: '<!-- /nose:header -->' },
  footer: { open: /<!-- nose:footer -->/g, close: '<!-- /nose:footer -->' },
};

function stamp(page, html, partials) {
  let out = html;
  for (const kind of ['header', 'footer']) {
    const m = MARK[kind];
    const opens = [...out.matchAll(m.open)];
    const closes = out.split(m.close).length - 1;
    if (opens.length !== 1 || closes !== 1) {
      throw new Error(`${page}: expected one <!-- nose:${kind} --> and one ${m.close}, found ${opens.length} and ${closes}`);
    }
    const start = opens[0].index + opens[0][0].length;
    const end = out.indexOf(m.close);
    if (end < start) throw new Error(`${page}: ${m.close} comes before its opening marker`);
    let body = kind === 'footer' ? partials.footer : opens[0][1] === 'app' ? partials.headerApp : withCurrent(partials.header, addressOf(page));
    const indent = (out.slice(0, opens[0].index).match(/[ \t]*$/) || [''])[0];
    out = out.slice(0, start) + '\n' + indent + body.trim() + '\n' + indent + out.slice(end);
  }
  return out;
}

function readPartials(root = ROOT) {
  const p = f => fs.readFileSync(path.join(root, 'partials', f), 'utf8');
  return { header: p('header.html'), headerApp: p('header-app.html'), footer: p('footer.html') };
}

function main(argv = process.argv.slice(2), root = ROOT) {
  const check = argv.includes('--check');
  const partials = readPartials(root);
  const differ = [];
  for (const page of pages(root)) {
    const file = path.join(root, page);
    const html = fs.readFileSync(file, 'utf8');
    if (NO_CHROME.has(page)) {
      if (/<!-- \/?nose:(header|footer)/.test(html)) throw new Error(`${page}: the demo page carries no stamped header or footer`);
      continue;
    }
    const next = stamp(page, html, partials);
    if (next !== html) { differ.push(page); if (!check) fs.writeFileSync(file, next); }
  }
  return differ;
}

module.exports = { pages, addressOf, withCurrent, stamp, readPartials, main, NO_CHROME };

if (require.main === module) {
  try {
    const differ = main();
    const check = process.argv.includes('--check');
    if (check && differ.length) { console.log(`FAIL: not as stamped: ${differ.join(', ')} - run bash build.sh`); process.exit(1); }
    console.log(`    header and footer: ${differ.length ? `${differ.length} page${differ.length === 1 ? '' : 's'} stamped` : 'every page as stamped'}`);
  } catch (e) {
    console.log(`FAIL: ${e.message}`);
    process.exit(1);
  }
}
