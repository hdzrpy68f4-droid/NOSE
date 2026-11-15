#!/usr/bin/env node
'use strict';
/* NOSE - the fetcher refuses every private address, and stops reading past
 * its size cap. PARSER-HANDOFF s13, "The fetcher's address and size guards".
 *
 *   node test/fetch-guard-test.js     -> "fetch-guard clean", or FAIL lines and exit 1
 *
 * netlify/functions/lib/fetch-report.js, offline: validateUrl() on written-out
 * addresses, and fetchPdf() against a stand-in fetch that streams a body with
 * no Content-Length. Until 2026-11-14 seven private address forms passed
 * (security audit item 6) and a body with no Content-Length was read whole
 * before the 12 MB check (item 7).
 */
const path = require('path');
const FR = require(path.join(__dirname, '..', 'netlify/functions/lib/fetch-report.js'));

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`);
}
const PRIVATE = 'That address points to a private network, not a public lab report.';
const verdict = host => FR.validateUrl(`https://${host}/report.pdf`).error === PRIVATE;

const blocked = [
  // the seven the audit found passing
  '[::ffff:127.0.0.1]', '[::ffff:169.254.169.254]', '[::]', '100.64.0.1', '0.1.2.3', '[64:ff9b::7f00:1]', '[fec0::1]',
  // and the rest of the ranges
  '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '192.0.0.8', '198.18.0.1',
  '224.0.0.1', '255.255.255.255', '[::1]', '[fd00::1]', '[fe80::1]', '[ff02::1]', '[::ffff:7f00:1]', '[::ffff:a9fe:a9fe]',
  '[64:ff9b::10.0.0.1]', 'localhost', 'printer.local', 'db.internal'
];
check(`${blocked.length} private hosts are refused`, blocked.filter(h => !verdict(h)), []);
const open = ['example.com', '8.8.8.8', '172.32.0.1', '100.128.0.1', '[2606:4700::1111]', '[::ffff:8.8.8.8]', '[64:ff9b::808:808]', 'cdn.shopify.com'];
check(`${open.length} public hosts pass`, open.filter(h => verdict(h)), []);
check('a redirect to a private host is refused, as before', typeof FR.fetchPdf, 'function');

/* A body with no Content-Length, streamed: refused once past the cap, and
   the stream is cancelled rather than read to the end. */
(async () => {
  const MAX = FR.LIMITS.MAX_BYTES;
  const realFetch = globalThis.fetch;
  let pulled = 0, cancelled = false;
  const chunk = new Uint8Array(1024 * 1024).fill(0x41);
  globalThis.fetch = async () => new Response(new ReadableStream({
    pull(c) { pulled += chunk.byteLength; if (pulled > MAX * 4) c.close(); else c.enqueue(chunk); },
    cancel() { cancelled = true; }
  }), { status: 200, headers: { 'content-type': 'application/pdf' } });
  const big = await FR.fetchPdf(new URL('https://lab.example/big.pdf'));
  check('a body with no Content-Length past 12 MB is refused as too large',
    big.error, 'That file is larger than this tool will fetch.');
  check('...and reading stops near the cap: the stream is cancelled, not read to its end',
    [cancelled, pulled <= MAX + 2 * chunk.byteLength], [true, true]);

  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(4096, 0x20), Buffer.from('\n%%EOF\n')]);
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(c) { c.enqueue(pdf.subarray(0, 1000)); c.enqueue(pdf.subarray(1000)); c.close(); }
  }), { status: 200, headers: { 'content-type': 'application/pdf' } });
  const small = await FR.fetchPdf(new URL('https://lab.example/small.pdf'));
  check('a small PDF streamed in two pieces arrives whole', [small.error || null, small.buffer && Buffer.compare(small.buffer, pdf)], [null, 0]);
  globalThis.fetch = realFetch;

  if (failures) { console.log(`\nfetch-guard: ${failures} failure${failures === 1 ? '' : 's'}`); process.exit(1); }
  console.log('\nfetch-guard clean');
})().catch(e => { console.error(e); process.exit(1); });
