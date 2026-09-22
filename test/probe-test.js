#!/usr/bin/env node
'use strict';
/* Offline checks of scripts/probe-db.js's own logic - no network, no database.
 *
 *   node test/probe-test.js        expect: probe-test clean
 *
 * The probe is the only thing that checks the real project, so a check in it
 * that passes without testing anything is worse than no check at all. These
 * cases pin down what may count as a pass: a Data API refusal only when it is
 * PostgREST's own "schema not exposed", and Enforce SSL only when the pooler
 * says SSL is required. Every other answer must fail.
 */

/* If the require.main guard in probe-db.js were ever lost, requiring it would
 * run the real probe. Without these it stops at "not set" instead of touching
 * the project. */
delete process.env.NOSE_DB_URL;
delete process.env.NOSE_DB_ADMIN_URL;
delete process.env.NOSE_PUBLISHABLE_KEY;

const assert = require('assert');
const path = require('path');
const probe = require(path.resolve(__dirname, '../scripts/probe-db.js'));

const REF = 'abcdefghijklmnopqrst';
const KEY = 'sb_publishable_' + 'FakeKeyForOfflineTests01';
const jwt = claims => ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'c2ln'].join('.');

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const notExposed = () =>
  json(406, { code: 'PGRST106', details: null, hint: null, message: 'Invalid schema: nose' });

function mockFetch(respond) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  return { fetchImpl, calls };
}
const checksOf = out => out.filter(r => !('info' in r));
const run = (respond, key = KEY, extra = {}) => {
  const m = mockFetch(respond);
  return probe.dataApiChecks({ ref: REF, key, fetchImpl: m.fetchImpl, ...extra })
    .then(out => ({ out, checks: checksOf(out), calls: m.calls }));
};
const allFail = (checks, n = 2) => {
  assert.strictEqual(checks.length, n, `expected ${n} checks, got ${checks.length}`);
  for (const c of checks) assert.strictEqual(c.pass, false, `"${c.label}" passed`);
};

/* A test that hangs on a promise nothing keeps alive lets Node exit quietly,
 * with code 0. Only reaching the end counts. */
let finished = false;
process.on('exit', code => {
  if (!finished && code === 0) {
    console.error('probe-test: stopped before the last check - NOT clean');
    process.exitCode = 1;
  }
});

let passed = 0;
const failed = [];
async function test(name, fn) {
  try { await fn(); passed++; }
  catch (e) { failed.push(`FAIL  ${name}\n      ${e.message}`); }
}

