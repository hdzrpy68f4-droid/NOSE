#!/usr/bin/env node
'use strict';
/* Probe the REAL Supabase project: the checks PGlite cannot make.
 *
 *   node scripts/probe-db.js
 *   NOSE_PUBLISHABLE_KEY=sb_publishable_... node scripts/probe-db.js
 *
 * Needs NOSE_DB_URL (the writer). NOSE_DB_ADMIN_URL adds the grant audit;
 * NOSE_PUBLISHABLE_KEY (public by design - Project Settings -> API Keys) adds
 * the Data API checks. Writes nothing that survives: the one save it makes is
 * inside a transaction that is rolled back.
 *
 * Exit 0 and "probe clean" only when every check that could run passed.
 */

const crypto = require('crypto');
const path = require('path');
const { clientConfig } = require(path.resolve(__dirname, '../netlify/functions/lib/store.js'));

let failures = 0;
const ok = (label, pass, detail = '') => {
  if (!pass) failures++;
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${label}${!pass && detail ? `  (${detail})` : ''}`);
};
const info = msg => console.log(`info  ${msg}`);
const skip = msg => console.log(`skip  ${msg}`);

function writerTarget(raw) {
  const u = new URL(raw);
  const user = decodeURIComponent(u.username);
  const m = /^nose_writer\.([a-z0-9]+)$/.exec(user);
  return { u, user, ref: m && m[1] };
}

async function connect(url, opts) {
  const { Client } = require('pg');
  const c = new Client(clientConfig(url, { timeoutMs: 5000, ...opts }));
  await c.connect();
  return c;
}

async function expectDenied(c, label, sql) {
  try {
    await c.query(sql);
    ok(label, false, 'the statement was allowed');
  } catch (e) {
    ok(label, e.code === '42501', `${e.code} ${e.message}`);
  }
}

async function main() {
  const writerUrl = process.env.NOSE_DB_URL;
  if (!writerUrl) {
    console.error('FAIL: NOSE_DB_URL is not set - run scripts/set-writer-password.js, save the result as a Codespaces secret, rebuild');
    process.exit(1);
  }

  /* --- the writer's address ---------------------------------------------- */
  const t = writerTarget(writerUrl);
  ok('NOSE_DB_URL user is nose_writer.<project-ref>', !!t.ref, `got "${t.user}"`);
  ok('NOSE_DB_URL host is the shared pooler', t.u.hostname.endsWith('.pooler.supabase.com'), t.u.hostname);
  ok('NOSE_DB_URL port is 6543 (transaction mode)', t.u.port === '6543', `got ${t.u.port}`);

  /* --- TLS and identity -------------------------------------------------- */
  let w;
  try {
    w = await connect(writerUrl);
    ok('connected with TLS verified against the embedded Supabase root CA', true);
  } catch (e) {
    ok('connected with TLS verified against the embedded Supabase root CA', false, e.message);
    if (/certificate|self.signed|unable to verify|altnames/i.test(e.message)) {
      console.log('\n      TLS verification failed. Do NOT switch verification off. Stop here and report this message.');
    }
    if (/tenant or user not found/i.test(e.message)) {
      console.log('\n      "Tenant or user not found" means the host or username is wrong, not the password.');
    }
    process.exit(1);
  }
  try {
    const s = w.connection && w.connection.stream;
    if (s && typeof s.getPeerCertificate === 'function') {
      const cert = s.getPeerCertificate();
      info(`server certificate: ${cert.subject && cert.subject.CN}  issued by ${cert.issuer && cert.issuer.CN}  (authorized: ${s.authorized})`);
    }
  } catch { /* informational only */ }

  try {
    ok('connected as nose_writer', (await w.query('select current_user as u')).rows[0].u === 'nose_writer');

    /* --- append-only, on the real project --------------------------------- */
    const plain = { documents: 'byte_size', extractions: 'extractor_version', parses: 'context' };
    for (const tbl of ['documents', 'extractions', 'parses']) {
      await expectDenied(w, `nose_writer cannot UPDATE ${tbl}`,   `update nose.${tbl} set ${plain[tbl]} = ${plain[tbl]} where false`);
      await expectDenied(w, `nose_writer cannot DELETE ${tbl}`,   `delete from nose.${tbl} where false`);
      await expectDenied(w, `nose_writer cannot TRUNCATE ${tbl}`, `truncate nose.${tbl}`);
    }

    /* --- the write path, rolled back -------------------------------------- */
    const sha = crypto.randomBytes(32).toString('hex');
    const payload = {
      sha256: sha, byteSize: 1, sourceUrl: null, fetchedAt: null,
      extractorVersion: 'probe', text: 'probe', parserVersion: 'probe', context: 'seed',
      output: { lab: 'probe', terps: { limonene: 0 } }
    };
    await w.query('begin');
    try {
      const r = (await w.query('select nose.save_scan($1::jsonb) as result', [JSON.stringify(payload)])).rows[0].result;
      ok('nose_writer can save through save_scan (inside a transaction)', r && r.parseWritten === true, JSON.stringify(r));
    } catch (e) {
      ok('nose_writer can save through save_scan (inside a transaction)', false, e.message);
    } finally {
      await w.query('rollback');
    }
    const left = (await w.query('select count(*)::int as n from nose.documents where sha256 = $1', [sha])).rows[0].n;
    ok('...and the rollback left nothing behind', left === 0, `${left} row(s) remain`);
  } finally {
    await w.end().catch(() => {});
  }

  /* --- grant audit, as admin ---------------------------------------------- */
  const adminUrl = process.env.NOSE_DB_ADMIN_URL;
  if (!adminUrl) {
    skip('grant audit - NOSE_DB_ADMIN_URL is not set');
  } else {
    const a = await connect(adminUrl, { name: 'NOSE_DB_ADMIN_URL' });
    try {
      const role = (await a.query(
        `select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication, rolcanlogin
           from pg_roles where rolname = 'nose_writer'`)).rows[0];
      ok('nose_writer exists', !!role);
      if (role) {
        ok('nose_writer has no superuser, bypassrls, createrole, createdb or replication',
          !role.rolsuper && !role.rolbypassrls && !role.rolcreaterole && !role.rolcreatedb && !role.rolreplication,
          JSON.stringify(role));
      }

      const grantees = (await a.query(`
        select distinct coalesce(nullif(g.grantee::regrole::text, '-'), 'PUBLIC') as who
          from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) g where n.nspname = 'nose'
        union
        select distinct coalesce(nullif(g.grantee::regrole::text, '-'), 'PUBLIC')
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace, aclexplode(p.proacl) g where n.nspname = 'nose'
        union
        select distinct coalesce(nullif(g.grantee::regrole::text, '-'), 'PUBLIC')
          from pg_namespace n, aclexplode(n.nspacl) g where n.nspname = 'nose'`)).rows.map(r => r.who);
      const stray = grantees.filter(g => g !== 'postgres' && g !== 'nose_writer');
      ok('only postgres and nose_writer hold any grant in schema nose', stray.length === 0, `also: ${stray.join(', ')}`);

      const publicExec = (await a.query(`
        select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'nose'
           and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) g where g.grantee = 0))`)).rows[0].n;
      ok('PUBLIC cannot execute any nose function', publicExec === 0, `${publicExec} function(s)`);

      const api = (await a.query(`
        select r.rolname,
               has_schema_privilege(r.rolname, 'nose', 'USAGE') as schema_usage,
               has_table_privilege(r.rolname, 'nose.parses', 'SELECT') as can_select
          from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role')`)).rows;
      for (const r of api) {
        ok(`${r.rolname} cannot reach schema nose`, !r.schema_usage && !r.can_select, JSON.stringify(r));
      }

      const old = (await a.query(`
        select count(*)::int as n from information_schema.tables
         where table_schema = 'public' and table_name in ('documents', 'parses', 'terpene_values')`)).rows[0].n;
      ok('the old public-schema tables are gone', old === 0, `${old} still present`);
    } finally {
      await a.end().catch(() => {});
    }
  }

  /* --- the Data API must not serve schema nose ----------------------------- */
  const key = process.env.NOSE_PUBLISHABLE_KEY;
  if (!key) {
    skip('Data API checks - set NOSE_PUBLISHABLE_KEY (Project Settings -> API Keys, the publishable key)');
  } else if (!t.ref) {
    skip('Data API checks - no project ref in NOSE_DB_URL');
  } else {
    const base = `https://${t.ref}.supabase.co/rest/v1`;
    const hdr = { apikey: key, Authorization: `Bearer ${key}` };
    const read = await fetch(`${base}/documents`, { headers: { ...hdr, 'Accept-Profile': 'nose' } });
    const readBody = await read.text();
    ok('GET documents with Accept-Profile: nose is refused', !read.ok, `HTTP ${read.status} ${readBody.slice(0, 120)}`);
    const rpc = await fetch(`${base}/rpc/save_scan`, {
      method: 'POST',
      headers: { ...hdr, 'Content-Profile': 'nose', 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: {} })
    });
    const rpcBody = await rpc.text();
    ok('POST rpc/save_scan with Content-Profile: nose is refused', !rpc.ok, `HTTP ${rpc.status} ${rpcBody.slice(0, 120)}`);
    info(`Data API said: ${read.status} ${readBody.slice(0, 100).replace(/\s+/g, ' ')}`);
  }

  /* --- is Enforce SSL on? -------------------------------------------------- */
  /* A plaintext attempt with a deliberately WRONG password, so no working
   * credential ever travels unencrypted. Reaching "password authentication
   * failed" means the pooler accepted a connection without TLS. */
  {
    const { Client } = require('pg');
    const u = new URL(writerUrl);
    u.password = 'wrong-' + crypto.randomBytes(8).toString('hex');
    const c = new Client({ connectionString: u.toString(), ssl: false, connectionTimeoutMillis: 5000 });
    try {
      await c.connect();
      ok('Enforce SSL is on (a plaintext connection is refused)', false, 'a plaintext connection with a wrong password succeeded?!');
    } catch (e) {
      const reachedAuth = /password authentication failed|authentication failed/i.test(e.message);
      ok('Enforce SSL is on (a plaintext connection is refused)', !reachedAuth,
        'plaintext reached password authentication - turn on Enforce SSL (Database -> SSL Configuration)');
      info(`plaintext attempt said: ${e.message}`);
    } finally {
      await c.end().catch(() => {});
    }
  }

  console.log(failures ? `\nprobe: ${failures} failure${failures === 1 ? '' : 's'}` : '\nprobe clean');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error('probe threw:', e && e.message); process.exit(1); });
