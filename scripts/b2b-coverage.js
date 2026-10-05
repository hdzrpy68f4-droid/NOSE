#!/usr/bin/env node
'use strict';
/* How much of a dispensary's catalog NOSE can read: the coverage report.
 *
 *   node scripts/b2b-coverage.js <catalog.csv>
 *   node scripts/b2b-coverage.js <catalog.csv> --out b2b-out/acme --limit 20
 *
 * The catalog is the CSV a dispensary exports, one row per listed batch, in
 * the format docs/B2B-CATALOG-FORMAT.md defines. Every row is an inhalable
 * (flower, pre-roll, vape or concentrate). For each in-stock row the coa_url
 * is fetched as NOSE's scanner fetches a link - lib/fetch-report.js, the
 * scanner's own chain, guards and deadlines - one link at a time with a pause
 * between, then extracted with lib/extract-text.js and read by parseCoa, as
 * coa.js reads it.
 *
 * The report says how many in-stock batches have a terpene panel NOSE can
 * read, by category and by lab, with the denominator beside every share, and
 * lists every one it can't with the reason: the parser's rejectReasons
 * verbatim, or the scanner's own sentence for a link or a PDF it could not
 * use. Three things are flagged and never fixed: a report whose form is not
 * the row's category (a pre-roll is flower to the parser), a report whose
 * batch and lab ID do not contain the row's batch_id, and one link on two
 * batches. Numbers appear only for accepted reads: the total terpenes the lab
 * printed, and the top three terpenes as share of total through normalize()
 * from js/match-math.<hash>.js (scripts/lib/match.js) - the app's own maths.
 * A batch without an accepted read shows no numbers: never a guess, never a
 * strain-name lookup.
 *
 * It writes report.md and report.csv into --out (default b2b-out/ at the top
 * of the repo, gitignored), prints the summary, and writes nothing else: no
 * database, no archive, no endpoint. It never loads coa.js or lib/archive.js,
 * so no catalog's report reaches the lab-report archive. Needs no secrets;
 * needs the network and an `npm install`.
 *
 * A file whose header has a column that looks like it is about a person
 * (lib/store.js's PERSONAL_KEYS and seven more words) is refused before any
 * row is read, so a wrong export is never read; so is one with any column
 * outside the format, by name. A link is printed as its host only: an address
 * can carry a token.
 *
 * Aroma and flavour only. PARSER-HANDOFF s14.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify/functions/lib');
const { validateUrl, fetchPdf } = require(path.join(LIB, 'fetch-report.js'));
const { PERSONAL_KEYS } = require(path.join(LIB, 'store.js'));

const USAGE = 'usage: node scripts/b2b-coverage.js <catalog.csv> [--out DIR] [--limit N]';
const DEFAULT_OUT = path.join(ROOT, 'b2b-out');
const FORMAT_DOC = 'docs/B2B-CATALOG-FORMAT.md';

/* The format, docs/B2B-CATALOG-FORMAT.md. Every column must be in the header;
   the ones not in REQUIRED may be empty on a row. */
const COLUMNS = Object.freeze(['product_id', 'batch_id', 'category', 'route', 'name', 'brand', 'coa_url',
                               'in_stock', 'product_url', 'thc_percent', 'cbd_percent']);
const REQUIRED = Object.freeze(['product_id', 'batch_id', 'category', 'route', 'name', 'in_stock']);
const CATEGORIES = Object.freeze(['flower', 'pre-roll', 'vape', 'concentrate']);
const ROUTES = Object.freeze(['smoking', 'inhalation']);
const STOCK = Object.freeze(['yes', 'no']);
/* The parser's productClass for each category. A pre-roll is flower to the
   parser: its "pre-roll" pattern is in the flower rule (parse-coa.js CLASSES). */
const FAMILY = Object.freeze({ flower: 'flower', 'pre-roll': 'flower', vape: 'vape', concentrate: 'concentrate' });

/* A column name that looks like it is about a person refuses the whole file.
   The words longer than three letters count anywhere in the name, once case
   and separators are gone ("Customer E-mail" holds "customer" and "email");
   the short ones (ip, dob) only as a whole part of it, so "zip" or "shipping"
   is not "ip". Every such column is outside the format anyway; this rule says
   why, and stops before a row is read. */
const PERSONAL_WORDS = Object.freeze([...PERSONAL_KEYS, 'customer', 'patient', 'card', 'license', 'licence', 'dob', 'address']);
const squash = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const LONG_WORDS = [...new Set(PERSONAL_WORDS.map(squash))].filter(w => w.length > 3);
const SHORT_WORDS = [...new Set(PERSONAL_WORDS.map(squash))].filter(w => w.length <= 3);

