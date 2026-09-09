const fs = require('fs');
const path = require('path');
const dir = process.argv[2] || 'test/fixtures/extracted';
const modPath = path.resolve(process.cwd(), process.argv[3] || 'netlify/functions/lib/parse-coa.js');
const { parseCoa } = require(modPath);
let hits = 0;
for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.txt')).sort()){
  const r = parseCoa(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (r.unmapped && r.unmapped.length){ hits++; console.log(f + '  ->  ' + r.unmapped.join(' | ')); }
}
console.log('\nfixtures with non-empty unmapped: ' + hits);
