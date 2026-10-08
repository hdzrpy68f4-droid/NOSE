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
 *   node scripts/b2b-coverage.js --store <slug> [--out DIR]
 *
 * The same report from the database, since 2026-10-08: the batches the store
 * uploaded (netlify/functions/b2b-catalog.js) and their current readings
 * (scripts/b2b-read-catalog.js). It fetches nothing and reads schema b2b
 * alone, as nose_b2b - NOSE_B2B_DB_URL, a Codespaces secret - and writes only
 * the two files. Its lines about the file become lines about the store: the
 * batches in its window, and that a row refused on upload is never kept.
 *
 * A file whose header has a column that looks like it is about a person
 * (lib/store.js's PERSONAL_KEYS and seven more words) is refused before any
 * row is read, so a wrong export is never read; so is one with any column
 * outside the format, by name. The reader lives in lib/b2b-catalog-format.js,
 * shared with the upload. A link is printed as its host only: an address can
 * carry a token.
 *
 * Aroma and flavour only. PARSER-HANDOFF s14.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify/functions/lib');
const { validateUrl, fetchPdf } = require(path.join(LIB, 'fetch-report.js'));
const format = require(path.join(LIB, 'b2b-catalog-format.js'));
/* The format, docs/B2B-CATALOG-FORMAT.md: the columns, the three lists, the
   personal rule and the reader, shared with the upload (2026-10-08). */
const { COLUMNS, REQUIRED, CATEGORIES, PERSONAL_WORDS, looksPersonal, parseCsv, checkHeader, readCatalog, shown } = format;

const USAGE = 'usage: node scripts/b2b-coverage.js <catalog.csv> [--out DIR] [--limit N]\n' +
              '       node scripts/b2b-coverage.js --store <slug> [--out DIR]';
const DEFAULT_OUT = path.join(ROOT, 'b2b-out');

/* The parser's productClass for each category. A pre-roll is flower to the
   parser: its "pre-roll" pattern is in the flower rule (parse-coa.js CLASSES). */
const FAMILY = Object.freeze({ flower: 'flower', 'pre-roll': 'flower', vape: 'vape', concentrate: 'concentrate' });
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
  notFetched: 'not fetched', outOfStock: 'out of stock', rowRefused: format.ROW_REFUSED,
  notRead: 'not read yet'
});
/* The four that an in-stock batch can end in, plus a --limit run's fifth -
   and, read from the database (--store), a batch scripts/b2b-read-catalog.js
   has not read yet: no reading, or one of a link the store has since changed. */
const IN_STOCK_OUTCOMES = Object.freeze([OUTCOMES.accepted, OUTCOMES.refused, OUTCOMES.noLink, OUTCOMES.fetchFailed,
                                         OUTCOMES.notFetched, OUTCOMES.notRead]);
const SAYS = Object.freeze({
  [OUTCOMES.accepted]: 'terpene panel NOSE can read',
  [OUTCOMES.refused]: 'report refused',
  [OUTCOMES.noLink]: 'no lab-report link in the catalog',
  [OUTCOMES.fetchFailed]: 'link could not be fetched',
  [OUTCOMES.notFetched]: 'not fetched (--limit)',
  [OUTCOMES.notRead]: 'not read yet'
});
const UNRECOGNISED = '(lab not recognised)';
const NO_REPORT = '(no report read)';

class UsageError extends Error {}

/* ------------------------------------------------------------ arguments */

