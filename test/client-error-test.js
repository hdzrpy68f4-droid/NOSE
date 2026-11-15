#!/usr/bin/env node
'use strict';
/* NOSE - an error report from the app is stored, a start-up failure included.
 * PARSER-HANDOFF s13, "Start-up error reports reach the server".
 *
 *   node test/client-error-test.js     -> "client-error clean", or FAIL lines and exit 1
 *
 * netlify/functions/client-error.js is driven through its default export,
 * offline, with a stand-in for @netlify/blobs (test/lib/functions-harness.js).
 * Until 2026-11-14 it took only "error" and "unhandledrejection", while the
 * app's step() reports a failed start-up step as "init:<step>": each of
 * those was answered 400 bad-kind and lost.
 *
 * What it pins down:
 *   - error, unhandledrejection, init:hero and init:route are each stored
 *   - every name the bundle passes to step() is an accepted kind
 *   - "init:" alone, 41 letters, an upper-case letter and "boot" are refused
 *     with bad-kind and nothing stored
 *   - a stored init record holds the same fields as an error record, the
 *     kind as sent, under errors/<day>/<ctx>/<suffix>
 */
for (const k of ['NETLIFY_SITE_ID', 'NETLIFY_AUTH_TOKEN', 'NETLIFY_BLOBS_CONTEXT']) delete process.env[k];

const fs = require('fs');
const path = require('path');
const { ROOT, makeBlobs, loadFunctions, quietly } = require('./lib/functions-harness.js');

let finished = false;
process.on('exit', code => {
  if (!finished && code === 0) { process.stderr.write('client-error: stopped before the last check - NOT clean\n'); process.exitCode = 1; }
});
let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
}

/* Since 2026-11-14 a report keeps day, never ts or clientTs (PARSER-HANDOFF
   s13, "Votes and error reports keep the day, not the time"). */
const FIELDS = ['v', 'kind', 'message', 'source', 'line', 'col', 'page', 'ua', 'day', 'ctx'];
const TODAY = () => new Date().toISOString().slice(0, 10);
const report = (kind, more = {}) => ({ kind, message: 'x is not defined', source: 'https://nose-app.com/js/nose.js', line: 12, col: 3,
  page: '/app', ua: 'test', ts: new Date().toISOString(), ...more });

