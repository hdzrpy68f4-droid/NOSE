#!/usr/bin/env node
'use strict';
/* NOSE for dispensaries - make, key and remove stores. Admin, run by hand
 * from the Codespace. PARSER-HANDOFF s14.
 *
 *   node scripts/b2b-store.js create <slug> --name "<display name>" --origin https://<host> [--origin ...]
 *                            [--window-months N] [--guardrail-thc N] [--guardrail-cbd N]
 *   node scripts/b2b-store.js add-origin <slug> https://<host>
 *   node scripts/b2b-store.js rotate-keys <slug> [--secret | --public]
 *   node scripts/b2b-store.js revoke <slug> [--secret | --public]
 *   node scripts/b2b-store.js delete-store <slug> [--yes]
 *
 * create        a store, with its first secret key (nsk_, for its server's
 *               catalog uploads) and public key (npk_, for its page's
 *               widget). --origin is where its page lives: an https origin,
 *               no path. The window (default 12 months) is how long a listed
 *               batch stays in its feed; a guardrail, in percentage points,
 *               keeps ranked batches near the THC or CBD of what the shopper
 *               bought (off unless given).
 * add-origin    one more https origin the store's page may load the widget
 *               from.
 * rotate-keys   a new key of each kind (or only --secret, or only --public);
 *               the old one stops working at once.
 * revoke        the store's working key of each kind (or one kind) stops
 *               working, with none to replace it: the store is cut off until
 *               rotate-keys gives it new ones.
 * delete-store  the end of a license: the store, its keys, its batches and
 *               their readings - and, since 2026-10-08, its votes in Netlify
 *               Blobs (the "b2b-votes" store, everything under
 *               votes/<slug>/). A dry run unless --yes. The database half
 *               goes first, in one transaction, so the store's key has
 *               stopped working by the time its votes are listed and
 *               deleted. If Blobs stops answering part way - or a vote sent
 *               in that same second lands after the listing - the same
 *               command run again deletes the votes left, store row or not.
 *               Needs NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN as well, the
 *               Codespaces secrets the archive scripts use.
 *
 * KEYS ARE SHOWN ONCE AND KEPT NOWHERE. A new key is printed to this
 * terminal once, after the change has committed, and never written anywhere
 * else: the database receives only its SHA-256, so not even a statement log
 * can hold it. Nothing here prints a full fingerprint, and no command shows a
 * key again - rotate-keys makes new ones.
 *
 * Needs NOSE_DB_ADMIN_URL (the Session pooler string). Refuses to run as
 * nose_b2b or nose_writer: the application roles cannot make, key or delete
 * stores, and this script is the only code that does.
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify/functions/lib');
const b2b = require(path.join(LIB, 'b2b-store.js'));
const b2bVotes = require(path.join(LIB, 'b2b-votes.js'));

const USAGE = `usage:
  node scripts/b2b-store.js create <slug> --name "<display name>" --origin https://<host> [--origin ...]
                            [--window-months N] [--guardrail-thc N] [--guardrail-cbd N]
  node scripts/b2b-store.js add-origin <slug> https://<host>
  node scripts/b2b-store.js rotate-keys <slug> [--secret | --public]
  node scripts/b2b-store.js revoke <slug> [--secret | --public]
  node scripts/b2b-store.js delete-store <slug> [--yes]`;
const COMMANDS = ['create', 'add-origin', 'rotate-keys', 'revoke', 'delete-store'];
const KINDS = ['secret', 'public'];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ORIGIN = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?$/;

class UsageError extends Error {}
class Refusal extends Error {}

/* --------------------------------------------------------------- arguments */

/* An https origin, as a browser sends it in an Origin header: the scheme, the
   host in lowercase (punycode for a name in another script) and a port only
   when it is not 443. Anything after the host refuses it - a page's path is
   not part of its origin. */
function toOrigin(raw) {
  let u;
  try { u = new URL(String(raw)); }
  catch { throw new UsageError(`"${raw}" is not an https origin - write it as https://shop.example\n${USAGE}`); }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/' ||
      /[?#]/.test(String(raw)) || !ORIGIN.test(u.origin)) {
    throw new UsageError(`"${raw}" is not an https origin - the scheme and host only, as https://shop.example (no path)\n${USAGE}`);
  }
  return u.origin;
}

