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

const supa = { users: new Map(), calls: [], down: false, failDelete: false, failAdminGet: false };
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
  if (p === '/recover' && call.method === 'POST') return reply(200, {});
  const m = /^\/admin\/users\/([^/]+)$/.exec(p);
  if (m && call.method === 'GET') {
    const user = byId(decodeURIComponent(m[1]));
    if (supa.failAdminGet || !user) return reply(404, { msg: 'User not found' });
    return reply(200, { id: user.id, email: user.email, user_metadata: user.user_metadata, created_at: user.created_at });
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

async function call(handler, method, body, cookie) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
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
  const [signup, login, me, logout, reset, accountDelete, palate, purge] = await loadFunctions(blobs, [
    'netlify/functions/auth-signup.js', 'netlify/functions/auth-login.js', 'netlify/functions/auth-me.js',
    'netlify/functions/auth-logout.js', 'netlify/functions/auth-reset.js', 'netlify/functions/account-delete.js',
    'netlify/functions/palate-sync.js', 'netlify/functions/sessions-purge.js']);
  const sessions = () => blobs.keys('auth-sessions');
  addUser(ALICE, PASSWORD, { subscription: 'free', age_attested_at: '2026-01-02T03:04:05.000Z' });
  addUser(BOB, PASSWORD, { subscription: 'active' });
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
    [sent.method, sent.path, sent.body.email, sent.body.password], ['POST', '/auth/v1/signup', 'new@example.test', PASSWORD]);
  check('signup: ...its user metadata is exactly age_attested_at, a time, and subscription "free"',
    [Object.keys(sent.body.data), !Number.isNaN(Date.parse(sent.body.data.age_attested_at)), sent.body.data.subscription],
    [['age_attested_at', 'subscription'], true, 'free']);
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
  check('me: a subscription of "active" is read from Supabase\'s metadata', r.data.subscription, 'active');
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
  check('sessions-purge: its reply and its one log line hold counts only',
    [purged.value.status, await purged.value.json(), purged.lines],
    [200, { scanned: live.length + 2, deleted: 2, failed: 0 },
      [`log: [sessions-purge] done {"scanned":${live.length + 2},"deleted":2,"failed":0}`]]);
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
  r = await call(palate, 'DELETE', undefined, bobCookie);
  check('palate-sync: DELETE removes that user\'s palate and no other',
    [r.data, blobs.keys('palates')], [{ status: 'deleted' }, [`palates/${aliceUser}`]]);
  check('palate-sync: another method is 405', (await call(palate, 'POST', {}, alice)).status, 405);

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
    supa.calls.filter(c => c.path === '/auth/v1/recover' && c.body.email === ALICE).length, 3);

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
  check('account-delete: the order is palate, then sessions, then identity',
    [steps[0], steps[1], steps.slice(2).every(s => s === 'delete auth-sessions'), supa.calls.slice(at.supa).map(c => `${c.method} ${c.path}`)],
    ['delete palates', 'list auth-sessions', true, [`DELETE /auth/v1/admin/users/${aliceUser}`]]);
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

  finished = true;
  if (failures) { console.log(`\naccounts: ${failures} failure${failures === 1 ? '' : 's'}`); process.exit(1); }
  console.log('\naccounts clean');
}
main().catch(e => { console.error(e); process.exit(1); });
