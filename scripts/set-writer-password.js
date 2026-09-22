#!/usr/bin/env node
'use strict';
/* Give nose_writer a fresh random password, prove it works, and print its
 * NOSE_DB_URL once.
 *
 *   node scripts/set-writer-password.js
 *
 * Needs NOSE_DB_ADMIN_URL - the Session pooler string from the dashboard's
 * Connect button (user postgres.<project-ref>, port 5432) - saved as a
 * Codespaces secret. Needs the root certificate embedded first
 * (scripts/embed-supabase-ca.js).
 *
 * Only a SCRAM-SHA-256 verifier is sent to the server, never the password: if
 * statement logging is on, a plaintext ALTER ROLE ... PASSWORD lands in
 * Supabase's logs. The password is 64 hex characters, which needs no
 * percent-encoding in a URL and no SASLprep normalisation.
 *
 * Run it again at any time to rotate the password; the old one stops working
 * immediately, so update both saved copies straight after.
 */

const crypto = require('crypto');
const path = require('path');
const { clientConfig } = require(path.resolve(__dirname, '../netlify/functions/lib/store.js'));

function fail(msg) {
  console.error(`\nFAIL: ${msg}`);
  process.exit(1);
}

/* RFC 5802 / RFC 7677, as Postgres stores it. */
function scramVerifier(password, { salt = crypto.randomBytes(16), iterations = 4096 } = {}) {
  const salted = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const clientKey = crypto.createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = crypto.createHash('sha256').update(clientKey).digest();
  const serverKey = crypto.createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

/* Host and project ref come from the string copied from Connect - never typed
 * or composed by hand. */
function parseAdminUrl(raw) {
  let u;
  try { u = new URL(raw); }
  catch { throw new Error('NOSE_DB_ADMIN_URL is not a valid URL - copy the Session pooler string from Connect again'); }
  const user = decodeURIComponent(u.username);
  const m = /^postgres\.([a-z0-9]+)$/.exec(user);
  if (!m) throw new Error(`NOSE_DB_ADMIN_URL user is "${user}" - it should be postgres.<project-ref>, from the Session pooler tab`);
  if (!u.hostname.endsWith('.pooler.supabase.com')) throw new Error('NOSE_DB_ADMIN_URL host is not the pooler - use the Session pooler tab, not Direct');
  if (u.port !== '5432') throw new Error(`NOSE_DB_ADMIN_URL port is ${u.port || 'missing'} - the Session pooler uses 5432`);
  return { ref: m[1], host: u.hostname };
}

/* Built with the URL API so the source never contains a user:password@ literal
 * (build.sh refuses any such pattern in the repository). */
function writerUrl({ ref, host }, password) {
  const u = new URL(`postgresql://${host}`);
  u.username = `nose_writer.${ref}`;
  u.password = password;
  u.port = '6543';
  u.pathname = '/postgres';
  return u.toString();
}

async function main() {
  const admin = process.env.NOSE_DB_ADMIN_URL;
  if (!admin) fail('NOSE_DB_ADMIN_URL is not set - save it as a Codespaces secret, then rebuild the Codespace');
  const target = parseAdminUrl(admin);

  const password = crypto.randomBytes(32).toString('hex');
  const verifier = scramVerifier(password);
  /* ALTER ROLE cannot take a bind parameter, so the literal is checked to
   * contain nothing but base64 and SCRAM punctuation before it is inlined. */
  if (!/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(verifier)) {
    fail('internal: verifier has an unexpected shape');
  }

  const { Client } = require('pg');
  const a = new Client(clientConfig(admin, { name: 'NOSE_DB_ADMIN_URL', timeoutMs: 5000 }));
  try {
    await a.connect();
    await a.query(`alter role nose_writer password '${verifier}'`);
  } catch (e) {
    fail(`could not set the password as admin: ${e.message}` +
         (/tenant or user not found/i.test(e.message) ? '\n  "Tenant or user not found" means the host or username is wrong, not the password.' : '') +
         (/does not exist/i.test(e.message) ? '\n  Has the migration been pushed? npx supabase db push --db-url "$NOSE_DB_ADMIN_URL"' : ''));
  } finally {
    await a.end().catch(() => {});
  }

  const url = writerUrl(target, password);

  /* Prove it before anyone saves it: connect exactly the way production will,
   * through the transaction pooler with TLS verified. The pooler can take a
   * moment to see a new password, so allow a few attempts. */
  let who = null;
  let lastError = null;
  for (let attempt = 1; attempt <= 4 && !who; attempt++) {
    const w = new (require('pg').Client)(clientConfig(url, { timeoutMs: 5000 }));
    try {
      await w.connect();
      who = (await w.query('select current_user as u')).rows[0].u;
    } catch (e) {
      lastError = e;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    } finally {
      await w.end().catch(() => {});
    }
  }
  if (who !== 'nose_writer') {
    fail(`the new password was set but logging in as nose_writer failed: ${lastError && lastError.message}` +
         (lastError && /tenant or user not found/i.test(lastError.message) ? '\n  "Tenant or user not found" means the host or username is wrong, not the password.' : ''));
  }

  console.log('\nnose_writer password set, and a TLS-verified login through the transaction pooler succeeded.');
  console.log('\nNOSE_DB_URL - shown once, copy it now:\n');
  console.log(`  ${url}\n`);
  console.log('Save it in both places:');
  console.log('  1. GitHub -> NOSE repo -> Settings -> Secrets and variables -> Codespaces -> NOSE_DB_URL');
  console.log('  2. Netlify -> project -> Project configuration -> Environment variables -> NOSE_DB_URL');
  console.log('     (tick "Contains secret values", and give it a Production value)');
  console.log('\nThen close this terminal with the trash-can icon at the top right of the');
  console.log('terminal panel, so the address does not stay on screen.');
}

module.exports = { scramVerifier, parseAdminUrl, writerUrl };
if (require.main === module) main().catch(e => fail(e.message));
