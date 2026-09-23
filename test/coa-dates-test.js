'use strict';
/* NOSE - lib/coa-dates.js and the parser's harvestOn / reportOn (PARSER-HANDOFF s7).
 *
 *   node test/coa-dates-test.js      -> "coa-dates clean", or FAIL lines and exit 1
 *
 * isoDate() on every form it reads and on the near misses it must not, then
 * the parser: both fields on every fixture, each the ISO form of its printed
 * date, and every OTHER field of every fixture identical whether coa-dates.js
 * loads or not - the dates are output only, and the reading does not depend
 * on them.
 *
 * Needs test/fixtures/extracted (node test/extract-dump.js).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify/functions/lib');
const EXTRACTED = path.join(ROOT, 'test/fixtures/extracted');
const { isoDate, todayUtc, EARLIEST } = require(path.join(LIB, 'coa-dates.js'));
const { parseCoa } = require(path.join(LIB, 'parse-coa.js'));

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
};

const TODAY = '2026-09-23';
const on = (raw, today = TODAY) => isoDate(raw, { today });

/* --- the three forms --------------------------------------------------------- */
check('MM/DD/YYYY', on('07/14/2025'), '2025-07-14');
check('YYYY-MM-DD', on('2025-07-14'), '2025-07-14');
check('Mon D, YYYY', on('Jul 14, 2025'), '2025-07-14');
check('Mon D, YYYY with a one-digit day, any case', [on('jul 4, 2025'), on('SEP 30, 2025'), on('Nov 05, 2024')],
  ['2025-07-04', '2025-09-30', '2024-11-05']);
check('month first, as US labs print it', on('01/02/2025'), '2025-01-02');
check('surrounding whitespace is not part of the value', on('  11/17/2025 '), '2025-11-17');

/* --- why: printed dates do not sort as text, ISO days do ------------------- */
const printed = ['11/17/2025', '07/07/2026', '09/24/2024'];
check('printed dates sorted as text put 2026 before 2025', [...printed].sort(), ['07/07/2026', '09/24/2024', '11/17/2025']);
check('the same dates as ISO days sort in time order', printed.map(d => on(d)).sort(), ['2024-09-24', '2025-11-17', '2026-07-07']);

/* --- anything else is null --------------------------------------------------- */
const NEAR_MISSES = [
  '07/07/25',              // two-digit year: how Kaycha prints harvest dates
  '7/7/2025', '07/7/2025', // one-digit month or day
  'July 14, 2025',         // full month name
  'Jul 14 2025', 'Jul 14,2025', 'Jul. 14, 2025', 'Jly 14, 2025',
  '14.07.2025', '2025/07/14', '07-14-2025', '2025-7-14', '20250714',
  '11/17/2025 10:32 AM', '2025-11-17T10:32:00Z', 'Reported 11/17/2025',
  '', '   ', 'N/A', 'Pending', 'ND'
];
check('near misses read null', NEAR_MISSES.map(d => on(d)), NEAR_MISSES.map(() => null));
check('anything not a string reads null', [null, undefined, 42, new Date(), ['07/14/2025'], { d: '07/14/2025' }].map(d => on(d)),
  [null, null, null, null, null, null]);

/* --- days the calendar does not have --------------------------------------- */
check('impossible days read null',
  ['02/30/2025', '02/29/2025', '04/31/2025', '13/01/2025', '00/10/2025', '10/00/2025', '14/07/2025',
   '2025-02-29', '2025-13-01', 'Feb 30, 2025', 'Apr 31, 2025'].map(d => on(d)),
  [null, null, null, null, null, null, null, null, null, null, null]);
check('a leap day is a day', [on('02/29/2024'), on('2024-02-29'), on('Feb 29, 2024')], ['2024-02-29', '2024-02-29', '2024-02-29']);

/* --- after today, and before the floor -------------------------------------- */
check('today reads; tomorrow does not (UTC)', [on('09/23/2026'), on('09/24/2026'), on('2026-09-24'), on('Sep 24, 2026'), on('01/01/2031')],
  ['2026-09-23', null, null, null, null]);
