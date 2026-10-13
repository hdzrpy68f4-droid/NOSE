#!/usr/bin/env node
'use strict';
/* NOSE - the pilot's plan, sample size and report, offline.
 *
 *   node test/b2b-pilot-test.js      -> "b2b-pilot clean", or FAIL lines and exit 1
 *
 * What it pins down (PARSER-HANDOFF s14, "Pilot plan and report"):
 *
 *   - scripts/b2b-sample-size.js against published worked examples, never
 *     against its own output: two means - the primary metric - against the
 *     NCSS PASS chapter "Two-Sample Z-Tests Assuming Equal Variance" (its
 *     validation against Chow, Shao and Wang 2008, pages 63-64: sigma 0.10,
 *     delta 0.05 - 63 a group, power 0.8013; and its Example 1: sigma 4.5,
 *     delta 2, power 0.90 - 107 at alpha 0.05, 151 at 0.01); two proportions
 *     - the band check's votes - against the documentation of R's
 *     stats::power.prop.test (n = 76.7, n = 10451937, n = 73.37,
 *     power = 0.740)
 *   - the report's statistics against published worked examples: the
 *     deciding difference of two means, from raw data, against the
 *     NIST/SEMATECH e-Handbook of Statistical Methods, 7.3.1 (11 and 9
 *     assembly times: means 36.0909 and 32.2222, standard deviations 4.9082
 *     and 2.5386, t = 2.2694); Wilson's interval against the e-Handbook,
 *     7.2.4.1 (n = 200, 0.13, one-sided 95% lower limit 0.09577);
 *     Newcombe's hybrid score interval against his Table II, method 10
 *     (Statistics in Medicine 17, 1998, 873-890: 56/70 - 48/80 and three
 *     more); the split check against Wikipedia's "Sample ratio mismatch"
 *     example (600 and 400 of 1000: p = 2.54e-10); the delta method against
 *     the mean it must equal when every shopper has one order
 *   - synthetic exports: a known difference in inhalable orders per shopper
 *     is found; a null reads as null; the groups' outcomes swapped read as the
 *     mirror; the plan's alpha decides; a short run, and a run still going,
 *     say only how far short; a personal column is refused before any row is
 *     read; any unreadable row refuses the file, never echoing a value
 *   - the plan: its ```pilot block, its checks, and pre-registration by git -
 *     committed before the first day or not, numbers changed later, prose
 *     changed later, uncommitted, shallow, no git - in throwaway repositories
 *   - the votes: matchBand()'s four names, the window, another store's
 *     votes, the daily cap, too few votes, Strong against Low each way
 *   - it only reads: the vote store asked to list and nothing else, no file
 *     written, pg, coa.js and the archive never loaded; the command line end
 *     to end in a throwaway tree with a stand-in @netlify/blobs
 *   - no effect wording in any file or output, and the two documents naming
 *     what the code reads
 *
 * Nothing it does reaches the network, a database or Netlify.
 */

delete process.env.NETLIFY_SITE_ID;
delete process.env.NETLIFY_AUTH_TOKEN;

const fs = require('fs');
const Module = require('module');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify/functions/lib');
const REPORT = path.join(ROOT, 'scripts/b2b-pilot-report.js');
const SIZE = path.join(ROOT, 'scripts/b2b-sample-size.js');
const PLAN_DOC = path.join(ROOT, 'docs/B2B-PILOT-PLAN.md');
const EXPORT_DOC = path.join(ROOT, 'docs/B2B-PILOT-EXPORT.md');

let finished = false;
process.on('exit', code => {
  if (!finished && code === 0) {
    process.stderr.write('b2b-pilot: stopped before the last check - NOT clean\n');
    process.exitCode = 1;
  }
});

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
}

/* Every module anything asks for while the tests run. */
const loads = [];
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  try { loads.push(Module._resolveFilename(request, parent, isMain)); } catch { loads.push(request); }
  return originalLoad.apply(this, arguments);
};

const report = require(REPORT);
const sizing = require(SIZE);
const b2bVotes = require(path.join(LIB, 'b2b-votes.js'));
const format = require(path.join(LIB, 'b2b-catalog-format.js'));
const M = require(path.join(ROOT, 'scripts/lib/match.js')).load();
const { EFFECT } = require('./b2b-strings-test.js');
/* The analysis layer's words beyond EFFECT (test/analysis-test.js). */
const MORE_WORDS = /\b(effects?|potency|potent)\b/i;
const wordsIn = text => [...(String(text).match(EFFECT) || []), ...(String(text).match(MORE_WORDS) || [])];

const tmp = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const round = (v, d) => Number(v.toFixed(d));

/* ============================================================= exports */

const HEADER = report.COLUMNS.join(',');
const row = (o = {}) => {
  const r = { group: 'test', orders: 0, inhalable_orders: 0, revenue: '0', soldout_sessions: 0, soldout_sessions_ordered: 0,
    opted_in: 'no', bought_matched: 'no', bought_matched_again: 'no', ...o };
  return report.COLUMNS.map(c => r[c]).join(',');
};

/* n shoppers of one group, the first `buyers` of them with inhalable orders
   - 1 and 2 by turns, or `each` apiece; aov is revenue per order; leak marks
   control shoppers. */
function shoppers(group, n, buyers, { aov = 40.5, leak = 0, each = 0 } = {}) {
  const lines = [];
  for (let i = 0; i < n; i++) {
    const buyer = i < buyers;
    const inh = buyer ? each || 1 + (i % 2) : 0;
    const orders = inh + (i % 3 === 0 ? 1 : 0);
    const soldout = i % 5 === 0 ? 1 : 0;
    const test = group === 'test';
    lines.push(row({
      group, orders, inhalable_orders: inh, revenue: (orders * aov).toFixed(2), soldout_sessions: soldout,
      soldout_sessions_ordered: soldout && buyer ? 1 : 0,
      opted_in: (test && i % 3 === 0) || (!test && i < leak) ? 'yes' : 'no',
      bought_matched: test && buyer && i % 4 === 0 ? 'yes' : 'no',
      bought_matched_again: test && buyer && i % 8 === 0 ? 'yes' : 'no'
    }));
  }
  return lines;
}
const csv = lines => `${HEADER}\n${lines.join('\n')}\n`;
/* The inhalable orders shoppers() gives n shoppers, the first `buyers` of them buyers. */
const countsOf = (n, buyers) => Array.from({ length: n }, (_, i) => (i < buyers ? 1 + (i % 2) : 0));
/* A mean, its spread and its standard error by the textbook's one-pass sums -
   not the report's code - to check what the report prints. */
function byHand(values) {
  const n = values.length;
  const sum = values.reduce((a, v) => a + v, 0);
  const squares = values.reduce((a, v) => a + v * v, 0);
  const variance = (squares - (sum * sum) / n) / (n - 1);
  return { n, sum, m: sum / n, sd: Math.sqrt(variance), se: Math.sqrt(variance / n) };
}
const read = text => report.readExport(Buffer.from(text, 'utf8'));

/* ============================================================== plans */

const FILL = { store: 'test-shop', first_day: '2026-08-03', last_day: '2026-09-27', mean: '0.45', sd: '0.75', lift: '0.35',
  alpha: '0.05', power: '0.8', shoppers_per_group: '437', votes_per_band: '40' };
