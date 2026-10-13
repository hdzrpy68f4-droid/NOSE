#!/usr/bin/env node
'use strict';
/* NOSE for dispensaries - the pilot's report. PARSER-HANDOFF s14, "Pilot plan
 * and report".
 *
 *   node scripts/b2b-pilot-report.js <export.csv> --store <slug>
 *
 * Reads three things and writes nothing:
 *
 *   the plan     docs/pilots/<slug>.md, made from docs/B2B-PILOT-PLAN.md and
 *                committed before the pilot's first day. Its ```pilot block
 *                holds the pre-registered numbers; git says when they were
 *                first committed.
 *   the export   the store's CSV, one row per assigned shopper, counts only
 *                (docs/B2B-PILOT-EXPORT.md). A personal-looking or other
 *                unknown column, or any row it cannot read, refuses the whole
 *                file, before anything is computed from it.
 *   the votes    the store's keys in the "b2b-votes" Blobs store, listed and
 *                never read, written or deleted (lib/b2b-votes.js). A key
 *                names the band, up or down, and the UTC day.
 *
 * It keeps the analysis layer's habits (scripts/lab-stats.js): it only reads,
 * and a denominator sits beside every share - "180 of 450 shoppers (40.0%)" -
 * with a 95% interval beside every rate. Whatever the numbers show, the same
 * rule reads them:
 *
 *   - Until the plan's last day has passed and both groups hold the
 *     pre-registered shoppers_per_group, it prints only how far short the run
 *     is: no rate, no interval, no result.
 *   - The primary result is the interval of the difference in the share of
 *     assigned shoppers with an inhalable order, test minus control, at the
 *     plan's alpha: wholly above zero, wholly below, or including it.
 *   - It withholds every result, saying why, when the plan's numbers were
 *     first committed on or after the first day (or git cannot tell), when the
 *     split fails a chi-squared check against half and half (p < 0.001), when
 *     a control shopper shows any sign of the widget, or when the plan's
 *     shoppers_per_group is below what its own numbers require.
 *
 * The methods: a proportion's interval is Wilson's score interval; a
 * difference of two proportions, Newcombe's hybrid score interval, built from
 * the two Wilson intervals (Newcombe, Statistics in Medicine 17, 1998,
 * 873-890, method 10); a ratio of sums over shoppers - visits, revenue per
 * order - the delta method, each shopper the unit, since shoppers are what the
 * page randomised; a mean count, the normal interval of a mean; the split, a
 * chi-squared goodness-of-fit test. The normal quantile and distribution are
 * scripts/b2b-sample-size.js's, so the sample size checked here is the one the
 * plan was given.
 *
 * Bands are matchBand()'s own four names (lib/b2b-votes.js's BANDS, which
 * test/b2b-endpoints-test.js reads back from js/match-math). No score is shown:
 * the report counts votes by band.
 *
 * Prints no row of the export, no value from a refused file, no secret and no
 * vote key: counts and shares only. Needs NETLIFY_SITE_ID and
 * NETLIFY_AUTH_TOKEN, as delete-store does, for the votes.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify/functions/lib');
const format = require(path.join(LIB, 'b2b-catalog-format.js'));
const b2bVotes = require(path.join(LIB, 'b2b-votes.js'));
const sizing = require('./b2b-sample-size.js');
const rerun = require('./lib/rerun');

const USAGE = 'usage: node scripts/b2b-pilot-report.js <export.csv> --store <slug>';
const EXPORT_DOC = 'docs/B2B-PILOT-EXPORT.md';
const PLAN_DOC = 'docs/B2B-PILOT-PLAN.md';
const PLANS_DIR = 'docs/pilots';
const SECRETS = ['NETLIFY_SITE_ID', 'NETLIFY_AUTH_TOKEN'];

class UsageError extends Error {}
class Refusal extends Error {}

/* ======================================================= the export format */

const COLUMNS = Object.freeze(['group', 'orders', 'inhalable_orders', 'revenue', 'soldout_sessions',
  'soldout_sessions_ordered', 'opted_in', 'bought_matched', 'bought_matched_again']);
const COUNTS = Object.freeze(['orders', 'inhalable_orders', 'soldout_sessions', 'soldout_sessions_ordered']);
const FLAGS = Object.freeze(['opted_in', 'bought_matched', 'bought_matched_again']);
const GROUPS = Object.freeze(['test', 'control']);

/* A column that could identify a shopper refuses the export, as a personal
   column refuses a catalog. The catalog's own rule first (looksPersonal, its
   list and its matching), then these words, matched the same way: a word
   longer than three letters anywhere in the name once case and separators
   are gone, a short one only as a whole part of it. */
const IDENTITY_WORDS = Object.freeze(['shopper', 'member', 'loyalty', 'name', 'birth', 'zip', 'zipcode', 'postal',
  'postcode', 'account', 'id', 'uuid', 'guid']);
const squash = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const ID_LONG = IDENTITY_WORDS.filter(w => w.length > 3);
const ID_SHORT = IDENTITY_WORDS.filter(w => w.length <= 3);