check('the floor is 2014-01-01', [EARLIEST, on('01/01/2014'), on('12/31/2013'), on('2013-12-31'), on('Jan 1, 2014'), on('06/15/1999')],
  ['2014-01-01', '2014-01-01', null, null, '2014-01-01', null]);
{
  const now = new Date();
  const t = todayUtc(now);
  const tomorrow = todayUtc(new Date(now.getTime() + 86400000));
  const us = iso => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
  check('by default "today" is the real UTC day', [isoDate(us(t)), isoDate(us(tomorrow))], [t, null]);
}

/* --- the parser -------------------------------------------------------------- */
if (!fs.existsSync(EXTRACTED)) {
  console.error('FAIL: test/fixtures/extracted is missing - run: node test/extract-dump.js');
  process.exit(1);
}
const names = fs.readdirSync(EXTRACTED).filter(f => f.endsWith('.txt')).map(f => f.slice(0, -4)).sort();
const outputs = Object.fromEntries(names.map(n => [n, parseCoa(fs.readFileSync(path.join(EXTRACTED, `${n}.txt`), 'utf8'))]));

check('every fixture carries harvestOn and reportOn, even when null',
  names.filter(n => !('harvestOn' in outputs[n]) || !('reportOn' in outputs[n])), []);
check('each is the ISO form of the printed date beside it',
  names.filter(n => outputs[n].harvestOn !== isoDate(outputs[n].harvestDate) || outputs[n].reportOn !== isoDate(outputs[n].reportDate)), []);
check('the corpus: three ACS harvest dates and two TerpLife report dates read',
  names.filter(n => outputs[n].harvestOn || outputs[n].reportOn).map(n => [n, outputs[n].harvestOn, outputs[n].reportOn]),
  [['ACS-FLW-002', '2026-04-03', null], ['ACS-LRS-001', '2026-03-23', null], ['ACS-PRR-001', '2026-04-27', null],
   ['GreenRoadsFullSpectrumCBDOil750mgLot24007', null, '2024-11-11'], ['TerpLife_GrpeBblGm_flower', null, '2025-11-17']]);
check('Kaycha prints two-digit years, which read null: KAY-CAR-001 "07/07/25"',
  [outputs['KAY-CAR-001'].harvestDate, outputs['KAY-CAR-001'].harvestOn], ['07/07/25', null]);

/* The dates are output only. Load the parser with coa-dates.js unavailable -
   as when parse-coa.js runs on its own (s1) - and every other field of every
   fixture must be the same; only the two dates change, to null. */
{
  const probe = `
    const Module = require('module');
    const load = Module._load;
    Module._load = function (request, ...rest) {
      if (/coa-dates(\\.js)?$/.test(request)) throw new Error('not here');
      return load.call(this, request, ...rest);
    };
    const fs = require('fs'), path = require('path');
    const { parseCoa } = require(${JSON.stringify(path.join(LIB, 'parse-coa.js'))});
    const dir = ${JSON.stringify(EXTRACTED)};
    const out = {};
    for (const n of ${JSON.stringify(names)}) out[n] = parseCoa(fs.readFileSync(path.join(dir, n + '.txt'), 'utf8'));
    process.stdout.write(JSON.stringify(out));`;
  const r = spawnSync(process.execPath, ['-e', probe], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    check('the parser runs without coa-dates.js', r.stderr.trim().split('\n').pop(), '(runs)');
  } else {
    const without = JSON.parse(r.stdout);
    const rest = o => { const { harvestOn, reportOn, ...others } = o; return others; };
    check('without coa-dates.js both dates read null on every fixture',
      names.filter(n => without[n].harvestOn !== null || without[n].reportOn !== null), []);
    check('...and every other field of every fixture is identical',
      names.filter(n => JSON.stringify(rest(without[n])) !== JSON.stringify(rest(JSON.parse(JSON.stringify(outputs[n]))))), []);
  }
}

if (failures) {
  console.error(`\ncoa-dates-test: ${failures} failure${failures === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('\ncoa-dates clean');
