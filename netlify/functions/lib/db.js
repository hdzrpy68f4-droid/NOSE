'use strict';
/* NOSE - how the server code reaches Postgres, and what it may say when that
 * fails. One copy, since 2026-10-16 (PARSER-HANDOFF s13, "One set of server
 * helpers"), shared by the archive's store (lib/store.js, NOSE_DB_URL) and the
 * dispensary store's (NOSE_B2B_DB_URL, PARSER-HANDOFF s14); until then each
 * held its own withClient(), and the archive (lib/archive.js, reason()) and
 * the dispensary store each their own scrubber.
 *
 *   clientConfig(url, { name, timeoutMs, queryTimeoutMs })
 *       how NOSE connects: TLS verified against Supabase's own root
 *       certificate, never an sslmode in the address. lib/store.js re-exports
 *       it, and the Codespace scripts take it from there.
 *   withClient(fn, { urlEnv, name, timeoutMs, _Client })
 *       a fresh pg Client for one exchange - connect, fn(client), let go -
 *       the whole of it inside timeoutMs. urlEnv names the environment
 *       variable that holds the address; name is what a message calls it.
 *   scrub(err)
 *       an error's message, safe to print or return.
 *
 * Nothing here logs, and pg is loaded only when a connection is made: a
 * caller with no address configured never loads it.
 *
 * Never a query `name`: named queries are prepared statements, which the
 * transaction pooler cannot run. */

function checkUrl(url, name = 'NOSE_DB_URL') {
  if (!url) throw new Error(`${name} is not set`);
  if (/[?&]sslmode=/i.test(url)) {
    throw new Error(`${name} must not contain sslmode: pg discards the ssl object when one is present, ` +
                    'and TLS verification is configured in code');
  }
  return url;
}

function loadCa() {
  let ca;
  try { ca = require('./supabase-ca'); }
  catch {
    throw new Error('Supabase root certificate not embedded yet - run: node scripts/embed-supabase-ca.js <downloaded .crt>');
  }
  if (typeof ca !== 'string' || !ca.includes('BEGIN CERTIFICATE')) {
    throw new Error('netlify/functions/lib/supabase-ca.js does not hold a PEM certificate');
  }
  return ca;
}

/* One place that decides how NOSE connects, shared by the scripts. TLS is
 * verified against Supabase's own root certificate. Never
 * rejectUnauthorized: false - if verification fails, the connection fails. */
function clientConfig(url, { name = 'NOSE_DB_URL', timeoutMs = 1000, queryTimeoutMs = 4000 } = {}) {
  return {
    connectionString: checkUrl(url, name),
    ssl: { ca: loadCa() },
    connectionTimeoutMillis: timeoutMs,
    /* A hung query must not outlive the 10s NOSE keeps a reply within - its
       own budget, not a Netlify limit ("Configuration for functions" and
       "Lambda compatibility for Functions", read 2026-10-15; lib/archive.js
       says more, beside the archive's limits). */
    query_timeout: queryTimeoutMs
  };
}

/* Connect, run fn(client), let go - the whole exchange inside timeoutMs.
 *
 * The budget covers TLS, login and the query together. pg's own connect and
 * query timeouts are set to the same figure as a second line, but the race
 * here is what holds. Losing it ends the client without waiting: pg destroys
 * the socket when a query is still active, and save_scan is one statement, so
 * an abandoned write either committed whole or rolled back whole. There is no
 * half-written scan.
 *
 * Two things keep a late failure from taking the function down with it. An
 * 'error' listener, because a pg client that loses its socket while nobody is
 * waiting emits 'error', and an unheard one crashes the process - possibly in
 * the middle of somebody else's request. And Promise.race itself, which stays
 * subscribed to the work it abandoned, so a connect that fails after we
 * stopped waiting is still a handled rejection.
 *
 * The address is read from process.env[urlEnv] at each call, never cached.
 * There is no default variable: a caller names the database it means.
 *
 * _Client exists for the tests of the archive's connection and the
 * dispensary store's; nothing else passes it. */
async function withClient(fn, { urlEnv, name = urlEnv, timeoutMs = 4000, _Client } = {}) {
  if (typeof urlEnv !== 'string' || !urlEnv) throw new TypeError('withClient: urlEnv names the variable that holds the address');
  const Client = _Client || require('pg').Client;
  const c = new Client(clientConfig(process.env[urlEnv], { name, timeoutMs, queryTimeoutMs: timeoutMs }));
  c.on('error', () => {});

  let timer;
  const work = (async () => {
    await c.connect();
    return fn(c);
  })();
  const giveUp = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`gave up after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([work, giveUp]);
  } finally {
    clearTimeout(timer);
    /* Not awaited: closing must never hold up the reply. */
    Promise.resolve().then(() => c.end()).catch(() => {});
  }
}

/* An error's message, safe to print or return: no key, no fingerprint, no
   address, no database host, no IP, no quoted input value. The dispensary
   store's rules since 2026-10-07, and the archive's too since 2026-10-16:
   until then lib/archive.js's reason() left keys and quoted values alone. */
function scrub(err) {
  return String((err && err.message) || err || 'failed')
    .replace(/n[sp]k_[0-9A-Za-z_-]+/g, '<key>')
    .replace(/[0-9a-f]{64}/gi, '<sha256>')
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<address>')
    .replace(/\b[\w.-]+\.supabase\.(?:com|co)\b(?::\d+)?/gi, '<database host>')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b(?::\d+)?/g, '<ip>')
    .replace(/\b(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\b/gi, '<ip>')
    .replace(/:\s*"[^"]*"/g, ': <value>')
    .replace(/\s+/g, ' ')
    .slice(0, 160);
}

module.exports = { withClient, clientConfig, checkUrl, scrub };
