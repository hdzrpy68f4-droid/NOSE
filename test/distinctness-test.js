#!/usr/bin/env node
'use strict';
/* Proves the forward chooser's distinctness guard actually fires.
 *
 * The gates prove the guard broke nothing. Nothing proved it DOES anything -
 * the corpus contains no document that trips it, which is why the probe came
 * back empty. These are synthetic COAs built to trip it on purpose.
 *
 * Layout in all cases: analyte name, then two numeric cells (a limit column
 * and a result column), the ragged two-cell shape Kaycha and ACS print. */

const assert = require('assert');
const { parseCoa } = require('../netlify/functions/lib/parse-coa.js');

const NAMES = ['Limonene', 'Myrcene', 'Caryophyllene', 'Humulene', 'alpha-Pinene',
               'beta-Pinene', 'Linalool', 'Bisabolol', 'Terpinolene', 'Ocimene'];
const KEYS  = ['limonene', 'myrcene', 'caryophyllene', 'humulene', 'pinene_a',
               'pinene_b', 'linalool', 'bisabolol', 'terpinolene', 'ocimene'];

const TOTAL = 0.200;

function coa(first, second){
  const rows = NAMES.map((n, i) =>
    [n, first[i].toFixed(3), second[i].toFixed(3)].join('\n'));
  return ['Terpenes', 'Total Terpenes: ' + TOTAL.toFixed(3) + '%'].concat(rows).join('\n');
}

const expect = (got, want, label) =>
  assert.strictEqual(got, want, label + ': expected ' + want + ', got ' + got);

let failed = 0;
const run = (name, fn) => {
  try { fn(); console.log('ok    ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + e.message); }
};

/* --- 1. uniform limit column, both columns reconcile ---------------------
   Limit column: 10 x 0.020 = 0.200, share 1.000
   Result column:            = 0.190, share 0.950
   Bigger share wins, so before the guard the limit column took it and every
   terpene read 0.020 - a flat fingerprint, internally consistent, meaningless. */
const REAL = [0.052, 0.031, 0.028, 0.019, 0.015, 0.013, 0.011, 0.009, 0.007, 0.005];

run('uniform limit column is rejected in favour of the measurements', () => {
  const r = parseCoa(coa(new Array(10).fill(0.020), REAL));
  KEYS.forEach((k, i) => expect(r.terps[k], REAL[i], k));
  assert.ok(!Object.values(r.terps).some(v => v === 0.020),
            'a terpene still holds the limit value 0.020');
});

/* --- 2. control: same shape, distinct first column ------------------------
   Proves case 1 turns on DISTINCTNESS and not on column position or on the
   guard rejecting everything it sees. Same 1.000 vs 0.950 shares; the first
   column is varied, so it survives the guard and still wins on share. */
const VARIED = [0.041, 0.033, 0.029, 0.024, 0.021, 0.018, 0.014, 0.009, 0.006, 0.005];

run('a varied first column still wins on share', () => {
  const r = parseCoa(coa(VARIED, REAL));
  KEYS.forEach((k, i) => expect(r.terps[k], VARIED[i], k));
});

/* --- 3. diagnostic, not an assertion --------------------------------------
   The case the guard does NOT cover. Here the result column overshoots the
   printed total and is discarded, so after the guard rejects the limit column
   too, no column is chosen at all - and the fallback below the chooser takes
   the first plausible candidate per row, which is the limit column again.
   Reported rather than asserted: writing a passing test around this would
   freeze the behaviour in place. */
const OVERSHOOT = [0.120, 0.090, 0.070, 0.060, 0.050, 0.040, 0.030, 0.022, 0.013, 0.005];

const d = parseCoa(coa(new Array(10).fill(0.020), OVERSHOOT));
const vals = Object.values(d.terps);
const flat = vals.length > 0 && vals.every(v => v === 0.020);
console.log('\n--- diagnostic: result column overshoots, no column reconciles ---');
console.log('usable:      ' + d.usable);
console.log('total:       ' + d.totalTerpenes);
console.log('fingerprint: ' + (flat ? 'FLAT at 0.020 - fallback re-picked the limit column'
                                    : JSON.stringify(d.terps)));
if (d.rejectReasons.length) console.log('refused:     ' + d.rejectReasons.join('; '));

console.log('\n' + (failed ? failed + ' failed' : 'distinctness guard verified'));
process.exit(failed ? 1 : 0);
