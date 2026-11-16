#!/usr/bin/env node
'use strict';
/* NOSE - the account functions, run offline. PARSER-HANDOFF s13, "A gate for
 * the account system".
 *
 *   node test/accounts-test.js     -> "accounts clean", or FAIL lines and exit 1
 *
 * auth-signup, auth-login, auth-me, auth-logout, auth-reset, account-delete
 * and palate-sync are driven through their default exports, with
 * netlify/lib/auth.js under them. @netlify/blobs is stood in for
 * (test/lib/functions-harness.js), and so is global fetch, the one way
 * auth.js's gotrue() reaches Supabase: every call's path, method, headers
 * and body is recorded and answered by a small made-up user list.
 *
 * What it pins down:
 *   - signup: the age attestation, the 10-character password, what is sent
 *     to Supabase, one reply for a new and an existing address
 *   - login: the cookie, word for word; the session record's five fields;
 *     the fixed message for a bad password; the ninth try in 15 minutes
 *   - me: signed out, signed in, Supabase unreachable
 *   - logout: this device, and everywhere; another user's sessions untouched
 *   - readSession: a malformed cookie is signed-out; an expired session is
 *     signed-out and deleted
 *   - account-delete: the confirmation; palate, then sessions, then
 *     identity; each failing step named in a 500 "partial"; cookie cleared
 *   - palate-sync: 401 without a session; the limits; one user never reads
 *     another's
 *   - reset: one reply whether or not the address exists
 *   - sessions-purge (since 2026-11-14, "Sessions end when the privacy page
 *     says"): an expired record whose cookie never returns is deleted, a live
 *     one kept, counts only in its log line
 *   - privacy: no console line holds an email address or a password; no
 *     function reads the cookie except through readSession
 *
 * No network, no Netlify, no Supabase. Nothing is written to disk.
 */
for (const k of ['NETLIFY_SITE_ID', 'NETLIFY_AUTH_TOKEN', 'NETLIFY_BLOBS_CONTEXT']) delete process.env[k];
process.env.SUPABASE_URL = 'https://supabase.test/';
process.env.SUPABASE_SERVICE_KEY = 'service-key-for-the-test';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ROOT, makeBlobs, loadFunctions, quietly } = require('./lib/functions-harness.js');

let finished = false;
process.on('exit', code => {
  if (!finished && code === 0) { process.stderr.write('accounts: stopped before the last check - NOT clean\n'); process.exitCode = 1; }
});
let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
}

/* ------------------------------------------------ Supabase, stood in for */