function looksPersonal(name) {
  const flat = squash(name);
  if (LONG_WORDS.some(w => flat.includes(w))) return true;
  const parts = String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return SHORT_WORDS.some(w => parts.includes(w) || flat === w);
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const PAUSE_MS = 1000;        // between one fetch and the next: a lab's portal is someone else's server
const TOP = 3;

/* What coa.js's handler does between the download and the parser, restated
   here because this script must not load coa.js (and the archive wiring with
   it). test/b2b-coverage-test.js checks each one against coa.js's own source,
   so the report and the scanner cannot drift apart: the same text floor, the
   same sentences, and UNSAFE_UNDER_UNPDF still empty. */
const MIN_TEXT = 200;
const SCANNER = Object.freeze({
  unreadable: 'That PDF could not be read. It may be a scan rather than a text document.',
  noText: 'That PDF has no readable text. Scanned reports are not supported.',
  unparsed: 'That report could not be parsed.',
  refused: 'That report could not be read reliably.'
});
/* The card's one line for a usable reading with novelty (PARSER-HANDOFF s7);
   the test checks js/nose.*.js still publishes exactly this. */
const NOVELTY_LINE = 'NOSE hasn\'t seen this lab\'s layout before — check the top three against the report.';

const OUTCOMES = Object.freeze({
  accepted: 'accepted', refused: 'refused', noLink: 'no link', fetchFailed: 'fetch failed',
  notFetched: 'not fetched', outOfStock: 'out of stock', rowRefused: 'row refused'
});
/* The four that an in-stock batch can end in, plus a --limit run's fifth. */
const IN_STOCK_OUTCOMES = Object.freeze([OUTCOMES.accepted, OUTCOMES.refused, OUTCOMES.noLink, OUTCOMES.fetchFailed, OUTCOMES.notFetched]);
const SAYS = Object.freeze({
  [OUTCOMES.accepted]: 'terpene panel NOSE can read',
  [OUTCOMES.refused]: 'report refused',
  [OUTCOMES.noLink]: 'no lab-report link in the catalog',
  [OUTCOMES.fetchFailed]: 'link could not be fetched',
  [OUTCOMES.notFetched]: 'not fetched (--limit)'
});
const UNRECOGNISED = '(lab not recognised)';
const NO_REPORT = '(no report read)';

class UsageError extends Error {}

/* ------------------------------------------------------------ arguments */

function parseArgs(argv) {
  const opts = { catalog: null, out: null, limit: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new UsageError(`--out needs a folder\n${USAGE}`);
      opts.out = argv[++i];
    } else if (a === '--limit') {
      if (!/^[1-9]\d{0,5}$/.test(argv[i + 1] || '')) throw new UsageError(`--limit needs a whole number above 0\n${USAGE}`);
      opts.limit = Number(argv[++i]);
    } else if (a.startsWith('--')) {
      throw new UsageError(`unknown: ${a}\n${USAGE}`);
    } else if (opts.catalog) {
      throw new UsageError(`one catalog at a time\n${USAGE}`);
    } else {
      opts.catalog = a;
    }
  }
  if (!opts.catalog) throw new UsageError(USAGE);
  return opts;
}

/* ------------------------------------------------------------- the file */

/* RFC 4180: commas, double quotes around a value that holds a comma, a quote
   or a line break, "" for a quote inside one, CRLF or LF between records.
   Returns { records } or { error }. A quote in the middle of an unquoted
   value is kept as it is. */
function parseCsv(text) {
  const records = [];
  let rec = [];
  let field = '';
  let quoted = false;
  let fresh = true;            // nothing read yet in this field
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && fresh) { quoted = true; fresh = false; continue; }
    if (c === ',') { rec.push(field); field = ''; fresh = true; continue; }
    if (c === '\n' || c === '\r') {
      rec.push(field); records.push(rec);
      rec = []; field = ''; fresh = true;
      if (c === '\r' && text[i + 1] === '\n') i++;
      continue;
    }
    field += c;
    fresh = false;
  }
  if (quoted) return { error: 'the file ends inside a quoted value - a double quote is never closed' };
  if (!fresh || field !== '' || rec.length) { rec.push(field); records.push(rec); }
  return { records };
}

const refuse = why => ({ refusal: `refused: ${why}. Nothing in the file was used. The format is ${FORMAT_DOC}.` });
const listed = list => list.map(n => (n === '' ? '(an empty name)' : `"${shown(n, 60)}"`)).join(', ');

/* The header decides whether the file is read at all. Personal-looking
   columns first, so the reason given is the one that matters. */