function slugOf(raw) {
  if (typeof raw !== 'string' || !SLUG.test(raw) || raw.length > 40) {
    throw new UsageError(`a slug is lowercase letters, digits and single hyphens, up to 40: "rose-city"\n${USAGE}`);
  }
  return raw;
}

function points(raw, flag) {
  const n = Number(raw);
  if (!/^\d+(\.\d+)?$/.test(String(raw)) || !(n > 0 && n <= 100)) {
    throw new UsageError(`${flag} is a number of percentage points, above 0 and at most 100\n${USAGE}`);
  }
  return String(raw);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command)) throw new UsageError(USAGE);
  const opts = { command, slug: null, name: null, origins: [], windowMonths: null, guardrailThc: null,
                 guardrailCbd: null, kinds: [], yes: false };
  const value = (i, flag) => {
    const v = rest[i + 1];
    if (v === undefined || v.startsWith('--')) throw new UsageError(`${flag} needs a value\n${USAGE}`);
    return v;
  };
  const allowed = {
    create: ['--name', '--origin', '--window-months', '--guardrail-thc', '--guardrail-cbd'],
    'add-origin': [], 'rotate-keys': ['--secret', '--public'], revoke: ['--secret', '--public'], 'delete-store': ['--yes']
  }[command];
  const plain = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) { plain.push(a); continue; }
    if (!allowed.includes(a)) throw new UsageError(`${command} does not take ${a}\n${USAGE}`);
    if (a === '--name') {
      const n = value(i++, a).trim();
      if (n.length < 1 || n.length > 100 || /[\u0000-\u001f\u007f]/.test(n)) {
        throw new UsageError(`--name is the store's name as shoppers see it, 1 to 100 characters\n${USAGE}`);
      }
      opts.name = n;
    } else if (a === '--origin') {
      opts.origins.push(toOrigin(value(i++, a)));
    } else if (a === '--window-months') {
      const v = value(i++, a);
      if (!/^\d+$/.test(v) || +v < 1 || +v > 36) throw new UsageError(`--window-months is a whole number of months, 1 to 36\n${USAGE}`);
      opts.windowMonths = v;
    } else if (a === '--guardrail-thc') {
      opts.guardrailThc = points(value(i++, a), a);
    } else if (a === '--guardrail-cbd') {
      opts.guardrailCbd = points(value(i++, a), a);
    } else if (a === '--secret' || a === '--public') {
      opts.kinds.push(a.slice(2));
    } else if (a === '--yes') {
      opts.yes = true;
    }
  }
  const wanted = command === 'add-origin' ? 2 : 1;
  if (plain.length !== wanted) throw new UsageError(USAGE);
  opts.slug = slugOf(plain[0]);
  if (command === 'add-origin') opts.origins = [toOrigin(plain[1])];
  if (command === 'create') {
    if (!opts.name) throw new UsageError(`create needs --name\n${USAGE}`);
    if (!opts.origins.length) throw new UsageError(`create needs at least one --origin\n${USAGE}`);
    if (new Set(opts.origins).size !== opts.origins.length) throw new UsageError(`an --origin is given twice\n${USAGE}`);
  }
  opts.kinds = opts.kinds.length ? KINDS.filter(k => opts.kinds.includes(k)) : [...KINDS];
  return opts;
}

/* ------------------------------------------------------------------- SQL */

const TODAY = `(now() at time zone 'UTC')::date`;
const STORE_SQL = `
  select s.id::text as id, s.slug, s.display_name, to_json(s.allowed_origins) as origins, s.window_months,
         s.guardrail_thc_points::text as thc, s.guardrail_cbd_points::text as cbd, s.created_on::text as created_on,
         (select count(*) from b2b.store_keys k where k.store_id = s.id and k.revoked_on is null)::int as keys_working,
         (select count(*) from b2b.store_keys k where k.store_id = s.id and k.revoked_on is not null)::int as keys_revoked,
         (select count(*) from b2b.batches b where b.store_id = s.id)::int as batches,
         (select count(*) from b2b.batch_reads r where r.store_id = s.id)::int as reads
    from b2b.stores s where s.slug = $1`;
