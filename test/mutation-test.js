'use strict';
/* NOSE — mutation tests.
 *
 *   node test/mutation-test.js [fixture-dir] [parser]
 *
 * Deliberately corrupts each fixture in ways real COAs vary, and requires the
 * parser to respond in one of exactly two ways:
 *
 *     the SAME fingerprint   (the mutation was cosmetic and was absorbed)
 *   or a REJECTION           (the mutation broke something and it said so)
 *
 * A third outcome - a DIFFERENT fingerprint, still accepted - is the failure
 * this whole suite exists to catch. It is the shape of every serious bug found
 * while building this parser: values landing on the wrong analytes while the
 * totals still reconcile and nothing looks wrong.
 *
 * These mutations are not hypothetical. Each one is modelled on something a
 * real Florida COA does, or on a bug that actually occurred:
 *   greek        - labs write alpha/a/α interchangeably
 *   pageNumbers  - "1 of 6" was once read as a terpene value
 *   glueNames    - TerpLife prints "alpha-Fenchyl alcohol, (+)alpha Bisabolol"
 *   dropTotal    - some templates omit a printed total entirely
 *   dupSummary   - page-one summaries repeat the page-two panel
 *   unitSwap     - ACS prints mg/g beside %, ten times larger
 */
const fs = require('fs');
const path = require('path');

const dir = path.resolve(process.argv[2] || 'test/fixtures/extracted');
const parserFp = path.resolve(process.argv[3] || 'netlify/functions/lib/parse-coa.js');

if (!fs.existsSync(dir)){ console.error(`no fixture directory at ${dir}`); process.exit(1); }
if (!fs.existsSync(parserFp)){ console.error(`no parser at ${parserFp}`); process.exit(1); }
const { parseCoa } = require(parserFp);

/* Cosmetic mutations: the parser is expected to ABSORB these and return an
   identical fingerprint. A rejection is tolerated (conservative, not wrong) but
   a different fingerprint is a failure. */
const COSMETIC = {
  greek: t => t
    .replace(/\balpha-/g, 'a-').replace(/\bbeta-/g, 'b-').replace(/\bgamma-/g, 'g-'),
  pageNumbers: t => t.split('\n')
    .map((l, i) => (i > 0 && i % 40 === 0 ? l + '\n' + (i / 40) + ' of 9' : l)).join('\n'),
  trailingSpace: t => t.split('\n').map(l => l + '  ').join('\n'),
  blankLines: t => t.split('\n').join('\n\n')
};

/* Destructive mutations: these remove or corrupt information the parser needs.
   The ONLY acceptable responses are an identical fingerprint (it found the data
   elsewhere) or a rejection. */
const DESTRUCTIVE = {
  dropTotal: t => t.split('\n')
    .filter(l => !/^total\s+terpenes/i.test(l.trim()))
    .join('\n'),
  /* Scale the ANALYTE values but not the printed total, mimicking a mg/g column
     being read where the % column was meant. Scaling everything - as an earlier
     version did - just produces a valid document in different units, which the
     parser is right to accept, so it tested nothing. */
  /* NOTE: a unit-swap mutation is deliberately absent. Scaling values without
     also scaling the printed total is hard to do reliably from the outside -
     labs print the total in several places and formats - and scaling everything
     produces a valid document in different units, which the parser is correct
     to accept. Unit confusion is better tested by the real ACS fixture, where a
     mg/g column genuinely sits beside a % column.
  */
  glueNames: t => t.replace(/\n(alpha|beta|a|b)-/g, '$1-'),
  shuffleValues: t => {
    /* Reverse the order of standalone numeric lines: every value is still real
       and from this report, but attached to the wrong analyte. This is the
       exact failure mode the suite exists for. */
    const lines = t.split('\n');
    const idx = [], vals = [];
    lines.forEach((l, i) => { if (/^\d+\.\d+$/.test(l.trim())){ idx.push(i); vals.push(l); } });
    vals.reverse();
    idx.forEach((i, k) => { lines[i] = vals[k]; });
    return lines.join('\n');
  }
};

const fingerprint = r => JSON.stringify({ t: r.terps, tot: r.totalTerpenes });

const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt')).sort();
if (!files.length){ console.error(`no .txt fixtures in ${dir}`); process.exit(1); }

let same = 0, rejected = 0, changed = 0, skipped = 0;
const failures = [];

for (const f of files){
  const text = fs.readFileSync(path.join(dir, f), 'utf8');
  let base;
  try { base = parseCoa(text); } catch { skipped++; continue; }
  if (!base.usable){ skipped++; continue; }   // only meaningful on accepted COAs
  const want = fingerprint(base);

  for (const [group, muts] of [['cosmetic', COSMETIC], ['destructive', DESTRUCTIVE]]){
    for (const [name, mutate] of Object.entries(muts)){
      let got;
      try { got = parseCoa(mutate(text)); }
      catch (e){
        changed++;
        failures.push(`${f} [${name}] THREW: ${e.message}`);
        continue;
      }
      if (!got.usable){ rejected++; continue; }
      if (fingerprint(got) === want){ same++; continue; }

      changed++;
      const diffs = [];
      for (const k of new Set([...Object.keys(base.terps), ...Object.keys(got.terps)])){
        const a = base.terps[k] ?? 0, b = got.terps[k] ?? 0;
        if (Math.abs(a - b) > 1e-9) diffs.push(`${k} ${a}->${b}`);
      }
      if (base.totalTerpenes !== got.totalTerpenes)
        diffs.unshift(`total ${base.totalTerpenes}->${got.totalTerpenes}`);
      failures.push(`${f} [${group}/${name}] ACCEPTED A DIFFERENT FINGERPRINT\n` +
                    `      ${diffs.slice(0, 4).join('  ')}${diffs.length > 4 ? ` (+${diffs.length - 4} more)` : ''}`);
    }
  }
}

if (failures.length){
  console.log('FAILURES — a mutated document was accepted with different values:\n');
  failures.forEach(x => console.log('  ' + x));
  console.log('');
}
console.log(`${same} absorbed / ${rejected} rejected / ${changed} SILENTLY CHANGED` +
            `   (${files.length - skipped} fixtures tested, ${skipped} skipped)`);
if (changed){
  console.log('\nEvery SILENTLY CHANGED case is a fingerprint the parser would have');
  console.log('handed to a user as correct. Absorbed and rejected are both fine.');
  process.exit(1);
}
console.log('\nNo mutation produced a different accepted fingerprint.');
