#!/usr/bin/env node
'use strict';
/* NOSE - the demo's test store: b2b/demo/test-store.json, the feed that
 * <nose-matches> reads on b2b/demo/ in place of b2b-feed.
 *
 *   node scripts/b2b-demo-feed.js            writes b2b/demo/test-store.json
 *   node scripts/b2b-demo-feed.js --check    exits 1 if the committed file is not what this writes
 *
 * The store, its products, brands, links, stock and THC and CBD figures are
 * made up. Every terpene panel is real: the reading today's parser gives one
 * of the committed lab-report fixtures (test/fixtures/extracted), shaped as
 * b2b-feed shapes a batch - lib/b2b-store.js's FEED_FIELDS, in that order;
 * terps and the lab's total only for an accepted reading; usable false for
 * a refused one, and null for a batch with no reading. Nothing is estimated
 * and no panel comes from a strain name: a product is named here after the
 * report its panel is read from, and a batch with no report shows none.
 *
 * test/b2b-widget-test.mjs runs this with --check, so the published file
 * cannot drift from the fixtures it is read from. Run it after a parser
 * change moves a fixture's reading, and commit the file it writes.
 * PARSER-HANDOFF s14, "The widget".
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'b2b/demo/test-store.json');
const EXTRACTED = path.join(ROOT, 'test/fixtures/extracted');
const { parseCoa } = require(path.join(ROOT, 'netlify/functions/lib/parse-coa.js'));
const { FEED_FIELDS, FEED_STORE_FIELDS } = require(path.join(ROOT, 'netlify/functions/lib/b2b-store.js'));

/* The test store's window and guardrail: twelve months, no guardrail. */
const STORE = { window_months: 12, guardrail_thc_points: null, guardrail_cbd_points: null };

/* product_id, batch_id, category, route, name, brand, in stock, THC %, CBD %,
   and the fixture whose reading the batch carries - null for a batch NOSE
   has no reading of. */