function checkHeader(header) {
  const raw = header.map((h, i) => (i === 0 ? h.replace(/^\uFEFF/, '') : h).trim());
  const personal = raw.filter(looksPersonal);
  if (personal.length) {
    return refuse(`the header has ${personal.length === 1 ? 'a column' : 'columns'} that looks like it is about a person - ` +
      `${listed(personal)} - so none of its rows was read. A catalog carries products and batches, never shoppers: ` +
      'export the catalog columns only');
  }
  const names = raw.map(n => n.toLowerCase());
  const unknown = raw.filter((n, i) => !COLUMNS.includes(names[i]));
  if (unknown.length) return refuse(`${unknown.length === 1 ? 'a column' : 'columns'} outside the format: ${listed(unknown)}`);
  const twice = COLUMNS.filter(c => names.filter(n => n === c).length > 1);
  if (twice.length) return refuse(`${twice.length === 1 ? 'a column appears' : 'columns appear'} more than once: ${listed(twice)}`);
  const missing = COLUMNS.filter(c => !names.includes(c));
  if (missing.length) return refuse(`${missing.length === 1 ? 'a column is' : 'columns are'} missing: ${listed(missing)}`);
  return { index: Object.fromEntries(COLUMNS.map(c => [c, names.indexOf(c)])) };
}

/* A value echoed back in a reason: one line, and short. */
function shown(v, n = 40) {
  const s = String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

const PERCENT = /^(\d{1,3}(\.\d+)?|\.\d+)\s*%?$/;
function percentProblem(col, v) {
  if (v === '') return null;
  if (!PERCENT.test(v) || Number(v.replace('%', '')) > 100) return `${col} "${shown(v)}" is not a number from 0 to 100`;
  return null;
}

function httpsProblem(col, v) {
  if (v === '') return null;
  try { if (new URL(v).protocol === 'https:') return null; } catch {}
  return `${col} is not an https address`;
}

/* Each data record into a row, or a refused row with every reason it fails.
   Row numbers count the header as row 1, as a spreadsheet shows them. */
function readRows(records, index) {
  const rows = [];
  let blank = 0;
  const firstRowOf = new Map();
  for (let k = 1; k < records.length; k++) {
    const rec = records[k];
    const row = k + 1;
    if (rec.every(v => v.trim() === '')) { blank++; continue; }
    if (rec.length !== COLUMNS.length) {
      rows.push({ row, outcome: OUTCOMES.rowRefused, reasons: [`has ${rec.length} value${rec.length === 1 ? '' : 's'}; the header has ${COLUMNS.length}`] });
      continue;
    }
    const r = { row };
    for (const c of COLUMNS) r[c] = rec[index[c]].trim();
    for (const c of ['category', 'route', 'in_stock']) r[c] = r[c].toLowerCase();
    const problems = [];
    for (const c of REQUIRED) if (r[c] === '') problems.push(`${c} is empty`);
    if (r.category && !CATEGORIES.includes(r.category)) problems.push(`category "${shown(r.category)}" is not flower, pre-roll, vape or concentrate`);
    if (r.route && !ROUTES.includes(r.route)) problems.push(`route "${shown(r.route)}" is not smoking or inhalation`);
    if (r.in_stock && !STOCK.includes(r.in_stock)) problems.push(`in_stock "${shown(r.in_stock)}" is not yes or no`);
    for (const p of [httpsProblem('product_url', r.product_url), percentProblem('thc_percent', r.thc_percent),
                     percentProblem('cbd_percent', r.cbd_percent)]) if (p) problems.push(p);
    if (r.batch_id) {
      const key = r.batch_id.toLowerCase();
      if (firstRowOf.has(key)) problems.push(`batch_id is already on row ${firstRowOf.get(key)} - one row per batch`);
      else if (!problems.length) firstRowOf.set(key, row);
    }
    if (problems.length) rows.push({ row, product_id: r.product_id, batch_id: r.batch_id, outcome: OUTCOMES.rowRefused, reasons: problems });
    else rows.push({ ...r, outcome: null, reasons: [], flags: [] });
  }
  return { rows, blank };
}

function readCatalog(buffer) {
  if (!buffer || !buffer.length) return refuse('the file is empty');
  if (buffer.length > MAX_FILE_BYTES) return refuse(`the file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { return refuse('the file is not UTF-8 text - save it as "CSV UTF-8"'); }
  /* The header alone first: a file it refuses has none of its rows parsed. */
  const end = text.search(/\r\n|\n|\r/);
  const head = parseCsv(end < 0 ? text : text.slice(0, end));
  if (head.error || !head.records.length || head.records[0].every(v => v.trim() === '')) return refuse('the first line is not a header row');
  const checked = checkHeader(head.records[0]);
  if (checked.refusal) return checked;
  const all = parseCsv(text);
  if (all.error) return refuse(all.error);
  return readRows(all.records, checked.index);
}

/* -------------------------------------------------------------- reading */

/* A link validateUrl has passed, exactly as coa.js's handler takes it from
   there: fetchPdf, the text, parseCoa. Nothing is kept but the reading. */
async function readFetched(url, { extract, parse }) {
  const fetched = await fetchPdf(url);
  if (fetched.error) return { outcome: OUTCOMES.fetchFailed, reasons: [fetched.error] };
  let text;
  try {
    const got = await extract(fetched.buffer);
    text = typeof got === 'string' ? got : got && got.text;
  } catch {
    return { outcome: OUTCOMES.refused, reasons: [SCANNER.unreadable] };
  }
  if (typeof text !== 'string' || text.length < MIN_TEXT) return { outcome: OUTCOMES.refused, reasons: [SCANNER.noText] };
  let output;
  try { output = parse(text); } catch { return { outcome: OUTCOMES.refused, reasons: [SCANNER.unparsed] }; }
  if (output && output.usable === true) return { outcome: OUTCOMES.accepted, reasons: [], output };
  const reasons = output && Array.isArray(output.rejectReasons) && output.rejectReasons.length ? output.rejectReasons.map(String) : [SCANNER.refused];
  return { outcome: OUTCOMES.refused, reasons, output: output || null };
}

/* Spaces and letter case aside: "1006 1837 9110 9527" holds 1006183791109527. */
const plain = s => String(s).replace(/\s+/g, '').toLowerCase();

/* What the reading says about the row: flagged, never fixed. */
function flagReading(r) {
  const out = r.output;
  if (!out) return;
  const family = FAMILY[r.category];
  if (out.productClass !== family) {
    r.flags.push(out.productClass === 'unknown' || !out.productClass
      ? { kind: 'category', note: `the report does not say which form it is (read as unknown); the catalog says ${r.category}` }
      : { kind: 'category', note: `the report reads as ${out.productClass}; the catalog says ${r.category}${r.category === family ? '' : ` (${family} to the parser)`}` });
  }
  const want = plain(r.batch_id);
  const holds = v => v != null && String(v).trim() !== '' && plain(v).includes(want);
  if (!holds(out.batch) && !holds(out.labId)) {
    const said = [out.batch ? `batch "${shown(out.batch, 60)}"` : null, out.labId ? `lab ID "${shown(out.labId, 60)}"` : null].filter(Boolean);
    r.flags.push({ kind: 'batch', note: said.length ? `the report's ${said.join(' and ')} ${said.length > 1 ? 'do' : 'does'} not contain "${shown(r.batch_id, 60)}"`
      : `NOSE read no batch or lab ID on the report, so it cannot show that the report is for "${shown(r.batch_id, 60)}"` });
  }
}

