'use strict';
const fs = require('fs');
const path = require('path');
const { parseCoa: parse } = require(path.resolve(process.argv[3] || 'netlify/functions/lib/parse-coa.js'));

const dir = process.argv[2] || './all';
let ok = 0, no = 0;
for (const f of fs.readdirSync(dir).sort()){
  if (!f.endsWith('.txt')) continue;
  const r = parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const name = f.replace(/\.txt$/, '').slice(0, 42);
  const cov = r.coverage == null ? '   —  ' : (r.coverage * 100).toFixed(1).padStart(5) + '%';
  const n = Object.values(r.terps).filter(v => v > 0).length;
  if (r.usable){ ok++; console.log(`ACCEPT  ${name.padEnd(44)} ${cov}  ${String(n).padStart(2)} terps`); }
  else {
    no++;
    console.log(`REJECT  ${name.padEnd(44)} ${cov}  ${String(n).padStart(2)} terps`);
    r.rejectReasons.forEach(x => console.log(`          - ${x}`));
  }
}
console.log(`\n${ok} accepted / ${no} rejected`);
