/* NOSE - every word the dispensary widget shows, in one file, so that a
 * store's compliance team can read all of it in one place. Two variants:
 *
 *   default   the plan's own wording
 *   florida   for a Florida dispensary (an MMTC): aroma rather than flavor
 *             or taste, and orders rather than purchases, for Florida's
 *             advertising rule (64ER25-6), which bars marketing that depicts
 *             consumption or implies recreational use, and holds a dispensary
 *             responsible for what its vendors show. Counsel reviews it
 *             before a store uses it; changing a word here changes it
 *             everywhere the widget shows it.
 *
 * A store picks the variant on the element: <nose-matches strings="florida">.
 * Both variants carry the same keys and the same {placeholders}, and
 * test/b2b-strings-test.js fails if either holds a word about effects or
 * recreational use - reword the string; the list of words is never narrowed.
 *
 * Words the widget shows that this file does not decide are listed at the
 * end, in SHOWN_FROM_OTHER_FILES, so this file still holds every visible
 * word: the match labels are matchBand()'s own (js/match-math), and the bar's
 * words are the app's bar (js/aroma-bar). The test fails if that list and
 * those files ever disagree. Product names, brands and THC and CBD figures
 * come from the store's own catalog, as the store wrote them.
 *
 * No attribution line ("Flavor match by NOSE") is here yet: that waits on the
 * owner's choice (PARSER-HANDOFF s14, "The widget").
 *
 * Loaded as a classic script in a page (sets window.NoseStrings) and by
 * require() in Node (module.exports). build.sh fingerprints it:
 * js/b2b-strings.<hash>.js. Aroma and flavour only.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.NoseStrings = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MONTHS = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']);

  /* {placeholders}: {n} a count, {month} a month and year from MONTHS,
     {category} one of the four category words, {name} a product name from
     the catalog, {value} a THC or CBD figure from the catalog, {label} a
     match label and {shown} its number, 0 to 100. */
  const DEFAULT = Object.freeze({
    /* Before the shopper has said yes: one button and one sentence. */
    consentButton: 'Sort by flavor using what I\'ve bought here',
    consentNote: 'My purchases stay with this store.',

    /* The rail. */
    railTitle: 'Closest to your usual',
    railEmpty: 'Nothing to compare with yet.',
    railNone: 'Nothing in stock in this category to compare with right now.',

    /* The sold-out panel. */
    soldOutTitle: '{name} is sold out',
    soldOutLead: 'Closest in flavor to the batch you bought last',
    soldOutNoPanel: 'Its last batch has no terpene panel available, so there is nothing to compare it with.',
    soldOutNone: 'Nothing in stock to compare it with right now.',

    /* A card. */
    matchLine: '{label} · {shown}',
    matchAria: '{label}, {shown} out of 100',
    noPanel: 'No terpene panel available for this batch',
    thc: 'THC {value}%',
    cbd: 'CBD {value}%',
    thcMissing: 'THC not listed',
    cbdMissing: 'CBD not listed',

    /* What the rail is based on. */
    basisOne: 'Based on 1 {category} product you\'ve bought since {month}',
    basisMany: 'Based on {n} {category} products you\'ve bought since {month}',
    basisNone: 'Not based on anything you\'ve bought yet',
    remove: 'Remove from my palate',
    removeAria: 'Remove {name} from my palate',
    removedTitle: 'Taken out of your palate',
    putBack: 'Put back in my palate',
    putBackAria: 'Put {name} back in my palate',
    notUsedTitle: 'Not used',
    notUsedPanel: '{name}: no terpene panel available',
    notUsedOthersOne: '1 other purchase isn\'t used',
    notUsedOthersMany: '{n} other purchases aren\'t used',

    /* Under the rail and the sold-out panel. */
    method: 'Matched on the terpene shares in each batch\'s lab report: aroma and flavor only. Whether a close match smells and tastes alike is still being tested.',

    /* On order history, after a purchase. */
    voteQuestion: 'Was the flavor close?',
    voteMatched: 'Matched to the rest of what you\'ve bought here as {label} · {shown}',
    voteUp: 'Yes',
    voteDown: 'No',
    voteThanks: 'Thanks, noted.',

    /* The four catalog categories, as the basis line says them. */
    categories: Object.freeze({ flower: 'flower', 'pre-roll': 'pre-roll', vape: 'vape', concentrate: 'concentrate' }),
    months: MONTHS
  });

  const FLORIDA = Object.freeze({
    consentButton: 'Sort by aroma using my past orders here',
    consentNote: 'My order history stays with this dispensary.',

    railTitle: 'Closest in aroma to your past orders',
    railEmpty: 'Nothing to compare with yet.',
    railNone: 'Nothing available in this category to compare with right now.',

    soldOutTitle: '{name} is out of stock',
    soldOutLead: 'Closest in aroma to the batch in your most recent order of it',
    soldOutNoPanel: 'Its most recent batch has no terpene panel available, so there is nothing to compare it with.',
    soldOutNone: 'Nothing available to compare it with right now.',

    matchLine: '{label} · {shown}',
    matchAria: '{label}, {shown} out of 100',
    noPanel: 'No terpene panel available for this batch',
    thc: 'THC {value}%',
    cbd: 'CBD {value}%',
    thcMissing: 'THC not listed',
    cbdMissing: 'CBD not listed',

    basisOne: 'Based on 1 {category} product from your orders since {month}',
    basisMany: 'Based on {n} {category} products from your orders since {month}',
    basisNone: 'Not based on any of your orders yet',
    remove: 'Remove from my palate',
    removeAria: 'Remove {name} from my palate',
    removedTitle: 'Taken out of your palate',
    putBack: 'Put back in my palate',
    putBackAria: 'Put {name} back in my palate',
    notUsedTitle: 'Not used',
    notUsedPanel: '{name}: no terpene panel available',
    notUsedOthersOne: '1 other order item isn\'t used',
    notUsedOthersMany: '{n} other order items aren\'t used',

    method: 'Matched on the terpene shares in each batch\'s lab report: aroma only. Whether a close match smells alike is still being tested.',

    voteQuestion: 'Was the aroma close?',
    voteMatched: 'Matched to the rest of your orders here as {label} · {shown}',
    voteUp: 'Yes',
    voteDown: 'No',
    voteThanks: 'Thank you, noted.',

    categories: Object.freeze({ flower: 'flower', 'pre-roll': 'pre-roll', vape: 'vape', concentrate: 'concentrate' }),
    months: MONTHS
  });

  /* Shown by the widget, decided elsewhere - listed so that this file holds
     every visible word. The widget never reads these: it shows matchBand()'s
     labels from js/match-math and draws the bar with js/aroma-bar, as the
     app does. The same in both variants. */
  const SHOWN_FROM_OTHER_FILES = Object.freeze({
    /* matchBand()[0], js/match-math: the label on each scored card. */
    matchLabels: Object.freeze(['Close match', 'Related profile', 'Partial overlap', 'Different profile']),
    /* renderBar(), js/aroma-bar: its aria-label is the prefix, then each
       family's label and its share ("Citrus 34%"), or "no values"; each
       segment's tooltip is a family and its share; a segment wide enough
       shows the family's label. */
    barPrefix: 'Aroma profile: ',
    barNone: 'no values',
    familyLabels: Object.freeze(['Citrus', 'Earthy', 'Spice', 'Pine', 'Floral', 'Herbal'])
  });

  return Object.freeze({ default: DEFAULT, florida: FLORIDA, SHOWN_FROM_OTHER_FILES });
});
