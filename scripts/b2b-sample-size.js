#!/usr/bin/env node
'use strict';
/* NOSE for dispensaries - how many shoppers (or votes) each group of a pilot
 * needs. PARSER-HANDOFF s14, "Pilot plan and report".
 *
 *   node scripts/b2b-sample-size.js --mean <orders> --sd <spread> --lift <relative> [--alpha 0.05] [--power 0.8]
 *   node scripts/b2b-sample-size.js --baseline <rate> --lift <relative> [--alpha 0.05] [--power 0.8]
 *
 * THE PRIMARY METRIC - a difference in two means. The pilot is decided by
 * inhalable orders per assigned shopper (docs/B2B-PILOT-PLAN.md, section 3;
 * the owner's choice, 2026-10-13): every order containing an inhalable,
 * divided by the shoppers assigned, in the control group and in the test
 * group.
 *
 *   --mean    inhalable orders per signed-in shopper in a past period as long
 *             as the pilot, every signed-in shopper of that period counted -
 *             those with no order as 0
 *   --sd      the standard deviation of those same counts, one per shopper
 *             (a spreadsheet's STDEV.S over that column)
 *   --lift    how much larger the test group's mean must be to count,
 *             relative to the past mean: 0.10 means 10% larger. A negative
 *             lift sizes a fall instead.
 *
 * Each group then needs, with delta = mean * lift,
 *
 *   n = 2 sd^2 ( z(1 - alpha/2) + z(power) )^2 / delta^2
 *
 * shoppers, rounded up: the normal approximation for a two-sided test of two
 * means with one spread in both groups (Chow, Shao and Wang, Sample Size
 * Calculations in Clinical Research, 2nd ed., 2008, section 3.2). The pilot
 * report decides with the matching normal interval, each group's own spread.
 *
 * THE BAND CHECK - a difference in two proportions: the share of up votes in
 * Strong against Low, votes per band.
 *
 *   --baseline   the up share expected in Low: 0.30 is 30%
 *   --lift       how much larger Strong's share must be to count, relative to
 *                the baseline: 0.30 compares 0.30 with 0.39
 *
 *   n = ( z(1 - alpha/2) * sqrt(2 pbar (1 - pbar)) + z(power) * sqrt(p1 (1 - p1) + p2 (1 - p2)) )^2 / (p1 - p2)^2
 *
 * with p1 the baseline, p2 = p1 * (1 + lift) and pbar their mean: the formula
 * R's stats::power.prop.test solves (src/library/stats/R/power.R, its "normal
 * case"), without continuity correction.
 *
 * Both take
 *
 *   --alpha   the chance of a false difference the plan accepts, two-sided
 *             (default 0.05)
 *   --power   the chance of finding the lift when it is there (default 0.8),
 *             from 0.5 to below 1
 *
 * test/b2b-pilot-test.js checks both against published worked examples - the
 * NCSS PASS chapter "Two-Sample Z-Tests Assuming Equal Variance" (its
 * validation against Chow, Shao and Wang) and R's power.prop.test
 * documentation - never against this file's own output.
 *
 * z() is the normal quantile, Wichura's Algorithm AS 241 (Applied
 * Statistics 37, 1988, 477-484), accurate to about one part in 10^16; the
 * normal distribution function is Cody's (Mathematics of Computation 23,
 * 1969, 631-637) - the coefficients both papers publish, as R's own
 * qnorm.c and pnorm.c use them. scripts/b2b-pilot-report.js takes them from
 * here, so the plan's number and the report's check of it are one
 * computation.
 *
 * It reads nothing and writes nothing: arguments in, one answer out, and the
 * lines to paste into the plan.
 */

class UsageError extends Error {}

const USAGE = 'usage: node scripts/b2b-sample-size.js --mean <orders> --sd <spread> --lift <relative> [--alpha 0.05] [--power 0.8]\n' +
              '       node scripts/b2b-sample-size.js --baseline <rate> --lift <relative> [--alpha 0.05] [--power 0.8]';

/* ------------------------------------------------- the normal distribution */