function parseArgs(argv) {
  const opts = { catalog: null, store: null, out: null, limit: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--store') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new UsageError(`--store needs a store's slug\n${USAGE}`);
      opts.store = argv[++i];
    } else if (a === '--out') {
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
  if (opts.store && opts.catalog) throw new UsageError(`a catalog file or --store, not both\n${USAGE}`);
  if (opts.store && opts.limit != null) throw new UsageError(`--store reads the database and fetches nothing: --limit is for a file\n${USAGE}`);
  if (!opts.catalog && !opts.store) throw new UsageError(USAGE);
  return opts;
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

/* Numbers only for an accepted read: the total terpenes the lab printed, the
   top three as share of total, and the notes NOSE's card shows, word for word. */
function figures(r, match) {
  if (r.outcome !== OUTCOMES.accepted) return;
  r.top = topShares(match, r.output.terps);
  r.total = r.output.totalTerpenes;
  r.notes = [...(Array.isArray(r.output.novelty) && r.output.novelty.length ? [NOVELTY_LINE] : []),
             ...(Array.isArray(r.output.warnings) ? r.output.warnings.map(String) : [])];
}

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
    figures(r, match);
    log(`  ${String(tried).padStart(String(toTry).length)} of ${toTry}   row ${r.row}   ${r.outcome}`);
  }
  return { tried, requested };
}

/* ------------------------------------------------------------ the count */

const blankCounts = () => Object.fromEntries([['batches', 0], ...IN_STOCK_OUTCOMES.map(o => [o, 0])]);

/* The outcomes a report shows: "not fetched" only on a --limit run, "not
   read yet" only when a batch read from the database has no current reading. */
const shownOutcomes = rep => IN_STOCK_OUTCOMES.filter(o => (o !== OUTCOMES.notFetched || rep.limit != null) &&
                                                           (o !== OUTCOMES.notRead || rep.summary.total[OUTCOMES.notRead] > 0));

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
  const countRow = (label, t) => [md(label), String(t.batches), ...shownOutcomes(rep).map(o => share(t[o], t.batches))];
  const cols = shownOutcomes(rep).map(o => SAYS[o]);
  const fromStore = rep.source === 'store';

  L.push(`# Terpene panel coverage: ${md(rep.file)}`, '');
  if (fromStore) {
    L.push(`Read from the database on ${rep.day} (UTC): each batch's current reading, as \`scripts/b2b-read-catalog.js\` ` +
           'read its lab-report link - fetched once, as NOSE\'s scanner fetches a link, and read by the same parser. A link ' +
           'can change or move: a reading is what its link served the day it was read, and a link the store has changed since ' +
           'counts as not read yet.', '');
  } else {
    L.push(`Read on ${rep.day} (UTC) by NOSE ${md(rep.version)}. Each in-stock batch's lab-report link was fetched once, ` +
           'as NOSE\'s scanner fetches a link, and read by the same parser. A link can change or move: this is what each one ' +
           'served that day.', '');
  }
  L.push('This report is about the lab reports behind the catalog\'s links: whether NOSE can read the terpene panel on each. ' +
         'Aroma and flavor only. A batch without a panel NOSE can read shows no numbers.', '');
  if (rep.limit != null) {
    L.push(`**A partial run.** \`--limit ${rep.limit}\` tried the first ${plural(rep.tried, 'link')}; ` +
           `${plural(s.total[OUTCOMES.notFetched], 'in-stock batch', 'in-stock batches')} with a link ${s.total[OUTCOMES.notFetched] === 1 ? 'was' : 'were'} not fetched, ` +
           'so the shares below describe part of the catalog.', '');
  }

  L.push('## Summary', '');
  L.push(`**${share(s.total[OUTCOMES.accepted], s.inStock)}** in-stock inhalables have a terpene panel NOSE can read.`, '');
  if (fromStore) {
    L.push(`The store lists ${plural(s.rows, 'batch', 'batches')} in its ${rep.store.windowMonths}-month window: ` +
           `${plural(s.inStock, 'in-stock batch', 'in-stock batches')} and ${s.outOfStock} out of stock (kept for past purchases). ` +
           'A row refused on upload is never kept: the upload\'s reply lists it.', '');
  } else {
    L.push(`The file has ${plural(s.rows + rep.blank, 'row')} after its header: ${plural(s.inStock, 'in-stock batch', 'in-stock batches')}, ` +
           `${s.outOfStock} out of stock (not fetched), ${plural(s.rowRefused.length, 'row')} refused (listed at the end)` +
           `${rep.blank ? `, and ${plural(rep.blank, 'blank row')} skipped` : ''}.`, '');
  }
  table(['in-stock batches', 'how many'], shownOutcomes(rep).map(o => [SAYS[o], share(s.total[o], s.inStock)]), [1]);
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
  if (fromStore) {
    const kept = rep.rows.filter(r => r.outcome === OUTCOMES.outOfStock);
    L.push(`- Out of stock: ${s.outOfStock}. Kept so a shopper's past purchases are still found; ` +
           `${share(kept.filter(r => r.readable).length, kept.length)} have a terpene panel NOSE can read. ` +
           'Their links still count for "one link on more than one batch".');
    L.push('- Refused rows: never kept. The upload\'s reply lists each, by row number and reason.');
  } else {
    L.push(`- Out of stock: ${s.outOfStock}. Not fetched; their links still count for "one link on more than one batch".`);
    L.push(`- Refused rows: ${s.rowRefused.length}${s.rowRefused.length ? '. Each fails the format, and is not counted above:' : '.'}`);
    for (const r of s.rowRefused) L.push(`  - row ${r.row}${r.batch_id ? ` (batch "${md(r.batch_id)}")` : ''}: ${md(r.reasons.join('; '))}`);
  }
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
  for (const o of shownOutcomes(rep)) {
    if (o === OUTCOMES.accepted) continue;
    L.push(`  ${SAYS[o].padEnd(34)} ${share(s.total[o], s.inStock)}`);
  }
  if (rep.source === 'store') L.push(`  ${'out of stock, kept'.padEnd(34)} ${s.outOfStock}`);
  else L.push(`  ${'out of stock, not fetched'.padEnd(34)} ${s.outOfStock}`, `  ${'refused rows, not counted'.padEnd(34)} ${s.rowRefused.length}`);
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

/* --store: the same report, from the database. Each batch the store has
   listed within its window, as lib/b2b-store.js's listedInWindow() reads it,
   becomes the row the report would have made of it from the file: its row
   number is list_position - the row of the last upload that listed it - and
   its outcome comes from its current reading, as scripts/b2b-read-catalog.js
   wrote it. The parser's output is what the reading keeps of it: lab, form,
   the report's batch and lab ID, the terpenes and total of an accepted read,
   its warnings, and whether its layout was new. A reading the parser never
   made - the link gave no report, or the scanner could not read the PDF -
   has no form, so it is flagged for nothing, as in the file's report. */
const NEW_LAYOUT = Object.freeze(['(the reading kept only that its layout was new)']);

function fromDatabase(b) {
  const r = { row: b.listPosition, product_id: b.productId, batch_id: b.batchId, category: b.category, route: b.route,
              name: b.name, brand: b.brand || '', coa_url: b.coaUrl || '', in_stock: b.inStock ? 'yes' : 'no',
              product_url: b.productUrl || '', outcome: null, reasons: [], flags: [] };
  const rd = b.reading;
  if (!b.inStock) {
    r.outcome = OUTCOMES.outOfStock;
    r.readable = !!(rd && rd.current && rd.usable);
    return r;
  }
  if (!b.coaUrl) { r.outcome = OUTCOMES.noLink; return r; }
  if (!rd || !rd.sameLink) { r.outcome = OUTCOMES.notRead; return r; }
  if (!rd.fetched) { Object.assign(r, { outcome: OUTCOMES.fetchFailed, reasons: [...rd.rejectReasons] }); return r; }
  Object.assign(r, { outcome: rd.usable ? OUTCOMES.accepted : OUTCOMES.refused, reasons: rd.usable ? [] : [...rd.rejectReasons] });
  if (rd.productClass != null) {
    r.output = { usable: rd.usable, lab: rd.lab, productClass: rd.productClass, batch: rd.batch, labId: rd.labId,
                 terps: rd.terps, totalTerpenes: rd.totalTerpenes, warnings: rd.warnings, novelty: rd.newLayout ? NEW_LAYOUT : [] };
  }
  return r;
}

async function coverStore({ slug, client, now } = {}) {
  const b2b = require(path.join(LIB, 'b2b-store.js'));
  const store = await b2b.storeBySlug(slug, { client });
  if (!store) return { refusal: `no store called "${shown(slug, 40)}"` };
  const listed = await b2b.listedInWindow(store.storeId, { client });
  const match = require(path.join(__dirname, 'lib/match.js')).load();
  /* In the file's order, as the file's report has them: by row. */
  const rows = listed.map(fromDatabase).sort((x, y) => x.row - y.row || x.batch_id.localeCompare(y.batch_id));
  const shared = flagSharedLinks(rows);
  for (const r of rows) {
    if (r.in_stock !== 'yes') continue;
    flagReading(r);
    figures(r, match);
  }
  const rep = { source: 'store', file: `store ${slug}`, store, day: utcDay(now), limit: null, blank: 0, rows, shared };
  rep.summary = summarise(rows);
  return { report: rep };
}

function writeReport(outDir, rep) {
  fs.mkdirSync(outDir, { recursive: true });
  const files = [path.join(outDir, 'report.md'), path.join(outDir, 'report.csv')];
  fs.writeFileSync(files[0], renderMarkdown(rep));
  fs.writeFileSync(files[1], renderCsv(rep));
  return files;
}

/* The report from the database, as nose_b2b (NOSE_B2B_DB_URL, a Codespaces
   secret): it reads schema b2b and writes report.md and report.csv, nothing
   else. client exists for test/b2b-catalog-test.js. */
async function mainStore(opts, { log, error, client, env }) {
  let db = client || null;
  let own = false;
  try {
    if (!db) {
      if (!env.NOSE_B2B_DB_URL) {
        error('b2b-coverage: NOSE_B2B_DB_URL is not set - it is a Codespaces secret; add it, then restart the Codespace');
        return 1;
      }
      const { Client } = require('pg');
      const { clientConfig } = require(path.join(LIB, 'store.js'));
      db = new Client(clientConfig(env.NOSE_B2B_DB_URL, { name: 'NOSE_B2B_DB_URL', timeoutMs: 10000, queryTimeoutMs: 60000 }));
      db.on('error', () => {});
      own = true;
      await db.connect();
    }
    const got = await coverStore({ slug: opts.store, client: db });
    if (got.refusal) { error(`b2b-coverage: ${got.refusal}`); return 1; }
    const files = writeReport(path.resolve(opts.out || DEFAULT_OUT), got.report);
    log('');
    for (const line of summaryLines(got.report, files)) log(line);
    return 0;
  } catch (e) {
    error(`b2b-coverage: the database could not be read - ${require(path.join(LIB, 'b2b-store.js'))._scrub(e)}`);
    return 1;
  } finally {
    if (own && db) await db.end().catch(() => {});
  }
}

async function main(argv = process.argv.slice(2), { log = console.log, error = console.error, wait, client, env = process.env } = {}) {
  let opts;
  try { opts = parseArgs(argv); }
  catch (e) {
    if (!(e instanceof UsageError)) throw e;
    error(e.message);
    return 2;
  }
  if (opts.store) return mainStore(opts, { log, error, client, env });
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
  main, coverCatalog, coverStore, readCatalog, parseCsv, checkHeader, looksPersonal, readFetched, writeReport, renderMarkdown,
  renderCsv, parseArgs, UsageError, USAGE, COLUMNS, REQUIRED, CATEGORIES, FAMILY, PERSONAL_WORDS, PAUSE_MS, MIN_TEXT, SCANNER,
  NOVELTY_LINE, OUTCOMES, DEFAULT_OUT
};

if (require.main === module) {
  main().then(code => { process.exitCode = code; }, e => {
    console.error(`b2b-coverage failed: ${e && e.message}`);
    process.exitCode = 1;
  });
}