const CREATE_SQL = `
  insert into b2b.stores (slug, display_name, allowed_origins, window_months, guardrail_thc_points, guardrail_cbd_points)
  values ($1, $2, array(select jsonb_array_elements_text($3::jsonb)), coalesce($4::int, 12), $5::numeric, $6::numeric)
  returning id::text as id`;
const ADD_KEY_SQL = 'insert into b2b.store_keys (store_id, kind, key_sha256) values ($1::bigint, $2, $3)';
const REVOKE_SQL = `
  update b2b.store_keys set revoked_on = ${TODAY}
   where store_id = $1::bigint and kind = $2 and revoked_on is null
  returning left(key_sha256, 8) as short`;
const ADD_ORIGIN_SQL = `
  update b2b.stores set allowed_origins = allowed_origins || $2::text
   where slug = $1 and not ($2::text = any (allowed_origins))
  returning to_json(allowed_origins) as origins`;
/* Readings first, then batches, keys and the store: each refers to the one
   after it. b2b has no ON DELETE CASCADE, so a forgotten table fails loudly. */
const DELETE_SQL = [
  'delete from b2b.batch_reads where store_id = $1::bigint',
  'delete from b2b.batches where store_id = $1::bigint',
  'delete from b2b.store_keys where store_id = $1::bigint',
  'delete from b2b.stores where id = $1::bigint'
];

/* --------------------------------------------------------------- helpers */

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const guard = v => (v == null ? 'off' : `${v} percentage points`);

async function store(db, slug) {
  return (await db.query(STORE_SQL, [slug])).rows[0] || null;
}

async function transaction(db, fn) {
  await db.query('begin');
  try {
    const out = await fn();
    await db.query('commit');
    return out;
  } catch (e) {
    await db.query('rollback').catch(() => {});
    throw e;
  }
}

function describeStore(s, log) {
  log(`  name             ${s.display_name}`);
  log(`  origins          ${s.origins.join(', ') || '(none - no page can load the widget)'}`);
  log(`  window           ${plural(s.window_months, 'month')}`);
  log(`  guardrail        THC ${guard(s.thc)}, CBD ${guard(s.cbd)}`);
}

function showKeys(keys, log) {
  log('');
  log(`${keys.length === 1 ? 'Its new key' : 'Its new keys'} - shown this once and kept nowhere, not even as text in the database. Copy now:`);
  log('');
  for (const { kind, key } of keys) {
    log(kind === 'secret'
      ? `  secret key  ${key}`
      : `  public key  ${key}`);
  }
  log('');
  for (const { kind } of keys) {
    log(kind === 'secret'
      ? '  The secret key is for the store\'s server, to upload its catalog. Hand it over by a channel you trust; never put it in a page, a repo or a chat.'
      : '  The public key goes in the store\'s page, where the widget names it. It is not a secret: it only opens the store\'s feed, and only from its origins.');
  }
  log('');
  log('Then close this terminal with the trash-can icon at the top right of the terminal panel, so the keys do not stay on screen.');
}

/* ------------------------------------------------------------ the command */

/* delete-store: the database half, then the votes. votes is the "b2b-votes"
   Blobs store (lib/b2b-votes.js, open); without it nothing is changed, since
   a license ended with its votes left behind would not be ended. A slug with
   no store row but votes still under its name is what an earlier run left
   when Blobs stopped answering: those votes are deleted the same way. */