/* The same link on more than one batch, across every row of the file in
   stock or not: an in-stock batch pointing at the last batch's report is the
   case this exists for. Two links are the same address when they differ only
   after "#", which is never sent to the server. */
function linkKey(link) {
  try { const u = new URL(link); u.hash = ''; return u.href; } catch { return link; }
}
function hostOf(link) {
  try { return new URL(link).host || '(no host)'; } catch { return '(not a web address)'; }
}
function flagSharedLinks(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (r.outcome === OUTCOMES.rowRefused || !r.coa_url) continue;
    const k = linkKey(r.coa_url);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const shared = [];
  for (const list of groups.values()) {
    if (new Set(list.map(r => r.batch_id.toLowerCase())).size < 2) continue;
    shared.push({ host: hostOf(list[0].coa_url), rows: list.map(r => ({ row: r.row, batch_id: r.batch_id, in_stock: r.in_stock })) });
    for (const r of list) {
      const others = list.filter(o => o !== r).map(o => `row ${o.row} (batch "${shown(o.batch_id, 60)}"${o.in_stock === 'yes' ? '' : ', out of stock'})`);
      r.flags.push({ kind: 'link', note: `the same link is on ${others.join(', ')}` });
    }
  }
  return shared;
}

/* Top three as share of total, from the app's normalize(). */
function topShares(M, terps) {
  return Object.entries(M.normalize(terps || {}))
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .slice(0, TOP)
    .map(([key, share]) => ({ name: M.TERPENES[key] ? M.TERPENES[key].name : key, share }));
}
const asPercent = share => `${(share * 100).toFixed(1)}%`;

