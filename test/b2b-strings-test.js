'use strict';
/* NOSE - every word the dispensary widget shows: js/b2b-strings.<hash>.js.
 *
 *   node test/b2b-strings-test.js        expect: b2b-strings clean
 *
 * Offline, no browser. What it pins down (PARSER-HANDOFF s14, "The widget"):
 *   - the strings file loads in Node and as a page loads it (window.NoseStrings,
 *     frozen), with two variants, default and florida
 *   - both variants hold the same keys, the same {placeholders} in each
 *     string, the four categories and the twelve months: the Florida variant
 *     covers every visible string
 *   - no word about effects or recreational use in any string of either
 *     variant, nor anywhere in the file, comments included - the prompt's
 *     words and their forms (EFFECT, below, checked against each of them).
 *     A string that trips it is reworded; the list is never narrowed
 *   - the Florida variant says aroma, never flavor or taste, and orders,
 *     never purchases or buying: what its header says it does
 *   - the words the widget shows from other files are listed truly: the
 *     match labels are matchBand()'s own, in js/match-math, and the bar's
 *     words are what js/aroma-bar's renderBar() draws
 *   - js/b2b-widget shows only these words: every S.<key> it reads exists,
 *     every key is read (none a compliance team reviews for nothing), and no
 *     string of this file is written out again in the widget
 *
 * Exports EFFECT and effectWords() for test/b2b-widget-test.mjs, which reads
 * the rendered widget with the same list.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'js');

/* The prompt's words - relax, calm, sleep, energ, focus, uplift, euphor,
   sedat, mood, high, buzz, stoned, pain, anxiety, stress, treat, relief, cure
   - and their forms. A word boundary before each, so "secure" is not "cure";
   forms that do not start with the word are named: asleep, slept, distress,
   curing, curative, anxious, relieve. */
const EFFECT = /\b(?:relax\w*|calm\w*|sleep\w*|asleep|slept|energ\w*|focus\w*|uplift\w*|euphor\w*|sedat\w*|mood\w*|high\w*|buzz\w*|stoned|stoner\w*|pain(?:s|ful\w*|less\w*|killer\w*)?|anxi\w*|stress\w*|distress\w*|treat\w*|relie(?:f|fs|ve|ves|ved|ving|ver|vers)|cur(?:e|es|ed|ing|ative\w*))\b/gi;
const effectWords = text => (String(text).match(EFFECT) || []);

/* What the list must catch - each of the prompt's words and forms of each -
   and what it must not: words the widget and its catalogs use. */
const MUST_CATCH = ['relax', 'relaxing', 'relaxed', 'relaxation', 'calm', 'calming', 'calmer', 'sleep', 'sleepy', 'sleeping',
  'asleep', 'slept', 'energ', 'energy', 'energizing', 'energetic', 'focus', 'focused', 'focusing', 'uplift', 'uplifting',
  'euphor', 'euphoria', 'euphoric', 'sedat', 'sedative', 'sedating', 'sedation', 'mood', 'moods', 'moody', 'high', 'higher',
  'highest', 'highly', 'buzz', 'buzzed', 'buzzy', 'stoned', 'stoner', 'pain', 'painful', 'painless', 'painkillers',
  'anxiety', 'anxious', 'stress', 'stressed', 'stressful', 'distress', 'treat', 'treats', 'treatment', 'treating',
  'relief', 'relieve', 'relieving', 'cure', 'cures', 'cured', 'curing', 'curative', 'Relaxing', 'HIGH'];
const MUST_PASS = ['secure', 'procure', 'current', 'curated', 'aroma', 'flavor', 'palate', 'terpene', 'store', 'stock',
  'stone fruit', 'Spain', 'thigh', 'retreat', 'Test Brand', 'Close match', 'Sunset Haze', 'Pineapple Express'];

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { console.log(`ok    ${name}`); return; }
  failures++;
  console.log(`FAIL  ${name}\n      expected ${e.slice(0, 400)}\n      actual   ${a.slice(0, 400)}`);
}

function one(dir, re, what) {
  const found = fs.readdirSync(dir).filter(f => re.test(f));
  if (found.length !== 1) {
    console.error(`b2b-strings-test: expected exactly one ${what}, found ${found.length ? found.join(', ') : 'none'} - run: bash build.sh`);
    process.exit(1);
  }
  return path.join(dir, found[0]);
}

function placeholders(s) { return (s.match(/\{\w+\}/g) || []).sort(); }