async function main() {
  const blobs = makeBlobs();
  const [handler] = await loadFunctions(blobs, ['netlify/functions/client-error.js']);
  const post = async body => {
    const { value } = await quietly(() => handler(new Request('https://nose-app.com/.netlify/functions/client-error',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })));
    return [value.status, value.status === 204 ? '' : (await value.json()).reason];
  };

  for (const kind of ['error', 'unhandledrejection', 'init:hero', 'init:route']) {
    const before = blobs.writes();
    check(`"${kind}" is answered 204 and stored`, [await post(report(kind)), blobs.writes() - before], [[204, ''], 1]);
  }

  /* Every name the app's step() is called with. */
  const bundles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => /^nose(\.[0-9a-f]{8})?\.js$/.test(f));
  check('exactly one js/nose.<hash>.js', bundles.length, 1);
  const app = fs.readFileSync(path.join(ROOT, 'js', bundles[0]), 'utf8');
  check('the bundle reports a failed step as "init:" + its name', app.includes("window.__noseReport('init:'+name,"), true);
  const names = [...new Set([...app.matchAll(/\bstep\('([^']+)'/g)].map(m => m[1]))].sort();
  check('the bundle names at least nine start-up steps', names.length >= 9, true);
  for (const name of names) check(`step "${name}" is an accepted kind`, await post(report(`init:${name}`)), [204, '']);

  for (const kind of ['init:', `init:${'a'.repeat(41)}`, 'init:Hero', 'boot', 'init:hero!', 'init', ' init:hero']) {
    const before = blobs.writes();
    check(`"${kind.length > 30 ? kind.slice(0, 12) + '... (41 letters)' : kind}" is refused with bad-kind, nothing stored`,
      [await post(report(kind)), blobs.writes() - before], [[400, 'bad-kind'], 0]);
  }
  check('40 letters and spaces is the longest accepted', await post(report(`init:${'a b '.repeat(10)}`)), [204, '']);

  /* What an init report carries, and what is stored for it. */
  const fresh = makeBlobs();
  globalThis.__noseHarnessBlobs = fresh;
  await post(report('error'));
  await post(report('init:hero', { message: 'boom', source: 'Error: boom\n    at updateHero (https://nose-app.com/js/nose.js:1:2)', line: null, col: null }));
  const keys = fresh.keys('client-errors');
  check('two records, each under errors/<today>/<ctx>/<32 random hex>, no time in the key',
    keys.map(k => new RegExp(`^errors/${TODAY()}/[0-9a-f]{12}/[0-9a-f]{32}$`).test(k)), [true, true]);
  const records = keys.map(k => fresh.read('client-errors', k));
  const init = records.find(r => r.kind === 'init:hero'), err = records.find(r => r.kind === 'error');
  check('an init record holds the same fields as an error record', [Object.keys(init), Object.keys(err)], [FIELDS, FIELDS]);
  check('...the kind as sent, the message, the start of the stack on one line, no line or column',
    [init.kind, init.message, init.source, init.line, init.col],
    ['init:hero', 'boom', 'Error: boom     at updateHero (https://nose-app.com/js/nose.js:1:2)', null, null]);
  check('the store is client-errors, strongly consistent', fresh.opened.every(o => o.name === 'client-errors' && o.consistency === 'strong'), true);
  check('a record keeps the day, v 2, and no time of day anywhere, key or value',
    [init.v, init.day, keys.filter(k => /T\d{2}:\d{2}|\d{2}:\d{2}:\d{2}|\d{9}-/.test(k + JSON.stringify(fresh.read('client-errors', k))))], [2, TODAY(), []]);

  /* errors-purge still deletes by the day in the key, the new keys and the
     old alike. */
  {
    const purgeBlobs = makeBlobs();
    const [purge] = await loadFunctions(purgeBlobs, ['netlify/functions/errors-purge.js']);
    const store = purgeBlobs.getStore('client-errors');
    const day = n => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);
    const hex = c => c.repeat(32);
    await store.setJSON(`errors/${day(91)}/aaaaaaaaaaaa/${hex('a')}`, { v: 2 });
    await store.setJSON(`errors/${day(120)}/bbbbbbbbbbbb/093000123-abc123`, { v: 1 });
    await store.setJSON(`errors/${day(89)}/cccccccccccc/${hex('c')}`, { v: 2 });
    await store.setJSON(`errors/${TODAY()}/dddddddddddd/${hex('d')}`, { v: 2 });
    const { value, lines } = await quietly(() => purge());
    check('errors-purge deletes reports older than 90 days by the day in the key, old key layout and new; keeps the rest',
      [value.status, purgeBlobs.keys('client-errors').map(k => k.split('/')[1]), lines.length], [200, [day(89), TODAY()].sort(), 1]);
  }

  /* scripts/blobs-to-days.js, against stand-in stores. */
  {
    const script = require(path.join(ROOT, 'scripts/blobs-to-days.js'));
    const b = makeBlobs();
    const votes = b.getStore('match-feedback'), errs = b.getStore('client-errors');
    const oldVote = (k, ts, extra = {}) => votes.setJSON(k, { v: 2, vote: 'up', band: 'Good', score: 80, candidate: 'cold-creek', palate: ['lemon-tart'],
      palateSize: 1, ts, clientTs: ts, ctx: 'ctx1', notes: null, ...extra });
    await oldVote('votes/good/up/2026-10-20/101500123-abc123', '2026-10-20T10:15:00.123Z');
    await oldVote('votes/low/down/2026-10-21/235959999-def456', '2026-10-21T23:59:59.999Z', { vote: 'down', band: 'Low', score: 30 });
    await votes.setJSON(`votes/good/up/${TODAY()}/${'e'.repeat(32)}`, { v: 3, vote: 'up', band: 'Good', day: TODAY(), ctx: 'new' });
    await errs.setJSON('errors/2026-10-22/0123456789ab/120000000-xyz789', { v: 1, kind: 'error', message: 'm', source: '', line: 1, col: 1,
      page: '/app', ua: 'u', ts: '2026-10-22T12:00:00.000Z', clientTs: null, ctx: '0123456789ab' });
    const printed = [];
    const run = (args, opts = {}) => script.main(args, { out: l => printed.push(l), err: l => printed.push(l), getStore: n => (n === 'match-feedback' ? votes : n === 'client-errors' ? errs : b.getStore(n)), ...opts });

    const refused = [];
    check('the script refuses without NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN',
      await script.main([], { env: {}, out: l => refused.push(l), err: l => refused.push(l) }), 1);
    const before = JSON.stringify([b.keys('match-feedback'), b.keys('client-errors')]);
    const dry = await run([]);
    check('a dry run counts what still keeps a time - 2 votes, 1 error report - and writes nothing',
      [dry, printed.slice(-3), JSON.stringify([b.keys('match-feedback'), b.keys('client-errors')]) === before],
      [0, ['votes: 3 scanned, 2 still keep a time and would be rewritten', 'error reports: 1 scanned, 1 still keep a time and would be rewritten',
        'dry run - nothing was written; add --yes to rewrite'], true]);

    /* A run that stops part way: the delete of the second old vote fails. */
    const realDelete = votes.delete.bind(votes);
    let deletes = 0;
    votes.delete = async k => { if (++deletes === 2) throw new Error('stand-in: stopped part way'); return realDelete(k); };
    const partial = await run(['--yes']);
    votes.delete = realDelete;
    const second = await run(['--yes']);
    const vKeys = b.keys('match-feedback'), eKeys = b.keys('client-errors');
    const vRecs = vKeys.map(k => b.read('match-feedback', k));
    check('--yes, stopped part way, says so; a second run finishes it',
      [partial, second], [1, 0]);
    check('...every vote now under votes/<band>/<vote>/<day>/<32 hex>, its band, vote and day kept, no ts or clientTs, v 3',
      [vKeys.every(k => /^votes\/(good|low)\/(up|down)\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{32}$/.test(k)),
       vRecs.map(r => [r.band, r.vote, r.day, 'ts' in r, 'clientTs' in r, r.v]).sort()],
      [true, [['Good', 'up', '2026-10-20', false, false, 3], ['Good', 'up', TODAY(), false, false, 3], ['Low', 'down', '2026-10-21', false, false, 3]].sort()]);
    check('...the stopped vote counted once, not twice', vKeys.length, 3);
    check('...the error report under errors/<day>/<ctx>/<32 hex>, day and ctx kept, no ts or clientTs, v 2',
      [eKeys.length, /^errors\/2026-10-22\/0123456789ab\/[0-9a-f]{32}$/.test(eKeys[0]), b.read('client-errors', eKeys[0])],
      [1, true, { v: 2, kind: 'error', message: 'm', source: '', line: 1, col: 1, page: '/app', ua: 'u', day: '2026-10-22', ctx: '0123456789ab' }]);
    printed.length = 0;
    await run([]);
    check('...and a dry run after it finds 0 to rewrite', printed.slice(0, 2),
      ['votes: 3 scanned, 0 still keep a time and would be rewritten', 'error reports: 1 scanned, 0 still keep a time and would be rewritten']);
    check('the script prints counts only: no key, no value, no time',
      [...printed, ...refused].filter(l => /votes\/|errors\/|ctx1|cold-creek|T\d{2}:/.test(l)), []);
  }

  finished = true;
  if (failures) { console.log(`\nclient-error: ${failures} failure${failures === 1 ? '' : 's'}`); process.exit(1); }
  console.log('\nclient-error clean');
}
main().catch(e => { console.error(e); process.exit(1); });
