# NOSE for dispensaries — pilot plan (template)

One store, one A/B test, written down before day one, and read once at the
end the same way whatever it shows. The pilot tests two claims from the plan:
that the module keeps inhalable orders on the dispensary's own site, and that
the match bands mean something.

**How to use this file.** Copy it to `docs/pilots/<slug>.md`, where `<slug>` is
the store's slug. Fill in every `____`, then commit and push it **before the
first day**. That commit is the pre-registration: `scripts/b2b-pilot-report.js`
reads the numbers in §9 from the committed file, and gives no result for
numbers first committed on or after the first day. This repository is public:
write nothing here the store has not agreed to publish, and nothing about any
shopper.

The rules below are the report's rules (PARSER-HANDOFF.md §14, "Pilot plan
and report"). When they change, this file changes in the same commit, and
`test/b2b-pilot-test.js` checks them.

## 1. Store and dates

| | |
|---|---|
| Store | ____ |
| Slug | ____ (as `scripts/b2b-store.js create` made it) |
| First day (UTC) | ____ |
| Last day (UTC) | ____ |
| Export taken | on or after ____: at least 60 days after the last day (§4) |
| Widget release | version ____, from `docs/B2B-RELEASES.md` |
| Pages carrying the widget | ____ (the rail on which category pages; the sold-out panel where; the vote on order history) |
| Catalog | uploaded on ____; its coverage report: ____ of ____ in-stock inhalables have a terpene panel NOSE can read |
| Who reviews the pages during the pilot | ____ (a role, not a name) |
| Currency of `revenue` | ____, before / after tax: ____, before / after discounts: ____ |

## 2. How the page assigns groups

- **Who is in the pilot**: every shopper who signs in on a page carrying the
  widget between the first and the last day. Left out, decided now: ____
  (staff accounts, test accounts). Visitors who are not signed in are not in
  the pilot and see the store's normal menu.
- **When**: at that first visit, before anything about the widget shows — the
  opt-in prompt included.
- **How**: a random draw, half `test` and half `control`, kept on the store's
  side with the shopper's account, so a shopper keeps one group on every
  device for the whole pilot. Never from anything about the shopper. Method
  used: ____.
- **What each group sees**: `group="test"` shows the opt-in prompt and the
  module; `group="control"` shows the store's normal menu, and the widget
  loads nothing and sends nothing (`docs/B2B-INTEGRATION.md`, step 6).
- **What NOSE learns**: nothing about who is in which group. The page sets
  the attribute; the list stays with the store. At the end the store sends
  counts per shopper with a group label and no identity (§10 and
  `docs/B2B-PILOT-EXPORT.md`).
- **Every assigned shopper counts**, whether or not they opted in, saw a card
  or ordered at all. That measures the module as it would really ship.

## 3. The primary metric — the one that decides

**Shoppers with an inhalable order, per assigned shopper**: in each group,
the share of all assigned shoppers who placed at least one order containing
an inhalable (flower, pre-roll, vape or concentrate) between their assignment
and the last day.

- It is a share of shoppers, so the sample size in §7 is one for a
  difference in two proportions.
- **Reported beside it, deciding nothing**: inhalable orders per assigned
  shopper — every order containing an inhalable, divided by the shoppers
  assigned — the plan's first wording of this metric.
- **The result**, at the `alpha` in §9: the interval of the difference
  (test minus control) at 1 − `alpha` — 95% at 0.05 — by Newcombe's hybrid
  score method, built from each group's Wilson score interval.
  - wholly above zero: *more test shoppers placed an inhalable order*;
  - wholly below zero: *fewer test shoppers placed an inhalable order*;
  - including zero: *no difference shown*.

  The three are computed by one rule, so the result reads the same way
  whether the module helps or not.

## 4. Secondary metrics — reported, deciding nothing

Each is shown per group with its counts beside its rate and a 95% interval.
None changes the result in §3.