/* AS 241 (PPND16): the z with lower-tail probability p, for 0 < p < 1. */
function normalQuantile(p) {
  if (!(p > 0 && p < 1)) throw new RangeError('normalQuantile: p must be between 0 and 1');
  const q = p - 0.5;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    return q * (((((((r * 2509.0809287301226727 + 33430.575583588128105) * r + 67265.770927008700853) * r +
      45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r +
      133.14166789178437745) * r + 3.387132872796366608) /
      (((((((r * 5226.495278852854561 + 28729.085735721942674) * r + 39307.89580009271061) * r +
        21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r +
        42.313330701600911252) * r + 1);
  }
  let r = Math.sqrt(-Math.log(q < 0 ? p : 1 - p));
  let val;
  if (r <= 5) {
    r -= 1.6;
    val = (((((((r * 7.7454501427834140764e-4 + 0.0227238449892691845833) * r + 0.24178072517745061177) * r +
      1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r +
      4.6303378461565452959) * r + 1.42343711074968357734) /
      (((((((r * 1.05075007164441684324e-9 + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r +
        0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r +
        2.05319162663775882187) * r + 1);
  } else {
    r -= 5;
    val = (((((((r * 2.01033439929228813265e-7 + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r +
      0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r +
      5.4637849111641143699) * r + 6.6579046435011037772) /
      (((((((r * 2.04426310338993978564e-15 + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r +
        7.868691311456132591e-4) * r + 0.0148753612908506148525) * r + 0.13692988092273580531) * r +
        0.59983220655588793769) * r + 1);
  }
  return q < 0 ? -val : val;
}

/* Cody (1969): [P(Z <= x), P(Z > x)], each to full double precision. */
const CODY_A = [2.2352520354606839287, 161.02823106855587881, 1067.6894854603709582, 18154.981253343561249, 0.065682337918207449113];
const CODY_B = [47.20258190468824187, 976.09855173777669322, 10260.932208618978205, 45507.789335026729956];
const CODY_C = [0.39894151208813466764, 8.8831497943883759412, 93.506656132177855979, 597.27027639480026226,
  2494.5375852903726711, 6848.1904505362823326, 11602.651437647350124, 9842.7148383839780218, 1.0765576773720192317e-8];
const CODY_D = [22.266688044328115691, 235.38790178262499861, 1519.377599407554805, 6485.558298266760755,
  18615.571640885098091, 34900.952721145977266, 38912.003286093271411, 19685.429676859990727];
const CODY_P = [0.21589853405795699, 0.1274011611602473639, 0.022235277870649807, 0.001421619193227893466,
  2.9112874951168792e-5, 0.02307344176494017303];
const CODY_Q = [1.28426009614491121, 0.468238212480865118, 0.0659881378689285515, 0.00378239633202758244, 7.29751555083966205e-5];
const SQRT_32 = Math.sqrt(32);
const ONE_OVER_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

function normalBoth(x) {
  if (Number.isNaN(x)) return [NaN, NaN];
  const y = Math.abs(x);
  let temp;
  if (y <= 0.67448975) {
    let xnum = 0, xden = 0;
    if (y > Number.EPSILON * 0.5) {
      const xsq = x * x;
      xnum = CODY_A[4] * xsq;
      xden = xsq;
      for (let i = 0; i < 3; i++) { xnum = (xnum + CODY_A[i]) * xsq; xden = (xden + CODY_B[i]) * xsq; }
    }
    temp = x * (xnum + CODY_A[3]) / (xden + CODY_B[3]);
    return [0.5 + temp, 0.5 - temp];
  }
  if (y <= SQRT_32) {
    let xnum = CODY_C[8] * y, xden = y;
    for (let i = 0; i < 7; i++) { xnum = (xnum + CODY_C[i]) * y; xden = (xden + CODY_D[i]) * y; }
    temp = (xnum + CODY_C[7]) / (xden + CODY_D[7]);
  } else if (y < 38.4674) {
    const xsq = 1 / (x * x);
    let xnum = CODY_P[5] * xsq, xden = xsq;
    for (let i = 0; i < 4; i++) { xnum = (xnum + CODY_P[i]) * xsq; xden = (xden + CODY_Q[i]) * xsq; }
    temp = xsq * (xnum + CODY_P[4]) / (xden + CODY_Q[4]);
    temp = (ONE_OVER_SQRT_2PI - temp) / y;
  } else {
    return x > 0 ? [1, 0] : [0, 1];
  }
  const xsq = Math.trunc(y * 16) / 16;
  const del = (y - xsq) * (y + xsq);
  const tail = Math.exp(-xsq * xsq * 0.5) * Math.exp(-del * 0.5) * temp;
  return x > 0 ? [1 - tail, tail] : [tail, 1 - tail];
}
const normalCdf = x => normalBoth(x)[0];
const normalUpper = x => normalBoth(x)[1];

/* ------------------------------------------------------ the two formulas */

function checkLevels(alpha, power) {
  if (!(alpha > 0 && alpha < 1)) throw new RangeError('alpha is between 0 and 1');
  if (!(power >= 0.5 && power < 1)) throw new RangeError('power is from 0.5 to below 1');
}

/* Two means, one spread: shoppers per group, before rounding up. */
function sampleSizeMeans({ delta, sd, alpha = 0.05, power = 0.8 }) {
  if (typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0) throw new RangeError('delta is a difference other than 0');
  if (typeof sd !== 'number' || !(sd > 0) || !Number.isFinite(sd)) throw new RangeError('sd is a spread above 0');
  checkLevels(alpha, power);
  const z = normalQuantile(1 - alpha / 2) + normalQuantile(power);
  return (2 * sd * sd * z * z) / (delta * delta);
}

/* The power of that two-sided test with n shoppers in each group: the
   quantity sampleSizeMeans() solves for. */
function powerForMeans({ n, delta, sd, alpha = 0.05 }) {
  if (!(n > 0)) throw new RangeError('n is a number of shoppers above 0');
  if (!(sd > 0)) throw new RangeError('sd is a spread above 0');
  return normalCdf(Math.abs(delta) * Math.sqrt(n / (2 * sd * sd)) - normalQuantile(1 - alpha / 2));
}

function checkLift(lift) {
  if (typeof lift !== 'number' || !Number.isFinite(lift) || lift === 0 || lift <= -1) {
    throw new UsageError('--lift is a relative change other than 0, above -1 (0.10 is 10% larger)');
  }
}

/* The plan's inputs for the primary metric: a past mean, its spread, and a
   relative lift. */
function meansOf({ mean, sd, lift }) {
  if (typeof mean !== 'number' || !(mean > 0) || !Number.isFinite(mean)) {
    throw new UsageError('--mean is inhalable orders per shopper in a past period, a number above 0');
  }
  if (typeof sd !== 'number' || !(sd > 0) || !Number.isFinite(sd)) {
    throw new UsageError('--sd is the standard deviation of those orders per shopper, a number above 0');
  }
  checkLift(lift);
  return { mean1: mean, mean2: mean * (1 + lift), delta: mean * lift, sd };
}

function perGroupMeans({ mean, sd, lift, alpha = 0.05, power = 0.8 }) {
  const m = meansOf({ mean, sd, lift });
  const exact = sampleSizeMeans({ delta: m.delta, sd, alpha, power });
  return { ...m, alpha, power, exact, n: Math.ceil(exact) };
}

function checkProportions(p1, p2) {
  for (const p of [p1, p2]) if (typeof p !== 'number' || !(p >= 0 && p <= 1)) throw new RangeError('a proportion is between 0 and 1');
  if (p1 === p2) throw new RangeError('the two proportions must differ');
}

/* Two proportions: per group, before rounding up. */
function sampleSize({ p1, p2, alpha = 0.05, power = 0.8 }) {
  checkProportions(p1, p2);
  checkLevels(alpha, power);
  const pbar = (p1 + p2) / 2;
  const root = normalQuantile(1 - alpha / 2) * Math.sqrt(2 * pbar * (1 - pbar)) +
               normalQuantile(power) * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return (root * root) / ((p1 - p2) * (p1 - p2));
}

/* The power of the same two-sided test with n in each group: the quantity
   sampleSize() solves for, as power.prop.test computes it. */
function powerFor({ n, p1, p2, alpha = 0.05 }) {
  checkProportions(p1, p2);
  if (!(n > 0)) throw new RangeError('n is a number above 0');
  const pbar = (p1 + p2) / 2;
  return normalCdf((Math.sqrt(n) * Math.abs(p1 - p2) - normalQuantile(1 - alpha / 2) * Math.sqrt(2 * pbar * (1 - pbar))) /
                   Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)));
}

/* The band check's inputs: a baseline share and a relative lift. */
function proportionsOf({ baseline, lift }) {
  if (typeof baseline !== 'number' || !(baseline > 0 && baseline < 1)) throw new UsageError('--baseline is a share between 0 and 1 (0.30 is 30%)');
  checkLift(lift);
  const p2 = baseline * (1 + lift);
  if (!(p2 > 0 && p2 < 1)) throw new UsageError(`--baseline ${baseline} with --lift ${lift} puts the share at ${p2} - a share must stay below 1`);
  return { p1: baseline, p2 };
}

function perGroup({ baseline, lift, alpha = 0.05, power = 0.8 }) {
  const { p1, p2 } = proportionsOf({ baseline, lift });
  const exact = sampleSize({ p1, p2, alpha, power });
  return { p1, p2, alpha, power, exact, n: Math.ceil(exact) };
}

/* ------------------------------------------------------------ the command */

const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
const FLAG_NAMES = { '--mean': 'mean', '--sd': 'sd', '--baseline': 'baseline', '--lift': 'lift', '--alpha': 'alpha', '--power': 'power' };

/* { mode: 'means' | 'proportions', the numbers, and raw: each as typed, for
   the lines to paste }. */
function parseArgs(argv) {
  const opts = { alpha: 0.05, power: 0.8, raw: { alpha: '0.05', power: '0.8' } };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const name = FLAG_NAMES[flag];
    if (!name) throw new UsageError(`unknown: ${flag}`);
    if (seen.has(name)) throw new UsageError(`${flag} given twice`);
    seen.add(name);
    const v = argv[++i];
    if (v === undefined || !NUMBER.test(v)) throw new UsageError(`${flag} needs a number`);
    opts[name] = Number(v);
    opts.raw[name] = v;
  }
  const means = seen.has('mean') || seen.has('sd');
  if (means && seen.has('baseline')) {
    throw new UsageError('--mean and --sd size the primary metric, --baseline the band check: give one or the other');
  }
  if (means && !(seen.has('mean') && seen.has('sd') && seen.has('lift'))) {
    throw new UsageError('the primary metric needs --mean, --sd and --lift');
  }
  if (!means && !(seen.has('baseline') && seen.has('lift'))) {
    throw new UsageError('give --mean, --sd and --lift (the primary metric), or --baseline and --lift (the band check)');
  }
  if (!(opts.alpha > 0 && opts.alpha < 1)) throw new UsageError('--alpha is between 0 and 1 (0.05 is 5%)');
  if (!(opts.power >= 0.5 && opts.power < 1)) throw new UsageError('--power is from 0.5 to below 1 (0.8 is 80%)');
  opts.mode = means ? 'means' : 'proportions';
  if (means) meansOf(opts); else proportionsOf(opts);
  return opts;
}

const thousands = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const pct = p => `${(p * 100).toFixed(1)}%`;
const brief = v => String(Number(v.toPrecision(4)));
const row = (label, value) => `  ${label.padEnd(26)}${value}`;
const paste = (key, value) => `${(key + ':').padEnd(20)}${value}`;
const liftLabel = lift => `${lift > 0 ? '+' : ''}${(lift * 100).toFixed(1)}%`;

function describeMeans(opts) {
  const r = perGroupMeans(opts);
  const achieved = powerForMeans({ n: r.n, delta: r.delta, sd: r.sd, alpha: r.alpha });
  return [
    'b2b-sample-size: shoppers per group for a difference in two means - the primary metric, two-sided',
    row('control (past mean)', `${brief(r.mean1)} inhalable orders a shopper, standard deviation ${brief(r.sd)}`),
    row(`test (lift ${liftLabel(opts.lift)})`, `${brief(r.mean2)}   a difference of ${brief(r.delta)} a shopper`),
    row('alpha', `${r.alpha}, two-sided`),
    row('power', String(r.power)),
    row('shoppers per group', `${thousands(r.n)}   (${thousands(2 * r.n)} in all; ${r.exact.toFixed(2)} before rounding up)`),
    row(`power with ${thousands(r.n)} a group`, achieved.toFixed(3)),
    '',
    'For the plan\'s ```pilot block (section 9), these lines as they are:',
    paste('mean', opts.raw.mean),
    paste('sd', opts.raw.sd),
    paste('lift', opts.raw.lift),
    paste('alpha', opts.raw.alpha),
    paste('power', opts.raw.power),
    paste('shoppers_per_group', r.n),
    '',
    'The normal approximation for two means with one spread in both groups (Chow, Shao and Wang 2008, section 3.2), two-sided.'
  ].join('\n');
}

function describeProportions(opts) {
  const r = perGroup(opts);
  const achieved = powerFor({ n: r.n, p1: r.p1, p2: r.p2, alpha: r.alpha });
  return [
    'b2b-sample-size: votes per band for the band check - a difference in two proportions, two-sided',
    row('Low (baseline up share)', pct(r.p1)),
    row(`Strong (lift ${liftLabel(opts.lift)})`, `${pct(r.p2)}   a difference of ${((r.p2 - r.p1) * 100).toFixed(1)} points`),
    row('alpha', `${r.alpha}, two-sided`),
    row('power', String(r.power)),
    row('votes per band', `${thousands(r.n)}   (${thousands(2 * r.n)} in Strong and Low; ${r.exact.toFixed(2)} before rounding up)`),
    row(`power with ${thousands(r.n)} a band`, achieved.toFixed(3)),
    '',
    'For the plan\'s ```pilot block (section 9), this line as it is - use the plan\'s own alpha and power here:',
    paste('votes_per_band', r.n),
    '',
    'The normal approximation R\'s power.prop.test solves: two-sided, no continuity correction.'
  ].join('\n');
}

function describe(opts) {
  return opts.mode === 'means' ? describeMeans(opts) : describeProportions(opts);
}

function main(argv = process.argv.slice(2)) {
  let opts;
  try { opts = parseArgs(argv); }
  catch (e) {
    if (e instanceof UsageError) { console.error(`${e.message}\n${USAGE}`); process.exit(2); }
    throw e;
  }
  console.log(describe(opts));
}

module.exports = {
  normalQuantile, normalCdf, normalUpper,
  sampleSizeMeans, powerForMeans, meansOf, perGroupMeans,
  sampleSize, powerFor, proportionsOf, perGroup,
  parseArgs, describe, UsageError, USAGE
};
if (require.main === module) main();