function planText(values, extra = '') {
  const block = '```pilot\n' + report.PLAN_KEYS.map(k => `${(k + ':').padEnd(20)}${values[k]}`).join('\n') + '\n```';
  return fs.readFileSync(PLAN_DOC, 'utf8').replace(/^```pilot\n[\s\S]*?^```$/m, block) + extra;
}

/* A throwaway repository holding one plan, committed on the given day. */
function planRepo({ values = FILL, day = '2026-07-20', slug = 'test-shop' } = {}) {
  const dir = tmp('nose-pilot-');
  const git = (args, env = {}) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env } });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'pilot@test.example']);
  git(['config', 'user.name', 'pilot test']);
  git(['config', 'commit.gpgsign', 'false']);
  const rel = `docs/pilots/${slug}.md`;
  const write = text => { fs.mkdirSync(path.join(dir, 'docs/pilots'), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  const commit = (when, msg) => {
    git(['add', '-A']);
    git(['commit', '-q', '-m', msg], { GIT_AUTHOR_DATE: `${when}T12:00:00Z`, GIT_COMMITTER_DATE: `${when}T12:00:00Z` });
  };
  write(planText(values));
  commit(day, 'plan');
  return { dir, rel, git, write, commit, run: report.gitIn(dir) };
}

/* ============================================================== votes */

/* Netlify Blobs as @netlify/blobs 10.x answers list(): every page followed,
   keys and ETags. Any other call is recorded, so the test can say none was
   made. */
function voteStore(keys) {
  const calls = [];
  return new Proxy({}, { get: (_, method) => {
    if (method === 'calls') return calls;
    if (method === 'then' || typeof method === 'symbol') return undefined;
    calls.push(String(method));
    if (method === 'list') return async ({ prefix } = {}) => ({ blobs: keys.filter(k => k.startsWith(prefix || '')).map(key => ({ key, etag: '"e"' })), directories: [] });
    return async () => { throw new Error(`the vote store was asked to ${String(method)}`); };
  } });
}
function votes(spec, slug = 'test-shop') {
  const keys = [];
  for (const [band, vote, day, n] of spec) for (let i = 0; i < n; i++) keys.push(b2bVotes.voteKey(slug, band, vote, day));
  return keys;
}
const STRONG_BEATS_LOW = [['Strong', 'up', '2026-08-10', 40], ['Strong', 'down', '2026-08-11', 10], ['Good', 'up', '2026-08-12', 30],
  ['Good', 'down', '2026-08-12', 20], ['Moderate', 'up', '2026-08-13', 25], ['Moderate', 'down', '2026-08-13', 35],
  ['Low', 'up', '2026-08-14', 20], ['Low', 'down', '2026-08-14', 60]];

async function run({ text, repo, store = voteStore(votes(STRONG_BEATS_LOW)), today = '2026-12-01', slug = 'test-shop' }) {
  const loaded = report.loadPlan(repo.dir, slug);
  const exported = read(text);
  if (exported.refusal) throw new Error(exported.refusal);
  const lines = [];
  const out = await report.pilotReport({ plan: loaded.plan, planRel: loaded.rel, values: loaded.values, exported, exportName: 'export.csv',
    slug, votes: store, today, git: repo.run, log: l => lines.push(l) });
  return { out, lines, text: lines.join('\n'), store };
}
const line = (lines, start) => lines.find(l => l.startsWith(start)) || null;

async function main() {
  /* ====================================================== the sample size */
  const cli = (script, args, opts = {}) => spawnSync(process.execPath, [script, ...args],
    { encoding: 'utf8', timeout: 30000, cwd: opts.cwd || ROOT, env: { PATH: process.env.PATH, HOME: os.tmpdir(), ...(opts.env || {}) } });
  /* Two means - the primary metric. NCSS PASS, "Two-Sample Z-Tests Assuming
     Equal Variance": its Example 4 validates against Chow, Shao and Wang
     (2008), pages 63-64 - alpha 0.05, power 0.80, sigma 0.10, delta 0.05,
     two-sided: "the per group sample size as 63", and PASS's actual power at
     63, 0.8013; its Example 1 - sigma 4.5, means 11 and 9, power 0.90: 107 a
     group at alpha 0.05, 151 at alpha 0.01. */
  check('two means: Chow, Shao and Wang\'s 63 a group (sigma 0.10, delta 0.05, alpha 0.05, power 0.80), as PASS validates it',
    Math.ceil(sizing.sampleSizeMeans({ delta: 0.05, sd: 0.10, alpha: 0.05, power: 0.8 })), 63);
  check('...with PASS\'s power at 63 a group, 0.8013', round(sizing.powerForMeans({ n: 63, delta: 0.05, sd: 0.10 }), 4), 0.8013);
  check('...and PASS\'s Example 1, sigma 4.5, delta 2, power 0.90: 107 a group at alpha 0.05, 151 at 0.01',
    [Math.ceil(sizing.sampleSizeMeans({ delta: 2, sd: 4.5, alpha: 0.05, power: 0.9 })),
      Math.ceil(sizing.sampleSizeMeans({ delta: 2, sd: 4.5, alpha: 0.01, power: 0.9 }))], [107, 151]);
  const means1 = cli(SIZE, ['--mean', '9', '--sd', '4.5', '--lift', '0.2222222222222222', '--power', '0.9']);
  check('the command, primary metric: a mean of 9 lifted to 11, sd 4.5, power 0.90 - PASS\'s 107 a group, and the lines to paste, as typed',
    [means1.status, /^ {2}shoppers per group +107 {3}\(214 in all; /m.test(means1.stdout), /^mean: +9$/m.test(means1.stdout), /^sd: +4\.5$/m.test(means1.stdout),
      /^lift: +0\.2222222222222222$/m.test(means1.stdout), /^alpha: +0\.05$/m.test(means1.stdout), /^power: +0\.9$/m.test(means1.stdout),
      /^shoppers_per_group: 107$/m.test(means1.stdout)], [0, true, true, true, true, true, true, true]);
  const means2 = cli(SIZE, ['--mean', '11', '--sd', '4.5', '--lift', '-0.18181818181818182', '--alpha', '0.01', '--power', '0.9']);
  check('...a fall sized the same way: 11 down to 9 at alpha 0.01 needs PASS\'s 151', [means2.status, /^ {2}shoppers per group +151 /m.test(means2.stdout)], [0, true]);

  /* Two proportions - the band check's votes. R's documentation for
     power.prop.test, its Examples section:
       power.prop.test(p1 = .50, p2 = .75, power = .90)              ## =>     n = 76.7
       power.prop.test(p1 = .5, p2 = 0.501, sig.level=.001, power=0.90) ## => n = 10451937
       power.prop.test(      p1=0.90, p2= 1.0, power=0.8)              ##-> n = 73.37
       power.prop.test(n = 50, p1 = .50, p2 = .75)                   ## => power = 0.740 */
  check('two proportions: p1 .50, p2 .75, power .90 - R\'s documented n = 76.7',
    round(sizing.sampleSize({ p1: 0.5, p2: 0.75, power: 0.9 }), 1), 76.7);
  check('...p1 .5, p2 .501, alpha .001, power .90 - R\'s n = 10451937, as R prints it',
    Math.round(sizing.sampleSize({ p1: 0.5, p2: 0.501, alpha: 0.001, power: 0.9 })), 10451937);
  check('...p1 .90, p2 1.0, power .8 - R\'s n = 73.37',
    round(sizing.sampleSize({ p1: 0.9, p2: 1.0, power: 0.8 }), 2), 73.37);
  check('...and the power with n = 50 a group, p1 .50, p2 .75 - R\'s 0.740',
    round(sizing.powerFor({ n: 50, p1: 0.5, p2: 0.75 }), 3), 0.74);
  const s1 = cli(SIZE, ['--baseline', '0.5', '--lift', '0.5', '--power', '0.9']);
  check('the command, band check: Low at .5, Strong .75, power 0.90 - 77 votes a band, R\'s 76.7 rounded up, and the line to paste',
    [s1.status, /^ {2}votes per band +77 {3}\(154 in Strong and Low; 76\.71 before rounding up\)$/m.test(s1.stdout),
      /^votes_per_band: +77$/m.test(s1.stdout), /^shoppers_per_group:/m.test(s1.stdout)], [0, true, true, false]);
  const s2 = cli(SIZE, ['--baseline', '0.75', '--lift', '-0.3333333333333333', '--power', '0.9']);
  check('...a negative lift sizes a fall: .75 to .50 needs what .50 to .75 needs (76.7, 77)',
    [s2.status, /^ {2}votes per band +77 /m.test(s2.stdout)], [0, true]);
  const s3 = cli(SIZE, ['--baseline', '0.9', '--lift', '0.11111111111111', '--alpha', '0.05', '--power', '0.8']);
  check('...Low at .9, Strong just under 1: R\'s 73.37 rounds up to 74',
    [s3.status, /^ {2}votes per band +74 /m.test(s3.stdout)], [0, true]);
  const usage = args => { const r = cli(SIZE, args); return [r.status, /usage: node scripts\/b2b-sample-size\.js/.test(r.stderr)]; };
  check('...and refuses, printing its usage: nothing given; a mode half given or both at once; a mean, sd or share of 0; a share of 1; a lift of 0 or -1; a share pushed to 1; alpha 0; power 0.4; an unknown flag; a flag twice; a word',
    [usage([]), usage(['--baseline', '0.3']), usage(['--mean', '0.5', '--lift', '0.1']), usage(['--mean', '0.5', '--sd', '0.8']),
      usage(['--sd', '0.8', '--lift', '0.1']), usage(['--mean', '0.5', '--sd', '0.8', '--lift', '0.1', '--baseline', '0.3']),
      usage(['--mean', '0', '--sd', '0.8', '--lift', '0.1']), usage(['--mean', '0.5', '--sd', '0', '--lift', '0.1']),
      usage(['--baseline', '0', '--lift', '0.1']), usage(['--baseline', '1', '--lift', '0.1']), usage(['--baseline', '0.3', '--lift', '0']),
      usage(['--mean', '0.5', '--sd', '0.8', '--lift', '-1']), usage(['--baseline', '0.5', '--lift', '1']),
      usage(['--mean', '0.5', '--sd', '0.8', '--lift', '0.1', '--alpha', '0']), usage(['--baseline', '0.3', '--lift', '0.1', '--power', '0.4']),
      usage(['--baseline', '0.3', '--lift', '0.1', '--n', '5']), usage(['--baseline', '0.3', '--baseline', '0.3', '--lift', '0.1']),
      usage(['--mean', 'lots', '--sd', '0.8', '--lift', '0.1'])],
    Array(18).fill([2, true]));

  /* =================================================== the intervals */
  /* NIST/SEMATECH e-Handbook 7.3.1: assembly times, the old process on 11
     devices and the new on 9 - means 36.0909 and 32.2222, standard deviations
     4.9082 and 2.5386, and the statistic for unequal standard deviations,
     t = 2.2694. */
  const OLD = [32, 37, 35, 28, 41, 44, 35, 31, 34, 38, 42];
  const NEW = [36, 31, 30, 31, 34, 36, 29, 32, 31];
  const mOld = report.mean(OLD);
  const mNew = report.mean(NEW);
  const dNist = report.difference(mOld, mNew, e => e.m);
  check('the deciding statistic: NIST e-Handbook 7.3.1 from its raw data - means 36.0909 and 32.2222, standard deviations 4.9082 and 2.5386, t = 2.2694 with each group\'s own spread',
    [round(mOld.m, 4), round(mNew.m, 4), round(mOld.sd, 4), round(mNew.sd, 4), round(dNist.d / dNist.se, 4)], [36.0909, 32.2222, 4.9082, 2.5386, 2.2694]);
  check('Wilson\'s interval: NIST e-Handbook 7.2.4.1 - n 200, 0.13, one-sided 95% (z 1.645), lower limit 0.09577',
    round(report.wilson(26, 200, 1.645)[0], 5), 0.09577);
  /* Newcombe (1998), Table II, method 10 - as reproduced with his four
     worked examples: 56/70-48/80, 9/10-3/10, 6/7-2/7, 5/56-0/29. */
  const NEWCOMBE = [[[56, 70, 48, 80], [0.0524, 0.3339]], [[9, 10, 3, 10], [0.1705, 0.8090]], [[6, 7, 2, 7], [0.0582, 0.8062]],
    [[5, 56, 0, 29], [-0.0381, 0.1926]]];
  check('Newcombe\'s hybrid score interval: his Table II, method 10, all four examples to the four decimals printed',
    NEWCOMBE.map(([a]) => report.newcombe(...a).map(v => round(v, 4))), NEWCOMBE.map(([, e]) => e));
  check('the split check: Wikipedia\'s sample-ratio-mismatch example, 600 and 400 of 1000 - p = 2.54e-10',
    Number(report.splitCheck(600, 400).p.toPrecision(3)), 2.54e-10);
  const ones = [[1, 10], [1, 25], [1, 40], [1, 0], [1, 25]];
  const r1 = report.ratio(ones);
  const m1 = report.mean(ones.map(([, y]) => y));
  check('the delta method: with one order a shopper, a ratio is a mean - the same value and the same standard error',
    [r1.R === m1.m, Math.abs(r1.se - m1.se) < 1e-12], [true, true]);
  check('...a ratio the same for every shopper has no spread: y = 2.5x for all, interval 2.5 to 2.5',
    report.ratio([[1, 2.5], [2, 5], [4, 10], [0, 0]]).interval.map(v => round(v, 12)), [2.5, 2.5]);
  check('a mean\'s interval: 10, 20, 30 has standard error 10 / sqrt(3)',
    Math.abs(report.mean([10, 20, 30]).se - 10 / Math.sqrt(3)) < 1e-12, true);

  /* ===================================================== the export */
  const good = read(`﻿${HEADER.toUpperCase().replace(/,/g, ' , ')}\r\n${row({ group: 'Test', opted_in: 'YES' })}\r\n,,,,,,,,\r\n${row({ group: 'control', orders: 2, inhalable_orders: 1, revenue: '84.5' })}\r\n`);
  check('an export reads: a byte-order mark, CRLF, letter case and spaces aside, a blank row skipped and counted',
    [good.refusal, good.rows && good.rows.map(r => [r.group, r.orders, r.cents, r.opted_in]), good.blank], [undefined, [['test', 0, 0, true], ['control', 2, 8450, false]], 1]);
  const personal = `Customer Email,${HEADER}\n"jane@shop.example",${row()}\n"unclosed`;
  const p1 = read(personal);
  check('a personal column refuses the whole file before any row is read - named, its value never shown',
    [/^refused: the header has a column that looks like it is about a person - "Customer Email" - so none of its rows was read/.test(p1.refusal || ''),
      (p1.refusal || '').includes('jane'), p1.rows], [true, false, undefined]);
  const idCols = ['shopper_id', 'Loyalty Number', 'First Name', 'ZIP', 'zipcode', 'Member', 'uuid', 'Account', 'Date of Birth', 'patient', 'Card'];
  check('...and so does any column that could identify a shopper: the catalog\'s words and the export\'s own',
    idCols.filter(c => !/looks like it is about a person/.test(read(`${HEADER},${c}\n${row()},x\n`).refusal || '')), []);
  check('...while none of the format\'s columns, nor words that only contain a short one, looks like one',
    [report.COLUMNS.filter(report.looksIdentifying), ['Shipping', 'description', 'paid', 'grid'].filter(report.looksIdentifying)], [[], []]);
  check('a column outside the format is refused by name; a missing or doubled one too',
    [read(`${HEADER},store_note\n${row()},x\n`).refusal, read(`${HEADER.replace(',revenue', '')}\n`).refusal, read(`${HEADER},orders\n`).refusal].map(r => (r || '').replace(/ Nothing.*$/, '')),
    ['refused: a column outside the format: "store_note".', 'refused: a column is missing: "revenue".', 'refused: a column appears more than once: "orders".']);
  check('a file that is empty, not UTF-8, larger than 20 MB, headerless, or never closes a quote is refused',
    [report.readExport(Buffer.alloc(0)).refusal, report.readExport(Buffer.from([0x67, 0x72, 0xe9, 0x0a])).refusal,
      report.readExport(Buffer.alloc(format.MAX_FILE_BYTES + 1, 0x61)).refusal, read('\n\n').refusal, read(`${HEADER}\n"test,1`).refusal]
      .map(r => /^refused: .*Nothing in the file was used\. The format is docs\/B2B-PILOT-EXPORT\.md\.$/.test(r || '')), [true, true, true, true, true]);
  check('...and so is one with no shopper rows', read(`${HEADER}\n\n`).refusal,
    'refused: the file has no shopper rows. Nothing in the file was used. The format is docs/B2B-PILOT-EXPORT.md.');
  const bad = [row({ orders: 'jane@shop.example' }), row({ group: 'treatment-b' }), row({ revenue: '$12.00' }), row({ opted_in: 'maybe' }),
    row({ orders: 1, inhalable_orders: 2 }), row({ soldout_sessions: 1, soldout_sessions_ordered: 2, orders: 3, inhalable_orders: 3 }),
    row({ soldout_sessions: 2, soldout_sessions_ordered: 1 }), row({ revenue: '5' }), row({ orders: 1, bought_matched: 'yes' }),
    row({ bought_matched_again: 'yes' }), 'test,1,1', row({ orders: '' })];
  const refusedRows = read(csv([row(), ...bad, row()])).refusal || '';
  check('one row it cannot read refuses the whole file, every row listed with its reason and never its value',
    [refusedRows.startsWith('refused: 12 rows cannot be read - row 3: orders is not a whole number; row 4: group is not test or control; ' +
      'row 5: revenue is not a plain number with at most two decimals; row 6: opted_in is not yes or no; row 7: inhalable_orders is more than orders; ' +
      'row 8: soldout_sessions_ordered is more than soldout_sessions; row 9: soldout_sessions_ordered is more than inhalable_orders; ' +
      'row 10: revenue is above 0 with no orders; row 11: bought_matched is yes with no inhalable order; ' +
      'row 12: bought_matched_again is yes while bought_matched is no; row 13: has 3 values; the header has 9; row 14: orders is empty - ' +
      'and a row left out would change every share the pilot rests on.'),
      ['jane', 'treatment', '$12', 'maybe'].filter(v => refusedRows.includes(v))], [true, []]);
  check('...past twenty rows it says how many more', /\(and 5 more rows\)/.test(read(csv(Array(25).fill(row({ group: 'nobody' })))).refusal || ''), true);

  /* ========================================================= the plan */
  const tpl = fs.readFileSync(PLAN_DOC, 'utf8');
  check('the template\'s ```pilot block holds exactly the numbers the report reads, its blanks not filled in',
    report.readPlanBlock(tpl).error, 'it is not filled in: store, first_day, last_day, mean, sd, lift, shoppers_per_group, votes_per_band');
  const filled = report.readPlanBlock(planText(FILL));
  const okPlan = report.checkPlan(filled.values, 'test-shop');
  /* 2 x 0.75^2 x (1.959964 + 0.841621)^2 / (0.45 x 0.35)^2 = 355.96: 356 a group. */
  check('a filled-in plan reads, typed; its required size is the sample-size script\'s two-means answer for the same numbers - 356',
    [okPlan.error, okPlan.plan && [okPlan.plan.firstDay, okPlan.plan.mean, okPlan.plan.sd, okPlan.plan.perGroup, okPlan.plan.required],
      okPlan.plan && okPlan.plan.required === sizing.perGroupMeans({ mean: 0.45, sd: 0.75, lift: 0.35, alpha: 0.05, power: 0.8 }).n],
    [undefined, ['2026-08-03', 0.45, 0.75, 437, 356], true]);
  const planErr = values => {
    const b = report.readPlanBlock(planText({ ...FILL, ...values }));
    return b.error || report.checkPlan(b.values, 'test-shop').error;
  };
  check('...and refuses another store\'s plan, a day that is not one, a last day first, a mean or spread of 0 or less, a size that is not whole or below 2',
    [planErr({ store: 'other-shop' }), planErr({ first_day: '2026-02-30' }), planErr({ last_day: '2026-08-01' }),
      planErr({ mean: '0' }), planErr({ sd: '-0.5' }), planErr({ shoppers_per_group: '437.5' }), planErr({ shoppers_per_group: '1' }),
      planErr({ power: '0.3' })],
    ['it is the plan of store "other-shop", not "test-shop"', 'first_day is not a day, YYYY-MM-DD', 'last_day is before first_day',
      'mean is inhalable orders per shopper in a past period, a number above 0',
      'sd is the standard deviation of those orders per shopper, a number above 0', 'shoppers_per_group is not a whole number above 0',
      'shoppers_per_group is at least 2: a group\'s spread needs two shoppers', 'power is not from 0.5 to below 1']);
  check('...and a block with a line too many, a line missing, a line twice, two blocks or none',
    [report.readPlanBlock(planText(FILL).replace('votes_per_band:', 'note: x\nvotes_per_band:')).error,
      report.readPlanBlock(planText(FILL).replace(/^votes_per_band:.*\n/m, '')).error,
      report.readPlanBlock(planText(FILL).replace(/^(lift:.*)$/m, '$1\n$1')).error,
      report.readPlanBlock(planText(FILL) + '\n```pilot\nstore: x\n```\n').error, report.readPlanBlock('# no block').error],
    ['its ```pilot block names something the report does not read: note', 'its ```pilot block is missing votes_per_band',
      'its ```pilot block gives lift twice', 'it has more than one ```pilot block', 'it has no ```pilot block']);

  /* ================================================ pre-registration */
  const before = planRepo({ day: '2026-07-20' });
  const reg = r => report.preRegistration({ rel: r.rel, values: report.readPlanBlock(fs.readFileSync(path.join(r.dir, r.rel), 'utf8')).values,
    firstDay: FILL.first_day, git: r.run });
  const ok = reg(before);
  check('pre-registered: committed on 2026-07-20, before the first day 2026-08-03 - the day and the commit said',
    [ok.ok, ok.day, /^[0-9a-f]{7}$/.test(ok.commit)], [true, '2026-07-20', true]);
  before.write(`${planText(FILL)}\n| 2026-08-20 | /flower | a card outside the routes | route | 2026-08-21 |\n`);
  before.commit('2026-08-21', 'incident log');
  check('...still, when only the prose changed after the first day (an incident logged)', reg(before).ok, true);
  before.write(planText({ ...FILL, shoppers_per_group: '500' }));
  check('...not with the numbers changed and not committed', reg(before).why, 'docs/pilots/test-shop.md has changes git has not committed, so its numbers are not the ones committed before the first day');
  before.commit('2026-08-25', 'bigger sample');
  const late = reg(before);
  check('...not with the numbers changed after the first day: those numbers were first committed late',
    [late.ok, late.day, late.why && late.why.startsWith('the plan\'s numbers were first committed on 2026-08-25')], [false, '2026-08-25', true]);
  const onDay = reg(planRepo({ day: FILL.first_day }));
  check('...not when first committed on the first day itself', [onDay.ok, onDay.day], [false, '2026-08-03']);
  const loose = planRepo();
  fs.writeFileSync(path.join(loose.dir, 'docs/pilots/other.md'), 'x');
  const untracked = { ...loose, rel: 'docs/pilots/other.md' };
  check('...not for a plan git has never seen',
    report.preRegistration({ rel: untracked.rel, values: filled.values, firstDay: FILL.first_day, git: untracked.run }).why,
    'docs/pilots/other.md has changes git has not committed, so its numbers are not the ones committed before the first day');
  const shallow = tmp('nose-pilot-shallow-');
  const origin = planRepo();
  origin.write(`${planText(FILL)}\nlater prose\n`);
  origin.commit('2026-07-25', 'prose');
  execFileSync('git', ['clone', '-q', '--depth', '1', `file://${origin.dir}`, shallow], { stdio: 'ignore' });
  check('...not from a shallow clone, which cannot show the first commit',
    report.preRegistration({ rel: 'docs/pilots/test-shop.md', values: filled.values, firstDay: FILL.first_day, git: report.gitIn(shallow) }).why,
    'this clone is shallow, so git cannot show when the plan was first committed (git fetch --unshallow)');
  const nogit = tmp('nose-pilot-nogit-');
  check('...and not where git cannot be read',
    report.preRegistration({ rel: 'docs/pilots/test-shop.md', values: filled.values, firstDay: FILL.first_day, git: report.gitIn(nogit) }).why,
    'git could not be read here, so nothing shows when the plan was committed');

  /* ===================================================== the report */
  const repo = planRepo();
  const known = csv([...shoppers('test', 450, 180), ...shoppers('control', 440, 132)]);
  const watch = ['writeFileSync', 'writeFile', 'appendFileSync', 'appendFile', 'mkdirSync', 'mkdtempSync', 'rmSync', 'unlinkSync', 'renameSync', 'copyFileSync'];
  const saved = Object.fromEntries(watch.map(k => [k, fs[k]]));
  const written = [];
  for (const k of watch) fs[k] = (...a) => { written.push(k); return saved[k].apply(fs, a); };
  const loadsBefore = loads.length;
  let a;
  try { a = await run({ text: known, repo }); }
  finally { for (const k of watch) fs[k] = saved[k]; }
  const reportLoads = loads.slice(loadsBefore);
  check('a known difference is found: 270 inhalable orders from 450 test shoppers against 198 from 440 control - more a shopper in test',
    [a.out.state, a.out.result], ['complete', 'more']);
  const z95 = sizing.normalQuantile(0.975);
  const f3 = v => v.toFixed(3);
  const T = byHand(countsOf(450, 180));
  const C = byHand(countsOf(440, 132));
  const dd = T.m - C.m;
  const seD = Math.sqrt(T.se ** 2 + C.se ** 2);
  check('...each group\'s count over its shoppers, the mean and its 95% interval; the difference, each group with its own spread - by the textbook\'s sums, not the report\'s code',
    [line(a.lines, '  test       270 inhalable orders'), line(a.lines, '  control    198 inhalable orders'), line(a.lines, '  difference (test - control)   +0.150')],
    [`  test       270 inhalable orders / 450 shoppers = 0.600 a shopper   95% interval ${f3(T.m - z95 * T.se)} to ${f3(T.m + z95 * T.se)}`,
      `  control    198 inhalable orders / 440 shoppers = 0.450 a shopper   95% interval ${f3(C.m - z95 * C.se)} to ${f3(C.m + z95 * C.se)}`,
      `  difference (test - control)   +0.150 a shopper   95% interval +${f3(dd - z95 * seD)} to +${f3(dd + z95 * seD)}   relative +33.3%`]);
  check('...and says so by the pre-registered rule',
    line(a.lines, '  RESULT: more'), `  RESULT: more inhalable orders per assigned shopper in the test group - the 95% interval of the difference, +${f3(dd - z95 * seD)} to +${f3(dd + z95 * seD)} a shopper, is wholly above zero.`);
  check('...the plan\'s mean and spread set beside the pilot\'s - here a wider spread than planned, said',
    line(a.lines, '  The plan assumed'), `  The plan assumed 0.45 inhalable orders a shopper, standard deviation 0.75; the pilot shows control at 0.450, standard deviation ${f3(C.sd)} (test ${f3(T.sd)}) - a wider spread than planned, so the test was less likely than planned to find the lift.`);
  const t95 = report.wilson(180, 450).map(v => (v * 100).toFixed(1));
  const c95 = report.wilson(132, 440).map(v => (v * 100).toFixed(1));
  const d95 = report.newcombe(180, 450, 132, 440).map(v => (v * 100).toFixed(1));
  check('...beside it, deciding nothing: the share of shoppers with an inhalable order, its count beside it, Wilson\'s interval and Newcombe\'s',
    [line(a.lines, '  Beside it, deciding nothing'), line(a.lines, '  test       180 of 450 shoppers'), line(a.lines, '  control    132 of 440 shoppers'),
      line(a.lines, '  difference (test - control)   +10.0 points')],
    ['  Beside it, deciding nothing - shoppers with an inhalable order, per assigned shopper:',
      `  test       180 of 450 shoppers   40.0%   95% interval ${t95[0]}% to ${t95[1]}%`,
      `  control    132 of 440 shoppers   30.0%   95% interval ${c95[0]}% to ${c95[1]}%`,
      `  difference (test - control)   +10.0 points   95% interval +${d95[0]} to +${d95[1]} points`]);
  check('...every check passed, and said',
    a.lines.filter(l => /^ {2}(ok|FAIL|WAIT|SHORT)/.test(l)).map(l => l.slice(2, 7)), ['ok   ', 'ok   ', 'ok   ', 'ok   ', 'ok   ', 'ok   ']);
  check('...every share has its denominator beside it: shoppers, visits, test shoppers, votes',
    [/^ {2}test {7}\d+ of \d+ visits, from \d+ shoppers {3}\d+\.\d%/.test(a.lines.find(l => / visits, from /.test(l)) || ''),
      /^ {2}Opt-in rate \(test only\): 150 of 450 test shoppers {3}33\.3% {3}95% interval/.test(line(a.lines, '  Opt-in rate') || ''),
      /^ {2}A matched product bought again within 60 days \(test only\): 23 of 45 test shoppers who bought one {3}51\.1%.*\(23 of 450 test shoppers in all\)$/.test(line(a.lines, '  A matched product') || ''),
      line(a.lines, '  Strong     '), line(a.lines, '  Low        '),
      a.lines.filter(l => /\d+\.\d%/.test(l) && !/ of [\d,]+/.test(l) && !/^ {2}difference/.test(l)).length,
      a.lines.filter(l => / a shopper/.test(l) && !/^ {2}(difference|RESULT|The plan assumed)/.test(l) && !/ \/ [\d,]+ shoppers = /.test(l)).length],
    [true, true, true, `  Strong     40 of 50          80.0%      ${report.wilson(40, 50).map(v => `${(v * 100).toFixed(1)}%`).join(' to ')}`,
      `  Low        20 of 80          25.0%      ${report.wilson(20, 80).map(v => `${(v * 100).toFixed(1)}%`).join(' to ')}`, 0, 0]);
  check('...the guardrail: average order value, no drop shown', a.out.guardrail, 'no drop shown');
  check('...the votes: Strong 40 of 50 up, Low 20 of 80 - Strong beats Low; the four fall in order', [a.out.bandResult,
    line(a.lines, '  As read, the up share falls')], ['strong', '  As read, the up share falls from Strong to Low, band by band: yes (shown, not tested).']);
  check('...published either way', a.lines[a.lines.length - 1], 'Published either way: every figure above, those that did not move included (docs/pilots/test-shop.md, section 10).');
  check('it only reads: the vote store was asked to list, and nothing else', [...new Set(a.store.calls)], ['list']);
  check('...no file was written while it ran', written, []);
  check('...and pg, coa.js, the archive, the PDF store and @netlify/blobs were never loaded',
    reportLoads.filter(f => /(^|[\\/])(pg|coa\.js|archive\.js|pdf-store\.js)$|node_modules[\\/]pg[\\/]|@netlify[\\/]blobs/.test(f)), []);

  const nul = await run({ text: csv([...shoppers('test', 450, 135), ...shoppers('control', 440, 132)]), repo });
  check('a null reads as null: 202 inhalable orders from 450 against 198 from 440 - no difference shown',
    [nul.out.result, line(nul.lines, '  test       202 inhalable orders / 450 shoppers = 0.449 a shopper') !== null,
      /^ {2}RESULT: no difference shown - the 95% interval of the difference, -\d\.\d{3} to \+\d\.\d{3} a shopper, includes zero\.$/.test(line(nul.lines, '  RESULT:') || '')],
    ['no difference shown', true, true]);
  /* The owner's choice, 2026-10-13: the count decides, not the share. The
     same share of shoppers buy in both groups - 135 of 450 and 132 of 440,
     30% each - but each test buyer places 2 inhalable orders. */
  const each = await run({ text: csv([...shoppers('test', 450, 135, { each: 2 }), ...shoppers('control', 440, 132)]), repo });
  check('the count decides, not the share: 30% of shoppers buy in each group, but test buyers order twice - more inhalable orders a shopper in test',
    [each.out.result, line(each.lines, '  difference (test - control)   0.0 points') !== null,
      line(each.lines, '  test       270 inhalable orders / 450 shoppers = 0.600 a shopper') !== null], ['more', true, true]);
  check('a bound that is not zero never prints as zero; zero prints as zero',
    [report.figure(0.0004, 3), report.figure(-0.00041, 3), report.signed(0.0004, 3), report.figure(0, 3), report.signed(0, 1), report.signed(12.34, 1)],
    ['0.00040', '-0.00041', '+0.00040', '0.000', '0.0', '+12.3']);
  /* The same shoppers with the groups' outcomes swapped: 132 of 440 test, 180 of 450 control. */
  const mirror = await run({ text: csv([...shoppers('test', 440, 132), ...shoppers('control', 450, 180)]), repo });
  const negated = a.out.primary.interval.map(v => -v).reverse();
  check('the groups\' outcomes swapped read as the mirror: fewer a shopper in test, the difference and its interval negated, by the same rule',
    [mirror.out.result, mirror.out.primary.diff === -a.out.primary.diff, mirror.out.primary.interval.every((v, i) => Math.abs(v - negated[i]) < 1e-12)],
    ['fewer', true, true]);

  /* The plan's alpha decides, not the 95% shown: at 0.01, 255 inhalable
     orders from 450 against 198 from 440 has a 95% interval above zero and a
     99% one that includes it. This plan's spread, 0.85, is wider than the
     pilot's, so no note about it. */
  const strict = planRepo({ values: { ...FILL, alpha: '0.01', lift: '0.45', sd: '0.85' } });
  const at99 = await run({ text: csv([...shoppers('test', 450, 170), ...shoppers('control', 440, 132)]), repo: strict });
  const tm = report.mean(countsOf(450, 170));
  const cm = report.mean(countsOf(440, 132));
  const iv95 = report.difference(tm, cm, e => e.m).interval;
  const iv99 = report.difference(tm, cm, e => e.m, sizing.normalQuantile(0.995)).interval;
  check('the plan\'s alpha decides: at 0.01 the 99% interval includes zero, though the 95% one shown is above it',
    [iv95[0] > 0, iv99[0] < 0, at99.out.checks.sized, at99.out.result,
      /^ {2}RESULT: no difference shown - the 99% interval of the difference, -\d\.\d{3} to \+\d\.\d{3} a shopper, includes zero\.$/.test(line(at99.lines, '  RESULT:') || ''),
      /\(test \d\.\d{3}\)\.$/.test(line(at99.lines, '  The plan assumed') || '')],
    [true, true, true, 'no difference shown', true, true]);
  fs.rmSync(strict.dir, { recursive: true, force: true });

  const short = await run({ text: csv([...shoppers('test', 300, 150), ...shoppers('control', 290, 60)]), repo });
  check('a short run says so, and only that: how far short each group is, the votes by count',
    [short.out.state, line(short.lines, '  SHORT'), line(short.lines, '  test       300 of 437'), line(short.lines, '  control    290 of 437'),
      line(short.lines, 'No rate')],
    ['short', '  SHORT  the run is short of the planned 437 shoppers a group: test 300, control 290', '  test       300 of 437 shoppers   (137 short)',
      '  control    290 of 437 shoppers   (147 short)', 'No rate, interval or result is shown before then, whatever the figures would say.']);
  check('...no rate, interval, result or up share anywhere in it, though the numbers are lopsided',
    [/%|interval [\d+-]|RESULT|GUARDRAIL|up share/.test(short.text), short.out.result], [false, null]);
  const early = await run({ text: known, repo, today: '2026-09-27' });
  check('a run still going - its last day not yet passed - shows only how far short, even at full size',
    [early.out.state, line(early.lines, '  WAIT'), /%|RESULT/.test(early.text), line(early.lines, '  test       450 of 437')],
    ['running', '  WAIT   the pilot is still running: its last day is 2026-09-27; today is 2026-09-27 (UTC)', false, '  test       450 of 437 shoppers   (reached)']);

  const lateRepo = planRepo({ day: '2026-08-05' });
  const unreg = await run({ text: known, repo: lateRepo });
  check('numbers committed after the first day: every figure shown, no result, and why',
    [unreg.out.result, unreg.out.guardrail, unreg.out.bandResult, line(unreg.lines, '  RESULT:'),
      /^ {2}test {7}270 inhalable orders \/ 450 shoppers = 0\.600 a shopper {3}95% interval/.test(line(unreg.lines, '  test       270') || '')],
    [null, null, undefined, '  RESULT: none - the plan was not committed before the first day.', true]);
  const lopsided = await run({ text: csv([...shoppers('test', 600, 240), ...shoppers('control', 440, 132)]), repo });
  check('a split that does not fit half and half: 600 and 440 - no result, and why',
    [lopsided.out.result, line(lopsided.lines, '  RESULT:')], [null, '  RESULT: none - the split does not fit half and half - check how the page assigns groups.']);
  const leaky = await run({ text: csv([...shoppers('test', 450, 180), ...shoppers('control', 440, 132, { leak: 3 })]), repo });
  check('control shoppers with a sign of the widget: counted, said, no result',
    [leaky.out.result, line(leaky.lines, '  FAIL')], [null, '  FAIL   3 of 440 control shoppers show yes for opted_in, bought_matched or bought_matched_again: the groups leaked']);
  const small = planRepo({ values: { ...FILL, shoppers_per_group: '300' } });
  const under = await run({ text: known, repo: small });
  check('a plan whose size is below its own numbers: no result, and why',
    [under.out.result, line(under.lines, '  FAIL')], [null, '  FAIL   shoppers_per_group 300 is below what mean, sd, lift, alpha and power require (356)']);
  const cheaper = await run({ text: csv([...shoppers('test', 450, 180, { aov: 30 }), ...shoppers('control', 440, 132, { aov: 40.5 })]), repo });
  check('average order value that fell in the test group: the guardrail says dropped', cheaper.out.guardrail, 'dropped');

  /* ========================================================= the votes */
  check('the bands are matchBand()\'s own four names, read from the maths file, Strong down to Low',
    [...new Set(Array.from({ length: 101 }, (_, i) => M.matchBand(1 - i / 100)[1]))], [...b2bVotes.BANDS]);
  const mixed = [...votes(STRONG_BEATS_LOW), ...votes([['Strong', 'up', '2026-07-30', 7], ['Low', 'down', '2026-09-28', 9]]),
    ...votes([['Strong', 'down', '2026-08-10', 30]], 'test-shop-2'), 'votes/test-shop/Partial/up/2026-08-10/' + 'a'.repeat(32),
    ...votes([['Good', 'up', '2026-08-20', 100]])];
  const vm = await run({ text: known, repo, store: voteStore(mixed) });
  check('only the store\'s own votes in the pilot\'s days count: another store\'s apart, days outside counted apart, a key of another layout counted apart',
    [vm.out.bands.counts, line(vm.lines, '  Votes on days outside'), line(vm.lines, '  Keys not in the vote layout')],
    [{ Strong: { up: 40, down: 10 }, Good: { up: 130, down: 20 }, Moderate: { up: 25, down: 35 }, Low: { up: 20, down: 60 } },
      '  Votes on days outside the pilot, not counted: 16.', '  Keys not in the vote layout, not counted: 1.']);
  check('...a day that reached the cap of 100 is named: votes past it were dropped',
    line(vm.lines, '  Days that reached'), '  Days that reached the daily cap of 100 votes: 2026-08-20 - votes past the cap were dropped, so those days are undercounted.');
  check('...and the up share no longer falls band by band: said as read', line(vm.lines, '  As read'), '  As read, the up share falls from Strong to Low, band by band: no (shown, not tested).');
  const few = await run({ text: known, repo, store: voteStore(votes([['Strong', 'up', '2026-08-10', 30], ['Low', 'down', '2026-08-10', 5]])) });
  check('too few votes: the table shown, no result, and how many there are of how many',
    [few.out.bandResult, line(few.lines, '  RESULT: none - Strong')], [undefined, '  RESULT: none - Strong has 30 and Low 5 of the 40 votes each the plan needs.']);
  const flat = await run({ text: known, repo, store: voteStore(votes([['Strong', 'up', '2026-08-10', 25], ['Strong', 'down', '2026-08-10', 25], ['Low', 'up', '2026-08-11', 24], ['Low', 'down', '2026-08-11', 26]])) });
  const backwards = await run({ text: known, repo, store: voteStore(votes([['Strong', 'up', '2026-08-10', 10], ['Strong', 'down', '2026-08-10', 40], ['Low', 'up', '2026-08-11', 40], ['Low', 'down', '2026-08-11', 10]])) });
  check('Strong against Low, the other two ways: no difference shown, and Low ahead - each followed by the methodology line',
    [flat.out.bandResult, backwards.out.bandResult, line(backwards.lines, '  Strong did not beat Low'), /^ {2}As read: not every band has votes/.test(line(flat.lines, '  As read') || '')],
    ['no difference shown', 'low', '  Strong did not beat Low: /methodology says so, and the method is revised.', true]);

  /* ================================================ the command line */
  const tree = tmp('nose-pilot-tree-');
  for (const f of ['scripts/b2b-pilot-report.js', 'scripts/b2b-sample-size.js', 'scripts/lib/rerun.js', 'netlify/functions/lib/b2b-catalog-format.js',
    'netlify/functions/lib/store.js', 'netlify/functions/lib/b2b-votes.js', 'netlify/functions/lib/version.js']) {
    fs.mkdirSync(path.dirname(path.join(tree, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(tree, f));
  }
  /* A stand-in @netlify/blobs: getStore for "b2b-votes", list() and nothing more. */
  fs.mkdirSync(path.join(tree, 'node_modules/@netlify/blobs'), { recursive: true });
  fs.writeFileSync(path.join(tree, 'node_modules/@netlify/blobs/index.js'), `'use strict';
const fs = require('fs');
exports.getStore = o => {
  if (o.name !== 'b2b-votes' || !o.siteID || !o.token) throw new Error('stand-in: wrong store or no site and token');
  const keys = JSON.parse(fs.readFileSync(process.env.STAND_IN_VOTES, 'utf8'));
  return { list: async ({ prefix }) => ({ blobs: keys.filter(k => k.startsWith(prefix)).map(key => ({ key, etag: '"e"' })), directories: [] }) };
};\n`);
  const tg = (args, env = {}) => execFileSync('git', ['-C', tree, ...args], { stdio: 'ignore', env: { ...process.env, ...env } });
  tg(['init', '-q', '-b', 'main']); tg(['config', 'user.email', 'pilot@test.example']); tg(['config', 'user.name', 'pilot test']); tg(['config', 'commit.gpgsign', 'false']);
  fs.mkdirSync(path.join(tree, 'docs/pilots'), { recursive: true });
  fs.writeFileSync(path.join(tree, 'docs/pilots/test-shop.md'), planText(FILL));
  tg(['add', '-A']);
  tg(['commit', '-q', '-m', 'plan'], { GIT_AUTHOR_DATE: '2026-07-20T12:00:00Z', GIT_COMMITTER_DATE: '2026-07-20T12:00:00Z' });
  const exp = path.join(tree, 'export.csv');
  fs.writeFileSync(exp, known);
  fs.writeFileSync(path.join(tree, 'personal.csv'), personal);
  fs.writeFileSync(path.join(tree, 'votes.json'), JSON.stringify(votes(STRONG_BEATS_LOW)));
  const treeReport = path.join(tree, 'scripts/b2b-pilot-report.js');
  const secrets = { NETLIFY_SITE_ID: 'site-for-the-test', NETLIFY_AUTH_TOKEN: 'token-for-the-test', STAND_IN_VOTES: path.join(tree, 'votes.json') };
  const end = cli(treeReport, [exp, '--store', 'test-shop'], { cwd: tree, env: secrets });
  check('the command, end to end: the plan, the export and the votes read, the report printed, exit 0',
    [end.status, end.stderr, /^NOSE pilot report - test-shop$/m.test(end.stdout), /^ {2}RESULT: more inhalable orders per assigned shopper in the test group/m.test(end.stdout),
      /^ {2}RESULT: Strong matches drew a larger share/m.test(end.stdout), end.stdout.includes('token-for-the-test')], [0, '', true, true, true, false]);
  const treeFiles = execFileSync('git', ['-C', tree, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).split('\n').filter(Boolean).sort();
  check('...and wrote nothing: the tree holds what the test put there', treeFiles.filter(l => !/ (export|personal)\.csv$| votes\.json$| node_modules\/| scripts\/| netlify\//.test(l)), []);
  const per = cli(treeReport, [path.join(tree, 'personal.csv'), '--store', 'test-shop'], { cwd: tree, env: secrets });
  check('...a personal column refused there too: exit 1, the column named, the e-mail never printed',
    [per.status, /^refused: the header has a column that looks like it is about a person - "Customer Email"/.test(per.stderr), (per.stdout + per.stderr).includes('jane')],
    [1, true, false]);
  const nosecret = cli(treeReport, [exp, '--store', 'test-shop'], { cwd: tree });
  check('...without the two Codespaces secrets it refuses, before asking Netlify anything',
    [nosecret.status, nosecret.stderr.trim()], [1, 'REFUSED: NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN are not set - they are Codespaces secrets; add them, then restart the Codespace - the band table lists the store\'s votes in Netlify Blobs']);
  const noplan = cli(treeReport, [exp, '--store', 'other-shop'], { cwd: tree, env: secrets });
  check('...a store with no plan is refused, saying where the plan goes',
    [noplan.status, noplan.stderr.trim()], [1, 'REFUSED: there is no plan at docs/pilots/other-shop.md - copy docs/B2B-PILOT-PLAN.md there, fill it in and commit it before the first day']);
  const use = args => { const r = cli(treeReport, args, { cwd: tree }); return [r.status, /usage: node scripts\/b2b-pilot-report\.js <export\.csv> --store <slug>/.test(r.stderr)]; };
  check('...and prints its usage for no arguments, no store, a slug that is not one, two files, an unknown flag',
    [use([]), use([exp]), use([exp, '--store', 'Not A Slug']), use([exp, exp, '--store', 'test-shop']), use([exp, '--store', 'test-shop', '--all'])],
    Array(5).fill([2, true]));

  /* =========================================================== words */
  const files = [PLAN_DOC, EXPORT_DOC, REPORT, SIZE].map(f => [path.relative(ROOT, f), fs.readFileSync(f, 'utf8')]);
  check('no effect wording in the plan, the export format, the report or the sample-size script',
    files.map(([f, s]) => [f, wordsIn(s)]).filter(([, w]) => w.length), []);
  check('...nor in anything the report or the sample-size script printed',
    [a.text, nul.text, short.text, vm.text, backwards.text, end.stdout, s1.stdout, means1.stdout].flatMap(wordsIn), []);
  const plan = files[0][1];
  check('the plan template has every part the pilot needs, and the line "published either way"',
    ['## 1. Store and dates', '## 2. How the page assigns groups', '## 3. The primary metric', '## 4. Secondary metrics',
      '## 5. The hypothesis check', '## 6. Guardrails', '## 7. Sample size and stopping rule', '## 10. Published either way',
      'published either way', 'NOSE learns', 'Strong, Good, Moderate, Low', '**Inhalable orders per assigned shopper**',
      'scripts/b2b-sample-size.js --mean ____ --sd ____ --lift ____', 'scripts/b2b-sample-size.js --baseline ____ --lift ____',
      'the counts stay with the store'].filter(s => !plan.includes(s)), []);
  check('...and its block names exactly the numbers the report reads, in its order',
    (/^```pilot\n([\s\S]*?)^```$/m.exec(plan) || [, ''])[1].split('\n').filter(Boolean).map(l => l.split(':')[0]), [...report.PLAN_KEYS]);
  const exportDoc = files[1][1];
  check('the export format names every column, every personal and identity word, and every value the report reads',
    [report.COLUMNS.filter(c => !exportDoc.includes(`| \`${c}\` |`)), format.PERSONAL_WORDS.filter(w => !exportDoc.includes(`\`${w}\``)),
      report.IDENTITY_WORDS.filter(w => !exportDoc.includes(`\`${w}\``)), [...report.GROUPS, 'yes', 'no'].filter(v => !exportDoc.includes(`\`${v}\``))],
    [[], [], [], []]);
  const code = fs.readFileSync(REPORT, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('the report\'s code writes nothing: no file call that writes, no Blobs write or delete, no SQL',
    /writeFile|appendFile|mkdir|unlink|rmSync|renameSync|copyFile|createWriteStream|\.set(JSON)?\(|\.delete\(|removeStoreVotes|record\(|\b(insert|update|delete)\s+(into|from)\b/i.test(code), false);
  check('...and asks Blobs for one thing: the store\'s vote keys', (code.match(/b2bVotes\.\w+/g) || []).filter((v, i, all) => all.indexOf(v) === i).sort(),
    ['b2bVotes.BANDS', 'b2bVotes.DEFAULT_DAILY_CAP', 'b2bVotes.VOTES', 'b2bVotes.open', 'b2bVotes.storePrefix', 'b2bVotes.storeVoteKeys']);

  for (const d of [before.dir, lateRepo.dir, small.dir, repo.dir, loose.dir, origin.dir, shallow, nogit, tree]) fs.rmSync(d, { recursive: true, force: true });

  finished = true;
  if (failures) {
    console.log(`\n${failures} check${failures === 1 ? '' : 's'} failed - b2b-pilot NOT clean`);
    process.exitCode = 1;
  } else {
    console.log('\nb2b-pilot clean');
  }
}

main().catch(e => {
  finished = true;
  console.error('b2b-pilot-test threw:', e && e.stack);
  process.exitCode = 1;
});
