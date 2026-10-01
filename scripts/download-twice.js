#!/usr/bin/env node
'use strict';
/* Download the same lab report twice and say what changed. Writes nothing.
 *
 *   node scripts/download-twice.js <link> [<link> ...]
 *   node scripts/download-twice.js --wait 90 <link> [<link> ...]
 *
 * Each link - the address a jar's QR code opens, or a PDF's own address - is
 * fetched the way the scanner fetches it (a viewer or listings page is read
 * for its report link by coa.js's own resolver), then fetched again after a
 * wait (65 seconds unless --wait says otherwise; every link is downloaded
 * once before the wait, so each pair is at least that far apart). For each
 * pair it prints:
 *
 *   bytes   the SHA-256 of each download, as the archive keys a document;
 *           the PDF's creation and modification stamps and its file ID
 *   text    the SHA-256 of the extracted text, as the archive fingerprints
 *           an extraction (extract-text.js, then store.js's cleaning)
 *   lab     the lab and lab ID the parser reads, so the pair can be found in
 *           scripts/duplicates.js
 *
 * When the two texts differ it prints the lines that differ, as extracted,
 * with their line numbers, and exits 1: a copy of one report whose text
 * changes on every download cannot be recognised by its text.
 *
 * Nothing reaches the archive: no database, no Blobs, no storeScan. The link
 * is printed as its host only - a scanned link can carry a token in its path
 * or query. Needs no secrets; needs the network and an `npm install`.
 */

const crypto = require('crypto');
const path = require('path');
const rerun = require('./lib/rerun');

const { LIB } = rerun;
const USAGE = 'usage: node scripts/download-twice.js [--wait SECONDS] <link> [<link> ...]';
const DEFAULT_WAIT_S = 65;
const MAX_PAGE_HOPS = 2;          // as coa.js: a listings page, then a report page
const FETCH_TIMEOUT_MS = 30000;
const MAX_DIFF_LINES = 60;

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { wait: DEFAULT_WAIT_S, links: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--wait') {
      if (!/^\d{1,4}$/.test(argv[i + 1] || '')) throw new UsageError(`--wait needs a number of seconds\n${USAGE}`);
      opts.wait = Number(argv[++i]);
    } else if (a.startsWith('--')) {
      throw new UsageError(`unknown: ${a}\n${USAGE}`);
    } else {
      let u;
      try { u = new URL(a); } catch { throw new UsageError(`not a web address: ${a}\n${USAGE}`); }
      if (u.protocol !== 'https:') throw new UsageError(`only https links: ${u.host}\n${USAGE}`);
      opts.links.push(a);
    }
  }
  if (!opts.links.length) throw new UsageError(USAGE);
  return opts;
}

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const isPdf = buf => buf.subarray(0, 5).toString('latin1') === '%PDF-';
const looksLikeHtml = buf => /<!doctype html|<html/i.test(buf.subarray(0, 400).toString('latin1'));

/* The report behind a link: a PDF straight away, or a page the scanner's own
   resolver reads for its report link, at most two pages deep. */