async function coverRows(rows, { limit = null, pauseMs = PAUSE_MS, wait = ms => new Promise(r => setTimeout(r, ms)),
                                 log = () => {}, extract, parse, match } = {}) {
  const linked = rows.filter(r => r.outcome === null && r.in_stock === 'yes' && r.coa_url);
  const toTry = limit == null ? linked.length : Math.min(limit, linked.length);
  let tried = 0;
  let requested = 0;
  for (const r of rows) {
    if (r.outcome !== null) continue;
    if (r.in_stock !== 'yes') { r.outcome = OUTCOMES.outOfStock; continue; }
    if (!r.coa_url) { r.outcome = OUTCOMES.noLink; continue; }
    if (tried >= toTry) { r.outcome = OUTCOMES.notFetched; continue; }
    tried++;
    const checked = validateUrl(r.coa_url);
    if (checked.error) Object.assign(r, { outcome: OUTCOMES.fetchFailed, reasons: [checked.error] });
    else {
      /* A pause before every request but the first. A link validateUrl
         refuses is never requested, so nothing waits for it. */
      if (requested > 0 && pauseMs > 0) await wait(pauseMs);
      requested++;
      Object.assign(r, await readFetched(checked.url, { extract, parse }));
    }
    flagReading(r);
    if (r.outcome === OUTCOMES.accepted) {
      r.top = topShares(match, r.output.terps);
      r.total = r.output.totalTerpenes;
      r.notes = [...(Array.isArray(r.output.novelty) && r.output.novelty.length ? [NOVELTY_LINE] : []),
                 ...(Array.isArray(r.output.warnings) ? r.output.warnings.map(String) : [])];
    }
    log(`  ${String(tried).padStart(String(toTry).length)} of ${toTry}   row ${r.row}   ${r.outcome}`);
  }
  return { tried, requested };
}

/* ------------------------------------------------------------ the count */

const blankCounts = () => Object.fromEntries([['batches', 0], ...IN_STOCK_OUTCOMES.map(o => [o, 0])]);

