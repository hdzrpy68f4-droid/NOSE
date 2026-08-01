// Receives rate-limited client-side JS error reports and stores them.
//
// Operational data, not evidence — lower value than the votes, so it gets a
// SHORT retention (90 days, enforced by errors-purge.js) while votes are kept
// indefinitely. Same storage pattern as match-feedback so there is one thing
// to reason about, not two.
//
// PRIVACY NOTE, flagged because it is a real step beyond the vote payload:
// this stores a truncated user-agent string. Combined with a path and a
// timestamp that is a mild fingerprint — weaker than an IP, stronger than a
// vote. It is kept because the scanner's failures are browser-specific (iOS
// Safari has no BarcodeDetector, which is why html5-qrcode is in the bundle at
// all) and an error report without a browser version is close to useless for
// that. If that trade isn't wanted, drop `ua` from the record below; nothing
// else depends on it. Either way the privacy policy needs a line about it.

import { getStore } from '@netlify/blobs';
import {
  ERRORS_STORE, readJsonBody, isInt, clean, safeClientTs,
  contextHash, dayKey, keySuffix, noContent, rejected,
} from '../lib/beacon.js';

const KINDS = new Set(['error', 'unhandledrejection']);

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
  }

  const body = await readJsonBody(request);
  if (!body.ok) return rejected(body.reason);
  const d = body.data;

  if (!KINDS.has(d.kind)) return rejected('bad-kind');
  if (typeof d.message !== 'string' || !d.message) return rejected('bad-message');
  if (d.line !== null && d.line !== undefined && !isInt(d.line, 0, 1e7)) return rejected('bad-line');
  if (d.col !== null && d.col !== undefined && !isInt(d.col, 0, 1e7)) return rejected('bad-col');
  if (typeof d.page !== 'string' || !d.page.startsWith('/')) return rejected('bad-page');

  const ts = new Date().toISOString();
  const message = clean(d.message, 300);
  const page = clean(d.page, 200);

  const record = {
    v: 1,
    kind: d.kind,
    message,
    source: clean(d.source, 200),
    line: isInt(d.line, 0, 1e7) ? d.line : null,
    col: isInt(d.col, 0, 1e7) ? d.col : null,
    page,
    ua: clean(d.ua, 180),
    ts,
    clientTs: safeClientTs(d.ts),
    // Groups identical failures so one broken deploy reads as one bug with a
    // count, rather than a thousand separate entries.
    ctx: contextHash([d.kind, message, page, clean(d.source, 200), String(d.line ?? '')]),
  };

  try {
    // errors/<YYYY-MM-DD>/<ctx>/<suffix> — date first so the purge is a prefix
    // scan, ctx second so repeats of one bug group together.
    // Strong consistency, matching the vote store — see match-feedback.js.
    const store = getStore({ name: ERRORS_STORE, consistency: 'strong' });
    await store.setJSON(`errors/${dayKey(ts)}/${record.ctx}/${keySuffix(ts)}`, record);
  } catch (err) {
    console.error('[client-error] persist failed', {
      kind: record.kind, ctx: record.ctx,
      error: err && err.message ? err.message : String(err),
    });
  }

  return noContent();
};

// Volume: the client caps reports per page load (MAX in the reporter), so a
// single visitor cannot flood this. A distributed flood is not rate-limited
// here on purpose — the only usable key would be the IP address, and storing
// or hashing one to build a counter would put a pseudo-identifier into a store
// that currently has none. The 4KB body cap and strict validation are the
// mitigation; a spike is visible as an unusual day-prefix count and a day's
// keys can be deleted wholesale.