- **Sold-out recovery**: of the visits in which the product a shopper had
  bought most was out of stock, the share that ended in an order containing an
  inhalable — both groups, by the rule the widget's sold-out panel uses
  (`js/b2b-rank`'s `soldOut()`), counted by the store for test and control
  alike. Visits come in shoppers, so the interval counts each shopper as one
  unit (the delta method for a ratio).
- **A matched product bought again within 60 days** (test only): of the test
  shoppers who bought a product they reached from one of the widget's cards,
  the share who bought it again within 60 days. How the store counts a
  matched purchase: ____ (suggested: give every catalog `product_url` a marker
  of the store's own, `?from=flavor` say, the same for every shopper, and
  count an order of a product whose page that shopper opened through it).
  The export is taken at least 60 days after the last day, so every matched
  purchase has its full 60 days.
- **Opt-in rate** (test only): the share of test shoppers who pressed the
  widget's button. Control never sees it.

## 5. The hypothesis check — votes by band

After an order, the vote asks "Was the flavor close?" beside a product the
shopper bought. Each vote is kept by NOSE under the store, the band the
shopper was shown, up or down, and the day — nothing about who voted.

- The report lists the store's votes from the first day to the last
  (UTC), and gives the share of up votes in each of `matchBand()`'s four
  bands — Strong, Good, Moderate, Low — with its counts and a 95% interval.
- **Expected**: the share falls from Strong to Low. Shown as read, in order;
  not a test.
- **The result**, at the `alpha` in §9, once Strong and Low each hold
  `votes_per_band` votes: the interval of the difference in up share,
  Strong minus Low — the same method as §3.
  - wholly above zero: *Strong matches drew a larger share of up votes than
    Low ones*;
  - wholly below zero: *Low matches drew a larger share of up votes than
    Strong ones*;
  - including zero: *no difference shown between Strong and Low*.
- **If Strong does not beat Low**, `/methodology` says so and the method is
  revised.
- At most 100 votes a store a day are kept (`B2B_VOTE_DAILY_CAP` unset). The
  report names any day that reached it: votes past it were dropped, and that
  day is undercounted.

## 6. Guardrails

- **Average order value must not drop in the test group**: revenue divided
  by orders, per group, with a 95% interval (the delta method, shoppers as
  the unit). It *dropped* if the interval of the difference, test minus
  control, at the `alpha` in §9 is wholly below zero; otherwise *no drop
  shown*.
- **Copy and route incidents — target zero.** A copy incident: any shown
  word about how a product makes someone feel rather than how it smells or
  tastes — the words `test/b2b-strings-test.js` refuses — in NOSE's strings or
  in a catalog name the widget showed. A route incident: a card outside the
  shopper's routes. Reviewed by the role in §1, on ____ (how often); every
  one goes in the incident log below. Not in the export: the report points
  here.

## 7. Sample size and stopping rule

- **The sample size**, from the store's own numbers:

  ```bash
  node scripts/b2b-sample-size.js --baseline ____ --lift ____ --alpha 0.05 --power 0.8
  ```

  - `--baseline`: the share of signed-in shoppers with an inhalable order in
    a past period as long as the pilot: ____ (period: ____).
  - `--lift`: the smallest relative rise worth acting on: ____.
  - It prints the shoppers needed in each group; that number goes in §9 as
    `shoppers_per_group`. The report checks it against the same
    computation and gives no result if it is smaller.
- **Votes per band**, the same way: `--baseline` the up share expected in Low
  (____), `--lift` the smallest rise in Strong worth acting on (____); its
  answer is `votes_per_band` in §9. The vote cap and the share of shoppers who
  vote make this slow to reach: estimate ____ votes a week.
- **How long**: the store assigns about ____ new signed-in shoppers a week, so
  2 × `shoppers_per_group` takes about ____ weeks: the first and last days in
  §1.
- **The stopping rule**:
  - The pilot runs from the first day to the last day whatever the numbers
    show. It is not stopped early because the numbers look good, and not
    extended after anyone has looked.
  - It is read once, from one export taken at least 60 days after the last
    day.
  - Until the last day has passed and both groups hold `shoppers_per_group`
    shoppers, the report shows only how far short the run is — no rate, no
    interval, no result.
  - If the last day comes and either group is short, the pilot is published
    as short, with every figure and no result.

## 8. What stops a result

The report shows its figures and withholds the result, saying why, when:

- the numbers in §9 were first committed on or after the first day, the
  file has changes git has not committed, or the clone is shallow;
- the split does not fit half and half: a chi-squared test of the two group
  sizes below p = 0.001;
- any control shopper shows `yes` for `opted_in`, `bought_matched` or
  `bought_matched_again`: control saw nothing of the widget, so a `yes` there
  means the groups leaked;
- `shoppers_per_group` is smaller than §7's computation gives.

Before the last day has passed, or while either group is short, it shows
only how far short the run is (§7).

## 9. The pre-registered numbers

The report reads exactly these lines. Fill each in, commit before the first
day, and change none afterwards: a change made later is a new plan, committed
too late.

```pilot
store:              ____
first_day:          ____
last_day:           ____
baseline:           ____
lift:               ____
alpha:              0.05
power:              0.8
shoppers_per_group: ____
votes_per_band:     ____
```

- `store`: the slug; `first_day`, `last_day`: `YYYY-MM-DD`, UTC;
  `baseline`, `lift`, `alpha`, `power`: as given to
  `scripts/b2b-sample-size.js`; `shoppers_per_group`, `votes_per_band`: its
  answers.

## 10. Published either way

The result is published either way: whether the module helps, makes no
difference, or the pilot ends short. What is published: this plan, the
sample sizes, every metric above with its counts — the ones that did not move
included — the band-by-band vote table, and the incident log. Where: ____.
Nothing about any shopper is published, and nothing the store has not agreed
to.

## Before the first day

- [ ] NOSE's privacy page (`/privacy/#dispensaries`) describes the
      end-of-pilot export before NOSE receives one (PARSER-HANDOFF.md §14,
      "Still open").
- [ ] The store's data terms with NOSE cover the export
      (`docs/B2B-PILOT-EXPORT.md`).
- [ ] Department approval of the website change, where the state requires
      it: in Florida, emergency rule 64ER25-6 as the plan reads it. Check the
      rule in force before the first day (Rule 64-4.227 may replace it), with
      counsel.
- [ ] The store's compliance counsel has read the strings variant it uses.
- [ ] The store can produce the export, every column, for a few test rows.
- [ ] This file, filled in, committed and pushed:
      `git log -1 --format=%cI -- docs/pilots/<slug>.md` shows a day before the
      first day.

## Incident log

Filled in during the pilot. One row per incident; none is the target.

| Day found (UTC) | Page | What was shown | Kind (copy or route) | Fixed on |
|---|---|---|---|---|