async function deleteStore(opts, { db, votes, log }) {
  const { command, slug } = opts;
  if (!votes) {
    throw new Refusal('delete-store also deletes the store\'s votes from Netlify Blobs, and no vote store was given - nothing was changed');
  }
  const s = await store(db, slug);
  let held;
  try { held = (await b2bVotes.storeVoteKeys(votes, slug)).length; }
  catch (e) { throw new Refusal(`Netlify Blobs did not answer (${b2b._scrub(e)}) - nothing was changed`); }
  if (!s && !held) throw new Refusal(`no store called "${slug}" - nothing was changed`);

  if (s) {
    log(`delete-store${opts.yes ? ' --yes' : ' (dry run)'}: store "${s.slug}" (#${s.id}), created ${s.created_on}`);
    describeStore(s, log);
    log(`  ${plural(s.keys_working + s.keys_revoked, 'key')} (${s.keys_working} working, ${s.keys_revoked} revoked), ` +
        `${plural(s.batches, 'listed batch', 'listed batches')}, ${plural(s.reads, 'reading')}`);
  } else {
    log(`delete-store${opts.yes ? ' --yes' : ' (dry run)'}: no store called "${slug}" is left in the database - ` +
        'only votes under its name, which an earlier delete-store did not finish deleting');
  }
  log(`  ${plural(held, 'vote')} in Netlify Blobs (store ${b2bVotes.STORE_NAME}, under ${b2bVotes.storePrefix(slug)})`);
  if (!opts.yes) {
    log('dry run - nothing was changed; --yes deletes all of it');
    return { command, deleted: false, votes: held };
  }

  let counts = null;
  if (s) {
    counts = await transaction(db, async () => {
      const n = [];
      for (const sql of DELETE_SQL) {
        const r = await db.query(sql, [s.id]);
        n.push(r.rowCount ?? r.affectedRows ?? null);
      }
      return n;
    });
    log(`deleted store "${slug}": its ${plural(s.reads, 'reading')}, ${plural(s.batches, 'listed batch', 'listed batches')}, ` +
        `${plural(s.keys_working + s.keys_revoked, 'key')} and the store itself`);
  }
  let gone;
  try { gone = await b2bVotes.removeStoreVotes(votes, slug); }
  catch (e) {
    throw new Refusal(`${s ? 'the database half is deleted, but ' : ''}Netlify Blobs stopped answering after ` +
                      `${plural(Number(e && e.deleted) || 0, 'vote')} - run the same command again: it deletes the votes left`);
  }
  log(`deleted ${plural(gone.deleted, 'vote')} from Netlify Blobs`);
  return { command, deleted: true, counts, votes: gone.deleted };
}

async function runCommand(opts, { db, votes = null, log = console.log }) {
  const who = (await db.query('select current_user as u')).rows[0].u;
  if (who === 'nose_b2b' || who === 'nose_writer') {
    throw new Refusal(`connected as ${who}, which cannot make, key or delete stores - this needs NOSE_DB_ADMIN_URL, the admin connection`);
  }
  const { command, slug } = opts;
  if (command === 'delete-store') return deleteStore(opts, { db, votes, log });

  if (command === 'create') {
    const keys = opts.kinds.map(kind => ({ kind, key: b2b.newKey(kind) }));
    try {
      await transaction(db, async () => {
        const { id } = (await db.query(CREATE_SQL, [slug, opts.name, JSON.stringify(opts.origins), opts.windowMonths,
                                                    opts.guardrailThc, opts.guardrailCbd])).rows[0];
        for (const k of keys) await db.query(ADD_KEY_SQL, [id, k.kind, b2b.keyHash(k.key)]);
      });
    } catch (e) {
      if (e && e.code === '23505') throw new Refusal(`a store called "${slug}" already exists - nothing was changed`);
      throw e;
    }
    const s = await store(db, slug);
    log(`created store "${s.slug}" (#${s.id}) on ${s.created_on} (UTC)`);
    describeStore(s, log);
    showKeys(keys, log);
    return { command, created: true };
  }

  const s = await store(db, slug);
  if (!s) throw new Refusal(`no store called "${slug}" - nothing was changed`);

  if (command === 'add-origin') {
    const [origin] = opts.origins;
    const res = await db.query(ADD_ORIGIN_SQL, [slug, origin]);
    if (!res.rows.length) {
      log(`store "${slug}" already allows ${origin} - nothing was changed`);
      return { command, added: false };
    }
    log(`store "${slug}" now allows: ${res.rows[0].origins.join(', ')}`);
    return { command, added: true };
  }

  if (command === 'rotate-keys') {
    const keys = opts.kinds.map(kind => ({ kind, key: b2b.newKey(kind) }));
    const old = await transaction(db, async () => {
      const gone = [];
      for (const k of keys) {
        for (const r of (await db.query(REVOKE_SQL, [s.id, k.kind])).rows) gone.push({ kind: k.kind, short: r.short });
        await db.query(ADD_KEY_SQL, [s.id, k.kind, b2b.keyHash(k.key)]);
      }
      return gone;
    });
    log(`store "${slug}": new ${opts.kinds.join(' and ')} ${keys.length === 1 ? 'key' : 'keys'}`);
    for (const o of old) log(`  the old ${o.kind} key (fingerprint ${o.short}) stopped working today`);
    if (!old.length) log('  (there was no working key to replace)');
    showKeys(keys, log);
    return { command, revoked: old.length, issued: keys.length };
  }

  if (command === 'revoke') {
    const gone = await transaction(db, async () => {
      const out = [];
      for (const kind of opts.kinds) {
        for (const r of (await db.query(REVOKE_SQL, [s.id, kind])).rows) out.push({ kind, short: r.short });
      }
      return out;
    });
    if (!gone.length) log(`store "${slug}" had no working ${opts.kinds.join(' or ')} key - nothing was changed`);
    for (const g of gone) log(`store "${slug}": its ${g.kind} key (fingerprint ${g.short}) stopped working today`);
    if (gone.length) log(`  node scripts/b2b-store.js rotate-keys ${slug} gives it new ones`);
    return { command, revoked: gone.length };
  }

  throw new UsageError(USAGE);
}

