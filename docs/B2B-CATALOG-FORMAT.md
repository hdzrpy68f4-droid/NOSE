# NOSE catalog format — the CSV a dispensary exports

One file, one row per batch the dispensary lists. It describes products and
batches: which batch is which, what kind of product it is, and where its lab
report (certificate of analysis, COA) can be fetched. It never describes a
shopper. A file that looks like it could is refused whole, before any of its
rows is read.

Read today by `scripts/b2b-coverage.js`, the coverage report
(PARSER-HANDOFF.md §14). The rules below are that script's rules: when they
change, both change in the same commit, and `test/b2b-coverage-test.js`
checks them.

## The file

- **CSV**: commas between values; a value holding a comma, a double quote or
  a line break goes in double quotes, with `""` for a quote inside it
  (RFC 4180). Line endings may be CRLF or LF.
- **UTF-8.** In Excel, save as "CSV UTF-8 (Comma delimited)". A byte-order
  mark at the start is fine. A file in any other encoding is refused rather
  than guessed at.
- **A header row** naming every column below, once each, in any order.
  Names are matched ignoring letter case and spaces around them:
  `Product_ID` is `product_id`; `Product ID` is not.
- **One row per batch.** A `batch_id` may appear on one row only. A batch
  sold as several products (two jar sizes, say) is listed once, under one of
  them.
- At most 20 MB. Blank rows are skipped.

## The columns

| column | required | what it holds |
|---|---|---|
| `product_id` | yes | The product's ID in the dispensary's own system. |
| `batch_id` | yes | The batch's ID, as the label prints it. The coverage report checks that the lab report names it. |
| `category` | yes | One of `flower`, `pre-roll`, `vape`, `concentrate`. |
| `route` | yes | One of `smoking`, `inhalation`. |
| `name` | yes | The product's name, as shoppers see it. |
| `brand` | no | The brand. |
| `coa_url` | no | The `https` link to this batch's lab report: the PDF itself, or the page the jar's QR code opens. Empty when there is none. |
| `in_stock` | yes | `yes` or `no`. |
| `product_url` | no | The `https` link to the product's page. |
| `thc_percent` | no | A number from 0 to 100, with or without a `%` sign. Empty when the label does not say; never `ND` or `<LOQ`. |
| `cbd_percent` | no | As `thc_percent`. |

Values in `category`, `route` and `in_stock` are matched ignoring letter case.
Spaces around any value are ignored.

Every in-stock batch the dispensary lists should have its own `coa_url`, the
link to *that batch's* report. The report for a strain, or for the batch
before, is a different document: NOSE reads the one jar's report and trusts
nothing else, never a strain name.

## What refuses the whole file

Nothing in a refused file is used. The refusal names what refused it.

- **A column that looks like it is about a person.** A column whose name
  holds any of these, once letter case and separators are set aside, refuses
  the file before any row is read: the names the lab-report archive refuses
  (`userid`, `user_id`, `email`, `email_address`, `emailaddress`, `ip`,
  `ipaddress`, `ip_address`, `deviceid`, `device_id`, `useragent`,
  `user_agent`, `sessionid`, `session_id`, `accountid`, `account_id`,
  `palate`, `phone`, from `netlify/functions/lib/store.js`), and `customer`,
  `patient`, `card`, `license`, `licence`, `dob`, `address`. The two short
  ones, `ip` and `dob`, count only as a whole part of the name, so `zip` is
  not `ip`. A catalog never needs such a column: an export that has one is
  the wrong export.
- **Any other column outside the list above**, named in the refusal.
- A column missing from the header, or named twice.
- A file that is not UTF-8, is empty, is larger than 20 MB, has no header
  row, or ends inside a quoted value.

## What refuses a row

The rest of the file is still read. Each refused row is listed with its row
number and every reason, and is left out of every count. Row numbers count
the header as row 1, as a spreadsheet shows them.

- A different number of values from the header.
- An empty `product_id`, `batch_id`, `category`, `route`, `name` or
  `in_stock`.
- A `category`, `route` or `in_stock` outside its list.
- A `product_url` that is not an `https` address.
- A `thc_percent` or `cbd_percent` that is not a number from 0 to 100.
- A `batch_id` already on an earlier row.

`coa_url` is not checked here. A link that is not `https`, or that points at a
private network, is fetched exactly as NOSE's scanner would fetch it, which
refuses it, and the report gives the scanner's reason.

## An example

```csv
product_id,batch_id,category,route,name,brand,coa_url,in_stock,product_url,thc_percent,cbd_percent
P-101,6650039866516120,vape,inhalation,Grease Monkey Cart,Brand A,https://yourcoa.com/coa/coa-view?sample=MI60617015-004,yes,https://shop.example/p/101,82.1,0.2
P-103,MI60120007-011,pre-roll,smoking,Indica Blend Pre-Roll,Brand A,https://lab.example/reports/KAY-PRR-001.pdf,yes,,18,0
P-117,MI60618012-002,flower,smoking,"Cold Creek Kush, 3.5g",Brand F,https://lab.example/reports/Kush_Creek.pdf,no,,22%,
```

`test/fixtures/b2b/catalog.csv` is a longer one, with a row for every case
the coverage report handles.

## What the coverage report does with it

For each in-stock row with a `coa_url`, one at a time with a pause between,
it fetches the link through NOSE's scanner's own chain
(`netlify/functions/lib/fetch-report.js`: `https` only, no private
addresses, redirects re-checked, bounded time and size, PDF bytes required),
extracts the text and reads it with NOSE's parser, as the scanner does. Then
it writes `report.md` and `report.csv` into one local folder, and nothing
anywhere else: no database, no lab-report archive, no endpoint.

- **Counted**: in-stock batches whose terpene panel NOSE can read, whose
  report was refused (the parser's reasons, word for word), with no link,
  and whose link could not be fetched (the scanner's own words), by category
  and by lab, with the denominator beside every share.
- **Flagged, never fixed**: a report whose form is not the row's category (a
  pre-roll is flower to the parser); a report whose batch and lab ID, read
  ignoring spaces and letter case, do not contain the row's `batch_id`; one
  link on more than one batch, across every row in stock or not (two links
  that differ only after `#` are one link).
- **Numbers only for a panel NOSE can read**: the total terpenes the lab
  printed, and the top three terpenes, each as a share of the terpenes NOSE
  models (the shape NOSE compares), computed with NOSE's own matching code.
  Every other batch shows none: never a guess.
- **Links are shown by host only**: an address can carry a token.
- `route`, `product_url`, `thc_percent` and `cbd_percent` are checked for
  format only. The report does not use them.

Aroma and flavor only: the report describes lab reports and what NOSE can
read from them, nothing else about any product.
