#!/usr/bin/env node
'use strict';
/* What the archive holds, at a glance. Read-only, as nose_writer.
 *
 *   node scripts/archive-status.js
 *
 * Counts per table and the five most recent parses - day, lab, product class,
 * usable or not, context. No text and no addresses are printed. Run it before
 * and after scanning a jar to watch the new rows arrive: a first scan adds one
 * row to each table, and scanning the same jar again adds nothing.
 */

const path = require('path');
const { clientConfig } = require(path.resolve(__dirname, '../netlify/functions/lib/store.js'));

/* Dates come back as text: pg would turn a date column into a JavaScript Date
 * at local midnight, which prints as the previous day west of Greenwich. */
async function status(client) {
  const n = (await client.query(`
    select (select count(*) from nose.documents)::int   as documents,
           (select count(*) from nose.extractions)::int as extractions,
           (select count(*) from nose.parses)::int      as parses`)).rows[0];
  const recent = (await client.query(`
    select id, parsed_on::text as day, coalesce(lab, '(no lab)') as lab,
           coalesce(product_class, '-') as product_class, usable, context
      from nose.parses
     order by id desc
     limit 5`)).rows;

  const lines = [`documents ${n.documents}   extractions ${n.extractions}   parses ${n.parses}`];
  if (recent.length) {
    lines.push('', 'most recent parses:');
    for (const r of recent) {
      const usable = r.usable === true ? 'usable' : r.usable === false ? 'refused' : '-';
      lines.push(`  #${r.id}  ${r.day}  ${r.lab}  ${r.product_class}  ${usable}  ${r.context}`);
    }
  }
  return lines;
}

async function main() {
  const url = process.env.NOSE_DB_URL;
  if (!url) {
    console.error('FAIL: NOSE_DB_URL is not set - it is a Codespaces secret; rebuild the Codespace if it was just added');
    process.exit(1);
  }
  const { Client } = require('pg');
  const c = new Client(clientConfig(url, { timeoutMs: 5000 }));
  try {
    await c.connect();
    for (const line of await status(c)) console.log(line);
  } finally {
    await c.end().catch(() => {});
  }
}

module.exports = { status };
if (require.main === module) {
  main().catch(e => { console.error('archive-status failed:', e && e.message); process.exit(1); });
}
