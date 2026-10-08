'use strict';
/* NOSE for dispensaries - the catalog format, read. PARSER-HANDOFF s14.
 *
 * docs/B2B-CATALOG-FORMAT.md in code: the CSV a dispensary exports, one row
 * per batch it lists. Two readers share it, so that a file is refused for the
 * same columns, and a row for the same reasons, wherever it is read:
 *
 *   scripts/b2b-coverage.js          the coverage report, from a file on disk
 *   netlify/functions/b2b-catalog.js the upload, from a store's server
 *
 * Moved here from scripts/b2b-coverage.js on 2026-10-08, line for line, so
 * the upload could read the format without loading a Codespace script; the
 * script requires it back and exports the same names. test/b2b-coverage-test.js
 * pins what it does; test/b2b-catalog-test.js checks both readers use this one.
 *
 * A file whose header has a column that looks like it is about a person
 * (lib/store.js's PERSONAL_KEYS and seven more words) is refused before any
 * row is read, so a wrong export is never read; so is one with any column
 * outside the format, by name. Nothing here reads a request, a database or the
 * network, and nothing here logs.
 *
 * lib/ files are bundled into the functions that require them and are never
 * functions of their own.
 */

const { PERSONAL_KEYS } = require('./store');

const FORMAT_DOC = 'docs/B2B-CATALOG-FORMAT.md';
/* What a refused row's outcome is called, here and in the coverage report. */
const ROW_REFUSED = 'row refused';

/* The format, docs/B2B-CATALOG-FORMAT.md. Every column must be in the header;
   the ones not in REQUIRED may be empty on a row. */
const COLUMNS = Object.freeze(['product_id', 'batch_id', 'category', 'route', 'name', 'brand', 'coa_url',
                               'in_stock', 'product_url', 'thc_percent', 'cbd_percent']);
const REQUIRED = Object.freeze(['product_id', 'batch_id', 'category', 'route', 'name', 'in_stock']);
const CATEGORIES = Object.freeze(['flower', 'pre-roll', 'vape', 'concentrate']);
const ROUTES = Object.freeze(['smoking', 'inhalation']);
const STOCK = Object.freeze(['yes', 'no']);

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
      rows.push({ row, outcome: ROW_REFUSED, reasons: [`has ${rec.length} value${rec.length === 1 ? '' : 's'}; the header has ${COLUMNS.length}`] });
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
    if (problems.length) rows.push({ row, product_id: r.product_id, batch_id: r.batch_id, outcome: ROW_REFUSED, reasons: problems });
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

module.exports = {
  COLUMNS, REQUIRED, CATEGORIES, ROUTES, STOCK, PERSONAL_WORDS, MAX_FILE_BYTES, FORMAT_DOC, ROW_REFUSED,
  looksPersonal, parseCsv, checkHeader, readRows, readCatalog, shown
};
