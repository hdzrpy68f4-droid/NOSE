'use strict';
/* NOSE - lib/coa-dates.js and the parser's harvestOn / reportOn / testedOn
 * (PARSER-HANDOFF s7).
 *
 *   node test/coa-dates-test.js      -> "coa-dates clean", or FAIL lines and exit 1
 *
 * isoDate() on every form it reads and on the near misses it must not, then
 * the parser: the three fields on every fixture - harvestOn and reportOn the
 * ISO form of the printed date beside them, testedOn the ISO day of the one
 * row per lab that says when the lab finished (s13, "When the lab
 * finished") - and every OTHER field of every fixture identical whether
 * coa-dates.js loads or not: the dates are output only, and the reading does
 * not depend on them.
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

/* --- the four forms ---------------------------------------------------------- */
check('MM/DD/YYYY', on('07/14/2025'), '2025-07-14');
check('MM/DD/YY, read as 20YY - how Kaycha prints harvest dates', [on('07/07/25'), on('03/23/26'), on('09/24/24')],
  ['2025-07-07', '2026-03-23', '2024-09-24']);
check('YYYY-MM-DD', on('2025-07-14'), '2025-07-14');
check('Mon D, YYYY', on('Jul 14, 2025'), '2025-07-14');
check('Mon D, YYYY with a one-digit day, any case', [on('jul 4, 2025'), on('SEP 30, 2025'), on('Nov 05, 2024')],
  ['2025-07-04', '2025-09-30', '2024-11-05']);
check('month first, as US labs print it', on('01/02/2025'), '2025-01-02');
check('surrounding whitespace is not part of the value', on('  11/17/2025 '), '2025-11-17');

/* --- since 2026-10-14: a one-digit month or day, and a time of day ----------- */
check('a one-digit month or day, four-digit year - Method\'s "8/27/2026"',
  [on('7/7/2025'), on('07/7/2025'), on('7/07/2025'), on('8/27/2026', '2026-10-05'), on('3/3/2025')],
  ['2025-07-07', '2025-07-07', '2025-07-07', '2026-08-27', '2025-03-03']);
check('...and two-digit year', [on('7/7/25'), on('07/7/25'), on('1/1/14'), on('12/1/24')],
  ['2025-07-07', '2025-07-07', '2014-01-01', '2024-12-01']);
check('a time of day after the date is dropped: Method, Modern Canna, ACT as printed',
  [on('8/27/2026, 4:00:00 AM', '2026-10-05'), on('3/3/2025, 7:11:00 PM'), on('11/08/24 11:59'), on('07/29/2025 18:04'),
   on('11/27/24 09:40')],
  ['2026-08-27', '2025-03-03', '2024-11-08', '2025-07-29', '2024-11-27']);
check('...after every form, by a space or a comma',
  [on('11/17/2025 10:32 AM'), on('2026-06-20 12:09:36'), on('Jul 14, 2025, 4:00 PM'), on('Jul 14, 2025 16:00'),
   on('11/17/2025,10:32'), on('11/17/2025 10:32AM'), on('11/17/2025  0:05'), on('11/17/2025 23:59:59'), on('11/17/2025 12:00 pm')],
  ['2025-11-17', '2026-06-20', '2025-07-14', '2025-07-14', '2025-11-17', '2025-11-17', '2025-11-17', '2025-11-17', '2025-11-17']);
check('...never moving the day: a late-evening time keeps the printed date',
  [on('8/4/2026, 11:59:59 PM', '2026-10-05'), on('8/5/2026, 12:00:00 AM', '2026-10-05')], ['2026-08-04', '2026-08-05']);
check('...a time that is not one makes the whole value null',
  ['11/17/2025 25:00', '11/17/2025 24:00', '11/17/2025 10:60', '11/17/2025 10:30:60', '11/17/2025 0:30 AM', '11/17/2025 13:00 PM',
   '11/17/2025 1:5', '11/17/2025 10:32 EST', '11/17/2025 18:04 UTC', '11/17/2025 10:32:00.5', '11/17/2025 10:32 AM by JD',
   '11/17/2025 10', '11/17/2025 ,10:32', '10:32', '11/17/2025 - 10:32'].map(d => on(d)),
  [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]);

