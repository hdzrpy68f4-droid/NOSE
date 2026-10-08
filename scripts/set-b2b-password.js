#!/usr/bin/env node
'use strict';
/* Give nose_b2b - the dispensary role (PARSER-HANDOFF s14) - a fresh random
 * password, prove it works, and print its NOSE_B2B_DB_URL once.
 *
 *   node scripts/set-b2b-password.js
 *
 * As scripts/set-writer-password.js does for nose_writer, and with its own
 * two helpers, not copies: needs NOSE_DB_ADMIN_URL (the Session pooler
 * string, user postgres.<project-ref>, port 5432) and the root certificate
 * embedded; sends the server only a SCRAM-SHA-256 verifier, never the
 * password, so no statement log can hold it; the password is 64 hex
 * characters, which a URL carries without percent-encoding.
 *
 * NOSE_B2B_DB_URL is nose_b2b.<project-ref> through the TRANSACTION pooler
 * (port 6543) - the form Supabase gives a custom role on the shared pooler
 * ("[ROLE].[PROJECT-REF]", docs: Connect to your database) - with no sslmode,
 * exactly like NOSE_DB_URL: TLS is verified in code, against the embedded
 * certificate, and store.js refuses a URL carrying sslmode.
 *
 * Save it as a Codespaces secret only, for now. It goes into Netlify's
 * Production context when the privacy page describes the dispensary program
 * (Prompt 8), not before.
 *
 * Run it again at any time to rotate the password; the old one stops working
 * at once, so update the saved copy straight after.
 */

const crypto = require('crypto');
const path = require('path');
const { clientConfig } = require(path.resolve(__dirname, '../netlify/functions/lib/store.js'));
const { scramVerifier, parseAdminUrl } = require(path.resolve(__dirname, 'set-writer-password.js'));

const ROLE = 'nose_b2b';

function fail(msg) {
  console.error(`\nFAIL: ${msg}`);
  process.exit(1);
}

/* Built with the URL API so the source never contains a user:password@ literal
 * (check-published.js refuses any such pattern in the repository). */
function b2bUrl({ ref, host }, password) {
  const u = new URL(`postgresql://${host}`);
  u.username = `${ROLE}.${ref}`;
  u.password = password;
  u.port = '6543';
  u.pathname = '/postgres';
  return u.toString();
}

async function main() {
  const admin = process.env.NOSE_DB_ADMIN_URL;
  if (!admin) fail('NOSE_DB_ADMIN_URL is not set - save it as a Codespaces secret, then restart the Codespace');
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
    await a.query(`alter role ${ROLE} password '${verifier}'`);
  } catch (e) {
    fail(`could not set the password as admin: ${e.message}` +
         (/tenant or user not found/i.test(e.message) ? '\n  "Tenant or user not found" means the host or username is wrong, not the password.' : '') +
         (/does not exist/i.test(e.message) ? '\n  Has the migration been pushed? npx supabase db push --db-url "$NOSE_DB_ADMIN_URL"' : ''));
  } finally {
    await a.end().catch(() => {});
  }

  const url = b2bUrl(target, password);

  /* Prove it before anyone saves it: connect exactly the way a function will,
   * through the transaction pooler with TLS verified. The pooler can take a
   * moment to see a new password, so allow a few attempts. */
  let who = null;
  let lastError = null;
  for (let attempt = 1; attempt <= 4 && !who; attempt++) {
    const c = new (require('pg').Client)(clientConfig(url, { name: 'NOSE_B2B_DB_URL', timeoutMs: 5000 }));
    try {
      await c.connect();
      who = (await c.query('select current_user as u')).rows[0].u;
    } catch (e) {
      lastError = e;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    } finally {
      await c.end().catch(() => {});
    }
  }
  if (who !== ROLE) {
    fail(`the new password was set but logging in as ${ROLE} failed: ${lastError && lastError.message}` +
         (lastError && /tenant or user not found/i.test(lastError.message) ? '\n  "Tenant or user not found" means the host or username is wrong, not the password.' : ''));
  }

  console.log(`\n${ROLE} password set, and a TLS-verified login through the transaction pooler succeeded.`);
  console.log('\nNOSE_B2B_DB_URL - shown once, copy it now:\n');
  console.log(`  ${url}\n`);
  console.log('Save it in ONE place for now:');
  console.log('  GitHub -> NOSE repo -> Settings -> Secrets and variables -> Codespaces -> New repository secret');
  console.log('  Name: NOSE_B2B_DB_URL');
  console.log('Not in Netlify yet: it goes there with the privacy page\'s dispensary section (Prompt 8).');
  console.log('\nThen close this terminal with the trash-can icon at the top right of the');
  console.log('terminal panel, so the address does not stay on screen.');
}

module.exports = { b2bUrl, ROLE };
if (require.main === module) main().catch(e => fail(e.message));
