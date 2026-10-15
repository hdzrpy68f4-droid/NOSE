#!/usr/bin/env node
'use strict';
/* The six aroma families' colours have one home, css/tokens.<hash>.css, and
 * every copy that cannot read it equals it.
 *
 *   node test/colour-tokens-test.js      expect: colour-tokens clean
 *
 * A gate after the build (scripts/gates.sh, 'colour tokens'), so it sees the
 * files as they deploy: the fingerprinted names and the rewritten links.
 * Offline; reads files only. PARSER-HANDOFF.md section 13, "One home for the
 * family colours". It checks:
 *   1. exactly one tokens file, css/tokens.<hash>.css (or an edited, unbuilt
 *      css/tokens.css), holding one :root block of the twelve properties -
 *      --citrus, --citrus-text and so on to --herbal-text, in family order,
 *      each a #RRGGBB colour - and nothing else but comments
 *   2. no other stylesheet or page defines any of the twelve, or writes any
 *      of the six fills or six inks as a colour: #RRGGBB, or an opaque rgb()
 *      or rgba(). A translucent tint of a fill (rgba(..., .16)) is a
 *      different colour and is not counted. Every .css and .html in the
 *      tree, skipping node_modules, .git, vendor, b2b-out and wip/ (a stale
 *      draft loaded by nothing); the six aroma pages' theme-color is checked
 *      in 4 instead
 *   3. every page outside test/ links the tokens file, once, before any other
 *      stylesheet
 *   4. the copies that cannot read it equal it: js/aroma-bar's FAMILIES,
 *      loaded as Node loads it (color is the fill, text the ink, in family
 *      order), js/hero's FILLS, favicon.svg's six bars, and each aroma
 *      page's <meta name="theme-color">
 *   5. every ink reaches 4.5:1 - WCAG 2.2 AA for text, SC 1.4.3 - on white,
 *      on #F3F3EE (--paper), on its fill at 10% over white (family.css's
 *      .note) and at 11% over #F3F3EE (family.css's .hero), using WCAG 2.2's
 *      relative luminance and contrast ratio. A mixed background is scored
 *      both as computed and with its channels rounded to whole numbers, as a
 *      screen paints it, and the lower ratio counts.
 * Prints one line per check, then "colour-tokens clean"; otherwise each
 * failure, and exits 1.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const FAMILY_KEYS = ['citrus', 'earthy', 'spice', 'pine', 'floral', 'herbal'];
const NAMES = FAMILY_KEYS.flatMap(f => [`--${f}`, `--${f}-text`]);
const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', 'b2b-out', 'wip', '.netlify']);
const TOKENS_FILE = /^tokens(\.[0-9a-f]{8})?\.css$/;
const MIN_RATIO = 4.5;

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`ok    ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
  return ok;
}

const rel = p => path.relative(ROOT, p).split(path.sep).join('/');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripCss = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const stripHtml = s => s.replace(/<!--[\s\S]*?-->/g, '');
const up = s => String(s).toUpperCase();

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out); }
    else if (/\.(css|html)$/.test(e.name)) out.push(rel(path.join(dir, e.name)));
  }
  return out;
}

/* ---- 1. one tokens file, twelve properties, nothing else ---------------- */
const tokenFiles = fs.readdirSync(path.join(ROOT, 'css')).filter(f => TOKENS_FILE.test(f)).map(f => `css/${f}`);
const tokens = {};
let tokensPath = null;
if (check(`one tokens file: ${tokenFiles.join(', ') || 'none'}`, tokenFiles.length === 1,
          'expected exactly one css/tokens.<hash>.css - run: bash build.sh')) {
  tokensPath = tokenFiles[0];
  const body = stripCss(read(tokensPath)).replace(/\s+/g, '');
  const m = /^:root\{([^{}]*)\}$/.exec(body);
  const decls = m ? m[1].split(';').filter(Boolean).map(d => d.split(':')) : [];
  const names = decls.map(d => d[0]);
  const colours = decls.every(d => d.length === 2 && /^#[0-9a-fA-F]{6}$/.test(d[1]));
  check(`${tokensPath} holds one :root block of the twelve properties, in family order, each a #RRGGBB colour, and nothing else`,
        m && colours && JSON.stringify(names) === JSON.stringify(NAMES),
        m ? `found ${names.join(' ')}` : 'not a single :root { ... } block');
  if (m && colours) for (const [n, v] of decls) tokens[n] = up(v);
}
const haveTokens = NAMES.every(n => tokens[n]);
const fill = f => tokens[`--${f}`];
const ink = f => tokens[`--${f}-text`];

/* ---- 2. no other stylesheet or page defines them or writes them --------- */
const files = walk(ROOT).filter(f => f !== tokensPath).sort();
const THEME_META = /<meta\s+name="theme-color"\s+content="[^"]*"\s*\/?>/g;
const AROMA_PAGE = /^aromas\/(citrus|earthy|spice|pine|floral|herbal)\/index\.html$/;

