#!/usr/bin/env node
/* NOSE - refuse to publish the old storage promise.
 *
 *   node scripts/check-trust.mjs [extra files...]      (run by build.sh)
 *
 * Until 2026-09-22 the About page listed, among its trust claims, that NOSE
 * kept nothing and sold nothing. The archive (PARSER-HANDOFF.md s13) made that
 * false: every lab report NOSE fetches is kept, and the privacy page says an
 * analysis of them may be sold. This fails the build if the promise comes back.
 *
 * Two rules, because internal code rightly says "nothing stored" about one
 * code path (a refused write, a dev build) while no visitor may be told it:
 *
 *  1. The promise itself - stored, store or kept, joined by or / nor / and / a
 *     comma and "nothing", to sold or sell, in either order - is refused in
 *     EVERY file git tracks and in every published file.
 *  2. "nothing stored", "nothing is stored", "nothing's stored", "we store
 *     nothing" and the like are refused wherever a visitor can read them:
 *     every published file, and the non-comment lines of the server code
 *     under netlify/, whose replies the page shows.
 *
 * "Published" is the same set scripts/check-published.js computes: the publish
 * directory minus .git, node_modules and paths _redirects blocks with a FORCED
 * 404. test/check-trust-test.js fails if the two ever count differently.
 *
 * Case does not matter, and the words may be split by line breaks, &nbsp; or
 * other space entities,  -style escapes, or tags (<em>, <br>). Attribute
 * text - a meta description, an aria-label - is read as well as body text.
 *
 * Extra paths on the command line - a static preview kept elsewhere, say - get
 * both rules; a path that does not exist fails rather than passing unread.
 * This file and its test never spell the promise out, so neither is exempt.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------------------------------------------------------- patterns */

const W = String.raw`[\s,;:–—-]*`;               // between words
const JOIN = String.raw`(?:or|nor|and|&)(?![a-z])`;
const NEG = String.raw`(?:nothing|never|not|no)(?![a-z])`;
const LINK = String.raw`(?:${JOIN}${W}(?:${NEG}${W})?|${NEG}${W})`;
const KEEP = String.raw`(?:stor(?:e|ed|es|ing)|kept)`;
const SELL = String.raw`(?:sold|sell(?:s|ing)?)`;

const PROMISE = [
  new RegExp(String.raw`\b${KEEP}\b${W}${LINK}${SELL}\b|\b${SELL}\b${W}${LINK}${KEEP}\b`, 'gi'),
  'the old promise: keep nothing, sell nothing'
];
const NOTHING_STORED = [
  new RegExp(String.raw`\bnothing(?:\s*'\s*s|\s+(?:is|was|gets|got|ever|is\s+ever|was\s+ever|will\s+be|will\s+ever\s+be))?\s+stored\b|\bstor(?:e|es|ed)\s+nothing\b`, 'gi'),
  'a "nothing stored" claim'
];

/* ------------------------------------------------------------ normalising */

/* Every replacement keeps each newline where it was, so a match's line number
   in the normalised text is its line number in the file. */
const blankKeepingLines = m => ' ' + m.replace(/[^\n]/g, '');