/* Every string in a variant, with where it is, for the reports below. */
function strings(variant) {
  const out = [];
  for (const [k, v] of Object.entries(variant)) {
    if (typeof v === 'string') out.push([k, v]);
    else if (Array.isArray(v)) v.forEach((s, i) => out.push([`${k}[${i}]`, s]));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k2, s]) => out.push([`${k}.${k2}`, s]));
  }
  return out;
}

/* A page's document, as much of it as renderBar() touches. */
function fakeDocument() {
  const make = tag => ({
    tag, className: '', title: '', textContent: '', attrs: {}, style: {}, children: [],
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    append(...c) { this.children.push(...c); },
    replaceChildren(...c) { this.children = c; }
  });
  return { createElement: make, getElementById: () => null };
}
function barWords(bar) {
  const words = [bar.attrs['aria-label']];
  for (const seg of bar.children) {
    words.push(seg.title);
    for (const label of seg.children) words.push(label.textContent);
  }
  return words;
}

function main() {
  const file = one(JS, /^b2b-strings(\.[0-9a-f]{8})?\.js$/, 'js/b2b-strings.<hash>.js');
  const src = fs.readFileSync(file, 'utf8');
  const S = require(file);

  /* --- the file ------------------------------------------------------------ */
  check('it exports two variants and the words shown from other files, frozen',
    [Object.keys(S).sort(), Object.isFrozen(S), Object.isFrozen(S.default), Object.isFrozen(S.florida), Object.isFrozen(S.SHOWN_FROM_OTHER_FILES)],
    [['SHOWN_FROM_OTHER_FILES', 'default', 'florida'], true, true, true, true]);
  {
    const win = {};
    win.self = win;
    vm.runInNewContext(src, win, { filename: path.basename(file) });
    check('as a page loads it (a classic script, `self` the window) it sets window.NoseStrings, the same words',
      win.NoseStrings ? JSON.stringify(win.NoseStrings) === JSON.stringify(S) : null, true);
  }
  check('it holds words, not code: no function in it but the loader', (src.match(/\bfunction\b/g) || []).length, 2);

  /* --- the two variants ---------------------------------------------------- */
  const keys = v => Object.keys(v).sort();
  check('default and florida hold the same keys', keys(S.florida), keys(S.default));
  check('...the same {placeholders} in each string',
    keys(S.default).filter(k => typeof S.default[k] === 'string' && JSON.stringify(placeholders(S.default[k])) !== JSON.stringify(placeholders(S.florida[k] || ''))),
    []);
  check('...the four catalog categories and the twelve months, in each',
    [keys(S.default.categories), keys(S.florida.categories), S.default.months.length, S.florida.months.length],
    [['concentrate', 'flower', 'pre-roll', 'vape'], ['concentrate', 'flower', 'pre-roll', 'vape'], 12, 12]);
  check('...and no string is empty, holds markup or carries a placeholder of another name',
    [...strings(S.default), ...strings(S.florida)].filter(([, s]) => !s.trim() || /[<>]/.test(s)
      || placeholders(s).some(p => !['{n}', '{month}', '{category}', '{name}', '{value}', '{label}', '{shown}'].includes(p))).map(([k]) => k),
    []);

  /* --- no effect or recreational words ------------------------------------- */
  check(`the list catches each of the prompt's words and their forms (${MUST_CATCH.length})`,
    MUST_CATCH.filter(w => effectWords(w).length !== 1), []);
  check(`...and none of the words the widget and the test store use (${MUST_PASS.length})`,
    MUST_PASS.filter(w => effectWords(w).length), []);
  for (const [name, variant] of [['default', S.default], ['florida', S.florida], ['shown from other files', S.SHOWN_FROM_OTHER_FILES]]) {
    check(`no effect or recreational word in any ${name} string`,
      strings(variant).filter(([, s]) => effectWords(s).length).map(([k, s]) => `${k}: ${effectWords(s).join(', ')}`), []);
  }
  check('...nor anywhere in the file, comments included', effectWords(src), []);

  /* --- Florida: aroma, and orders ---------------------------------------------- */
  check('the Florida variant says aroma, never flavor or taste, and orders, never purchases or buying',
    strings(S.florida).filter(([, s]) => /\b(flavou?rs?|tastes?|tasting|purchas\w*|bought|buy\w*)\b/i.test(s)).map(([k]) => k), []);
  check('...where the default variant says them',
    ['consentButton', 'soldOutLead', 'voteQuestion', 'basisMany', 'method'].map(k => /flavor|bought/.test(S.default[k])),
    [true, true, true, true, true]);
  check('the default variant keeps the plan\'s own words: the consent button and sentence, the rail, the basis, the vote, no panel',
    [S.default.consentButton, S.default.consentNote, S.default.railTitle, S.default.remove, S.default.voteQuestion, S.default.noPanel],
    ['Sort by flavor using what I\'ve bought here', 'My purchases stay with this store.', 'Closest to your usual',
     'Remove from my palate', 'Was the flavor close?', 'No terpene panel available for this batch']);

  /* --- words shown from other files ----------------------------------------- */
  const M = require(path.join(ROOT, 'scripts/lib/match.js')).load();
  const labels = [1, 0.8, 0.6, 0].map(s => M.matchBand(s)[0]);
  check('the match labels listed are matchBand()\'s own, from the strongest band down', S.SHOWN_FROM_OTHER_FILES.matchLabels, labels);
  const barFile = one(JS, /^aroma-bar(\.[0-9a-f]{8})?\.js$/, 'js/aroma-bar.<hash>.js');
  const BAR = require(barFile);
  check('the family labels listed are js/aroma-bar\'s FAMILIES, in FAMILY_ORDER',
    S.SHOWN_FROM_OTHER_FILES.familyLabels, BAR.FAMILY_ORDER.map(k => BAR.FAMILIES[k].label));
  {
    global.document = fakeDocument();
    try {
      const drawn = [];
      const each = {};
      for (const key of BAR.FAMILY_ORDER) each[Object.keys(M.TERPENES).find(t => M.TERPENES[t].family === key)] = 1;
      for (const terps of [{}, { limonene: 1 }, each, { myrcene: 0.6, caryophyllene: 0.3, linalool: 0.1 }]) {
        const target = document.createElement('div');
        BAR.renderBar(target, terps);
        drawn.push(target.children[0]);
      }
      const prefix = S.SHOWN_FROM_OTHER_FILES.barPrefix;
      check('renderBar()\'s aria-label is the listed prefix, then each family and its share - or the listed "no values"',
        [drawn[0].attrs['aria-label'], drawn[1].attrs['aria-label'], drawn.every(b => b.attrs['aria-label'].startsWith(prefix))],
        [`${prefix}${S.SHOWN_FROM_OTHER_FILES.barNone}`, `${prefix}Citrus 100%`, true]);
      const words = new Set(drawn.flatMap(barWords).join(' ').match(/[A-Za-z]+/g));
      const listed = new Set(`${prefix} ${S.SHOWN_FROM_OTHER_FILES.barNone} ${S.SHOWN_FROM_OTHER_FILES.familyLabels.join(' ')}`.match(/[A-Za-z]+/g));
      check('...and every word the bar draws - its label, each segment\'s tooltip and label, all six families - is listed',
        [...words].filter(w => !listed.has(w)), []);
      check('...each of the six families drawn when a profile holds it', drawn[2].children.length, 6);
    } finally { delete global.document; }
  }

  /* --- the widget reads these words, and only these --------------------------- */
  const widgetFile = one(JS, /^b2b-widget(\.[0-9a-f]{8})?\.js$/, 'js/b2b-widget.<hash>.js');
  const widget = fs.readFileSync(widgetFile, 'utf8');
  const used = [...new Set((widget.match(/\bS\.(\w+)/g) || []).map(m => m.slice(2)))].sort();
  check('every word the widget reads is in the strings file', used.filter(k => !(k in S.default)), []);
  check('...and every string in the file is one the widget reads', keys(S.default).filter(k => !used.includes(k)), []);
  check('the widget writes out none of the file\'s strings itself, in either variant',
    [...strings(S.default), ...strings(S.florida)].filter(([k, s]) => !/^(categories|months)/.test(k) && s.length > 3 && widget.includes(s)).map(([k]) => k),
    []);
  check('...nor the match labels or the bar\'s words: it shows matchBand()\'s labels from js/b2b-rank and draws js/aroma-bar\'s bar',
    [...S.SHOWN_FROM_OTHER_FILES.matchLabels, ...S.SHOWN_FROM_OTHER_FILES.familyLabels, 'Aroma profile', 'SHOWN_FROM_OTHER_FILES']
      .filter(w => widget.includes(w)), []);
  check('...and chooses the variant by the element\'s strings attribute, florida or else the default',
    /getAttribute\('strings'\) === 'florida' \? STRINGS\.florida : STRINGS\.default/.test(widget), true);

  if (failures) {
    console.error(`\nb2b-strings-test: ${failures} failure${failures === 1 ? '' : 's'}`);
    process.exit(1);
  }
  console.log('\nb2b-strings clean');
}

module.exports = { EFFECT, effectWords };
if (require.main === module) main();