function coloursIn(text) {   // [{ at, rgb: [r, g, b], opaque }]
  const out = [];
  for (const m of text.matchAll(/#([0-9a-fA-F]{6})(?![0-9a-fA-F])/g))
    out.push({ at: m[0], rgb: [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)), opaque: true });
  for (const m of text.matchAll(/rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)/gi)) {
    const a = m[4] === undefined ? 1 : /%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    out.push({ at: m[0], rgb: [m[1], m[2], m[3]].map(Number), opaque: a >= 1 });
  }
  return out;
}
const hexOf = rgb => '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();

if (haveTokens) {
  const twelve = new Map(FAMILY_KEYS.flatMap(f => [[fill(f), `${f}'s fill`], [ink(f), `${f}'s ink`]]));
  const defines = [], writes = [];
  for (const f of files) {
    let text = f.endsWith('.css') ? stripCss(read(f)) : stripHtml(read(f));
    if (AROMA_PAGE.test(f)) text = text.replace(THEME_META, '');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/(--(?:citrus|earthy|spice|pine|floral|herbal)(?:-text)?)\s*:/g))
        defines.push(`${f}:${i + 1} defines ${m[1]}`);
      for (const c of coloursIn(line))
        if (c.opaque && twelve.has(hexOf(c.rgb))) writes.push(`${f}:${i + 1} writes ${twelve.get(hexOf(c.rgb))} as ${c.at}`);
    });
  }
  check(`no other stylesheet or page defines any of the twelve (${files.length} files)`, !defines.length, defines.join('\n        '));
  check('...or writes any of the six fills or six inks as a colour', !writes.length, writes.join('\n        '));
}