/* ----------------------------------------------------------------- main */

async function main(argv = process.argv.slice(2), env = process.env) {
  let opts;
  try { opts = parseArgs(argv); }
  catch (e) {
    console.error(e.message);
    process.exitCode = 2;
    return;
  }
  if (!env.NOSE_DB_ADMIN_URL) {
    console.error('REFUSED: NOSE_DB_ADMIN_URL is not set - it is a Codespaces secret; add it, then restart the Codespace');
    process.exitCode = 1;
    return;
  }
  /* delete-store deletes the store's votes too, so it needs the vote store
     from outside Netlify: the site's ID and a personal access token. */
  let votes = null;
  if (opts.command === 'delete-store') {
    if (!env.NETLIFY_SITE_ID || !env.NETLIFY_AUTH_TOKEN) {
      console.error('REFUSED: delete-store also deletes the store\'s votes from Netlify Blobs - it needs NETLIFY_SITE_ID ' +
                    'and NETLIFY_AUTH_TOKEN, the Codespaces secrets the archive scripts use; nothing was changed');
      process.exitCode = 1;
      return;
    }
    votes = b2bVotes.open({ siteID: env.NETLIFY_SITE_ID, token: env.NETLIFY_AUTH_TOKEN });
  }
  const { Client } = require('pg');
  const { clientConfig } = require(path.join(LIB, 'store.js'));
  let db = null;
  try {
    db = new Client(clientConfig(env.NOSE_DB_ADMIN_URL, { name: 'NOSE_DB_ADMIN_URL', timeoutMs: 10000, queryTimeoutMs: 60000 }));
    db.on('error', () => {});
    await db.connect();
    await runCommand(opts, { db, votes });
  } catch (e) {
    if (e instanceof UsageError) { console.error(e.message); process.exitCode = 2; }
    else if (e instanceof Refusal) { console.error(`REFUSED: ${e.message}`); process.exitCode = 1; }
    else { console.error(`b2b-store stopped: ${b2b._scrub(e)}`); process.exitCode = 1; }
  } finally {
    if (db) await db.end().catch(() => {});
  }
}

module.exports = { runCommand, parseArgs, toOrigin, USAGE, COMMANDS, UsageError, Refusal, DELETE_SQL };
if (require.main === module) {
  main().catch(e => { console.error('b2b-store failed:', b2b._scrub(e)); process.exit(1); });
}