/* --- why: printed dates do not sort as text, ISO days do ------------------- */
const printed = ['11/17/2025', '07/07/2026', '09/24/2024'];
check('printed dates sorted as text put 2026 before 2025', [...printed].sort(), ['07/07/2026', '09/24/2024', '11/17/2025']);
check('the same dates as ISO days sort in time order', printed.map(d => on(d)).sort(), ['2024-09-24', '2025-11-17', '2026-07-07']);

/* --- anything else is null --------------------------------------------------- */
const NEAR_MISSES = [
  '07/07/5', '07/07/025', '7/7/5', '007/07/2025', '07/007/2025',   // a one- or three-digit year, or part
  'July 14, 2025',         // full month name
  'Jul 14 2025', 'Jul 14,2025', 'Jul. 14, 2025', 'Jly 14, 2025',
  '14.07.2025', '7.14.2025', '2025/07/14', '07-14-2025', '2025-7-14', '2025-07-4', '20250714',   // dotted, other separators, ISO with one digit
  '2025-11-17T10:32:00Z', '2025-11-17T10:32', 'Reported 11/17/2025', '11/17/2025 (amended)',
  '', '   ', 'N/A', 'Pending', 'ND'
];
check('near misses read null', NEAR_MISSES.map(d => on(d)), NEAR_MISSES.map(() => null));
check('anything not a string reads null', [null, undefined, 42, new Date(), ['07/14/2025'], { d: '07/14/2025' }].map(d => on(d)),
  [null, null, null, null, null, null]);