const ROWS = [
  ['D-101', 'DB-1101', 'flower', 'smoking', 'SFV OG', 'Test Brand B', true, 24.5, 0.1, 'ACS-FLW-002'],
  ['D-102', 'DB-1102', 'flower', 'smoking', 'OG Pluto', 'Test Brand B', true, 22.8, null, 'ACS-FLW-001'],
  ['D-103', 'DB-1103', 'flower', 'smoking', 'Gassius Clay', 'Test Brand C', true, 26.1, null, 'COA_GassiusClay_3_5gWF_4793_1807_7220_8969'],
  ['D-104', 'DB-1104', 'flower', 'smoking', 'Banana Papaya', 'Test Brand D', true, 21, null, 'KAY-FLW-001'],
  ['D-105', 'DB-1105', 'flower', 'smoking', 'Purple Brulee', 'Test Brand E', true, 23.4, 0.1, 'KF2025-046-PB-AU-COA'],
  ['D-106', 'DB-1106', 'flower', 'smoking', 'Cold Creek Kush', 'Test Brand F', false, 22, null, 'Kush_Creek'],
  ['D-107', 'DB-1107', 'flower', 'smoking', 'Crippy', 'Test Brand G', true, 25.2, null, 'MCL-FLW-003'],
  ['D-108', 'DB-1108', 'flower', 'smoking', 'Cherry Zest #4', 'Test Brand F', true, 24, null, 'MCL-FLW-004'],
  ['D-109', 'DB-1109', 'flower', 'smoking', 'Z Pie #9', 'Test Brand F', true, 27.3, null, 'MCL-FLW-005'],
  ['D-110', 'DB-1110', 'flower', 'smoking', 'Peanut Butter Breath', 'Test Brand G', true, 26.6, null, 'MC_PeanutButterBreath_flower'],
  ['D-111', 'DB-1111', 'flower', 'smoking', 'Twin Snakez #5', 'Test Brand G', true, 28.1, null, 'MC_TwinSnakez_flower'],
  ['D-112', 'DB-1112', 'flower', 'smoking', 'Purple Push Pop', 'Test Brand A', true, 27, null, 'MTL-FLW-002'],
  ['D-113', 'DB-1113', 'flower', 'smoking', 'The Devil\'s Fruitstand', 'Test Brand A', true, 25.5, null, 'MTL-FLW-003'],
  ['D-114', 'DB-1114', 'flower', 'smoking', 'Rose Especial', 'Test Brand A', true, 23.9, 0.2, 'MTL-FLW-004'],
  ['D-115', 'DB-1115', 'flower', 'smoking', 'Lemon Tart Pucker #1', 'Test Brand F', false, 23, null, 'external-download'],
  ['D-116', 'DB-1116', 'flower', 'smoking', 'Grease Monkey', 'Test Brand G', true, 26, null, 'Grease_monkey_flower'],
  ['D-117', 'DB-1117', 'flower', 'smoking', 'Grape Bubblegum', 'Test Brand D', true, 24.2, null, 'TerpLife_GrpeBblGm_flower'],
  ['D-118', 'DB-1118', 'flower', 'smoking', 'Sunset Haze', 'Test Brand C', true, 22.5, null, null],
  ['D-119', 'DB-1119', 'flower', 'smoking', 'House Blend', 'Test Brand E', true, 19.8, null, 'GreenRoadsFullSpectrumCBDOil750mgLot24007'],
  ['D-120', 'DB-1120', 'pre-roll', 'smoking', 'Indica Blend Pre-Roll', 'Test Brand D', true, 18, 0, 'KAY-PRR-001'],
  ['D-121', 'DB-1121', 'pre-roll', 'smoking', 'Squirrell Thai Stick Pre-Roll', 'Test Brand B', true, 20.4, null, 'ACS-PRR-001'],
  ['D-122', 'DB-1122', 'pre-roll', 'smoking', 'Sunset Haze Pre-Roll', 'Test Brand C', true, 19, null, null],
  ['D-130', 'DB-1130', 'vape', 'inhalation', 'Grease Monkey Cart', 'Test Brand A', true, 82.1, 0.2, 'Grease_Monkey_cart'],
  ['D-131', 'DB-1131', 'vape', 'inhalation', 'Bubbly Bagel AIO', 'Test Brand A', true, 88, null, 'KAY-AIO-001'],
  ['D-132', 'DB-1132', 'vape', 'inhalation', 'Blueberry Cheesecake Cart', 'Test Brand D', true, 85.3, null, 'KAY-CAR-002'],
  ['D-133', 'DB-1133', 'vape', 'inhalation', 'Apple Burst Cart', 'Test Brand E', true, 84, null, 'ACT_AppleBurst_vape'],
  ['D-134', 'DB-1134', 'vape', 'inhalation', 'Florida Man AIO', 'Test Brand D', true, 86.2, null, 'KAY-AIO-003'],
  ['D-140', 'DB-1140', 'concentrate', 'inhalation', 'GMO Resin', 'Test Brand C', true, 71.3, null, 'KAY-LRS-002'],
  ['D-141', 'DB-1141', 'concentrate', 'inhalation', 'Gelato de Limon Rosin', 'Test Brand C', true, 69.4, null, 'KAY-LRS-003'],
  ['D-142', 'DB-1142', 'concentrate', 'inhalation', 'Space Age Cake Badder', 'Test Brand B', true, 74, null, 'ACS-LRS-002']
];

function reading(fixture) {
  if (fixture === null) return { lab: null, harvest_on: null, report_on: null, usable: null, total_terpenes: null, terps: null };
  const file = path.join(EXTRACTED, `${fixture}.txt`);
  if (!fs.existsSync(file)) throw new Error(`${path.relative(ROOT, file)} is missing - run: node test/extract-dump.js`);
  const o = parseCoa(fs.readFileSync(file, 'utf8'));
  const usable = o.usable === true;
  return { lab: o.lab ?? null, harvest_on: o.harvestOn ?? null, report_on: o.reportOn ?? null, usable,
           total_terpenes: usable ? o.totalTerpenes : null, terps: usable ? o.terps : null };
}

function build() {
  const batches = ROWS.map(([product_id, batch_id, category, route, name, brand, in_stock, thc, cbd, fixture], i) => {
    const b = { batch_id, product_id, list_position: i + 2, category, route, name, brand,
                product_url: `https://shop.example/p/${product_id}`, in_stock, thc_percent: thc, cbd_percent: cbd,
                ...reading(fixture) };
    return Object.fromEntries(FEED_FIELDS.map(f => [f, b[f] === undefined ? null : b[f]]));
  });
  const store = Object.fromEntries(FEED_STORE_FIELDS.map(f => [f, STORE[f]]));
  return `${JSON.stringify({ store, batches }, null, 1)}\n`;
}

function main() {
  const text = build();
  if (process.argv.includes('--check')) {
    const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
    if (now !== text) { console.error(`${path.relative(ROOT, OUT)} is not what scripts/b2b-demo-feed.js writes - run it and commit the file`); process.exit(1); }
    console.log(`${path.relative(ROOT, OUT)} matches: ${ROWS.length} batches`);
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, text);
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${ROWS.length} batches`);
}

module.exports = { build, ROWS, STORE, OUT };
if (require.main === module) main();
