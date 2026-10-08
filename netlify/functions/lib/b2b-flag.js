'use strict';
/* NOSE - the one switch for everything dispensary (B2B). PARSER-HANDOFF s14.
 *
 *   const { b2bEnabled } = require('./lib/b2b-flag');
 *   if (!b2bEnabled()) return { statusCode: 404, ... };
 *
 * True only when BOTH hold:
 *
 *   B2B_ENABLED is exactly '1'   An environment variable set in the Netlify
 *                                UI, with a value in the Production context
 *                                only. Variables set there reach functions at
 *                                runtime; those in netlify.toml never do, and
 *                                each deploy keeps the values set when it was
 *                                made, so switching on or off takes a new
 *                                deploy (Netlify docs, "Environment variables
 *                                and functions").
 *   deployContext 'production'   build-info.json, which build.sh writes from
 *                                Netlify's $CONTEXT and esbuild bundles into
 *                                the function - the archive's own switch
 *                                (lib/version.js). A deploy preview or branch
 *                                deploy reads its own context there, so it
 *                                stays off even if the variable reached it.
 *
 * Anything else is off: unset, '0', 'true', ' 1', a missing or broken
 * build-info.json (it reads as 'dev'), a Codespace, a test. Every B2B
 * function asks this first and answers 404 when it is off, so a dev run or a
 * deploy preview never reaches the production database.
 *
 * This file holds no secret and reads no request. lib/ files are bundled into
 * the functions that require them and are never functions of their own.
 */

const { buildInfo } = require('./version');

function b2bEnabled(env = process.env) {
  return env.B2B_ENABLED === '1' && buildInfo().deployContext === 'production';
}

module.exports = { b2bEnabled };
