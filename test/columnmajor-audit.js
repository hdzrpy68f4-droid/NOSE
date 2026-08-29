'use strict';
/* Read-only: does readColumnMajor ever return a result? Changes nothing. */
const fs = require('fs');
const { parseCoa, readColumnMajor } = require('../netlify/functions/lib/parse-coa');
const DIR = 'test/fixtures/extracted';
const norm = t => String(t)
  .replace(/\uFB01/g,'fi').replace(/\uFB02/g,'fl').replace(/\u00A0/g,' ')
  .split('\n').map(l=>l.trim()).filter(Boolean);
for (const f of fs.readdirSync(DIR).sort().filter(x=>x.endsWith('.txt'))){
  const text = fs.readFileSync(DIR+'/'+f,'utf8');
  const r = parseCoa(text);
  const reached = r.mappedTotal === 0 || !(r.totalTerpenes > 0)
    || r.mappedTotal > r.totalTerpenes * 1.05;
  const col = readColumnMajor(norm(text), r.totalTerpenes);
  console.log(f.padEnd(40), (r.usable?'accept':'REJECT').padEnd(7),
    String(r.readBy).padEnd(12), 'reached:'+(reached?'yes':'no '),
    'colmajor:'+(col ? 'READS '+Object.keys(col.terps).length+' terps' : 'declines'));
  if (!r.usable) console.log('   -> ' + r.rejectReasons.join(' | '));
}
