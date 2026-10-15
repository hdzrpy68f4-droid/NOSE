#!/usr/bin/env node
'use strict';
/* The Node that runs the gates is the Node that Netlify builds and runs on.
 *
 *   node test/node-version-test.js      expect: node-version clean
 *
 * .nvmrc names one major version. Netlify's build reads it, and the functions
 * run on the build's Node while AWS Lambda is not retiring that runtime within
 * two months (PARSER-HANDOFF.md section 13, "Node 24 everywhere"). Checks,
 * offline, reading only these three files:
 *   - the running Node's major version is .nvmrc's
 *   - package.json's engines.node is "<that major>.x"
 *   - package-lock.json's root entry carries the same engines.node
 * It prints one line, e.g. "node v24.22.0, .nvmrc 24, engines 24.x", then
 * "node-version clean"; otherwise each mismatch and exits 1. The first gate
 * in scripts/gates.sh, so a Codespace on another Node says so before anything
 * else runs.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const problems = [];

function read(name, parse) {
  try { return parse(fs.readFileSync(path.join(ROOT, name), 'utf8')); }
  catch (e) { problems.push(`${name} could not be read: ${e.message}`); return undefined; }
}

const nvmrc = read('.nvmrc', s => s.trim());
const pkg = read('package.json', JSON.parse);
const lock = read('package-lock.json', JSON.parse);

const running = process.versions.node;
const runningMajor = running.split('.')[0];

const wanted = typeof nvmrc === 'string' && /^\d+$/.test(nvmrc) ? nvmrc : null;
if (nvmrc !== undefined && !wanted)
  problems.push(`.nvmrc should hold one major version, such as 24, not ${JSON.stringify(nvmrc)}`);

const engines = pkg && pkg.engines ? pkg.engines.node : undefined;
const lockRoot = lock && lock.packages ? lock.packages[''] : undefined;
const lockEngines = lockRoot && lockRoot.engines ? lockRoot.engines.node : undefined;

console.log(`node v${running}, .nvmrc ${nvmrc === undefined ? '(missing)' : nvmrc}, engines ${engines === undefined ? '(none)' : engines}`);

if (wanted) {
  if (pkg && engines !== `${wanted}.x`)
    problems.push(`package.json engines.node is ${engines === undefined ? 'missing' : JSON.stringify(engines)}, not "${wanted}.x"`);
  if (lock && lockEngines !== `${wanted}.x`)
    problems.push(`package-lock.json's root engines.node is ${lockEngines === undefined ? 'missing' : JSON.stringify(lockEngines)}, not "${wanted}.x" - run: npm install --package-lock-only --offline --ignore-scripts`);
  if (runningMajor !== wanted)
    problems.push(`running Node ${runningMajor}, .nvmrc says ${wanted} - switch: nvm install, then nvm alias default ${wanted}, then open a new terminal`);
}

if (problems.length) {
  for (const p of problems) console.log(`FAIL  ${p}`);
  process.exit(1);
}
console.log('node-version clean');