function looksIdentifying(name) {
  if (format.looksPersonal(name)) return true;
  const flat = squash(name);
  if (ID_LONG.some(w => flat.includes(w))) return true;
  const parts = String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return ID_SHORT.some(w => parts.includes(w) || flat === w);
}

const refuse = why => ({ refusal: `refused: ${why}. Nothing in the file was used. The format is ${EXPORT_DOC}.` });
const listed = list => list.map(n => (n === '' ? '(an empty name)' : `"${format.shown(n, 60)}"`)).join(', ');

function checkExportHeader(header) {
  const raw = header.map((h, i) => (i === 0 ? h.replace(/^﻿/, '') : h).trim());
  const personal = raw.filter(looksIdentifying);
  if (personal.length) {
    return refuse(`the header has ${personal.length === 1 ? 'a column' : 'columns'} that looks like it is about a person - ` +
      `${listed(personal)} - so none of its rows was read. A pilot export carries counts per shopper, never who the ` +
      'shopper is: export the format\'s columns only');
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

const WHOLE = /^\d{1,7}$/;
const MONEY = /^(\d{1,9})(?:\.(\d{1,2}))?$/;
const MAX_LISTED = 20;

/* One shopper's row, or every reason it cannot be read - never its values. */
function readRow(rec, index) {
  const problems = [];
  if (rec.length !== COLUMNS.length) {
    return { problems: [`has ${rec.length} value${rec.length === 1 ? '' : 's'}; the header has ${COLUMNS.length}`] };
  }
  const v = Object.fromEntries(COLUMNS.map(c => [c, rec[index[c]].trim()]));
  for (const c of COLUMNS) if (v[c] === '') problems.push(`${c} is empty`);
  const r = {};
  const group = v.group.toLowerCase();
  if (v.group !== '' && !GROUPS.includes(group)) problems.push('group is not test or control');
  r.group = group;
  for (const c of COUNTS) {
    if (v[c] === '') continue;
    if (!WHOLE.test(v[c])) problems.push(`${c} is not a whole number`);
    else r[c] = Number(v[c]);
  }
  if (v.revenue !== '') {
    const m = MONEY.exec(v.revenue);
    if (!m) problems.push('revenue is not a plain number with at most two decimals');
    else r.cents = Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
  }
  for (const c of FLAGS) {
    if (v[c] === '') continue;
    const f = v[c].toLowerCase();
    if (f !== 'yes' && f !== 'no') problems.push(`${c} is not yes or no`);
    else r[c] = f === 'yes';
  }
  if (problems.length) return { problems };
  if (r.inhalable_orders > r.orders) problems.push('inhalable_orders is more than orders');
  if (r.soldout_sessions_ordered > r.soldout_sessions) problems.push('soldout_sessions_ordered is more than soldout_sessions');
  if (r.soldout_sessions_ordered > r.inhalable_orders) problems.push('soldout_sessions_ordered is more than inhalable_orders');
  if (r.orders === 0 && r.cents > 0) problems.push('revenue is above 0 with no orders');
  if (r.bought_matched && r.inhalable_orders === 0) problems.push('bought_matched is yes with no inhalable order');
  if (r.bought_matched_again && !r.bought_matched) problems.push('bought_matched_again is yes while bought_matched is no');
  return problems.length ? { problems } : { row: r };
}

/* The whole file, or its refusal. One row it cannot read refuses it all: a row
   left out would change every share the pilot rests on. */
function readExport(buffer) {
  if (!buffer || !buffer.length) return refuse('the file is empty');
  if (buffer.length > format.MAX_FILE_BYTES) return refuse(`the file is larger than ${format.MAX_FILE_BYTES / 1024 / 1024} MB`);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { return refuse('the file is not UTF-8 text - save it as "CSV UTF-8"'); }
  const end = text.search(/\r\n|\n|\r/);
  const head = format.parseCsv(end < 0 ? text : text.slice(0, end));
  if (head.error || !head.records.length || head.records[0].every(v => v.trim() === '')) return refuse('the first line is not a header row');
  const checked = checkExportHeader(head.records[0]);
  if (checked.refusal) return checked;
  const all = format.parseCsv(text);
  if (all.error) return refuse(all.error);
  const rows = [];
  const bad = [];
  let blank = 0;
  for (let k = 1; k < all.records.length; k++) {
    const rec = all.records[k];
    if (rec.every(v => v.trim() === '')) { blank++; continue; }
    const res = readRow(rec, checked.index);
    if (res.problems) bad.push(`row ${k + 1}: ${res.problems.join(', ')}`);
    else rows.push(res.row);
  }
  if (bad.length) {
    const shown = bad.slice(0, MAX_LISTED).join('; ');
    const more = bad.length > MAX_LISTED ? ` (and ${bad.length - MAX_LISTED} more row${bad.length - MAX_LISTED === 1 ? '' : 's'})` : '';
    return refuse(`${bad.length === 1 ? 'a row' : `${bad.length} rows`} cannot be read - ${shown}${more} - and a row left out ` +
      'would change every share the pilot rests on');
  }
  if (!rows.length) return refuse('the file has no shopper rows');
  return { rows, blank };
}

/* ============================================================= the plan */

const PLAN_KEYS = Object.freeze(['store', 'first_day', 'last_day', 'baseline', 'lift', 'alpha', 'power',
  'shoppers_per_group', 'votes_per_band']);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

function isDay(s) {
  if (typeof s !== 'string' || !DAY.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/* The ```pilot block, as raw values: { values } or { error }. */
function readPlanBlock(text) {
  const starts = String(text).match(/^```pilot[ \t]*$/gm) || [];
  if (starts.length !== 1) return { error: starts.length ? 'it has more than one ```pilot block' : 'it has no ```pilot block' };
  const m = /^```pilot[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/m.exec(text);
  if (!m) return { error: 'its ```pilot block is never closed' };
  const values = {};
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const kv = /^([a-z_]+):(.*)$/.exec(line);
    if (!kv) return { error: 'a line of its ```pilot block is not "name: value"' };
    const [, key, value] = kv;
    if (!PLAN_KEYS.includes(key)) return { error: `its \`\`\`pilot block names something the report does not read: ${key}` };
    if (key in values) return { error: `its \`\`\`pilot block gives ${key} twice` };
    values[key] = value.trim();
  }
  const missing = PLAN_KEYS.filter(k => !(k in values));
  if (missing.length) return { error: `its \`\`\`pilot block is missing ${missing.join(', ')}` };
  const blank = PLAN_KEYS.filter(k => values[k] === '' || /_{2,}|YYYY/.test(values[k]));
  if (blank.length) return { error: `it is not filled in: ${blank.join(', ')}` };
  return { values };
}

/* The numbers, checked and typed: { plan } or { error }. */
function checkPlan(values, slug) {
  const v = values;
  if (!SLUG.test(v.store)) return { error: 'store is not a store slug' };
  if (v.store !== slug) return { error: `it is the plan of store "${v.store}", not "${slug}"` };
  for (const k of ['first_day', 'last_day']) if (!isDay(v[k])) return { error: `${k} is not a day, YYYY-MM-DD` };
  if (v.last_day < v.first_day) return { error: 'last_day is before first_day' };
  for (const k of ['baseline', 'lift', 'alpha', 'power']) if (!DECIMAL.test(v[k])) return { error: `${k} is not a number` };
  for (const k of ['shoppers_per_group', 'votes_per_band']) {
    if (!/^\d{1,9}$/.test(v[k]) || Number(v[k]) < 1) return { error: `${k} is not a whole number above 0` };
  }
  const plan = {
    store: v.store, firstDay: v.first_day, lastDay: v.last_day, baseline: Number(v.baseline), lift: Number(v.lift),
    alpha: Number(v.alpha), power: Number(v.power), perGroup: Number(v.shoppers_per_group), votesPerBand: Number(v.votes_per_band)
  };
  if (!(plan.alpha > 0 && plan.alpha < 1)) return { error: 'alpha is not between 0 and 1' };
  if (!(plan.power >= 0.5 && plan.power < 1)) return { error: 'power is not from 0.5 to below 1' };
  try { plan.required = sizing.perGroup(plan).n; }
  catch (e) { return { error: e.message.replace(/--(\w+)/g, '$1') }; }
  return { plan };
}

/* When were these numbers first committed? Git, read only. */
function gitIn(root) {
  return args => execFileSync('git', ['--no-optional-locks', '-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function preRegistration({ rel, values, firstDay, git }) {
  try {
    if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true') {
      return { ok: false, why: 'this clone is shallow, so git cannot show when the plan was first committed (git fetch --unshallow)' };
    }
    if (git(['status', '--porcelain', '--', rel]).trim()) {
      return { ok: false, why: `${rel} has changes git has not committed, so its numbers are not the ones committed before the first day` };
    }
    const commits = git(['log', '--reverse', '--format=%H %cI', '--', rel]).split('\n').filter(Boolean);
    for (const line of commits) {
      const [hash, when] = line.split(' ');
      let text;
      try { text = git(['show', `${hash}:${rel}`]); } catch { continue; }
      const then = readPlanBlock(text);
      if (!then.values || PLAN_KEYS.some(k => then.values[k] !== values[k])) continue;
      const day = new Date(when).toISOString().slice(0, 10);
      const commit = hash.slice(0, 7);
      return day < firstDay
        ? { ok: true, commit, day }
        : { ok: false, commit, day, why: `the plan's numbers were first committed on ${day} (${commit}), not before the first day ${firstDay}` };
    }
    return { ok: false, why: `${rel} is not committed` };
  } catch {
    return { ok: false, why: 'git could not be read here, so nothing shows when the plan was committed' };
  }
}

/* ============================================================ the votes */

const VOTE_TAIL = /^[0-9a-f]{32}$/;

async function readVotes(store, slug, { firstDay, lastDay }) {
  const prefix = b2bVotes.storePrefix(slug);
  const keys = await b2bVotes.storeVoteKeys(store, slug);
  const counts = Object.fromEntries(b2bVotes.BANDS.map(b => [b, { up: 0, down: 0 }]));
  const perDay = Object.create(null);
  let outside = 0;
  let unread = 0;
  for (const key of keys) {
    const parts = key.startsWith(prefix) ? key.slice(prefix.length).split('/') : [];
    const [band, vote, day, tail] = parts;
    if (parts.length !== 4 || !b2bVotes.BANDS.includes(band) || !b2bVotes.VOTES.includes(vote) || !isDay(day) || !VOTE_TAIL.test(tail)) {
      unread++;
      continue;
    }
    if (day < firstDay || day > lastDay) { outside++; continue; }
    counts[band][vote]++;
    perDay[day] = (perDay[day] || 0) + 1;
  }
  const capped = Object.keys(perDay).filter(d => perDay[d] >= b2bVotes.DEFAULT_DAILY_CAP).sort();
  return { counts, outside, unread, capped, listed: keys.length };
}

/* ======================================================== the statistics */

const Z95 = sizing.normalQuantile(0.975);

/* Wilson's score interval for x of n. */
function wilson(x, n, z = Z95) {
  if (!(n > 0)) return null;
  const p = x / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / den;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/* Newcombe's hybrid score interval for x1/n1 - x2/n2 (his method 10). */
function newcombe(x1, n1, x2, n2, z = Z95) {
  if (!(n1 > 0 && n2 > 0)) return null;
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const [l1, u1] = wilson(x1, n1, z);
  const [l2, u2] = wilson(x2, n2, z);
  const d = p1 - p2;
  return [d - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2), d + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)];
}

/* A ratio of sums over shoppers, sum(y) / sum(x), with the delta method's
   interval: each shopper is one unit, since shoppers are what was randomised. */
function ratio(pairs, z = Z95) {
  const n = pairs.length;
  let X = 0;
  let Y = 0;
  for (const [x, y] of pairs) { X += x; Y += y; }
  if (!(X > 0)) return { n, X, Y, R: null, se: null, interval: null };
  const R = Y / X;
  if (n < 2) return { n, X, Y, R, se: null, interval: null };
  let ss = 0;
  for (const [x, y] of pairs) { const d = y - R * x; ss += d * d; }
  const se = Math.sqrt(ss / (n - 1) / n) / (X / n);
  return { n, X, Y, R, se, interval: [R - z * se, R + z * se] };
}

/* A mean, with the normal interval of a mean. */
function mean(values, z = Z95) {
  const n = values.length;
  if (!n) return { n, m: null, se: null, interval: null };
  const m = values.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { n, m, se: null, interval: null };
  const ss = values.reduce((a, v) => a + (v - m) * (v - m), 0);
  const se = Math.sqrt(ss / (n - 1) / n);
  return { n, m, se, interval: [m - z * se, m + z * se] };
}

/* The difference of two estimates with standard errors: a - b. */
function difference(a, b, valueOf, z = Z95) {
  const va = valueOf(a);
  const vb = valueOf(b);
  if (va === null || vb === null || a.se === null || b.se === null) return null;
  const d = va - vb;
  const se = Math.hypot(a.se, b.se);
  return { d, interval: [d - z * se, d + z * se] };
}

/* Does the split fit half and half? Pearson's chi-squared, one degree of
   freedom: (nt - nc)^2 / (nt + nc). */
function splitCheck(nt, nc) {
  const z = (nt - nc) / Math.sqrt(nt + nc);
  return { chi2: z * z, p: 2 * sizing.normalUpper(Math.abs(z)) };
}

/* Which side of zero an interval lies on. */
const side = iv => (iv[0] > 0 ? 'above' : iv[1] < 0 ? 'below' : 'includes');

/* ============================================================ the words */

const thousands = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
function fixed(v, d) {
  const s = v.toFixed(d);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}
function signed(v, d) {
  const s = fixed(v, d);
  return s.startsWith('-') || Number(s) === 0 ? s : `+${s}`;
}
const pct = p => `${fixed(p * 100, 1)}%`;
const share = (x, n) => (n ? pct(x / n) : '-');
const points = d => `${signed(d * 100, 1)}`;
function money(v, sign = false) {
  const s = fixed(v, 2);
  const neg = s.startsWith('-');
  const [i, f] = s.replace('-', '').split('.');
  return `${neg ? '-' : sign && Number(s) !== 0 ? '+' : ''}${thousands(i)}.${f}`;
}
function level(alpha) {
  const s = fixed((1 - alpha) * 100, 1);
  return `${s.endsWith('.0') ? s.slice(0, -2) : s}%`;
}
const plural = (n, word) => `${thousands(n)} ${word}${n === 1 ? '' : 's'}`;
const clamp01 = iv => (iv ? [Math.max(0, iv[0]), Math.min(1, iv[1])] : iv);
const pValue = p => (p >= 0.01 ? p.toFixed(2) : p.toPrecision(2));
const col = (label, width = 11) => label.padEnd(width);

/* ============================================================ the report */

function byGroup(rows) {
  const g = { test: [], control: [] };
  for (const r of rows) g[r.group].push(r);
  return g;
}

function primaryOf(rows, z) {
  const x = rows.filter(r => r.inhalable_orders > 0).length;
  return { x, n: rows.length, iv: wilson(x, rows.length, z) };
}

async function pilotReport({ plan, planRel, values, exported, exportName, slug, votes, today, git, log = console.log }) {
  const { rows, blank } = exported;
  const g = byGroup(rows);
  const nt = g.test.length;
  const nc = g.control.length;
  const zPlan = sizing.normalQuantile(1 - plan.alpha / 2);
  const L = level(plan.alpha);

  const reg = preRegistration({ rel: planRel, values, firstDay: plan.firstDay, git });
  const running = today <= plan.lastDay;
  const short = nt < plan.perGroup || nc < plan.perGroup;
  const split = splitCheck(nt, nc);
  const leaked = g.control.filter(r => r.opted_in || r.bought_matched || r.bought_matched_again).length;
  const voteData = await readVotes(votes, slug, plan);

  const out = { state: running ? 'running' : short ? 'short' : 'complete', checks: {}, result: null, guardrail: null, bands: null };
  const stops = [];
  const check = (key, ok, text) => { out.checks[key] = ok; log(`  ${ok === true ? 'ok   ' : ok === 'wait' ? 'WAIT ' : ok === 'short' ? 'SHORT' : 'FAIL '}  ${text}`); };

  log(`NOSE pilot report - ${slug}`);
  log(`Plan: ${planRel} - first day ${plan.firstDay}, last day ${plan.lastDay} (UTC); baseline ${values.baseline}, lift ${values.lift}, ` +
      `alpha ${values.alpha}, power ${values.power}: ${thousands(plan.perGroup)} shoppers per group, ${thousands(plan.votesPerBand)} votes per band`);
  log(`Export: ${exportName} - ${plural(rows.length, 'assigned shopper')}: ${thousands(nt)} test, ${thousands(nc)} control` +
      (blank ? ` (${plural(blank, 'blank row')} skipped)` : ''));
  log('Every figure here is computed the same way whatever it shows. A match score compares the terpene profiles two lab ' +
      'reports measured: aroma and flavor only.');
  log('');
  log('Checks');
  if (reg.ok) check('preRegistered', true, `the plan's numbers were committed on ${reg.day} (${reg.commit}), before the first day ${plan.firstDay}`);
  else { check('preRegistered', false, reg.why); stops.push('the plan was not committed before the first day'); }
  if (running) check('ended', 'wait', `the pilot is still running: its last day is ${plan.lastDay}; today is ${today} (UTC)`);
  else check('ended', true, `the pilot has ended: its last day was ${plan.lastDay}; today is ${today} (UTC)`);
  if (short) {
    check('size', 'short', `the run is short of the planned ${thousands(plan.perGroup)} shoppers a group: test ${thousands(nt)}, control ${thousands(nc)}`);
  } else {
    check('size', true, `both groups reached the planned ${thousands(plan.perGroup)} shoppers: test ${thousands(nt)}, control ${thousands(nc)}`);
  }
  if (plan.perGroup >= plan.required) {
    check('sized', true, `shoppers_per_group ${thousands(plan.perGroup)} is at least what baseline, lift, alpha and power require (${thousands(plan.required)})`);
  } else {
    check('sized', false, `shoppers_per_group ${thousands(plan.perGroup)} is below what baseline, lift, alpha and power require (${thousands(plan.required)})`);
    stops.push('the plan\'s sample size is below what its own numbers require');
  }
  if (split.p >= 0.001) {
    check('split', true, `the split fits half and half: test ${thousands(nt)}, control ${thousands(nc)} (chi-squared p = ${pValue(split.p)}; below 0.001 stops the result)`);
  } else {
    check('split', false, `the split does not fit half and half: test ${thousands(nt)}, control ${thousands(nc)} (chi-squared p = ${pValue(split.p)}, below 0.001)`);
    stops.push('the split does not fit half and half - check how the page assigns groups');
  }
  if (!leaked) {
    check('control', true, 'control saw nothing of the widget: no control shopper shows yes for opted_in, bought_matched or bought_matched_again');
  } else {
    check('control', false, `${thousands(leaked)} of ${thousands(nc)} control shoppers show yes for opted_in, bought_matched or bought_matched_again: the groups leaked`);
    stops.push('control shoppers show signs of the widget');
  }
  log('');

  const voteTotal = b => voteData.counts[b].up + voteData.counts[b].down;
  if (running || short) {
    log(`Until the last day has passed and both groups hold ${thousands(plan.perGroup)} shoppers, this report shows only how far short the run is:`);
    for (const [name, n] of [['test', nt], ['control', nc]]) {
      log(`  ${col(name)}${thousands(n)} of ${thousands(plan.perGroup)} shoppers   (${n >= plan.perGroup ? 'reached' : `${thousands(plan.perGroup - n)} short`})`);
    }
    log(`  ${col('votes')}${b2bVotes.BANDS.map(b => `${b} ${thousands(voteTotal(b))}`).join(', ')} - the band check needs ` +
        `${thousands(plan.votesPerBand)} each in ${b2bVotes.BANDS[0]} and ${b2bVotes.BANDS[b2bVotes.BANDS.length - 1]}`);
    log('No rate, interval or result is shown before then, whatever the figures would say.');
    out.short = { test: Math.max(0, plan.perGroup - nt), control: Math.max(0, plan.perGroup - nc) };
    return out;
  }

  const withheld = stops.length ? `none - ${stops.join('; ')}.` : null;

  /* ---- the primary metric ---- */
  log('Primary - shoppers with an inhalable order, per assigned shopper (decides the result)');
  const pt = primaryOf(g.test, Z95);
  const pc = primaryOf(g.control, Z95);
  for (const [name, p] of [['test', pt], ['control', pc]]) {
    log(`  ${col(name)}${thousands(p.x)} of ${thousands(p.n)} shoppers   ${share(p.x, p.n)}   95% interval ${pct(p.iv[0])} to ${pct(p.iv[1])}`);
  }
  const d95 = newcombe(pt.x, pt.n, pc.x, pc.n, Z95);
  const dPlan = newcombe(pt.x, pt.n, pc.x, pc.n, zPlan);
  const diff = pt.x / pt.n - pc.x / pc.n;
  const rel = pc.x ? `   relative ${signed((pt.x / pt.n) / (pc.x / pc.n) * 100 - 100, 1)}%` : '';
  log(`  difference (test - control)   ${points(diff)} points   95% interval ${points(d95[0])} to ${points(d95[1])} points${rel}`);
  const where = `the ${L} interval of the difference, ${points(dPlan[0])} to ${points(dPlan[1])} points,`;
  out.primary = { test: pt, control: pc, diff, interval: dPlan };
  if (withheld) log(`  RESULT: ${withheld}`);
  else {
    out.result = side(dPlan) === 'above' ? 'more' : side(dPlan) === 'below' ? 'fewer' : 'no difference shown';
    log(`  RESULT: ${out.result === 'more' ? `more test shoppers placed an inhalable order - ${where} is wholly above zero.`
      : out.result === 'fewer' ? `fewer test shoppers placed an inhalable order - ${where} is wholly below zero.`
        : `no difference shown - ${where} includes zero.`}`);
  }
  log('  Beside it, deciding nothing - inhalable orders per assigned shopper:');
  const mt = mean(g.test.map(r => r.inhalable_orders));
  const mc = mean(g.control.map(r => r.inhalable_orders));
  for (const [name, m, rs] of [['test', mt, g.test], ['control', mc, g.control]]) {
    const total = rs.reduce((a, r) => a + r.inhalable_orders, 0);
    log(`  ${col(name)}${plural(total, 'inhalable order')} / ${plural(m.n, 'shopper')} = ${fixed(m.m, 2)}` +
        (m.interval ? `   95% interval ${fixed(Math.max(0, m.interval[0]), 2)} to ${fixed(m.interval[1], 2)}` : ''));
  }
  const md = difference(mt, mc, e => e.m);
  if (md) log(`  difference (test - control)   ${signed(md.d, 2)}   95% interval ${signed(md.interval[0], 2)} to ${signed(md.interval[1], 2)}`);
  log('');

  /* ---- secondary metrics ---- */
  log('Secondary - reported, deciding nothing');
  log('  Sold-out recovery: visits with the shopper\'s most-bought product out of stock that ended in an inhalable order');
  const so = {};
  for (const [name, rs] of [['test', g.test], ['control', g.control]]) {
    const r = ratio(rs.map(x => [x.soldout_sessions, x.soldout_sessions_ordered]));
    so[name] = r;
    const from = rs.filter(x => x.soldout_sessions > 0).length;
    const iv = clamp01(r.interval);
    log(`  ${col(name)}${thousands(r.Y)} of ${plural(r.X, 'visit')}, from ${plural(from, 'shopper')}   ${share(r.Y, r.X)}` +
        (iv ? `   95% interval ${pct(iv[0])} to ${pct(iv[1])}` : ''));
  }
  const sd = difference(so.test, so.control, e => e.R);
  if (sd) log(`  difference (test - control)   ${points(sd.d)} points   95% interval ${points(sd.interval[0])} to ${points(sd.interval[1])} points`);
  const opted = g.test.filter(r => r.opted_in).length;
  const oiv = wilson(opted, nt);
  log(`  Opt-in rate (test only): ${thousands(opted)} of ${thousands(nt)} test shoppers   ${share(opted, nt)}` +
      (oiv ? `   95% interval ${pct(oiv[0])} to ${pct(oiv[1])}` : ''));
  const bought = g.test.filter(r => r.bought_matched).length;
  const again = g.test.filter(r => r.bought_matched_again).length;
  const aiv = wilson(again, bought);
  log(`  A matched product bought again within 60 days (test only): ${thousands(again)} of ${thousands(bought)} test shoppers who bought one   ` +
      `${share(again, bought)}${aiv ? `   95% interval ${pct(aiv[0])} to ${pct(aiv[1])}` : ''}   (${thousands(again)} of ${thousands(nt)} test shoppers in all)`);
  const full = addDays(plan.lastDay, 60);
  if (today < full) log(`  The 60 days after the last day end on ${full}: an export taken before then misses repeats still to come.`);
  log('');

  /* ---- guardrails ---- */
  log('Guardrails');
  log('  Average order value: revenue / orders');
  const aov = {};
  for (const [name, rs] of [['test', g.test], ['control', g.control]]) {
    /* in cents, so the total is exact; shown in the plan's currency */
    const r = ratio(rs.map(x => [x.orders, x.cents]));
    aov[name] = r;
    const iv = r.interval ? [Math.max(0, r.interval[0]), r.interval[1]] : null;
    log(`  ${col(name)}${money(r.Y / 100)} / ${plural(r.X, 'order')} = ${r.R === null ? '-' : money(r.R / 100)}` +
        (iv ? `   95% interval ${money(iv[0] / 100)} to ${money(iv[1] / 100)}` : ''));
  }
  const ad = difference(aov.test, aov.control, e => e.R);
  const adPlan = difference(aov.test, aov.control, e => e.R, zPlan);
  if (ad) log(`  difference (test - control)   ${money(ad.d / 100, true)}   95% interval ${money(ad.interval[0] / 100, true)} to ${money(ad.interval[1] / 100, true)}`);
  if (withheld) log(`  GUARDRAIL: ${withheld}`);
  else if (!adPlan) log('  GUARDRAIL: none - a group has no orders, so there is no average to compare.');
  else {
    out.guardrail = side(adPlan.interval) === 'below' ? 'dropped' : 'no drop shown';
    const span = `the ${L} interval of the difference, ${money(adPlan.interval[0] / 100, true)} to ${money(adPlan.interval[1] / 100, true)},`;
    log(`  GUARDRAIL: ${out.guardrail === 'dropped' ? `dropped - ${span} is wholly below zero.` : `no drop shown - ${span} is not wholly below zero.`}`);
  }
  log(`  Copy and route incidents (target zero): kept by hand in the plan's incident log, ${planRel} - not in the export.`);
  log('');

  /* ---- the hypothesis check ---- */
  const [top, , , bottom] = b2bVotes.BANDS;
  log('Hypothesis check - "Was the flavor close?" votes by band');
  const counted = b2bVotes.BANDS.reduce((a, b) => a + voteTotal(b), 0);
  log(`  NOSE's votes for ${slug}, from the first day to the last (${plan.firstDay} to ${plan.lastDay}, UTC): ${plural(counted, 'vote')}`);
  log(`  ${col('band')}${'up of votes'.padEnd(18)}up share   95% interval`);
  for (const b of b2bVotes.BANDS) {
    const { up } = voteData.counts[b];
    const n = voteTotal(b);
    const iv = wilson(up, n);
    log(`  ${col(b)}${`${thousands(up)} of ${thousands(n)}`.padEnd(18)}${share(up, n).padEnd(11)}${iv ? `${pct(iv[0])} to ${pct(iv[1])}` : '-'}`);
  }
  const su = voteData.counts[top].up;
  const sn = voteTotal(top);
  const lu = voteData.counts[bottom].up;
  const ln = voteTotal(bottom);
  if (sn && ln) {
    const b95 = newcombe(su, sn, lu, ln, Z95);
    log(`  ${top} - ${bottom}   ${points(su / sn - lu / ln)} points   95% interval ${points(b95[0])} to ${points(b95[1])} points`);
  }
  out.bands = { counts: voteData.counts };
  if (!reg.ok) log(`  RESULT: none - ${reg.why}.`);
  else if (sn < plan.votesPerBand || ln < plan.votesPerBand) {
    log(`  RESULT: none - ${top} has ${thousands(sn)} and ${bottom} ${thousands(ln)} of the ${thousands(plan.votesPerBand)} votes each the plan needs.`);
  } else {
    const bPlan = newcombe(su, sn, lu, ln, zPlan);
    const span = `the ${L} interval of the difference, ${points(bPlan[0])} to ${points(bPlan[1])} points,`;
    out.bandResult = side(bPlan) === 'above' ? 'strong' : side(bPlan) === 'below' ? 'low' : 'no difference shown';
    log(`  RESULT: ${out.bandResult === 'strong' ? `${top} matches drew a larger share of up votes than ${bottom} ones - ${span} is wholly above zero.`
      : out.bandResult === 'low' ? `${bottom} matches drew a larger share of up votes than ${top} ones - ${span} is wholly below zero.`
        : `no difference shown between ${top} and ${bottom} - ${span} includes zero.`}`);
    if (out.bandResult !== 'strong') log(`  ${top} did not beat ${bottom}: /methodology says so, and the method is revised.`);
  }
  const voted = b2bVotes.BANDS.filter(b => voteTotal(b) > 0);
  const shares = voted.map(b => voteData.counts[b].up / voteTotal(b));
  const falls = shares.every((s, i) => i === 0 || shares[i - 1] >= s);
  log(voted.length === b2bVotes.BANDS.length
    ? `  As read, the up share falls from ${top} to ${bottom}, band by band: ${falls ? 'yes' : 'no'} (shown, not tested).`
    : '  As read: not every band has votes, so the order of the four is not shown.');
  log(`  Days that reached the daily cap of ${b2bVotes.DEFAULT_DAILY_CAP} votes: ${voteData.capped.length ? `${voteData.capped.join(', ')} - votes past the cap were dropped, so those days are undercounted` : 'none'}.`);
  if (voteData.outside) log(`  Votes on days outside the pilot, not counted: ${thousands(voteData.outside)}.`);
  if (voteData.unread) log(`  Keys not in the vote layout, not counted: ${thousands(voteData.unread)}.`);
  log('');
  log(`Published either way: every figure above, those that did not move included (${planRel}, section 10).`);
  return out;
}

/* ========================================================= the command */

function parseArgs(argv) {
  let file = null;
  let store = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--store') {
      if (store !== null) throw new UsageError('--store given twice');
      store = argv[++i];
      if (!store || !SLUG.test(store)) throw new UsageError('--store needs a store slug');
    } else if (a.startsWith('--')) throw new UsageError(`unknown: ${a}`);
    else if (file !== null) throw new UsageError('one export at a time');
    else file = a;
  }
  if (!file || !store) throw new UsageError('an export file and --store are both needed');
  return { file, store };
}

function loadPlan(root, slug) {
  const rel = `${PLANS_DIR}/${slug}.md`;
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    throw new Refusal(`there is no plan at ${rel} - copy ${PLAN_DOC} there, fill it in and commit it before the first day`);
  }
  const block = readPlanBlock(fs.readFileSync(file, 'utf8'));
  if (block.error) throw new Refusal(`the plan ${rel}: ${block.error}`);
  const checked = checkPlan(block.values, slug);
  if (checked.error) throw new Refusal(`the plan ${rel}: ${checked.error}`);
  return { rel, values: block.values, plan: checked.plan };
}

async function main(argv = process.argv.slice(2), env = process.env) {
  let opts;
  try { opts = parseArgs(argv); }
  catch (e) {
    if (e instanceof UsageError) { console.error(`${e.message}\n${USAGE}`); process.exit(2); }
    throw e;
  }
  let loaded;
  try { loaded = loadPlan(ROOT, opts.store); }
  catch (e) {
    if (e instanceof Refusal) { console.error(`REFUSED: ${e.message}`); process.exit(1); }
    throw e;
  }
  let size;
  try { size = fs.statSync(opts.file).size; }
  catch { console.error('REFUSED: the export file cannot be read'); process.exit(1); }
  if (size > format.MAX_FILE_BYTES) { console.error(refuse(`the file is larger than ${format.MAX_FILE_BYTES / 1024 / 1024} MB`).refusal); process.exit(1); }
  const exported = readExport(fs.readFileSync(opts.file));
  if (exported.refusal) { console.error(exported.refusal); process.exit(1); }
  const missing = rerun.missingSecrets(SECRETS, env);
  if (missing) {
    console.error(`REFUSED: ${missing} - the band table lists the store's votes in Netlify Blobs`);
    process.exit(1);
  }
  try {
    const votes = b2bVotes.open({ siteID: env.NETLIFY_SITE_ID, token: env.NETLIFY_AUTH_TOKEN });
    const lines = [];
    await pilotReport({ plan: loaded.plan, planRel: loaded.rel, values: loaded.values, exported, exportName: path.basename(opts.file),
      slug: opts.store, votes, today: new Date().toISOString().slice(0, 10), git: gitIn(ROOT), log: l => lines.push(l) });
    console.log(lines.join('\n'));
  } catch (e) {
    console.error(`pilot report failed: ${rerun.explain(e)}`);
    process.exitCode = 1;
  }
}

module.exports = {
  COLUMNS, COUNTS, FLAGS, GROUPS, IDENTITY_WORDS, PLAN_KEYS, EXPORT_DOC, PLAN_DOC, PLANS_DIR, USAGE,
  looksIdentifying, checkExportHeader, readExport, readPlanBlock, checkPlan, preRegistration, gitIn, readVotes,
  wilson, newcombe, ratio, mean, difference, splitCheck, pilotReport, parseArgs, loadPlan, main, UsageError, Refusal
};
if (require.main === module) {
  main().catch(e => { console.error('pilot report failed:', e && e.message); process.exit(1); });
}
