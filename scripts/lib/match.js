'use strict';
/* NOSE - the app's matching algorithm, for the Codespace scripts.
 *
 * Loads js/match-math.<hash>.js - the very file the app loads before
 * js/nose.<hash>.js - and returns what it exports: TERPENES, sanitizeTerps,
 * normalize, averageProfiles, cosine, matchBand. There is no copy of any of
 * it here, and there must never be one: a script's score has to be the score
 * the app would show.
 *
 * build.sh fingerprints the file, so its name changes whenever it does. It is
 * found by pattern, and exactly one must exist - an edited, unbuilt
 * js/match-math.js counts, as build.sh's own fingerprint() allows.
 */

const fs = require('fs');
const path = require('path');

const JS_DIR = path.resolve(__dirname, '../../js');
const FILE = /^match-math(\.[0-9a-f]{8})?\.js$/;

function matchFile(dir = JS_DIR) {
  const found = fs.readdirSync(dir).filter(f => FILE.test(f));
  if (found.length !== 1) {
    throw new Error(`expected exactly one js/match-math.<hash>.js, found ${found.length ? found.join(', ') : 'none'}` +
                    ' - run: bash build.sh');
  }
  return path.join(dir, found[0]);
}

function load(dir = JS_DIR) {
  return require(matchFile(dir));
}

module.exports = { load, matchFile, JS_DIR };
