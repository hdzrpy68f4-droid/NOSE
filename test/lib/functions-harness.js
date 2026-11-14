'use strict';
/* NOSE - load Netlify functions offline, for a test.
 *
 * The functions and netlify/lib/*.js are ES module syntax in a CommonJS
 * package; Netlify's esbuild bundler compiles them (netlify.toml). Node has
 * to be told, so one hook loads every .js file under netlify/ as a module -
 * except netlify/functions/lib, which is CommonJS - and answers
 * @netlify/blobs with the stand-in below. test/match-feedback-test.js does
 * the same for its own three files; this is that pattern, shared by
 * client-error-test and accounts-test.
 *
 * The stand-in answers as @netlify/blobs 10.x does for the calls the
 * functions make: getStore({ name, consistency }) or getStore(name), then
 * get(key, { type: 'json' }), set(), setJSON() with onlyIfNew / onlyIfMatch,
 * getWithMetadata(), delete() and list({ prefix, paginate }). Nothing leaves
 * the machine and nothing is written to disk.
 */
const crypto = require('crypto');
const Module = require('module');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');

function makeBlobs() {
  const blobs = { stores: new Map(), opened: [], calls: [], failList: new Set(), failDelete: new Set() };
  function storeNamed(name) {
    if (!blobs.stores.has(name)) blobs.stores.set(name, new Map());
    const m = blobs.stores.get(name);
    const page = prefix => ({ blobs: [...m.keys()].filter(k => k.startsWith(prefix)).sort().map(key => ({ key, etag: m.get(key).etag })), directories: [] });
    const put = (key, text, opts = {}) => {
      if (opts.onlyIfNew && m.has(key)) return { modified: false };
      if (opts.onlyIfMatch && (!m.has(key) || m.get(key).etag !== opts.onlyIfMatch)) return { modified: false };
      const etag = `"${crypto.randomBytes(8).toString('hex')}"`;
      m.set(key, { text, etag, metadata: opts.metadata || {} });
      return { modified: true, etag };
    };
    return {
      async set(key, value, opts) { blobs.calls.push(['set', name, key]); return put(key, String(value), opts); },
      async setJSON(key, value, opts) { blobs.calls.push(['setJSON', name, key]); return put(key, JSON.stringify(value), opts); },
      async get(key, opts = {}) {
        blobs.calls.push(['get', name, key]);
        if (!m.has(key)) return null;
        return opts.type === 'json' ? JSON.parse(m.get(key).text) : m.get(key).text;
      },
      async getWithMetadata(key, opts = {}) {
        blobs.calls.push(['getWithMetadata', name, key]);
        if (!m.has(key)) return null;
        const e = m.get(key);
        return { data: opts.type === 'json' ? JSON.parse(e.text) : e.text, etag: e.etag, metadata: e.metadata };
      },
      async delete(key) {
        blobs.calls.push(['delete', name, key]);
        if (blobs.failDelete.has(name)) throw new Error('stand-in: delete refused');
        m.delete(key);
      },
      list({ prefix = '', paginate = false } = {}) {
        blobs.calls.push(['list', name, prefix, paginate]);
        if (blobs.failList.has(name)) {
          if (paginate) return (async function* () { throw new Error('stand-in: list refused'); })();
          return Promise.reject(new Error('stand-in: list refused'));
        }
        if (paginate) return (async function* () { yield page(prefix); })();
        return Promise.resolve(page(prefix));
      },
    };
  }
  blobs.getStore = opts => {
    const o = typeof opts === 'string' ? { name: opts } : { ...opts };
    blobs.opened.push(o);
    return storeNamed(o.name);
  };
  blobs.keys = name => [...(blobs.stores.get(name) || new Map()).keys()].sort();
  blobs.read = (name, key) => JSON.parse(blobs.stores.get(name).get(key).text);
  blobs.writes = () => blobs.calls.filter(c => c[0] === 'set' || c[0] === 'setJSON').length;
  return blobs;
}

let registered = false;
/* Register the hook once, then import each named function file (paths from
   the repository root). Answers their default exports, in order. The stand-in
   reads globalThis.__noseHarnessBlobs at each getStore(), so a test may swap
   in a fresh makeBlobs() between cases. */
async function loadFunctions(blobs, files) {
  globalThis.__noseHarnessBlobs = blobs;
  if (!registered) {
    registered = true;
    const base = pathToFileURL(path.join(ROOT, 'netlify')).href + '/';
    const cjs = pathToFileURL(path.join(ROOT, 'netlify/functions/lib')).href + '/';
    const standIn = 'data:text/javascript,' + encodeURIComponent(
      'export function getStore(o) { return globalThis.__noseHarnessBlobs.getStore(o); }');
    Module.register('data:text/javascript,' + encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        if (specifier === '@netlify/blobs') return { url: ${JSON.stringify(standIn)}, shortCircuit: true };
        return next(specifier, context);
      }
      export async function load(url, context, next) {
        if (url.startsWith(${JSON.stringify(base)}) && !url.startsWith(${JSON.stringify(cjs)}) && url.endsWith('.js')) {
          const r = await next(url, { ...context, format: 'module' });
          return { ...r, format: 'module', shortCircuit: true };
        }
        return next(url, context);
      }`));
  }
  const out = [];
  for (const f of files) out.push((await import(pathToFileURL(path.join(ROOT, f)).href)).default);
  return out;
}

/* What the functions print, kept off the test's own output. */
const CONSOLE = ['log', 'info', 'warn', 'error', 'debug'];
async function quietly(fn) {
  const lines = [];
  const saved = CONSOLE.map(k => console[k]);
  CONSOLE.forEach(k => { console[k] = (...a) => lines.push(`${k}: ${a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')}`); });
  try { return { value: await fn(), lines }; } finally { CONSOLE.forEach((k, i) => { console[k] = saved[i]; }); }
}

module.exports = { ROOT, makeBlobs, loadFunctions, quietly };