function normaliseSpacing(text) {
  return text
    .replace(/&shy;|&#0*173;|&#x0*ad;|­/gi, '')                           // soft hyphens join
    .replace(/&(?:nbsp|ensp|emsp|thinsp|zwnj|zwj);|&#0*(?:160|8194|8195|8201|8203|8204|8205|8288);|&#x0*(?:a0|2002|2003|2009|200b|200c|200d|2060);/gi, ' ')
    .replace(/&(?:rsquo|lsquo|apos);|&#0*(?:39|8216|8217);|&#x0*(?:27|2018|2019);/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\\u00a0|\\u200[bcd]|\\u2060|\\xa0|\\00a0 ?/gi, ' ')             // JS and CSS escapes
    .replace(/\\u201[89]|\\u0027|\\x27/gi, "'")
    .replace(/[​-‍⁠﻿]/g, ' ')
    .replace(/[‘’`]/g, "'");
}

const stripTags = text => text.replace(/<!--|-->|<[^<>]{0,500}>/g, blankKeepingLines);

/* Server code: comments are for whoever reads the source, not for visitors. */
const stripComments = text => text
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ''))
  .replace(/(^|[\s;{}(),])\/\/[^\n]*/g, '$1');

/* ----------------------------------------------------------------- files */

const BINARY = /\.(pdf|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|zip|tar|gz|br)$/i;

function isText(file) {
  if (BINARY.test(file)) return false;
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return !buf.subarray(0, n).includes(0);
  } finally {
    fs.closeSync(fd);
  }
}

/* The same rule as scripts/check-published.js: forced 404s only. */
function blockedPaths() {
  const f = path.join(ROOT, '_redirects');
  if (!fs.existsSync(f)) return { prefixes: [], files: [] };
  const prefixes = [];
  const files = [];
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = /^\s*\/(\S*)\s+\/404\.html\s+404!\s*$/.exec(line);
    if (!m) continue;
    if (m[1].endsWith('/*')) prefixes.push(m[1].slice(0, -1));
    else files.push(m[1]);
  }
  return { prefixes, files };
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile()) out.push(full);
  }
  return out;
}

function trackedFiles() {
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
      .split('\0').filter(Boolean).map(f => path.join(ROOT, f)).filter(f => fs.existsSync(f));
  } catch {
    return walk(ROOT);   /* no git (unusual): check everything present */
  }
}

const rel = f => path.relative(ROOT, f).split(path.sep).join('/');

/* ------------------------------------------------------------------ scan */

const hits = new Map();   // "file:line" -> message, so two views of one line report once

function scan(file, patterns, where, prepare = t => t) {
  if (!isText(file)) return;
  const text = prepare(fs.readFileSync(file, 'utf8'));
  const views = [normaliseSpacing(text), normaliseSpacing(stripTags(text))];
  const name = file.startsWith(ROOT + path.sep) ? rel(file) : file;
  for (const view of views) {
    for (const [re, what] of patterns) {
      re.lastIndex = 0;
      for (const m of view.matchAll(re)) {
        const line = view.slice(0, m.index).split('\n').length;
        const key = `${name}:${line}`;
        if (!hits.has(key)) hits.set(key, `${key}: ${what} - "${m[0].replace(/\s+/g, ' ').trim()}" (${where})`);
      }
    }
  }
}

const { prefixes, files: blockedFiles } = blockedPaths();
const present = walk(ROOT);
const published = present.filter(f => {
  const r = rel(f);
  return !prefixes.some(p => r.startsWith(p)) && !blockedFiles.includes(r);
});
const server = present.filter(f => rel(f).startsWith('netlify/'));

const extra = [];
for (const arg of process.argv.slice(2)) {
  const p = path.resolve(arg);
  if (!fs.existsSync(p)) {
    console.log(`FAIL: ${arg} does not exist - nothing was checked in its place`);
    process.exit(1);
  }
  if (fs.statSync(p).isDirectory()) extra.push(...walk(p));
  else extra.push(p);
}

const inGit = trackedFiles();
const isExtra = new Set(extra);
const isPublished = new Set(published);
const where = f => isExtra.has(f) ? 'given on the command line' : isPublished.has(f) ? 'published' : 'in git';

for (const f of new Set([...inGit, ...published, ...extra])) scan(f, [PROMISE], where(f));
for (const f of new Set([...published, ...extra])) scan(f, [NOTHING_STORED], where(f));
for (const f of server) scan(f, [NOTHING_STORED], 'server code a visitor can see', /\.[cm]?js$/.test(f) ? stripComments : undefined);

if (hits.size) {
  console.log('FAIL: the old storage promise is back:');
  for (const h of hits.values()) console.log(`  ${h}`);
  console.log('Lab reports are kept (privacy page, #lab-reports), so the site may not promise otherwise.');
  console.log('Say what is true instead: see PARSER-HANDOFF.md s13, "The trust guard".');
  process.exit(1);
}
console.log(`==> no old storage promise (${published.length} published files, ${inGit.length} in git, ${server.length} server files${extra.length ? `, ${extra.length} extra` : ''})`);