const supa = { users: new Map(), calls: [], down: false, failDelete: false, failAdminGet: false, recovery: new Map(), confirm: new Map(), access: new Map() };
function addUser(email, password, meta = {}) {
  const user = { id: crypto.randomUUID(), email, password, user_metadata: meta, created_at: '2026-01-02T03:04:05.000Z' };
  supa.users.set(email, user);
  return user;
}
const byId = id => [...supa.users.values()].find(u => u.id === id);
const reply = (status, data) => new Response(data === undefined ? '' : JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const body = init.body ? JSON.parse(init.body) : undefined;
  const call = { host: u.host, path: u.pathname + u.search, method: init.method || 'GET', headers: { ...init.headers }, body };
  supa.calls.push(call);
  if (u.host !== 'supabase.test') throw new Error(`accounts-test: a request left for ${u.host}`);
  if (supa.down) throw new Error('stand-in: unreachable');
  const p = call.path.replace(/^\/auth\/v1/, '');
  if (p === '/signup' && call.method === 'POST') {
    if (supa.users.has(body.email)) return reply(422, { error_code: 'user_already_exists', msg: 'User already registered' });
    const user = addUser(body.email, body.password, body.data);
    return reply(200, { user: { id: user.id, email: user.email }, session: null });
  }
  if (p === '/token?grant_type=password' && call.method === 'POST') {
    const user = supa.users.get(body.email);
    if (!user || user.password !== body.password) return reply(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    return reply(200, { access_token: 'made-up-token', user: { id: user.id, email: user.email } });
  }
  if (p.startsWith('/recover') && call.method === 'POST') return reply(200, {});
  /* The reset's three calls (since 2026-11-14): a recovery code verified once,
     the password set with the session that answer carries, that session ended. */
  if (p === '/verify' && call.method === 'POST') {
    /* a sign-up confirmation code (since 2026-11-16), used once */
    if (body.type === 'signup' && supa.confirm.has(body.token_hash)) {
      const who = supa.confirm.get(body.token_hash);
      supa.confirm.delete(body.token_hash);
      const t = 'access-' + crypto.randomBytes(8).toString('hex');
      supa.access.set(t, who);
      return reply(200, { access_token: t, refresh_token: 'r', user: { id: supa.users.get(who).id, email: who } });
    }
    const email = supa.recovery.get(body.token_hash);
    if (body.type !== 'recovery' || !email) return reply(403, { error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
    supa.recovery.delete(body.token_hash);
    const token = 'access-' + crypto.randomBytes(8).toString('hex');
    supa.access.set(token, email);
    return reply(200, { access_token: token, refresh_token: 'r', user: { id: supa.users.get(email).id, email } });
  }
  if (p === '/user' && call.method === 'PUT') {
    const email = supa.access.get(String(call.headers.authorization).replace(/^Bearer /, ''));
    if (!email) return reply(401, { msg: 'invalid JWT' });
    if (String(body.password).length < 10) return reply(422, { error_code: 'weak_password', msg: 'Password should be at least 10 characters' });
    supa.users.get(email).password = body.password;
    return reply(200, { id: supa.users.get(email).id, email });
  }
  if (p === '/logout?scope=global' && call.method === 'POST') {
    supa.access.delete(String(call.headers.authorization).replace(/^Bearer /, ''));
    return reply(204);
  }
  const m = /^\/admin\/users\/([^/]+)$/.exec(p);
  if (m && call.method === 'GET') {
    const user = byId(decodeURIComponent(m[1]));
    if (supa.failAdminGet || !user) return reply(404, { msg: 'User not found' });
    return reply(200, { id: user.id, email: user.email, user_metadata: user.user_metadata, app_metadata: user.app_metadata || {}, created_at: user.created_at });
  }
  if (m && call.method === 'DELETE') {
    if (supa.failDelete) return reply(500, { msg: 'stand-in: delete refused' });
    const user = byId(decodeURIComponent(m[1]));
    if (user) supa.users.delete(user.email);
    return reply(200, {});
  }
  return reply(404, { msg: 'stand-in: no such route' });
};

/* ------------------------------------------------------------- the calls */

const ALICE = 'alice@example.test', BOB = 'bob@example.test';
const PASSWORD = 'correct horse battery';
const SECRETS = [ALICE, BOB, PASSWORD, 'new@example.test', 'limit@example.test', 'nobody@example.test', 'wrong password!'];
const logged = [];
const COOKIE = 'HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=1209600';
const CLEARED = 'nose_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

/* A request as a page on this site sends it: a body is declared JSON, and the
   browser says same-origin (since 2026-11-14 every cookie function refuses
   anything else; security audit item 4). `extra` replaces or removes (null)
   any header, for the cross-site cases. */
async function call(handler, method, body, cookie, extra = {}) {
  const headers = {};
  if (body !== undefined) { headers['content-type'] = 'application/json'; headers['sec-fetch-site'] = 'same-origin'; }
  if (cookie) headers.cookie = cookie;
  for (const [k, v] of Object.entries(extra)) { if (v === null) delete headers[k]; else headers[k] = v; }
  const { value, lines } = await quietly(() => handler(new Request('https://nose-app.com/.netlify/functions/x',
    { method, headers, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) })));
  logged.push(...lines);
  const text = await value.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* a plain-text reply */ }
  return { status: value.status, data, cookie: value.headers.get('set-cookie'), lines };
}
const sessionOf = r => (/^nose_session=([^;]+);/.exec(r.cookie || '') || [])[1] || null;

async function main() {
  const blobs = makeBlobs();
  const [signup, login, me, logout, reset, accountDelete, palate, purge, resetFinish, confirm] = await loadFunctions(blobs, [
    'netlify/functions/auth-signup.js', 'netlify/functions/auth-login.js', 'netlify/functions/auth-me.js',
    'netlify/functions/auth-logout.js', 'netlify/functions/auth-reset.js', 'netlify/functions/account-delete.js',
    'netlify/functions/palate-sync.js', 'netlify/functions/sessions-purge.js', 'netlify/functions/auth-reset-finish.js', 'netlify/functions/auth-confirm.js']);
  const sessions = () => blobs.keys('auth-sessions');
  addUser(ALICE, PASSWORD, { subscription: 'free', age_attested_at: '2026-01-02T03:04:05.000Z' });
  addUser(BOB, PASSWORD, { subscription: 'active' }).app_metadata = { subscription: 'active' };
  /* Carol set "active" in her own user_metadata, which Supabase lets a
     signed-in user change; only app_metadata is believed (security audit
     item 3, since 2026-11-14). */
  const CAROL = 'carol@example.test';
  SECRETS.push(CAROL);
  addUser(CAROL, PASSWORD, { subscription: 'active' });
  /* The throttle counts good logins too, eight in 15 minutes for one address;
     the run signs in more often than that, so each sign-in here starts it over. */
  const signIn = async email => {
    if (blobs.stores.has('auth-ratelimit')) blobs.stores.get('auth-ratelimit').clear();
    const r = await call(login, 'POST', { email, password: PASSWORD });
    return `nose_session=${sessionOf(r)}`;
  };

  /* ---- every function refuses another method ---- */
  check('a GET to each POST function, and a POST to auth-me, is answered 405',
    [(await call(signup, 'GET')).status, (await call(login, 'GET')).status, (await call(logout, 'GET')).status,
      (await call(reset, 'GET')).status, (await call(accountDelete, 'GET')).status, (await call(me, 'POST', {})).status],
    [405, 405, 405, 405, 405, 405]);

  /* ---- auth-signup ---- */
  let r = await call(signup, 'POST', { email: 'new@example.test', password: PASSWORD });
  check('signup: refused without ageAttested true', [r.status, r.data, r.cookie], [400, { error: 'age-not-attested' }, null]);
  r = await call(signup, 'POST', { email: 'new@example.test', password: PASSWORD, ageAttested: 'true' });
  check('signup: ...and with ageAttested "true", a string', [r.status, r.data.error], [400, 'age-not-attested']);
  r = await call(signup, 'POST', { email: 'new@example.test', password: '123456789', ageAttested: true });
  check('signup: refused for a password of 9 characters', [r.status, r.data], [400, { error: 'bad-password', message: 'Use at least 10 characters.' }]);
  r = await call(signup, 'POST', { email: 'not-an-address', password: PASSWORD, ageAttested: true });
  check('signup: refused for a bad address', [r.status, r.data], [400, { error: 'bad-email' }]);
  r = await call(signup, 'POST', '[1]');
  check('signup: refused for a body that is not an object', [r.status, r.data], [400, { error: 'rejected', reason: 'not-an-object' }]);
  check('signup: none of those reached Supabase', supa.calls.length, 0);

  const NEUTRAL = { status: 'submitted', message: 'Check your email to finish setting up your account.' };
  const fresh = await call(signup, 'POST', { email: ' New@Example.test ', password: PASSWORD, ageAttested: true });
  const sent = supa.calls.at(-1);
  check('signup: the call to Supabase is POST /auth/v1/signup with the address trimmed and lower-cased',
    [sent.method, sent.path, sent.body.email, sent.body.password], ['POST', '/auth/v1/signup?redirect_to=https%3A%2F%2Fnose-app.com%2Faccount%2Fconfirmed%2F', 'new@example.test', PASSWORD]);
  check('signup: ...its user metadata is exactly age_attested_at, a time - no subscription, which only app_metadata holds',
    [Object.keys(sent.body.data), !Number.isNaN(Date.parse(sent.body.data.age_attested_at))],
    [['age_attested_at'], true]);
  check('signup: ...and carries the service key, never a cookie',
    [sent.headers.apikey, sent.headers.authorization, 'cookie' in sent.headers], ['service-key-for-the-test', 'Bearer service-key-for-the-test', false]);
  const again = await call(signup, 'POST', { email: 'new@example.test', password: PASSWORD, ageAttested: true });
  check('signup: the reply for an address that already exists is the same as for a new one',
    [[fresh.status, fresh.data, fresh.cookie], [again.status, again.data, again.cookie]], [[200, NEUTRAL, null], [200, NEUTRAL, null]]);
  supa.down = true;
  r = await call(signup, 'POST', { email: 'other@example.test', password: PASSWORD, ageAttested: true });
  supa.down = false;
  check('signup: Supabase unreachable is 503 unavailable', [r.status, r.data], [503, { error: 'unavailable' }]);

  /* ---- auth-login ---- */
  r = await call(login, 'POST', { email: ALICE, password: PASSWORD });
  const aliceId = sessionOf(r);
  check('login: a good login answers signed-in with the address', [r.status, r.data], [200, { status: 'signed-in', email: ALICE }]);
  check('login: its cookie is exactly nose_session=<id>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=1209600',
    [r.cookie === `nose_session=${aliceId}; ${COOKIE}`, /^[A-Za-z0-9_-]{43}$/.test(aliceId || '')], [true, true]);
  const record = blobs.read('auth-sessions', `sessions/${aliceId}`);
  check('login: the session record holds exactly v, userId, email, createdAt and expiresAt',
    Object.keys(record), ['v', 'userId', 'email', 'createdAt', 'expiresAt']);
  check('login: ...and ends 14 days after it starts', Date.parse(record.expiresAt) - Date.parse(record.createdAt), 14 * 24 * 3600e3);
  check('login: two keys per session - the record, and the by-user entry',
    sessions(), [`by-user/${supa.users.get(ALICE).id}/${aliceId}`, `sessions/${aliceId}`]);
  const BAD = { error: 'invalid-credentials', message: 'Email or password is incorrect.' };
  r = await call(login, 'POST', { email: ALICE, password: 'wrong password!' });
  check('login: a bad password gets the fixed message and no cookie', [r.status, r.data, r.cookie], [400, BAD, null]);
  r = await call(login, 'POST', { email: 'nobody@example.test', password: PASSWORD });
  check('login: an unknown address gets the same', [r.status, r.data, r.cookie], [400, BAD, null]);
  const tries = [];
  for (let i = 0; i < 9; i++) tries.push((await call(login, 'POST', { email: 'limit@example.test', password: 'wrong password!' })).status);
  check('login: the ninth try for one address inside 15 minutes is 429', tries, [400, 400, 400, 400, 400, 400, 400, 400, 429]);
  check('login: the throttle key is a hash, not the address',
    blobs.keys('auth-ratelimit').every(k => /^rl\/(login|signup|reset)\/[0-9a-f]{32}$/.test(k)), true);
  supa.down = true;
  r = await call(login, 'POST', { email: BOB, password: PASSWORD });
  supa.down = false;
  check('login: Supabase unreachable is 503 unavailable', [r.status, r.data, r.cookie], [503, { error: 'unavailable' }, null]);
  r = await call(login, 'POST', { email: ALICE, password: PASSWORD }, `nose_session=${aliceId}`);
  const aliceId2 = sessionOf(r);
  check('login: signing in again replaces the session the cookie named',
    [aliceId2 !== aliceId, sessions().includes(`sessions/${aliceId}`), sessions().includes(`sessions/${aliceId2}`)], [true, false, true]);

  /* ---- auth-me ---- */
  const SIGNED_OUT = { signedIn: false, subscription: 'none' };
  r = await call(me, 'GET');
  check('me: signed out without a cookie', [r.status, r.data], [200, SIGNED_OUT]);
  r = await call(me, 'GET', undefined, `nose_session=${aliceId2}`);
  check('me: signed in - address, subscription, created day and the session\'s end',
    [r.status, r.data], [200, { signedIn: true, email: ALICE, subscription: 'free', createdAt: '2026-01-02T03:04:05.000Z',
      sessionExpiresAt: blobs.read('auth-sessions', `sessions/${aliceId2}`).expiresAt }]);
  const bobCookie = await signIn(BOB);
  r = await call(me, 'GET', undefined, bobCookie);
  check('me: a subscription of "active" is read from Supabase\'s app_metadata', r.data.subscription, 'active');
  r = await call(me, 'GET', undefined, await signIn(CAROL));
  check('me: "active" in the user\'s own user_metadata is not believed: free', [r.data.signedIn, r.data.subscription], [true, 'free']);
  supa.down = true;
  r = await call(me, 'GET', undefined, `nose_session=${aliceId2}`);
  supa.down = false;
  check('me: Supabase unreachable - still signed in, from the session, as free and degraded',
    [r.status, r.data], [200, { signedIn: true, email: ALICE, subscription: 'free', degraded: true }]);

  /* ---- readSession ---- */
  const outcomes = [];
  for (const bad of ['nose_session=%', 'nose_session=short', 'nose_session=' + 'a'.repeat(200), 'nose_session=' + '!'.repeat(40), 'other=1', 'nose_session']) {
    const got = await call(me, 'GET', undefined, bad).then(x => x.data, e => `threw ${e.name}`);
    outcomes.push(JSON.stringify(got) === JSON.stringify(SIGNED_OUT));
  }
  check('readSession: a cookie of "%", too short, too long, the wrong characters, another name or no value is signed-out, and never throws',
    outcomes, [true, true, true, true, true, true]);
  const expire = id => {
    const e = blobs.stores.get('auth-sessions').get(`sessions/${id}`);
    e.text = JSON.stringify({ ...JSON.parse(e.text), expiresAt: new Date(Date.now() - 1000).toISOString() });
  };
  const stale = (await signIn(ALICE)).slice(13);
  expire(stale);
  r = await call(me, 'GET', undefined, `nose_session=${stale}`);
  check('readSession: an expired session is signed-out, and its two keys are deleted when its cookie comes back',
    [r.data, sessions().filter(k => k.endsWith(stale))], [SIGNED_OUT, []]);

  /* ---- sessions-purge: an expired session whose cookie never returns ---- */
  const gone = (await signIn(ALICE)).slice(13);
  expire(gone);
  blobs.stores.get('auth-sessions').set('sessions/' + 'x'.repeat(43), { text: '"not a session"', etag: '"x"', metadata: {} });
  const live = sessions().filter(k => k.startsWith('sessions/') && !k.endsWith(gone) && !k.endsWith('x'.repeat(43)));
  const purged = await quietly(() => purge());
  logged.push(...purged.lines);
  check('sessions-purge: an expired session whose cookie never returned is deleted, with its by-user entry',
    sessions().filter(k => k.endsWith(gone)), []);
  check('sessions-purge: a record that cannot be read as a session is deleted', sessions().includes('sessions/' + 'x'.repeat(43)), false);
  check('sessions-purge: every live session is kept', live.every(k => sessions().includes(k)) && live.length >= 2, true);
  const purgedBody = await purged.value.json();
  const thr = purgedBody.throttle || {};
  check('sessions-purge: its reply and its one log line hold counts only, for sessions and for throttle records',
    [purged.value.status, purgedBody.sessions, thr.deleted, thr.failed, Object.keys(thr), purged.lines],
    [200, { scanned: live.length + 2, deleted: 2, failed: 0 }, 0, 0, ['scanned', 'deleted', 'failed'],
      [`log: [sessions-purge] done {"sessions":{"scanned":${live.length + 2},"deleted":2,"failed":0},"throttle":{"scanned":${thr.scanned},"deleted":0,"failed":0}}`]]);
  /* Throttle records past their window go (security audit item 14). */
  {
    const rl = blobs.stores.get('auth-ratelimit') || (blobs.getStore({ name: 'auth-ratelimit' }), blobs.stores.get('auth-ratelimit'));
    const put = (key, v) => rl.set(key, { text: JSON.stringify(v), etag: '"t"', metadata: {} });
    put('rl/login/' + 'a'.repeat(32), { start: Date.now() - 16 * 60e3, count: 3 });
    put('rl/login/' + 'b'.repeat(32), { start: Date.now() - 60e3, count: 1 });
    put('rl/signup/' + 'c'.repeat(32), { start: Date.now() - 59 * 60e3, count: 1 });
    put('rl/reset/' + 'd'.repeat(32), { start: Date.now() - 61 * 60e3, count: 1 });
    put('rl/other/' + 'e'.repeat(32), { start: Date.now(), count: 1 });
    put('rl/login/' + 'f'.repeat(32), 'not a record');
    await quietly(() => purge());
    check('sessions-purge: a login count older than 15 minutes, a reset count older than an hour, an unknown bucket and an unreadable record go; counts inside their window stay',
      ['a', 'b', 'c', 'd', 'e', 'f'].map(x => [...rl.keys()].some(k => k.endsWith(x.repeat(32)))), [false, true, true, false, false, false]);
  }
  blobs.failList.add('auth-sessions');
  const failedPurge = await quietly(() => purge());
  blobs.failList.delete('auth-sessions');
  check('sessions-purge: a listing that fails is a 500, and says so', [failedPurge.value.status, failedPurge.lines.length], [500, 1]);

  /* ---- auth-logout ---- */
  r = await call(logout, 'POST', {});
  check('logout: without a session, signed-out and the cookie cleared', [r.status, r.data, r.cookie], [200, { status: 'signed-out' }, CLEARED]);
  const a1 = await signIn(ALICE), a2 = await signIn(ALICE);
  r = await call(logout, 'POST', {}, a1);
  check('logout: this device - that session gone, the other kept, the cookie cleared',
    [r.data, r.cookie, sessions().includes(`sessions/${a1.slice(13)}`), sessions().includes(`sessions/${a2.slice(13)}`)],
    [{ status: 'signed-out', everywhere: false }, CLEARED, false, true]);
  r = await call(logout, 'POST', { everywhere: true }, a2);
  const aliceUser = supa.users.get(ALICE).id, bobUser = supa.users.get(BOB).id;
  check('logout: everywhere - every session of that user gone',
    [r.data, sessions().filter(k => k.includes(aliceUser)), (await call(me, 'GET', undefined, `nose_session=${aliceId2}`)).data],
    [{ status: 'signed-out', everywhere: true }, [], SIGNED_OUT]);
  check('logout: ...and another user\'s untouched',
    [sessions().filter(k => k.startsWith(`by-user/${bobUser}/`)).length, (await call(me, 'GET', undefined, bobCookie)).data.signedIn], [1, true]);
  const a3 = await signIn(ALICE);
  blobs.failList.add('auth-sessions');
  r = await call(logout, 'POST', { everywhere: true }, a3);
  blobs.failList.delete('auth-sessions');
  check('logout: everywhere, when the sessions cannot be listed - one console line, the cookie still cleared',
    [r.data, r.cookie, r.lines], [{ status: 'signed-out', everywhere: true }, CLEARED, ['error: [auth-logout] destroy failed stand-in: list refused']]);

  /* ---- palate-sync ---- */
  r = await call(palate, 'GET');
  check('palate-sync: 401 without a session, the cookie cleared', [r.status, r.data, r.cookie], [401, { error: 'unauthenticated' }, CLEARED]);
  r = await call(palate, 'PUT', { profiles: [] });
  check('palate-sync: PUT is 401 without a session too', r.status, 401);
  const alice = await signIn(ALICE);
  r = await call(palate, 'GET', undefined, alice);
  check('palate-sync: GET with nothing saved is empty', [r.status, r.data], [200, { status: 'empty', profiles: [], savedAt: null }]);
  const long = 'n'.repeat(300);
  r = await call(palate, 'PUT', { version: 9, extra: 'dropped', profiles: [
    { id: 'i'.repeat(300), name: long, subtitle: long, note: 'dropped', terps: { limonene: 0.5, myrcene: '0.25', over: 101, under: -1, text: 'x', ['k'.repeat(41)]: 1, edge: 100, zero: 0 } },
    { name: 'No id', terps: { linalool: 1 } },
    { name: '', terps: { linalool: 1 } }, { name: 'No terps' }, { name: 'List', terps: [1] }, { name: 'Nothing kept', terps: { a: -1 } }, null, 'text'] }, alice);
  check('palate-sync: PUT answers saved with the count it kept', [r.status, r.data.status, r.data.count], [200, 'saved', 2]);
  const kept = blobs.read('palates', `palates/${aliceUser}`);
  check('palate-sync: it keeps id and name to 120 characters, subtitle to 160, values 0 to 100 under keys of at most 40, and drops the rest',
    [Object.keys(kept), kept.version, kept.profiles],
    [['version', 'profiles', 'savedAt'], 1, [
      { id: 'i'.repeat(120), name: 'n'.repeat(120), subtitle: 'n'.repeat(160), terps: { limonene: 0.5, myrcene: 0.25, edge: 100, zero: 0 } },
      { id: null, name: 'No id', subtitle: '', terps: { linalool: 1 } }]]);
  r = await call(palate, 'GET', undefined, alice);
  check('palate-sync: GET returns what PUT kept', [r.data.status, r.data.count, r.data.profiles, r.data.savedAt], ['ok', 2, kept.profiles, kept.savedAt]);
  r = await call(palate, 'GET', undefined, bobCookie);
  check('palate-sync: one user never reads another\'s', [r.data, blobs.keys('palates')], [{ status: 'empty', profiles: [], savedAt: null }, [`palates/${aliceUser}`]]);
  const jar = { name: 'j', terps: { limonene: 1 } };
  check('palate-sync: 501 jars, a body over 262144 characters, a body that is not JSON, no list, and nothing valid are each refused',
    [(await call(palate, 'PUT', { profiles: Array(501).fill(jar) }, alice)).data.error,
      (await call(palate, 'PUT', JSON.stringify({ profiles: [{ name: 'x'.repeat(262144), terps: { limonene: 1 } }] }), alice)).status,
      (await call(palate, 'PUT', '{', alice)).data, (await call(palate, 'PUT', { profiles: 'x' }, alice)).data,
      (await call(palate, 'PUT', { profiles: [{ name: 'x', terps: {} }] }, alice)).data],
    ['too-many', 413, { error: 'invalid-json' }, { error: 'bad-shape' }, { error: 'nothing-valid' }]);
  check('palate-sync: 500 jars are kept', (await call(palate, 'PUT', { profiles: Array(500).fill(jar) }, bobCookie)).data.count, 500);
  r = await call(palate, 'DELETE', undefined, bobCookie, { 'sec-fetch-site': 'same-origin' });
  check('palate-sync: DELETE removes that user\'s palate and no other',
    [r.data, blobs.keys('palates')], [{ status: 'deleted' }, [`palates/${aliceUser}`]]);
  check('palate-sync: another method is 405', (await call(palate, 'POST', {}, alice)).status, 405);

  /* ---- a request from another site (security audit item 4, since 2026-11-14) ---- */
  {
    const CROSS = { error: 'cross-site', message: 'This request must come from a page on this site.' };
    const asForm = { 'content-type': 'text/plain', 'sec-fetch-site': 'cross-site' };
    const ways = [
      ['a plain form posted from another site', asForm],
      ['JSON from another site', { 'sec-fetch-site': 'cross-site' }],
      ['text/plain from this site', { 'content-type': 'text/plain' }],
      ['no Sec-Fetch-Site and no Origin', { 'sec-fetch-site': null }],
      ['no Sec-Fetch-Site, and another Origin', { 'sec-fetch-site': null, origin: 'https://evil.example' }],
    ];
    const before = { sessions: sessions().length, calls: supa.calls.length };
    const results = [];
    for (const [, extra] of ways) {
      results.push((await call(login, 'POST', { email: ALICE, password: PASSWORD }, undefined, extra)).status);
      results.push((await call(signup, 'POST', { email: 'x@example.test', password: PASSWORD, ageAttested: true }, undefined, extra)).status);
      results.push((await call(logout, 'POST', { everywhere: true }, bobCookie, extra)).status);
      results.push((await call(reset, 'POST', { email: ALICE }, undefined, extra)).status);
      results.push((await call(accountDelete, 'POST', { confirm: 'DELETE' }, bobCookie, extra)).status);
      results.push((await call(palate, 'PUT', { profiles: [jar] }, bobCookie, extra)).status);
    }
    check('every cookie function refuses a cross-site request 403, five ways, before anything else',
      results.every(s => s === 403) && results.length === 30, true);
    check('...and no session was made or ended, and Supabase was never asked',
      [sessions().length - before.sessions, supa.calls.length - before.calls], [0, 0]);
    check('...with one plain reply', (await call(login, 'POST', { email: ALICE, password: PASSWORD }, undefined, asForm)).data, CROSS);
    check('a page on this site whose browser sends no Sec-Fetch-Site passes on its own Origin',
      (await call(me, 'GET', undefined, bobCookie)).data.signedIn
        && (await call(palate, 'PUT', { profiles: [jar] }, bobCookie, { 'sec-fetch-site': null, origin: 'https://nose-app.com' })).status === 200, true);
    check('a DELETE from another site is refused; a GET of the palate is not guarded (it changes nothing)',
      [(await call(palate, 'DELETE', undefined, bobCookie, { 'sec-fetch-site': 'cross-site' })).status,
        (await call(palate, 'GET', undefined, bobCookie)).status], [403, 200]);
    await call(palate, 'DELETE', undefined, bobCookie, { 'sec-fetch-site': 'same-origin' });   // as it was before this block
  }

  /* ---- auth-confirm (since 2026-11-16, "Email links that come to NOSE") ---- */
  {
    const EVE = 'eve@example.test';
    SECRETS.push(EVE);
    addUser(EVE, PASSWORD);
    const code = 'pkce_' + 'c'.repeat(40);
    supa.confirm.set(code, EVE);
    SECRETS.push(code);
    const GONE = { error: 'link-expired', message: 'This confirmation link has expired or was already used. Try signing in; if your address is not confirmed yet, signing up again with it sends a new link.' };
    const from = logged.length;
    r = await call(confirm, 'POST', { token_hash: code }, undefined, { 'sec-fetch-site': 'cross-site' });
    check('confirm: refused from another site, the code not used up', [r.status, supa.confirm.has(code)], [403, true]);
    r = await call(confirm, 'POST', { token_hash: 'x<script>' });
    check('confirm: a code of the wrong shape never reaches Supabase', [r.status, r.data, supa.calls.filter(c => c.body && c.body.token_hash === 'x<script>').length], [400, GONE, 0]);
    r = await call(confirm, 'GET');
    check('confirm: only a POST', r.status, 405);
    const at = supa.calls.length;
    r = await call(confirm, 'POST', { token_hash: code });
    check('confirm: the code verified as a sign-up, then Supabase\'s session ended; no cookie set',
      [r.status, r.data.status, r.cookie, supa.calls.slice(at).map(c => `${c.method} ${c.path} ${c.body ? c.body.type : ''}`.trim()), supa.access.size >= 0 && ![...supa.access.values()].includes(EVE)],
      [200, 'confirmed', null, ['POST /auth/v1/verify signup', 'POST /auth/v1/logout?scope=global'], true]);
    r = await call(confirm, 'POST', { token_hash: code });
    check('confirm: the same code a second time is refused with one plain sentence', [r.status, r.data], [400, GONE]);
    const rec = 'pkce_' + 'd'.repeat(40);
    supa.recovery.set(rec, EVE);
    r = await call(confirm, 'POST', { token_hash: rec });
    check('confirm: a reset code is not a confirmation code, and is not used up', [r.status, supa.recovery.has(rec)], [400, true]);
    supa.recovery.delete(rec);
    supa.down = true;
    r = await call(confirm, 'POST', { token_hash: 'pkce_' + 'e'.repeat(40) });
    supa.down = false;
    check('confirm: Supabase unreachable is a 503, not "expired"', [r.status, r.data.error], [503, 'unavailable']);
    check('confirm: no console line holds the address or the code',
      logged.slice(from).some(l => l.includes(EVE) || l.includes(code)), false);
  }

  /* ---- auth-reset-finish (security audit item 13, since 2026-11-14) ---- */
  {
    const DAN = 'dan@example.test';
    SECRETS.push(DAN, 'a brand new password');
    addUser(DAN, PASSWORD);
    const d1 = await signIn(DAN), d2 = await signIn(DAN);
    const code = 'pkce_' + 'a'.repeat(40);
    supa.recovery.set(code, DAN);
    const EXPIRED = { error: 'link-expired', message: 'This reset link has expired or was already used. Ask for a new one on the account page.' };
    r = await call(resetFinish, 'POST', { token_hash: code, password: 'short' });
    check('reset-finish: a password under 10 characters is refused before Supabase is asked, and the code is not used up',
      [r.status, r.data.error, supa.recovery.has(code)], [400, 'bad-password', true]);
    r = await call(resetFinish, 'POST', { token_hash: 'pkce_' + 'b'.repeat(40), password: 'a brand new password' });
    check('reset-finish: a code Supabase does not know is refused with one plain sentence', [r.status, r.data], [400, EXPIRED]);
    r = await call(resetFinish, 'POST', { token_hash: 'x<script>', password: 'a brand new password' });
    check('reset-finish: a code of the wrong shape never reaches Supabase', [r.status, r.data, supa.calls.filter(c => c.body && c.body.token_hash === 'x<script>').length], [400, EXPIRED, 0]);
    r = await call(resetFinish, 'POST', { token_hash: code, password: 'a brand new password' }, undefined, { 'sec-fetch-site': 'cross-site' });
    check('reset-finish: refused from another site, the code not used up', [r.status, supa.recovery.has(code)], [403, true]);
    const at = supa.calls.length;
    r = await call(resetFinish, 'POST', { token_hash: code, password: 'a brand new password' });
    check('reset-finish: the code verified, the password set, the Supabase session ended - in that order',
      [r.status, r.data.status, supa.calls.slice(at).map(c => `${c.method} ${c.path}`)],
      [200, 'password-set', ['POST /auth/v1/verify', 'PUT /auth/v1/user', 'POST /auth/v1/logout?scope=global']]);
    check('...the new password signs in, the old one no longer does',
      [(await call(login, 'POST', { email: DAN, password: 'a brand new password' })).status, (await call(login, 'POST', { email: DAN, password: PASSWORD })).status], [200, 400]);
    check('...and both NOSE sessions from before the reset are gone',
      [(await call(me, 'GET', undefined, d1)).data.signedIn, (await call(me, 'GET', undefined, d2)).data.signedIn], [false, false]);
    r = await call(resetFinish, 'POST', { token_hash: code, password: 'another new password' });
    check('reset-finish: the same code a second time is refused', [r.status, r.data], [400, EXPIRED]);
    check('reset-finish: no console line holds the address, the password or the code',
      logged.filter(l => l.includes(DAN) || l.includes('brand new') || l.includes(code)), []);

    /* Supabase's default email (since 2026-11-15): it comes back to the page
       with a session after "#", and the page sends that session. */
    const jwt = sub => ['{"alg":"HS256"}', JSON.stringify({ sub, role: 'authenticated' }), 'sig'].map(x => Buffer.from(x).toString('base64url')).join('.');
    const d3 = await signIn(DAN);
    const session = jwt(supa.users.get(DAN).id);
    supa.access.set(session, DAN);
    const at2 = supa.calls.length;
    r = await call(resetFinish, 'POST', { access_token: session, password: 'a third new password' });
    check('reset-finish, by the session the default email hands back: the password set and Supabase\'s session ended, with no /verify',
      [r.status, r.data.status, supa.calls.slice(at2).map(c => `${c.method} ${c.path}`)],
      [200, 'password-set', ['PUT /auth/v1/user', 'POST /auth/v1/logout?scope=global']]);
    check('...the new password signs in, and the NOSE session from before is gone',
      [(await call(login, 'POST', { email: DAN, password: 'a third new password' })).status, (await call(me, 'GET', undefined, d3)).data.signedIn], [200, false]);
    r = await call(resetFinish, 'POST', { access_token: jwt('00000000-0000-0000-0000-000000000000'), password: 'a fourth new password' });
    check('reset-finish: a session Supabase does not know is refused with the same plain sentence', [r.status, r.data], [400, EXPIRED]);
    r = await call(resetFinish, 'POST', { access_token: 'not a jwt', password: 'a fourth new password' });
    check('reset-finish: something that is not a session never reaches Supabase', [r.status, r.data.error], [400, 'link-expired']);
    SECRETS.push('third new', 'fourth new');
  }

  /* ---- auth-reset ---- */
  const RESET = { status: 'submitted', message: 'If that address has an account, a reset link is on its way.' };
  const known = await call(reset, 'POST', { email: ALICE });
  const unknown = await call(reset, 'POST', { email: 'nobody@example.test' });
  const malformed = await call(reset, 'POST', { email: 'not-an-address' });
  check('reset: the reply is the same whether the address exists, does not, or is not an address',
    [[known.status, known.data, known.cookie], [unknown.status, unknown.data, unknown.cookie], [malformed.status, malformed.data, malformed.cookie]],
    [[200, RESET, null], [200, RESET, null], [200, RESET, null]]);
  const resets = [];
  for (let i = 0; i < 3; i++) resets.push((await call(reset, 'POST', { email: ALICE })).data);
  check('reset: ...and after the hourly limit of three', resets, [RESET, RESET, RESET]);
  check('reset: Supabase was asked three times for that address, not six',
    supa.calls.filter(c => c.path.startsWith('/auth/v1/recover') && c.body.email === ALICE).length, 3);
  check('reset: the link Supabase sends comes back to /account/reset/ (since 2026-11-15)',
    supa.calls.filter(c => c.path.startsWith('/auth/v1/recover')).every(c => c.path === '/auth/v1/recover?redirect_to=https%3A%2F%2Fnose-app.com%2Faccount%2Freset%2F'), true);

  /* ---- account-delete ---- */
  r = await call(accountDelete, 'POST', { confirm: 'DELETE' });
  check('account-delete: 401 without a session', [r.status, r.data], [401, { error: 'unauthenticated' }]);
  r = await call(accountDelete, 'POST', { confirm: 'delete' }, alice);
  check('account-delete: refused without confirm "DELETE", and nothing removed',
    [r.status, r.data.error, blobs.keys('palates').length, supa.users.has(ALICE)], [400, 'confirmation-required', 1, true]);

  /* each step failing in turn, on a user made for it */
  const PARTIAL = 'Some data could not be removed. Contact us and we will finish it manually.';
  async function failing(step, arm, disarm) {
    const email = `${step}@example.test`;
    SECRETS.push(email);
    const user = addUser(email, PASSWORD);
    const cookie = await signIn(email);
    await call(palate, 'PUT', { profiles: [jar] }, cookie);
    arm();
    const out = await call(accountDelete, 'POST', { confirm: 'DELETE' }, cookie);
    disarm();
    return { out, user };
  }
  let f = await failing('palate', () => blobs.failDelete.add('palates'), () => blobs.failDelete.delete('palates'));
  check('account-delete: the palate step failing is 500 "partial", naming palate, the cookie cleared - and the other two steps still ran',
    [f.out.status, f.out.data, f.out.cookie, sessions().filter(k => k.includes(f.user.id)), !!byId(f.user.id)],
    [500, { status: 'partial', failed: ['palate'], message: PARTIAL }, CLEARED, [], false]);
  f = await failing('sessions', () => blobs.failList.add('auth-sessions'), () => blobs.failList.delete('auth-sessions'));
  check('account-delete: the sessions cannot be listed - 500 "partial", naming sessions, the cookie cleared',
    [f.out.status, f.out.data, f.out.cookie, blobs.keys('palates').includes(`palates/${f.user.id}`), !!byId(f.user.id)],
    [500, { status: 'partial', failed: ['sessions'], message: PARTIAL }, CLEARED, false, false]);
  f = await failing('identity', () => { supa.failDelete = true; }, () => { supa.failDelete = false; });
  check('account-delete: Supabase refusing the delete is 500 "partial", naming identity, the cookie cleared',
    [f.out.status, f.out.data, f.out.cookie], [500, { status: 'partial', failed: ['identity'], message: PARTIAL }, CLEARED]);

  const before = { blobs: blobs.calls.length, supa: supa.calls.length };
  const alice2 = await signIn(ALICE);
  const at = { blobs: blobs.calls.length, supa: supa.calls.length };
  r = await call(accountDelete, 'POST', { confirm: 'DELETE' }, alice);
  const steps = blobs.calls.slice(at.blobs).filter(c => c[0] === 'delete' || c[0] === 'list').map(c => `${c[0]} ${c[1]}`);
  check('account-delete: deleted, the cookie cleared', [r.status, r.data, r.cookie], [200, { status: 'deleted' }, CLEARED]);
  check('account-delete: the order is palate, then sessions, then identity, then the address\'s three throttle records',
    [steps[0], steps[1], steps.slice(2, -3).every(s => s === 'delete auth-sessions'), steps.slice(-3), supa.calls.slice(at.supa).map(c => `${c.method} ${c.path}`)],
    ['delete palates', 'list auth-sessions', true, ['delete auth-ratelimit', 'delete auth-ratelimit', 'delete auth-ratelimit'], [`DELETE /auth/v1/admin/users/${aliceUser}`]]);
  check('account-delete: the address\'s login throttle record is gone',
    blobs.keys('auth-ratelimit').includes(`rl/login/${require('crypto').createHash('sha256').update(ALICE).digest('hex').slice(0, 32)}`), false);
  check('account-delete: the palate, every session on every device and the identity are gone; another user\'s are not',
    [blobs.keys('palates').includes(`palates/${aliceUser}`), sessions().filter(k => k.includes(aliceUser)), supa.users.has(ALICE),
      (await call(me, 'GET', undefined, alice2)).data, (await call(me, 'GET', undefined, bobCookie)).data.signedIn],
    [false, [], false, SIGNED_OUT, true]);
  check('(the run made its calls)', before.blobs > 0 && before.supa > 0, true);

  /* ---- privacy ---- */
  check('no console line holds an email address or a password',
    logged.filter(line => SECRETS.some(s => line.includes(s)) || /@example\.test/.test(line)), []);
  check('the functions did write console lines for this to read', logged.length >= 8, true);
  const dir = path.join(ROOT, 'netlify/functions');
  const readers = fs.readdirSync(dir).filter(f => f.endsWith('.js'))
    .filter(f => /readCookie|headers\.get\(\s*['"]cookie['"]\s*\)|COOKIE_NAME/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  check('no function reads the session cookie except through readSession', readers, []);
  check('every store the account functions opened is strongly consistent',
    blobs.opened.filter(o => o.consistency !== 'strong').map(o => o.name), []);
  check('every request went to Supabase\'s auth API, with the service key',
    supa.calls.every(c => c.host === 'supabase.test' && c.path.startsWith('/auth/v1/') && c.headers.apikey === 'service-key-for-the-test'), true);

  /* ---- the two keys (security audit item 10, since 2026-11-16) ---- */
  {
    process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-key-for-the-test';
    const FAY = 'fay@example.test';
    SECRETS.push(FAY);
    const at = supa.calls.length;
    await call(signup, 'POST', { email: FAY, password: PASSWORD, ageAttested: true });
    addUser(FAY, PASSWORD);   // the stand-in's sign-up route keeps no user since the call gained redirect_to
    const fay = await signIn(FAY);
    await call(reset, 'POST', { email: FAY });
    const code = 'pkce_' + '9'.repeat(40);
    supa.confirm.set(code, FAY);
    await call(confirm, 'POST', { token_hash: code });
    await call(me, 'GET', undefined, fay);
    await call(accountDelete, 'POST', { confirm: 'DELETE' }, fay);
    const made = supa.calls.slice(at);
    const admin = made.filter(c => c.path.startsWith('/auth/v1/admin/')), open = made.filter(c => !c.path.startsWith('/auth/v1/admin/'));
    check('with a publishable key set: sign-up, sign-in, reset, a link\'s code and its logout carry it, never the service key',
      [open.length >= 5, open.filter(c => c.headers.apikey !== 'publishable-key-for-the-test' || c.headers.authorization.includes('service-key')).map(c => c.path)], [true, []]);
    check('...and only /admin/ calls carry the service key',
      [admin.length >= 1, admin.filter(c => c.headers.apikey !== 'service-key-for-the-test' || c.headers.authorization !== 'Bearer service-key-for-the-test').map(c => c.path)], [true, []]);
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
  }

  /* ---- a keyed throttle fingerprint (security audit item 14, since 2026-11-16) ---- */
  {
    const crypto2 = require('crypto');
    const GUS = 'gus@example.test';
    SECRETS.push(GUS);
    addUser(GUS, PASSWORD);
    const plain = `rl/login/${crypto2.createHash('sha256').update(GUS).digest('hex').slice(0, 32)}`;
    const gus0 = await signIn(GUS);
    check('with no secret set, the throttle record is under the plain SHA-256, as before', blobs.keys('auth-ratelimit').includes(plain), true);
    process.env.NOSE_THROTTLE_SECRET = 'a-secret-for-the-test';
    const keyed = `rl/login/${crypto2.createHmac('sha256', 'a-secret-for-the-test').update(GUS).digest('hex').slice(0, 32)}`;
    const gus = await signIn(GUS);
    check('with a secret set, the record is under the keyed fingerprint, which is not the plain one',
      [blobs.keys('auth-ratelimit').includes(keyed), keyed !== plain], [true, true]);
    const tries = [];
    for (let i = 0; i < 9; i++) tries.push((await call(login, 'POST', { email: GUS, password: 'wrong password!' })).status);
    check('...and the throttle still counts: the window started again, and the ninth try inside it is 429', tries.at(-1), 429);
    r = await call(accountDelete, 'POST', { confirm: 'DELETE' }, gus);
    check('deleting the account deletes the address\'s records under both fingerprints',
      [r.status, blobs.keys('auth-ratelimit').includes(keyed), blobs.keys('auth-ratelimit').includes(plain)], [200, false, false]);
    delete process.env.NOSE_THROTTLE_SECRET;
    void gus0;
  }

  finished = true;
  if (failures) { console.log(`\naccounts: ${failures} failure${failures === 1 ? '' : 's'}`); process.exit(1); }
  console.log('\naccounts clean');
}
main().catch(e => { console.error(e); process.exit(1); });