async function main() {
  /* --- Data API: what passes --------------------------------------------- */

  await test('PGRST106 on both requests passes both checks', async () => {
    const { checks } = await run(notExposed);
    assert.strictEqual(checks.length, 2);
    for (const c of checks) assert.strictEqual(c.pass, true, c.label);
  });

  await test('requests: apikey header only, the right URLs, the nose profile, an empty payload', async () => {
    const { calls } = await run(notExposed);
    assert.strictEqual(calls.length, 2);
    const [get, post] = calls;

    assert.strictEqual(get.url, `https://${REF}.supabase.co/rest/v1/documents`);
    assert.ok(!get.init.method || get.init.method === 'GET', 'first request is a GET');
    assert.strictEqual(get.init.headers.apikey, KEY);
    assert.strictEqual(get.init.headers['Accept-Profile'], 'nose');

    assert.strictEqual(post.url, `https://${REF}.supabase.co/rest/v1/rpc/save_scan`);
    assert.strictEqual(post.init.method, 'POST');
    assert.strictEqual(post.init.headers.apikey, KEY);
    assert.strictEqual(post.init.headers['Content-Profile'], 'nose');
    assert.strictEqual(post.init.body, '{"payload":{}}');

    for (const c of calls) {
      const names = Object.keys(c.init.headers).map(h => h.toLowerCase());
      assert.ok(!names.includes('authorization'), 'no Authorization header: publishable keys are not JWTs');
      assert.ok(c.init.signal instanceof AbortSignal, 'every request has a timeout');
    }
  });

  await test('a legacy anon JWT is used as given', async () => {
    const anon = jwt({ role: 'anon', ref: REF });
    const { checks, calls } = await run(notExposed, anon);
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].init.headers.apikey, anon);
    for (const c of checks) assert.strictEqual(c.pass, true, c.label);
  });

  await test('the key is trimmed of pasted whitespace', async () => {
    const { calls } = await run(notExposed, `  ${KEY}\n`);
    assert.strictEqual(calls[0].init.headers.apikey, KEY);
  });

  /* --- Data API: every other answer fails -------------------------------- */

  await test('a rejected key (gateway 401 "Invalid API key") fails - a refusal that proves nothing', async () => {
    const { checks } = await run(() => json(401, {
      message: 'Invalid API key', hint: 'Double check your Supabase `anon` or `service_role` API key.' }));
    allFail(checks);
    assert.match(checks[0].detail, /proves nothing/);
  });

  await test('a failed JWT check (401 PGRST301) fails', async () => {
    const { checks } = await run(() => json(401, { code: 'PGRST301', message: 'Expected 3 parts in JWT; got 1' }));
    allFail(checks);
  });

  await test('an answer (200) fails loudly', async () => {
    const { checks } = await run(() => new Response('[]', { status: 200 }));
    allFail(checks);
    assert.match(checks[0].detail, /ANSWERED/);
  });

  await test('exposed but stopped by the grants (42501) fails', async () => {
    const { checks } = await run(() => json(401, { code: '42501', message: 'permission denied for schema nose' }));
    allFail(checks);
    assert.match(checks[0].detail, /Exposed schemas/);
  });

  await test('a reloading schema cache (503 PGRST002) is inconclusive, not a pass', async () => {
    const { checks } = await run(() => json(503, { code: 'PGRST002', message: 'Could not query the database for the schema cache. Retrying.' }));
    allFail(checks);
    assert.match(checks[0].detail, /inconclusive/);
  });

  await test('a non-JSON error page is inconclusive', async () => {
    const { checks } = await run(() => new Response('<html>502 Bad Gateway</html>', { status: 502 }));
    allFail(checks);
    assert.match(checks[0].detail, /inconclusive/);
  });

  await test('a network failure is inconclusive', async () => {
    const { checks } = await run(() => { throw new Error('getaddrinfo ENOTFOUND'); });
    allFail(checks);
    assert.match(checks[0].detail, /request failed/);
  });

  await test('a hung request times out and is inconclusive', async () => {
    /* AbortSignal.timeout's timer does not keep Node alive - a real socket
     * does - so the mock holds a timer of its own while it "hangs". */
    const hang = (url, init) => new Promise((_, reject) => {
      const socket = setTimeout(() => {}, 10000);
      init.signal.addEventListener('abort', () => { clearTimeout(socket); reject(init.signal.reason); });
    });
    const { checks } = await run(hang, KEY, { timeoutMs: 30 });
    allFail(checks);
    assert.match(checks[0].detail, /request failed/);
  });

  /* --- Data API: keys that must not be used ------------------------------ */

  await test('a secret key is refused before anything is sent', async () => {
    const { checks, calls } = await run(notExposed, 'sb_secret_' + 'x'.repeat(32));
    assert.strictEqual(calls.length, 0);
    allFail(checks, 1);
    assert.match(checks[0].detail, /SECRET key - nothing was sent/);
  });

  await test('a legacy service_role JWT is refused before anything is sent', async () => {
    const { checks, calls } = await run(notExposed, jwt({ role: 'service_role', ref: REF }));
    assert.strictEqual(calls.length, 0);
    allFail(checks, 1);
  });

  await test('no key: nothing sent, nothing reported', async () => {
    const { out, calls } = await run(notExposed, '   ');
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(out.length, 0);
  });

  await test('the key never appears in the output, even when a server echoes it', async () => {
    const { out } = await run(() => json(401, { message: `bad key ${KEY}` }));
    assert.ok(!JSON.stringify(out).includes(KEY));
  });

  /* --- Enforce SSL ------------------------------------------------------- */

  await test("Supavisor's SSL refusal counts as enforced", async () => {
    assert.strictEqual(probe.classifyPlaintext(`SSL connection is required for user: nose_writer.${REF}`), 'enforced');
    assert.strictEqual(probe.classifyPlaintext('(ESSLREQUIRED) SSL connection is required'), 'enforced');
  });

  await test('reaching the password check means Enforce SSL is off', async () => {
    assert.strictEqual(probe.classifyPlaintext(`password authentication failed for user "nose_writer.${REF}"`), 'off');
  });

  await test('any other answer is unknown - never a pass', async () => {
    for (const m of ['Connection terminated unexpectedly', 'timeout expired', 'read ECONNRESET',
      'too many authentication failures, new connections are temporarily blocked', '', undefined]) {
      assert.strictEqual(probe.classifyPlaintext(m), 'unknown', String(m));
    }
  });

  /* --- the writer's address ---------------------------------------------- */

  await test('the project ref comes from the nose_writer user name only', async () => {
    const u = new URL('postgresql://aws-0-us-east-1.pooler.supabase.com');
    u.username = `nose_writer.${REF}`;
    u.port = '6543';
    u.pathname = '/postgres';
    assert.strictEqual(probe.writerTarget(u.toString()).ref, REF);
    u.username = `postgres.${REF}`;
    assert.strictEqual(probe.writerTarget(u.toString()).ref, null);
  });

  finished = true;
  for (const f of failed) console.error(f);
  if (failed.length) {
    console.error(`\nprobe-test: ${failed.length} failure${failed.length === 1 ? '' : 's'} (${passed} passed)`);
    process.exit(1);
  }
  console.log(`probe-test: ${passed} checks\nprobe-test clean`);
}

main().catch(e => { console.error('probe-test threw:', e && e.message); process.exit(1); });
