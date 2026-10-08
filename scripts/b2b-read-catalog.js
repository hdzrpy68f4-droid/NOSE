#!/usr/bin/env node
'use strict';
/* NOSE for dispensaries - read each batch a store lists, once. Codespace, by
 * hand. PARSER-HANDOFF s14, "Catalog upload and the batch reader".
 *
 *   node scripts/b2b-read-catalog.js --store <slug> [--limit N] [--dry-run] [--reread]
 *
 * Every batch the store has listed within its window that has a coa_url and
 * no current reading - in stock or not, so that a shopper's past purchases,
 * usually sold out, have values too - is read the way the coverage report
 * reads a link (scripts/b2b-coverage.js): validateUrl and fetchPdf from
 * lib/fetch-report.js, the scanner's own chain, guards and deadlines, one link
 * at a time with a pause before every request but the first; then
 * lib/extract-text.js and parseCoa, with the scanner's own steps between
 * (readFetched). Each result becomes the batch's one current reading in
 * b2b.batch_reads:
 *
 *   accepted      the terpene values as the parser read them, and the total
 *                 the lab printed
 *   refused       the parser's reasons word for word, or the scanner's own
 *                 sentence - and no figure at all
 *   no report     the link gave no report: the fetcher's own words, marked
 *                 fetched = false and tried again on the next run
 *
 * A reading is current only while it came from the batch's own coa_url: a
 * link the store corrects is read again. --reread reads every listed batch
 * with a link again; a link that gives no report then never takes the place
 * of a reading it gave before. --limit N reads the first N due. --dry-run
 * fetches and reads and writes nothing.
 *
 * Each batch is read from its own link into its own row - never from another
 * batch, another store or a strain name: two batches sharing a link are each
 * fetched. A batch with no link is never read. Nothing here writes to schema
 * nose or to the coa-pdf store, and coa.js, lib/archive.js and
 * lib/pdf-store.js are never loaded: a catalog's lab reports do not enter the
 * lab-report archive.
 *
 * Needs NOSE_B2B_DB_URL, a Codespaces secret: it connects as nose_b2b and
 * refuses any other role. A run that writes refuses while parse-coa.js,
 * coa-dates.js or extract-text.js has uncommitted changes, as the archive's
 * tools do (scripts/lib/rerun.js): a stored reading comes from committed code.
 *
 * UNTIL PROMPT 8's privacy section is live: run this only on PGlite, a local
 * database, or with --dry-run. Nothing B2B reaches the production database
 * before the privacy page describes it.
 *
 * Prints a line per batch - its row in the last upload that listed it, and
 * what became of it - and a summary. Never a link (it is the store's, and can
 * carry a token), a report's text, a key or a secret. Aroma and flavour only.
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'netlify/functions/lib');
const { validateUrl } = require(path.join(LIB, 'fetch-report.js'));
const b2b = require(path.join(LIB, 'b2b-store.js'));
const cov = require(path.join(__dirname, 'b2b-coverage.js'));

const USAGE = 'usage: node scripts/b2b-read-catalog.js --store <slug> [--limit N] [--dry-run] [--reread]';
const { OUTCOMES } = cov;

class UsageError extends Error {}
class Refusal extends Error {}

/* ------------------------------------------------------------ arguments */