async function fetchReport(link, { fetch, resolvePage }) {
  let url = new URL(link);
  const visited = new Set([url.toString()]);
  for (let hop = 0; hop <= MAX_PAGE_HOPS; hop++) {
    const res = await fetch(url.toString(), {
      redirect: 'follow',
      headers: { Accept: 'application/pdf,text/html;q=0.8,*/*;q=0.5' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`the server answered ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (isPdf(buf)) return buf;
    if (!looksLikeHtml(buf)) throw new Error('it is neither a PDF nor a page');
    const here = new URL(res.url || url.toString());
    const next = resolvePage(buf, here);
    if (!next) throw new Error('a page with no report link the scanner can find on it');
    if (visited.has(next.toString())) throw new Error('a page that links back to itself');
    visited.add(next.toString());
    url = next;
  }
  throw new Error(`still a page after ${MAX_PAGE_HOPS} hops`);
}

/* The PDF's own stamps: when it says it was made and changed, and its file ID. */
async function stamps(buf) {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  try {
    const { info } = await pdf.getMetadata();
    const ids = Array.isArray(pdf.fingerprints) ? pdf.fingerprints.filter(Boolean) : [];
    return { created: (info && info.CreationDate) || null, modified: (info && info.ModDate) || null, fileId: ids.join(' ') || null };
  } finally {
    if (typeof pdf.destroy === 'function') await pdf.destroy();
  }
}

/* The lines that differ between two texts: common head and tail trimmed, the
   middle compared line by line (longest common subsequence). */
function diffLines(a, b) {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const x = a.slice(head, a.length - tail);
  const y = b.slice(head, b.length - tail);
  const out = [];
  if (x.length * y.length > 4e6) {
    x.forEach((l, i) => out.push({ side: '-', n: head + i + 1, line: l }));
    y.forEach((l, i) => out.push({ side: '+', n: head + i + 1, line: l }));
    return out;
  }
  const w = y.length + 1;
  const lcs = new Uint32Array((x.length + 1) * w);
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      lcs[i * w + j] = x[i] === y[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) { i++; j++; }
    else if (i < x.length && (j === y.length || lcs[(i + 1) * w + j] >= lcs[i * w + j + 1])) { out.push({ side: '-', n: head + i + 1, line: x[i] }); i++; }
    else { out.push({ side: '+', n: head + j + 1, line: y[j] }); j++; }
  }
  return out;
}

/* One download, measured: bytes, stamps, text, and what the parser reads. */
async function measure(link, deps) {
  const bytes = await fetchReport(link, deps);
  const got = await deps.extract(bytes);
  const text = typeof got === 'string' ? got : got && got.text;
  if (typeof text !== 'string') throw new Error('the extractor returned no text');
  let out = {};
  try { out = deps.parse(text) || {}; } catch { out = {}; }
  let s = { created: null, modified: null, fileId: null };
  try { s = await deps.stamps(bytes); } catch { /* the stamps only explain; their absence changes nothing */ }
  return { bytes: bytes.length, sha: sha256(bytes), textSha: rerun.textSha(text), lines: rerun.asStoredText(text).split('\n'),
           lab: out.lab || null, labId: out.labId || null, ...s };
}

async function downloadTwice({ links, wait = DEFAULT_WAIT_S, fetch = globalThis.fetch, resolvePage, extract, parse,
                               stamps: readStamps = stamps, sleep = ms => new Promise(r => setTimeout(r, ms)), log = console.log }) {
  const deps = { fetch, resolvePage, extract, parse, stamps: readStamps };
  const first = [];
  for (const link of links) {
    try { first.push({ ok: await measure(link, deps) }); }
    catch (e) { first.push({ error: e }); }
  }
  log(`download-twice: ${plural(links.length, 'link')} downloaded once; waiting ${wait} seconds before the second download`);
  await sleep(wait * 1000);
  const second = [];
  for (const [i, link] of links.entries()) {
    if (first[i].error) { second.push({ skipped: true }); continue; }
    try { second.push({ ok: await measure(link, deps) }); }
    catch (e) { second.push({ error: e }); }
  }

  const tally = { links: links.length, bytesDiffer: 0, textDiffers: 0, failed: 0 };
  links.forEach((link, i) => {
    const host = new URL(link).host;
    log('');
    const a = first[i].ok;
    const b = second[i].ok;
    if (!a || !b) {
      tally.failed++;
      const e = first[i].error || second[i].error;
      log(`${i + 1}. ${host}   FAILED on the ${first[i].error ? 'first' : 'second'} download: ${require(path.join(LIB, 'archive.js')).reason(e)}`);
      return;
    }
    const sameBytes = a.sha === b.sha;
    const sameText = a.textSha === b.textSha;
    if (!sameBytes) tally.bytesDiffer++;
    if (!sameText) tally.textDiffers++;
    log(`${i + 1}. ${host}   ${a.lab || '(lab not recognised)'}${a.labId ? `   lab ID ${a.labId}` : ''}`);
    log(`   bytes   ${sameBytes ? 'SAME     ' : 'DIFFERENT'}  ${rerun.short(a.sha)} ${a.bytes} bytes  →  ${rerun.short(b.sha)} ${b.bytes} bytes`);
    const stampLine = (label, k) => (a[k] || b[k]) ? `   ${label.padEnd(9)}${a[k] || '-'}  →  ${b[k] || '-'}${a[k] === b[k] ? '   (same)' : ''}` : null;
    for (const line of [stampLine('created', 'created'), stampLine('changed', 'modified'), stampLine('file ID', 'fileId')]) if (line) log(line);
    log(`   text    ${sameText ? 'SAME     ' : 'DIFFERENT'}  ${rerun.short(a.textSha)} ${a.lines.length} lines  →  ${rerun.short(b.textSha)} ${b.lines.length} lines`);
    if (!sameText) {
      const d = diffLines(a.lines, b.lines);
      log(`   the lines that differ - first download (-), second (+), with their line numbers:`);
      for (const x of d.slice(0, MAX_DIFF_LINES)) log(`     ${x.side} ${String(x.n).padStart(5)}  ${x.line}`);
      if (d.length > MAX_DIFF_LINES) log(`     ... and ${d.length - MAX_DIFF_LINES} more`);
    }
    log(`   so      ${sameBytes && sameText ? 'the same file both times: one document per report, as the archive is keyed today'
      : !sameBytes && sameText ? 'rebuilt on download, same text: today every download is stored as a new document'
      : !sameBytes ? 'rebuilt on download AND the text changed: its copies cannot be recognised by their text'
      : 'the same bytes read as two texts: the extractor is not deterministic - look at this before anything else'}`);
  });

  log('');
  log(`${plural(tally.links, 'link')}: bytes differed for ${tally.bytesDiffer}, text differed for ${tally.textDiffers}` +
      `${tally.failed ? `, ${tally.failed} failed` : ''}`);
  if (tally.textDiffers) log('STOP: a text changed between downloads - bring the lines above.');
  return tally;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

async function main(argv = process.argv.slice(2)) {
  let opts;
  try { opts = parseArgs(argv); }
  catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const { extractCoaText } = require(path.join(LIB, 'extract-text.js'));
  const { parseCoa } = require(path.join(LIB, 'parse-coa.js'));
  const { _resolvePdfFromPage } = require(path.join(LIB, '..', 'coa.js'));
  try {
    const tally = await downloadTwice({ links: opts.links, wait: opts.wait, resolvePage: _resolvePdfFromPage,
                                        extract: extractCoaText, parse: parseCoa });
    if (tally.textDiffers || tally.failed) process.exitCode = 1;
  } catch (e) {
    console.error(`download-twice failed: ${e && e.message}`);
    process.exitCode = 1;
  }
}

module.exports = { downloadTwice, fetchReport, diffLines, parseArgs, USAGE, UsageError, DEFAULT_WAIT_S };
if (require.main === module) {
  main().catch(e => { console.error('download-twice failed:', e && e.message); process.exit(1); });
}