function summarise(rows) {
  const inStock = rows.filter(r => IN_STOCK_OUTCOMES.includes(r.outcome));
  const total = blankCounts();
  const byCategory = new Map(CATEGORIES.map(c => [c, blankCounts()]));
  const byLab = new Map();
  for (const r of inStock) {
    const lab = r.output ? (r.output.lab || UNRECOGNISED) : NO_REPORT;
    if (!byLab.has(lab)) byLab.set(lab, blankCounts());
    for (const t of [total, byCategory.get(r.category), byLab.get(lab)]) { t.batches++; t[r.outcome]++; }
  }
  /* Labs by how many batches, then by name; the two groups that are not a lab last. */
  const labs = [...byLab.entries()].sort((a, b) => {
    const rank = k => (k === UNRECOGNISED ? 1 : k === NO_REPORT ? 2 : 0);
    return rank(a[0]) - rank(b[0]) || b[1].batches - a[1].batches || a[0].localeCompare(b[0]);
  });
  const byReason = (outcome) => {
    const m = new Map();
    for (const r of inStock.filter(x => x.outcome === outcome)) {
      for (const why of new Set(r.reasons)) { if (!m.has(why)) m.set(why, []); m.get(why).push(r.row); }
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  };
  return {
    rows: rows.length,
    inStock: inStock.length,
    outOfStock: rows.filter(r => r.outcome === OUTCOMES.outOfStock).length,
    rowRefused: rows.filter(r => r.outcome === OUTCOMES.rowRefused),
    total,
    byCategory: [...byCategory.entries()],
    byLab: labs,
    refusedBy: byReason(OUTCOMES.refused),
    failedBy: byReason(OUTCOMES.fetchFailed),
    flagged: kind => inStock.filter(r => r.flags.some(f => f.kind === kind))
  };
}

/* "12 of 40 (30%)": the denominator beside every share. */
const share = (n, of) => (of ? `${n} of ${of} (${Math.round((100 * n) / of)}%)` : `${n} of 0`);
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const rowList = rows => (rows.length === 1 ? `row ${rows[0]}` : `rows ${rows.join(', ')}`);

/* ------------------------------------------------------------- the files */

/* One line, no pipe to break a table, no markup to run: what the report and
   the catalog say is shown as they say it. Underscores stay as they are -
   inside a word, as in a batch ID, they are not markup. */
const md = v => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()
  .replace(/\\/g, '\\\\').replace(/([|*`])/g, '\\$1').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderMarkdown(rep) {
  const s = rep.summary;
  const L = [];
  /* `right` lists the columns that hold numbers; words stay left. */
  const table = (head, body, right = []) => {
    L.push(`| ${head.join(' | ')} |`, `|${head.map((h, i) => (right.includes(i) ? ' ---: |' : ' --- |')).join('')}`);
    for (const r of body) L.push(`| ${r.join(' | ')} |`);
  };
  const counted = n => Array.from({ length: n }, (_, i) => i + 1);
  const countRow = (label, t) => [md(label), String(t.batches), ...IN_STOCK_OUTCOMES.filter(o => o !== OUTCOMES.notFetched || rep.limit != null)
    .map(o => share(t[o], t.batches))];
  const cols = IN_STOCK_OUTCOMES.filter(o => o !== OUTCOMES.notFetched || rep.limit != null).map(o => SAYS[o]);

  L.push(`# Terpene panel coverage: ${md(rep.file)}`, '');
  L.push(`Read on ${rep.day} (UTC) by NOSE ${md(rep.version)}. Each in-stock batch's lab-report link was fetched once, ` +
         'as NOSE\'s scanner fetches a link, and read by the same parser. A link can change or move: this is what each one ' +
         'served that day.', '');
  L.push('This report is about the lab reports behind the catalog\'s links: whether NOSE can read the terpene panel on each. ' +
         'Aroma and flavor only. A batch without a panel NOSE can read shows no numbers.', '');
  if (rep.limit != null) {
    L.push(`**A partial run.** \`--limit ${rep.limit}\` tried the first ${plural(rep.tried, 'link')}; ` +
           `${plural(s.total[OUTCOMES.notFetched], 'in-stock batch', 'in-stock batches')} with a link ${s.total[OUTCOMES.notFetched] === 1 ? 'was' : 'were'} not fetched, ` +
           'so the shares below describe part of the catalog.', '');
  }

  L.push('## Summary', '');
  L.push(`**${share(s.total[OUTCOMES.accepted], s.inStock)}** in-stock inhalables have a terpene panel NOSE can read.`, '');
  L.push(`The file has ${plural(s.rows + rep.blank, 'row')} after its header: ${plural(s.inStock, 'in-stock batch', 'in-stock batches')}, ` +
         `${s.outOfStock} out of stock (not fetched), ${plural(s.rowRefused.length, 'row')} refused (listed at the end)` +
         `${rep.blank ? `, and ${plural(rep.blank, 'blank row')} skipped` : ''}.`, '');
  table(['in-stock batches', 'how many'], IN_STOCK_OUTCOMES.filter(o => o !== OUTCOMES.notFetched || rep.limit != null)
    .map(o => [SAYS[o], share(s.total[o], s.inStock)]), [1]);
  L.push('');

  L.push('## By category', '');
  table(['category', 'in stock', ...cols], s.byCategory.map(([c, t]) => countRow(c, t)), counted(cols.length + 1));
  L.push('');
  L.push('## By lab', '');
  L.push('The lab is the one the parser read on the report. A batch whose link gave no report has no lab, and is counted apart.', '');
  table(['lab', 'in stock', ...cols], s.byLab.map(([lab, t]) => countRow(lab, t)), counted(cols.length + 1));
  L.push('');

  if (s.refusedBy.length) {
    L.push('## Why reports were refused', '');
    L.push('The parser\'s own reasons, word for word - or the scanner\'s own sentence when the PDF itself could not be read. ' +
           'One report can be refused for more than one reason.', '');
    for (const [why, rows] of s.refusedBy) L.push(`- ${md(why)} - ${plural(rows.length, 'batch', 'batches')}: ${rowList(rows)}`);
    L.push('');
  }
  if (s.failedBy.length) {
    L.push('## Why links could not be fetched', '');
    L.push('The scanner\'s own words for each link.', '');
    for (const [why, rows] of s.failedBy) L.push(`- ${md(why)} - ${plural(rows.length, 'batch', 'batches')}: ${rowList(rows)}`);
    L.push('');
  }

  L.push('## Flagged - checked, never fixed', '');
  const flagSection = (kind, title, empty) => {
    const rows = s.flagged(kind);
    L.push(`### ${title}: ${rows.length}`, '');
    if (!rows.length) { L.push(empty, ''); return; }
    table(['row', 'batch_id', 'name', 'what NOSE saw'], rows.map(r => [String(r.row), md(r.batch_id), md(r.name),
      md(r.flags.filter(f => f.kind === kind).map(f => f.note).join('; '))]), [0]);
    L.push('');
  };
  flagSection('category', 'The report\'s form is not the catalog\'s category', 'None among the reports read.');
  flagSection('batch', 'The report does not name the batch', 'None among the reports read.');
  L.push(`### One link on more than one batch: ${rep.shared.length}`, '');
  if (!rep.shared.length) L.push('None in the file.', '');
  else {
    table(['link (host only)', 'batches'], rep.shared.map(g => [md(g.host),
      md(g.rows.map(x => `row ${x.row} "${x.batch_id}"${x.in_stock === 'yes' ? '' : ' (out of stock)'}`).join(', '))]));
    L.push('');
  }

  const cant = rep.rows.filter(r => [OUTCOMES.refused, OUTCOMES.noLink, OUTCOMES.fetchFailed].includes(r.outcome));
  L.push(`## Every in-stock batch NOSE can't read: ${cant.length}`, '');
  if (!cant.length) L.push('None.', '');
  else {
    table(['row', 'product_id', 'batch_id', 'category', 'name', 'brand', 'why', 'link (host only)'], cant.map(r => [String(r.row),
      md(r.product_id), md(r.batch_id), md(r.category), md(r.name), md(r.brand),
      md(r.outcome === OUTCOMES.noLink ? 'no lab-report link in the catalog' : `${SAYS[r.outcome]}: ${r.reasons.join('; ')}`),
      md(r.coa_url ? hostOf(r.coa_url) : '')]), [0]);
    L.push('');
  }

  const read = rep.rows.filter(r => r.outcome === OUTCOMES.accepted);
  L.push(`## Batches with a terpene panel NOSE can read: ${read.length}`, '');
  if (!read.length) L.push('None.', '');
  else {
    L.push('Total terpenes is the figure the lab printed. The top three are each terpene\'s share of the modelled total, ' +
           'as NOSE compares profiles; notes are the ones NOSE\'s card shows, word for word.', '');
    table(['row', 'batch_id', 'category', 'name', 'lab', 'total terpenes', 'top three, share of total', 'notes'], read.map(r => [
      String(r.row), md(r.batch_id), md(r.category), md(r.name), md(r.output.lab || UNRECOGNISED),
      md(typeof r.total === 'number' ? `${r.total}%` : 'not printed'),
      md(r.top.length ? r.top.map(t => `${t.name} ${asPercent(t.share)}`).join(' · ') : 'no modelled terpene above zero'),
      md(r.notes.join(' '))]), [0]);
    L.push('');
  }

  L.push('## Rows not read', '');
  L.push(`- Out of stock: ${s.outOfStock}. Not fetched; their links still count for "one link on more than one batch".`);
  L.push(`- Refused rows: ${s.rowRefused.length}${s.rowRefused.length ? '. Each fails the format, and is not counted above:' : '.'}`);
  for (const r of s.rowRefused) L.push(`  - row ${r.row}${r.batch_id ? ` (batch "${md(r.batch_id)}")` : ''}: ${md(r.reasons.join('; '))}`);
  L.push('');
  return L.join('\n');
}

/* A cell a spreadsheet will not run: =, +, - and @ start a formula. */
const csv = v => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const CSV_COLUMNS = Object.freeze(['row', 'product_id', 'batch_id', 'category', 'route', 'in_stock', 'name', 'brand', 'outcome', 'reason',
  'lab', 'report_form', 'report_batch', 'report_lab_id', 'total_terpenes_percent', 'top_1', 'top_1_share', 'top_2', 'top_2_share',
  'top_3', 'top_3_share', 'notes', 'flags', 'link_host']);

function renderCsv(rep) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of rep.rows) {
    const out = r.output || null;
    const top = r.outcome === OUTCOMES.accepted ? r.top : [];
    const cell = {
      row: r.row, product_id: r.product_id, batch_id: r.batch_id, category: r.category, route: r.route, in_stock: r.in_stock,
      name: r.name, brand: r.brand, outcome: r.outcome, reason: (r.reasons || []).join('; '),
      lab: out ? out.lab || UNRECOGNISED : '', report_form: out ? out.productClass : '',
      report_batch: out ? out.batch : '', report_lab_id: out ? out.labId : '',
      total_terpenes_percent: r.outcome === OUTCOMES.accepted && typeof r.total === 'number' ? r.total : '',
      notes: r.outcome === OUTCOMES.accepted ? r.notes.join(' ') : '',
      flags: (r.flags || []).map(f => f.note).join('; '),
      link_host: r.coa_url ? hostOf(r.coa_url) : ''
    };
    for (let k = 0; k < TOP; k++) {
      cell[`top_${k + 1}`] = top[k] ? top[k].name : '';
      cell[`top_${k + 1}_share`] = top[k] ? asPercent(top[k].share) : '';
    }
    lines.push(CSV_COLUMNS.map(c => csv(cell[c])).join(','));
  }
  /* A byte-order mark, so a spreadsheet reads it as UTF-8: β, ·, —. */
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function summaryLines(rep, files) {
  const s = rep.summary;
  const L = [`b2b-coverage: ${rep.file}`, '',
    `${share(s.total[OUTCOMES.accepted], s.inStock)} in-stock inhalables have a terpene panel NOSE can read`];
  for (const o of IN_STOCK_OUTCOMES) {
    if (o === OUTCOMES.accepted || (o === OUTCOMES.notFetched && rep.limit == null)) continue;
    L.push(`  ${SAYS[o].padEnd(34)} ${share(s.total[o], s.inStock)}`);
  }
  L.push(`  ${'out of stock, not fetched'.padEnd(34)} ${s.outOfStock}`, `  ${'refused rows, not counted'.padEnd(34)} ${s.rowRefused.length}`);
  L.push(`flagged: form not the category ${s.flagged('category').length}, batch not named ${s.flagged('batch').length}, ` +
         `one link on several batches ${rep.shared.length}`);
  if (rep.limit != null) L.push(`a partial run: --limit ${rep.limit}`);
  const where = f => { const r = path.relative(process.cwd(), f); return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : f; };
  if (files) L.push('', `written: ${files.map(where).join(', ')}`);
  return L;
}

/* ---------------------------------------------------------------- a run */

function utcDay(now = new Date()) { return now.toISOString().slice(0, 10); }

async function coverCatalog({ buffer, name, limit = null, pauseMs = PAUSE_MS, wait, log = () => {}, now } = {}) {
  const read = readCatalog(buffer);
  if (read.refusal) return { refusal: read.refusal };
  const v = require(path.join(LIB, 'version.js')).fromCheckout();
  if (!v.unpdf) return { error: 'unpdf is not installed - run: npm install' };
  const { extractCoaText } = require(path.join(LIB, 'extract-text.js'));
  const { parseCoa } = require(path.join(LIB, 'parse-coa.js'));
  const match = require(path.join(__dirname, 'lib/match.js')).load();
  const shared = flagSharedLinks(read.rows);
  const { tried, requested } = await coverRows(read.rows, { limit, pauseMs, wait, log, extract: extractCoaText, parse: parseCoa, match });
  const rep = { file: name, day: utcDay(now), version: `parser ${v.parserVersion}, extractor ${v.extractorVersion}`,
                limit, tried, requested, blank: read.blank, rows: read.rows, shared };
  rep.summary = summarise(read.rows);
  return { report: rep };
}

function writeReport(outDir, rep) {
  fs.mkdirSync(outDir, { recursive: true });
  const files = [path.join(outDir, 'report.md'), path.join(outDir, 'report.csv')];
  fs.writeFileSync(files[0], renderMarkdown(rep));
  fs.writeFileSync(files[1], renderCsv(rep));
  return files;
}

async function main(argv = process.argv.slice(2), { log = console.log, error = console.error, wait } = {}) {
  let opts;
  try { opts = parseArgs(argv); }
  catch (e) {
    if (!(e instanceof UsageError)) throw e;
    error(e.message);
    return 2;
  }
  let buffer;
  try { buffer = fs.readFileSync(opts.catalog); }
  catch (e) {
    error(`b2b-coverage: cannot read ${opts.catalog} (${e && e.code ? e.code : 'unreadable'})`);
    return 1;
  }
  const name = path.basename(opts.catalog);
  const got = await coverCatalog({ buffer, name, limit: opts.limit, wait, log });
  if (got.refusal) { error(`b2b-coverage: ${name} ${got.refusal}`); return 1; }
  if (got.error) { error(`b2b-coverage: ${got.error}`); return 1; }
  const outDir = path.resolve(opts.out || DEFAULT_OUT);
  const files = writeReport(outDir, got.report);
  log('');
  for (const line of summaryLines(got.report, files)) log(line);
  return 0;
}

module.exports = {
  main, coverCatalog, readCatalog, parseCsv, checkHeader, looksPersonal, readFetched, writeReport, renderMarkdown, renderCsv,
  parseArgs, UsageError, USAGE, COLUMNS, REQUIRED, CATEGORIES, FAMILY, PERSONAL_WORDS, PAUSE_MS, MIN_TEXT, SCANNER,
  NOVELTY_LINE, OUTCOMES, DEFAULT_OUT
};

if (require.main === module) {
  main().then(code => { process.exitCode = code; }, e => {
    console.error(`b2b-coverage failed: ${e && e.message}`);
    process.exitCode = 1;
  });
}