function parseArgs(argv) {
  const opts = { slug: null, limit: null, dryRun: false, reread: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--store') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new UsageError(`--store needs a store's slug\n${USAGE}`);
      opts.slug = argv[++i];
    } else if (a === '--limit') {
      if (!/^[1-9]\d{0,5}$/.test(argv[i + 1] || '')) throw new UsageError(`--limit needs a whole number above 0\n${USAGE}`);
      opts.limit = Number(argv[++i]);
    } else if (a === '--dry-run') {
      opts.dryRun = true;
    } else if (a === '--reread') {
      opts.reread = true;
    } else {
      throw new UsageError(`unknown: ${a}\n${USAGE}`);
    }
  }
  if (!opts.slug) throw new UsageError(USAGE);
  return opts;
}

/* ---------------------------------------------------------------- a run */

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const hostOf = link => { try { return new URL(link).host; } catch { return '(not a web address)'; } };

/* One store's due batches, read and - unless dryRun - written. client is a
   connection as nose_b2b. Returns what happened, batch by batch, for the
   summary and for test/b2b-catalog-test.js. */
async function readStore(opts, { client, log = () => {}, wait = ms => new Promise(r => setTimeout(r, ms)),
                                 pauseMs = cov.PAUSE_MS, extract, parse } = {}) {
  const store = await b2b.storeBySlug(opts.slug, { client });
  if (!store || store === b2b.NOT_CONFIGURED) throw new Refusal(`no store called "${opts.slug}" - nothing was read`);
  if (!extract) ({ extractCoaText: extract } = require(path.join(LIB, 'extract-text.js')));
  if (!parse) ({ parseCoa: parse } = require(path.join(LIB, 'parse-coa.js')));

  const listed = await b2b.listedInWindow(store.storeId, { client });
  const linked = listed.filter(b => b.coaUrl);
  const due = linked.filter(b => opts.reread || !(b.reading && b.reading.current));
  const toRead = opts.limit == null ? due : due.slice(0, opts.limit);

  const done = [];
  let requested = 0;
  for (const b of toRead) {
    const checked = validateUrl(b.coaUrl);
    let got;
    if (checked.error) got = { outcome: OUTCOMES.fetchFailed, reasons: [checked.error] };
    else {
      /* A pause before every request but the first; a link validateUrl
         refuses is never requested, so nothing waits for it. */
      if (requested > 0 && pauseMs > 0) await wait(pauseMs);
      requested++;
      got = await cov.readFetched(checked.url, { extract, parse });
    }
    const one = { batchId: b.batchId, row: b.listPosition, inStock: b.inStock, outcome: got.outcome, reasons: got.reasons,
                  written: false, kept: false };
    if (!opts.dryRun) {
      let w;
      if (got.outcome === OUTCOMES.fetchFailed) {
        w = await b2b.upsertUnfetched(store.storeId, b.batchId, b.coaUrl, got.reasons[0], { client });
      } else if (got.output) {
        /* The reasons the report gives: the parser's, or the scanner's
           sentence for a refusal that came with none. */
        const output = got.outcome === OUTCOMES.accepted ? got.output : { ...got.output, rejectReasons: got.reasons };
        w = await b2b.upsertRead(store.storeId, b.batchId, output, { client, readUrl: b.coaUrl });
      } else {
        /* The scanner refused the PDF before the parser saw it: its own
           sentence, and nothing the parser would have said. */
        w = await b2b.upsertRead(store.storeId, b.batchId, { usable: false, rejectReasons: got.reasons }, { client, readUrl: b.coaUrl });
      }
      one.written = w.written === true;
      one.kept = w.kept === true;
    }
    done.push(one);
    log(`  ${String(done.length).padStart(String(toRead.length).length)} of ${toRead.length}   row ${b.listPosition}   ` +
        `${got.outcome}${got.outcome === OUTCOMES.fetchFailed ? ` (${hostOf(b.coaUrl)})` : ''}${one.kept ? ' - kept the earlier reading' : ''}`);
  }
  return { store, listed: listed.length, linked: linked.length, due: due.length, toRead: toRead.length, requested, done };
}

function summaryLines(opts, r) {
  const n = o => r.done.filter(d => d.outcome === o).length;
  const L = [`b2b-read-catalog: store ${r.store.slug}${opts.dryRun ? ' (--dry-run)' : ''}`, '',
    `${plural(r.listed, 'batch', 'batches')} listed in its ${plural(r.store.windowMonths, 'month')} window; ${r.linked} with a lab-report link; ` +
    `${r.due} ${opts.reread ? 'to read again (--reread)' : 'with no current reading'}`,
    `read ${r.done.length}: ${n(OUTCOMES.accepted)} accepted, ${n(OUTCOMES.refused)} refused, ` +
    `${n(OUTCOMES.fetchFailed)} gave no report (tried again on the next run)`];
  if (opts.limit != null && r.due > r.done.length) L.push(`a partial run: --limit ${opts.limit}; ${r.due - r.done.length} more due`);
  if (opts.dryRun) L.push('--dry-run: nothing was written');
  else {
    const kept = r.done.filter(d => d.kept).length;
    L.push(`written: ${plural(r.done.filter(d => d.written).length, 'reading')}${kept ? `; ${plural(kept, 'earlier reading')} kept` : ''}`);
  }
  return L;
}

/* ----------------------------------------------------------------- main */

/* deps.client: a connection already made (test/b2b-catalog-test.js passes
   PGlite as nose_b2b); deps.stamps: the stamp-or-refuse answer, for the same
   test. Otherwise both are made here. */
async function main(argv = process.argv.slice(2), { env = process.env, log = console.log, error = console.error, client, stamps, wait } = {}) {
  let opts;
  try { opts = parseArgs(argv); }
  catch (e) {
    if (!(e instanceof UsageError)) throw e;
    error(e.message);
    return 2;
  }
  const checked = stamps || require(path.join(__dirname, 'lib/rerun.js'))
    .stampsOrRefusal({ env, needs: ['NOSE_B2B_DB_URL'], write: !opts.dryRun, extractor: true });
  if (checked.refusal) { error(`REFUSED: ${checked.refusal}`); return 1; }

  let db = client || null;
  let own = false;
  try {
    if (!db) {
      const { Client } = require('pg');
      const { clientConfig } = require(path.join(LIB, 'store.js'));
      db = new Client(clientConfig(env.NOSE_B2B_DB_URL, { name: 'NOSE_B2B_DB_URL', timeoutMs: 10000, queryTimeoutMs: 60000 }));
      db.on('error', () => {});
      own = true;
      await db.connect();
    }
    const who = (await db.query('select current_user as u')).rows[0].u;
    if (who !== 'nose_b2b') {
      throw new Refusal(`NOSE_B2B_DB_URL connects as "${who}", not nose_b2b - this script writes readings as the dispensary role and nothing else`);
    }
    const r = await readStore(opts, { client: db, log, wait });
    log('');
    for (const line of summaryLines(opts, r)) log(line);
    return 0;
  } catch (e) {
    if (e instanceof Refusal) { error(`REFUSED: ${e.message}`); return 1; }
    error(`b2b-read-catalog stopped: ${b2b._scrub(e)}`);
    return 1;
  } finally {
    if (own && db) await db.end().catch(() => {});
  }
}

module.exports = { main, readStore, parseArgs, summaryLines, USAGE, UsageError, Refusal };

if (require.main === module) {
  main().then(code => { process.exitCode = code; }, e => {
    console.error(`b2b-read-catalog failed: ${b2b._scrub(e)}`);
    process.exitCode = 1;
  });
}