/* --- days the calendar does not have --------------------------------------- */
check('impossible days read null',
  ['02/30/2025', '02/29/2025', '04/31/2025', '13/01/2025', '00/10/2025', '10/00/2025', '14/07/2025',
   '2025-02-29', '2025-13-01', 'Feb 30, 2025', 'Apr 31, 2025', '02/29/25', '13/01/25', '14/07/25'].map(d => on(d)),
  [null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
check('...with one digit too, and with a time',
  ['2/30/2025', '0/5/2025', '5/0/2025', '2/29/25', '2/30/2025 10:00', '13/1/2025, 4:00:00 AM'].map(d => on(d)),
  [null, null, null, null, null, null]);
check('day-first stays refused: a day over 12 has no month to be',
  ['27/08/2026', '31/1/2025', '27/8/26', '27/08/2026, 4:00:00 AM'].map(d => on(d, '2026-10-05')), [null, null, null, null]);
check('a leap day is a day', [on('02/29/2024'), on('2024-02-29'), on('Feb 29, 2024'), on('02/29/24'), on('2/29/2024, 5:00:00 AM')],
  ['2024-02-29', '2024-02-29', '2024-02-29', '2024-02-29', '2024-02-29']);

/* --- after today, and before the floor -------------------------------------- */
check('today reads; tomorrow does not (UTC)', [on('09/23/2026'), on('09/24/2026'), on('2026-09-24'), on('Sep 24, 2026'), on('01/01/2031')],
  ['2026-09-23', null, null, null, null]);
check('...nor with a time or one digit: the future stays refused',
  [on('9/23/2026, 11:59:59 PM'), on('9/24/2026, 12:00:00 AM'), on('9/24/26 00:01'), on('10/1/2026')], ['2026-09-23', null, null, null]);
check('...two-digit years too: 26 today, 99 is 2099 and in the future', [on('09/23/26'), on('09/24/26'), on('01/01/27'), on('01/01/99')],
  ['2026-09-23', null, null, null]);
check('the floor is 2014-01-01', [EARLIEST, on('01/01/2014'), on('12/31/2013'), on('2013-12-31'), on('Jan 1, 2014'), on('06/15/1999')],
  ['2014-01-01', '2014-01-01', null, null, '2014-01-01', null]);
check('...two-digit years too: 14 is the first that reads', [on('01/01/14'), on('12/31/13'), on('06/15/00'), on('06/15/09'), on('6/15/9')],
  ['2014-01-01', null, null, null, null]);
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
const textOf = n => fs.readFileSync(path.join(EXTRACTED, `${n}.txt`), 'utf8');
const outputs = Object.fromEntries(names.map(n => [n, parseCoa(textOf(n))]));

check('every fixture carries harvestOn, reportOn and testedOn, even when null',
  names.filter(n => !('harvestOn' in outputs[n]) || !('reportOn' in outputs[n]) || !('testedOn' in outputs[n])), []);
check('harvestOn and reportOn are each the ISO form of the printed date beside it',
  names.filter(n => outputs[n].harvestOn !== isoDate(outputs[n].harvestDate) || outputs[n].reportOn !== isoDate(outputs[n].reportDate)), []);
check('the corpus: 19 harvest dates (3 ACS, 16 Kaycha) and two TerpLife report dates read - unchanged by testedOn',
  names.filter(n => outputs[n].harvestOn || outputs[n].reportOn).map(n => [n, outputs[n].harvestOn, outputs[n].reportOn]),
  [['ACS-FLW-002', '2026-04-03', null], ['ACS-LRS-001', '2026-03-23', null], ['ACS-PRR-001', '2026-04-27', null],
   ['Grease_Monkey_cart', '2026-03-23', null], ['Grease_monkey_live_resin', '2026-03-23', null],
   ['GreenRoadsFullSpectrumCBDOil750mgLot24007', null, '2024-11-11'],
   ['KAY-AIO-002', '2025-12-05', null], ['KAY-AIO-003', '2026-04-28', null], ['KAY-CAR-001', '2025-07-07', null],
   ['KAY-CAR-002', '2025-11-18', null], ['KAY-CAR-003', '2026-05-27', null], ['KAY-FLW-001', '2026-01-27', null],
   ['KAY-FLW-003', '2024-09-24', null], ['KAY-LRS-001', '2025-10-06', null], ['KAY-LRS-002', '2026-05-22', null],
   ['KAY-LRS-003', '2026-05-25', null], ['KAY-LRS-005', '2024-10-22', null], ['KAY-PRR-001', '2026-01-14', null],
   ['Kush_Creek', '2026-05-24', null], ['TerpLife_GrpeBblGm_flower', null, '2025-11-17'], ['external-download', '2026-05-24', null]]);
check('every printed harvest or report date in the corpus reads',
  names.filter(n => (outputs[n].harvestDate && !outputs[n].harvestOn) || (outputs[n].reportDate && !outputs[n].reportOn)), []);
check('KAY-CAR-001 prints "07/07/25": 2025-07-07',
  [outputs['KAY-CAR-001'].harvestDate, outputs['KAY-CAR-001'].harvestOn], ['07/07/25', '2025-07-07']);

/* testedOn, fixture by fixture: the day each lab's own finish row prints, as
   test/date-probe.js showed it on 2026-10-05 and again on 2026-10-14. Kaycha
   and Modern Canna "Completed:", ACS "Completion Date:", ACT "Report
   Created:", Method its sign-off; TerpLife none, Green Scientific none. */
const TESTED = {
  '17484_0006800467': '2024-11-27', '17569_0005294444': '2023-12-29',
  'ACS-CAR-001': '2026-06-24', 'ACS-CAR-002': '2022-04-25', 'ACS-FLW-001': '2022-10-15', 'ACS-FLW-002': '2026-05-04',
  'ACS-LRS-001': '2026-06-11', 'ACS-LRS-002': '2021-08-03', 'ACS-PRR-001': '2026-06-16',
  'ACT_AppleBurst_vape': '2025-02-13', 'COA_GassiusClay_3_5gWF_4793_1807_7220_8969': '2025-08-21',
  'Grease_Monkey_cart': '2026-06-22', 'Grease_monkey_flower': '2026-06-18', 'Grease_monkey_live_resin': '2026-07-13',
  'GreenRoadsFullSpectrumCBDOil750mgLot24007': null, 'Harmony-Muscle-Rub-COA-PHRO1': null,
  'KAY-AIO-001': '2026-04-06', 'KAY-AIO-002': '2025-12-12', 'KAY-AIO-003': '2026-06-28', 'KAY-AIO-004': '2026-05-21',
  'KAY-CAR-001': '2025-07-11', 'KAY-CAR-002': '2025-12-19', 'KAY-CAR-003': '2026-07-23', 'KAY-CAR-004': '2024-08-21',
  'KAY-FLW-001': '2026-02-03', 'KAY-FLW-002': '2024-06-15', 'KAY-FLW-003': '2024-10-19',
  'KAY-LRS-001': '2025-11-11', 'KAY-LRS-002': '2026-07-16', 'KAY-LRS-003': '2026-07-10', 'KAY-LRS-004': '2024-05-03',
  'KAY-LRS-005': '2025-02-17', 'KAY-LRS-006': '2026-04-10', 'KAY-PRR-001': '2026-01-23',
  'KF2025-046-PB-AU-COA': '2025-07-29', 'Kush_Creek': '2026-06-24', 'LAB-0425BSWS-20250731': '2025-07-31',
  'MCL-CAR-001': '2024-11-08', 'MCL-CAR-002': '2024-11-08', 'MCL-FLW-001': '2024-11-08', 'MCL-FLW-002': '2021-10-05',
  'MCL-FLW-003': '2025-08-28', 'MCL-FLW-004': '2026-07-17', 'MCL-FLW-005': '2026-07-23', 'MCL-LRS-001': '2024-11-08',
  'MC_PeanutButterBreath_flower': '2026-06-30', 'MC_TwinSnakez_flower': '2026-07-17',
  'MTL-CAR-001': '2025-03-03', 'MTL-FLW-001': '2026-03-09', 'MTL-FLW-002': '2026-08-31', 'MTL-FLW-003': '2026-08-21',
  'MTL-FLW-004': '2026-08-04', 'MTL-LRS-001': '2025-03-03', 'MTL-LRS-002': '2025-05-09', 'MTL-PRR-001': '2026-03-07',
  'Method_DulceDeUva_flower': null, 'TerpLife_GrpeBblGm_flower': null, 'external-download': '2026-06-30',
  'hemp-bombs-cbd-gummies-50-count-750mg-of-cbd-COA': null
};
check('testedOn on every fixture: the day its lab\'s finish row prints',
  names.filter(n => outputs[n].testedOn !== TESTED[n]).map(n => [n, outputs[n].testedOn, TESTED[n]]), []);
check('...and the list names every fixture, no more', [names.length, Object.keys(TESTED).length, names.every(n => n in TESTED)], [59, 59, true]);
{
  const accepted = names.filter(n => outputs[n].usable);
  const dated = o => o.harvestOn || o.testedOn || o.reportOn;
  check('dated accepted fixtures, by harvestOn, testedOn or reportOn: 20 of 56 become 55 of 56 - only Method\'s older layout is undated',
    [accepted.length, accepted.filter(n => outputs[n].harvestOn || outputs[n].reportOn).length, accepted.filter(n => dated(outputs[n])).length,
     accepted.filter(n => !dated(outputs[n]))], [56, 20, 55, ['Method_DulceDeUva_flower']]);
  const perLab = {};
  for (const n of accepted) {
    const L = perLab[outputs[n].lab] || (perLab[outputs[n].lab] = [0, 0]);
    L[0]++; if (outputs[n].testedOn) L[1]++;
  }
  check('...testedOn per lab: Kaycha 22/22, Modern Canna 13/13, ACS 8/8, ACT 3/3, Method 8/9, TerpLife 0/1',
    perLab, { 'Modern Canna': [13, 13], 'ACS Laboratory': [8, 8], 'ACT Laboratories': [3, 3], 'Kaycha Labs': [22, 22],
              'Method Testing Labs': [9, 8], 'TerpLife Labs': [1, 0] });
}

/* The rules behind those values, each on a real fixture's text changed in one
   place. */
const tested = text => parseCoa(text).testedOn;
const lines = n => textOf(n).split('\n');
const swap = (n, from, to) => { const t = textOf(n); if (!t.includes(from)) throw new Error(`${n} does not print ${JSON.stringify(from)}`); return t.split(from).join(to); };
check('Modern Canna: "Completed:" is read; without its colon the same row is the status tile\'s word, and nothing is read',
  [tested(textOf('MCL-FLW-001')), tested(swap('MCL-FLW-001', 'Completed:', 'Completed')),
   textOf('MCL-FLW-001').split('\n').filter(l => l.trim() === 'Completed').length > 0],
  ['2024-11-08', null, true]);
check('Kaycha: "Completed:" then its value on the next line; a space before the colon is still the label',
  [tested(textOf('KAY-CAR-001')), tested(swap('KAY-CAR-001', 'Completed:', 'Completed :'))], ['2025-07-11', '2025-07-11']);
check('ACS: "Completion Date:" - not its batch, order, sampling or harvest dates',
  [tested(textOf('ACS-FLW-002')), outputs['ACS-FLW-002'].harvestOn, tested(swap('ACS-FLW-002', 'Completion Date:', 'Completion:'))],
  ['2026-05-04', '2026-04-03', null]);
check('ACT: "Report Created:", and the same label wrapped after "Report" - but not a bare "Created:" after anything else',
  [tested(textOf('ACT_AppleBurst_vape')), tested(textOf('LAB-0425BSWS-20250731')),
   tested(swap('LAB-0425BSWS-20250731', ', Report\nCreated:', ', Reported\nCreated:'))],
  ['2025-02-13', '2025-07-31', null]);
{
  const director = lines('MTL-CAR-001').find(l => /\s-\sLab Director$/.test(l));
  const without = textOf('MTL-CAR-001').split('\n').filter(l => l !== director).join('\n');
  check('Method: the sign-off after the Lab Director line, not "Batch Date:" - which stays printed and unread',
    [tested(textOf('MTL-CAR-001')), /Batch Date: 2\/27\/2025, 5:00:00 AM/.test(textOf('MTL-CAR-001')), tested(without)],
    ['2025-03-03', true, null]);
  check('...a line after the director that is not a date reads null, and no later date stands in',
    tested(textOf('MTL-CAR-001').replace(`${director}\n`, `${director}\nSigned electronically\n`)), null);
}
check('the first row with a value is read: an earlier unreadable one leaves testedOn null, an earlier empty one is passed over',
  [tested(swap('ACS-FLW-002', 'Completion Date:', 'Completion Date: pending\nCompletion Date:')),
   tested(swap('ACS-FLW-002', 'Completion Date:', 'Completion Date:\nOrder #:\nCompletion Date:'))],
  [null, '2026-05-04']);
check('one row per lab: a Kaycha label in an ACS report, an ACS label in a Kaycha report, are not read',
  [tested(swap('ACS-FLW-002', 'Completion Date:', 'Completed: 01/02/25\nCompletion Date:')),
   tested(swap('KAY-CAR-001', 'Completed:', 'Completion Date: 01/02/25\nCompleted:'))],
  ['2026-05-04', '2025-07-11']);
check('TerpLife: no testedOn - its "Date Reported:" is reportOn already',
  [outputs['TerpLife_GrpeBblGm_flower'].testedOn, outputs['TerpLife_GrpeBblGm_flower'].reportOn], [null, '2025-11-17']);
check('a lab the parser does not recognise: no row is read', tested('Completed: 07/11/25\nCompletion Date: 2026-06-24\nReport Created: 02/13/2025 18:18'), null);

/* The dates are output only. Load the parser with coa-dates.js unavailable -
   as when parse-coa.js runs on its own (s1) - and every other field of every
   fixture must be the same; only the three dates change, to null. */
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
    const rest = o => { const { harvestOn, reportOn, testedOn, ...others } = o; return others; };
    check('without coa-dates.js the three dates read null on every fixture',
      names.filter(n => without[n].harvestOn !== null || without[n].reportOn !== null || without[n].testedOn !== null), []);
    check('...and every other field of every fixture is identical',
      names.filter(n => JSON.stringify(rest(without[n])) !== JSON.stringify(rest(JSON.parse(JSON.stringify(outputs[n]))))), []);
  }
}

if (failures) {
  console.error(`\ncoa-dates-test: ${failures} failure${failures === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('\ncoa-dates clean');