/* ---- 3. every page links the tokens file first --------------------------- */
const pages = files.filter(f => f.endsWith('.html') && !f.startsWith('test/'));
if (tokensPath) {
  const want = `/${tokensPath}`;
  const bad = [];
  for (const p of pages) {
    const sheets = [...stripHtml(read(p)).matchAll(/<link\b[^>]*>/gi)].map(m => m[0])
      .filter(tag => /\brel\s*=\s*["']?stylesheet\b/i.test(tag))
      .map(tag => (/\bhref\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1] || '(no href)');
    const tokenLinks = sheets.filter(h => /\/css\/tokens(\.[0-9a-f]+)?\.css$/.test(h));
    if (!tokenLinks.length) bad.push(`${p} does not link ${want}`);
    else if (tokenLinks.length > 1) bad.push(`${p} links the tokens ${tokenLinks.length} times`);
    else if (tokenLinks[0] !== want) bad.push(`${p} links ${tokenLinks[0]}, not ${want}`);
    else if (sheets[0] !== want) bad.push(`${p} links ${sheets[0]} before ${want}`);
  }
  check(`every page outside test/ (${pages.length}) links ${want} once, before any other stylesheet`,
        pages.length > 0 && !bad.length, bad.join('\n        ') || 'no pages found');
}

/* ---- 4. the copies that cannot read it ---------------------------------- */
if (haveTokens) {
  const fills = FAMILY_KEYS.map(fill);
  const same = (a, b) => JSON.stringify(a.map(up)) === JSON.stringify(b.map(up));

  const bars = fs.readdirSync(path.join(ROOT, 'js')).filter(f => /^aroma-bar(\.[0-9a-f]{8})?\.js$/.test(f));
  if (check(`one js/aroma-bar: ${bars.join(', ') || 'none'}`, bars.length === 1)) {
    let bar = null, err = '';
    try { bar = require(path.join(ROOT, 'js', bars[0])); } catch (e) { err = e.message; }
    const F = bar && bar.FAMILIES;
    check(`js/${bars[0]}'s FAMILIES, loaded as Node loads it, are the six in family order, each color the fill and each text the ink`,
          !!F && same(bar.FAMILY_ORDER, FAMILY_KEYS) && same(Object.keys(F), FAMILY_KEYS)
            && FAMILY_KEYS.every(f => up(F[f].color) === fill(f) && up(F[f].text) === ink(f)),
          F ? FAMILY_KEYS.filter(f => !F[f] || up(F[f].color) !== fill(f) || up(F[f].text) !== ink(f))
                .map(f => F[f] ? `${f}: color ${F[f].color} text ${F[f].text}, tokens ${fill(f)} ${ink(f)}` : `${f}: missing`).join('; ')
              || `order ${bar.FAMILY_ORDER}` : `could not load it: ${err}`);
  }

  const heroes = fs.readdirSync(path.join(ROOT, 'js')).filter(f => /^hero(\.[0-9a-f]{8})?\.js$/.test(f));
  if (check(`one js/hero: ${heroes.join(', ') || 'none'}`, heroes.length === 1)) {
    const m = /\bvar FILLS\s*=\s*(\[[^\]]*\])\s*;/.exec(read(`js/${heroes[0]}`));
    const got = m ? vm.runInNewContext(m[1]) : [];
    check(`js/${heroes[0]}'s FILLS are the six fills, in family order`, same(got, fills), `found ${JSON.stringify(got)}`);
  }

  const g = /<g\b[^>]*>([\s\S]*?)<\/g>/.exec(read('favicon.svg'));
  const icon = g ? [...g[1].matchAll(/\bfill="([^"]*)"/g)].map(m => m[1]) : [];
  check("favicon.svg's six bars are the six fills, in family order", same(icon, fills), `found ${JSON.stringify(icon)}`);

  const metas = FAMILY_KEYS.map(f => {
    const found = [...read(`aromas/${f}/index.html`).matchAll(/<meta\s+name="theme-color"\s+content="([^"]*)"/g)].map(m => m[1]);
    return found.length === 1 && up(found[0]) === fill(f) ? null : `aromas/${f}/index.html: ${JSON.stringify(found)}, fill ${fill(f)}`;
  }).filter(Boolean);
  check("each aroma page's theme-color is its family's fill", !metas.length, metas.join('; '));
}

/* ---- 5. every ink reaches 4.5:1 ----------------------------------------- */
if (haveTokens) {
  // WCAG 2.2, "relative luminance" and "contrast ratio" (glossary).
  const channel = c => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (top, share, under) => top.map((c, i) => c * share + under[i] * (1 - share));   // color-mix(in srgb, ...)
  const WHITE = [255, 255, 255], PAPER = rgb('#F3F3EE');
  let lowest = Infinity, where = '';
  const below = [];
  for (const f of FAMILY_KEYS) {
    const backgrounds = [
      ['white', WHITE], ['#F3F3EE', PAPER],
      ['its fill at 10% over white', mix(rgb(fill(f)), 0.10, WHITE)],
      ['its fill at 11% over #F3F3EE', mix(rgb(fill(f)), 0.11, PAPER)],
    ];
    for (const [name, bg] of backgrounds) {
      const r = Math.min(ratio(rgb(ink(f)), bg), ratio(rgb(ink(f)), bg.map(Math.round)));
      if (r < lowest) { lowest = r; where = `${f} ${ink(f)} on ${name}`; }
      if (r < MIN_RATIO) below.push(`${f} ${ink(f)} on ${name}: ${r.toFixed(2)}:1`);
    }
  }
  check(`every ink reaches ${MIN_RATIO}:1 on the four backgrounds (lowest ${lowest.toFixed(2)}:1, ${where})`,
        !below.length, below.join('; '));
}

if (failures) process.exit(1);
console.log('colour-tokens clean');
