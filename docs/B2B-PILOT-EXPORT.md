# NOSE pilot export — the CSV a dispensary sends at the end of a pilot

One file, one row per assigned shopper, counts only. Each row says which
group the shopper was in and what they did during the pilot, as counts and
yes-or-no answers. No row says who the shopper is. A file that looks like it
could is refused whole, before any of its rows is read.

Read by `scripts/b2b-pilot-report.js` (PARSER-HANDOFF.md §14, "Pilot plan and
report") with the store's plan, `docs/pilots/<slug>.md` (made from
`docs/B2B-PILOT-PLAN.md`). The rules below are that script's rules: when they
change, this file changes in the same commit, and `test/b2b-pilot-test.js`
checks them.

**Not received yet.** Before NOSE receives a first export, its privacy page
(`/privacy/#dispensaries`) says what the export holds, where it is read and
when it is deleted (PARSER-HANDOFF.md §14, "Still open").

## The file

- **CSV**: commas between values; a value holding a comma, a double quote or
  a line break goes in double quotes, with `""` for a quote inside it
  (RFC 4180). Line endings may be CRLF or LF.
- **UTF-8.** In Excel, save as "CSV UTF-8 (Comma delimited)". A byte-order
  mark at the start is fine. A file in any other encoding is refused rather
  than guessed at.
- **A header row** naming every column below, once each, in any order.
  Names are matched ignoring letter case and spaces around them.
- **One row per assigned shopper**: every shopper the page put in either
  group during the pilot, those who never ordered included, with zeros.
- **Rows in any order but the store's own**: sorted by group, or shuffled —
  never in the order of the store's shopper list or sign-up dates.
- At most 20 MB. Blank rows are skipped.

## The columns

| column | what it holds |
|---|---|
| `group` | `test` or `control`: the group the page gave the shopper. |
| `orders` | Orders the shopper placed from their assignment to the pilot's last day. A whole number. |
| `inhalable_orders` | Of those, the orders containing at least one inhalable: flower, pre-roll, vape or concentrate. The pilot is decided by these: their total over the shoppers assigned, in each group. |
| `revenue` | The total of those orders, in the currency and with the tax and discounts the plan names: a plain number with at most two decimals, `152.40` — no currency sign, no thousands separator. `0` when `orders` is 0. |
| `soldout_sessions` | Visits during the pilot in which the product the shopper had bought most often from the store had no batch in stock: the rule the widget's sold-out panel uses (`js/b2b-rank`'s `soldOut()` — purchases counted, not batches, within the store's window). Counted for both groups. |
| `soldout_sessions_ordered` | Of those visits, the ones that ended in an order containing an inhalable. |
| `opted_in` | `yes` or `no`: the shopper pressed the widget's button. `no` for every control shopper, who never sees it. |
| `bought_matched` | `yes` or `no`: during the pilot the shopper bought a product they reached from one of the widget's cards, counted the way the plan says. `no` for every control shopper. |
| `bought_matched_again` | `yes` or `no`: they bought that product again — any batch of it — within 60 days of buying it. Take the export at least 60 days after the last day, so every matched purchase has its full 60 days. |

Values in `group` and in the three yes-or-no columns are matched ignoring
letter case. Spaces around any value are ignored.

## What refuses the whole file

Nothing in a refused file is used. The refusal names the column or the row
and what is wrong, and never repeats a value: a value in the wrong column can
be anything.

- **A column that looks like it is about a person.** The catalog's rule
  (`docs/B2B-CATALOG-FORMAT.md`), word for word: a column whose name holds
  any of the names the lab-report archive refuses (`userid`, `user_id`,
  `email`, `email_address`, `emailaddress`, `ip`, `ipaddress`, `ip_address`,
  `deviceid`, `device_id`, `useragent`, `user_agent`, `sessionid`,
  `session_id`, `accountid`, `account_id`, `palate`, `phone`), or `customer`,
  `patient`, `card`, `license`, `licence`, `dob`, `address` — and, for an
  export about shoppers, a name that could identify one: `shopper`,
  `member`, `loyalty`, `name`, `birth`, `zip`, `zipcode`, `postal`,
  `postcode`, `account`, `id`, `uuid`, `guid`. Letter case and separators are
  set aside; the short words (`ip`, `dob`, `zip`, `id`) count only as a whole
  part of the name, so `Shipping` is not `ip`. Checked first, before any row
  is read.
- **Any other column outside the list above**, named in the refusal.
- A column missing from the header, or named twice.
- A file that is not UTF-8, is empty, is larger than 20 MB, has no header
  row, ends inside a quoted value, or has no shopper rows.
- **Any row it cannot read.** Unlike the catalog, one such row refuses the
  whole file, and the refusal lists every one with its row number: a row
  left out would change every share the pilot rests on. Row numbers count the
  header as row 1, as a spreadsheet shows them. A row must have:
  - a value for every column;
  - `group` `test` or `control`;
  - `orders`, `inhalable_orders`, `soldout_sessions` and
    `soldout_sessions_ordered` as whole numbers;
  - `revenue` as above;
  - `yes` or `no` in `opted_in`, `bought_matched` and `bought_matched_again`;
  - and agree with itself: `inhalable_orders` no more than `orders`;
    `soldout_sessions_ordered` no more than `soldout_sessions` or
    `inhalable_orders`; `revenue` 0 when `orders` is 0; `bought_matched`
    `yes` only with an inhalable order; `bought_matched_again` `yes` only with
    `bought_matched` `yes`.

## What is read, and said

A control shopper with `yes` in `opted_in`, `bought_matched` or
`bought_matched_again` is read and counted. Control saw nothing of the
widget, so a `yes` there means the groups leaked: the report says how many,
and gives no result.

## An example

```csv
group,orders,inhalable_orders,revenue,soldout_sessions,soldout_sessions_ordered,opted_in,bought_matched,bought_matched_again
control,3,2,141.50,1,0,no,no,no
test,0,0,0,0,0,no,no,no
test,5,4,233.10,2,1,yes,yes,yes
```

## Running the report, from the Codespace

1. The plan is committed: `docs/pilots/<slug>.md`, filled in before the
   first day.
2. `mkdir -p b2b-out/<slug>`, then drag the export into that folder in the
   Explorer. `b2b-out/` is ignored by git: the export is the store's data,
   and this repository is public.
3. `node scripts/b2b-pilot-report.js b2b-out/<slug>/<file>.csv --store <slug>`.
   It reads the plan, the export and the store's votes in Netlify Blobs
   (`NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN`, Codespaces secrets), prints the
   report and writes nothing. A refused file says why: fix the export, never
   the rule.
4. Once the report is published, `rm -r b2b-out/<slug>`: nothing else holds a
   copy.

Aroma and flavor only: a match score compares the terpene profiles two lab
reports measured, and the report says nothing about how any product is
experienced.
