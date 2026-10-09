# NOSE for dispensaries — putting the widget on your pages

For a dispensary's web developer. `<nose-matches>` shows a shopper the
in-stock products whose terpene profile — what the lab measured, which is
about aroma and flavor — is closest to what they have bought from you before,
and why: which of their purchases it used. It also offers a sold-out panel and
a one-tap vote after a purchase.

**The core promise: a shopper's purchase history never reaches NOSE.** Your
page hands the shopper's batch IDs to the shopper's own browser, and the
widget builds their palate and ranks your menu there. NOSE serves the code,
one feed of your catalog that is the same for every visitor, and takes a vote
that carries nothing about who voted.

Switched on October 9, 2026. Everything NOSE receives and keeps from the
program is set out on its privacy page: https://nose-app.com/privacy/#dispensaries.

## What NOSE receives, and what it never does

| Request | What it carries | What it never carries |
|---|---|---|
| The release, two files | the version asked for; your page's origin | a cookie, your page's address |
| The feed, once per page | your store's public key; your page's origin | anything about the shopper, a purchase, a cookie, your page's address |
| A vote, when a shopper taps | your public key, the product voted on, the score and band shown, how many batches made the palate, up or down; your page's origin | the shopper, the purchase list, the palate, a time, a cookie, your page's address |
| Your catalog upload, from your server | the CSV below, with your secret key | anything about a shopper: a column that looks personal refuses the whole file |

The widget also keeps two lists in the shopper's browser, in storage on your
own origin, and sends them nowhere: `nose-matches-removed` (batches the
shopper took out of their palate) and `nose-matches-voted` (products they
voted on, so each gets one vote per browser). Clearing your site's data in the
browser clears them.

Netlify, which runs NOSE, keeps request logs with the address and time of
every request it serves, these included. NOSE copies nothing from them.

## 1. Load one pinned release

```html
<script src="https://nose-app.com/b2b/releases/1/nose-matches.js"
        integrity="sha384-THE-VALUE-FOR-RELEASE-1"
        crossorigin="anonymous" referrerpolicy="no-referrer" defer></script>
```

- **Take the version and the `integrity` value from
  [`docs/B2B-RELEASES.md`](B2B-RELEASES.md)** — the `nose-matches.js` column of
  that version's row. Never copy a hash from anywhere else.
- **A release never changes.** NOSE builds each one once, from one commit, and
  never writes it again; no NOSE deploy touches it. Your browser checks every
  byte against the `integrity` value and refuses anything else, so your page
  shows what you tested until you change the tag.
- **The stylesheet is pinned too.** The release links its own stylesheet,
  `.../b2b/releases/1/nose-matches.css`, inside the widget, and names that
  file's hash itself: you add no `<link>`.
- **`crossorigin="anonymous"` is required.** A browser checks the hash of a
  file from another origin only over CORS; without the attribute it blocks the
  script. The release is served with `Access-Control-Allow-Origin: *` and
  `Cross-Origin-Resource-Policy: cross-origin`, and without cookies.
- **`referrerpolicy="no-referrer"`** keeps your page's address — an order
  page's, say — out of the request. The widget sends its own requests with no
  referrer and no cookies, whatever your page's policy.
- One tag per page, however many `<nose-matches>` elements it holds. It may
  be `defer` or `async`; it must not be `type="module"`.
- **Moving to a new release** is your choice and your change: a new version
  has a new URL and a new hash in `docs/B2B-RELEASES.md`. The old one keeps
  being served.
- If the hash does not match, or the file cannot load, the browser runs
  nothing and the widget shows nothing; your page is otherwise unaffected.

## 2. Add NOSE to your Content-Security-Policy

The widget runs no inline script or style and no `eval`. If your pages send a
`Content-Security-Policy`, add these sources to the directives you already
have:

```
script-src   https://nose-app.com/b2b/releases/
style-src    https://nose-app.com/b2b/releases/
connect-src  https://nose-app.com/.netlify/functions/b2b-feed https://nose-app.com/.netlify/functions/b2b-vote
```

A source ending in `/` allows only the paths under it, and one without allows
that one path: the widget can load its code and stylesheet, and reach the feed
and the vote, and nothing else of NOSE's. A directive your policy does not
have falls back to `default-src`: add it with your `default-src` sources as
well as NOSE's - `style-src 'self' https://nose-app.com/b2b/releases/`, say -
or your own stylesheets stop loading. The widget loads no image, font or
frame. The bar in each card is drawn by setting style properties from script,
which `style-src` does not govern.

## 3. Place the element

```html
<nose-matches key="npk_YOUR_PUBLIC_KEY" mode="rail" category="flower"
              routes='["smoking","inhalation"]'
              consent="unknown" group="test"></nose-matches>
```

| Attribute | Value |
|---|---|
| `key` | Your store's **public** key: `npk_` and 64 characters. Not a secret — it names your store. A secret `nsk_` key here, or anything else, and the widget sends nothing and shows nothing. |
| `mode` | `rail` (the default): your in-stock batches of one category, closest to the shopper's palate first. `sold-out`: when the product the shopper buys most has no batch in stock, the batches closest to its last one. `vote`: on order history, "Was the flavor close?" for one product they bought. |
| `category` | `rail`: one of `flower`, `pre-roll`, `vape`, `concentrate`. The rail ranks that category and builds its palate from the shopper's purchases in it alone. |
| `routes` | `rail` and `sold-out`: JSON, the routes the shopper may buy, from `["smoking","inhalation"]`. Only batches whose `route` is in the list are shown. Required; the widget shows nothing without it. |
| `purchases` | JSON, the shopper's purchases from you: `[{"batchId":"…","day":"YYYY-MM-DD"}]`. **Only after consent** — step 4. |
| `consent` | `granted`, `denied` or `unknown` — your record of the shopper's answer. |
| `group` | `test` or `control`, for an A/B test — step 6. |
| `product` | `vote`: the `product_id` the vote is about. |
| `strings` | `default`, or `florida` for the Florida wording (aroma, orders, dispensary). Have your compliance counsel read it before you use it. |
| `feed` | For NOSE's demo only: a file on NOSE's own origin read in place of the feed. A file on any other origin and the widget shows nothing. Leave it out. |

- **Purchases**: one entry per purchase. `batchId` is the batch's ID exactly
  as your catalog lists it; `day` is the day of the purchase **in UTC**, as
  `YYYY-MM-DD`. Convert a local time first: a purchase at 9 pm in Florida is
  the next day in UTC. Purchases older than your store's window (12 months
  unless agreed otherwise) are not used, and a batch bought several times
  counts once.
- A batch whose lab report NOSE has not read, or could not read, is never
  scored or guessed: its card says "No terpene panel available for this
  batch", and it comes after the scored ones.
- Each card links to the batch's `product_url` from your catalog. The widget
  never adds to a cart.
- When it shows nothing because of a wrong attribute, a key it does not
  accept or a feed that did not come, it writes one line to the browser's
  console, once, without detail.

## 4. Purchases only after consent

Unless `consent` is `granted`, the widget ignores `purchases` entirely and
never reads it. But your page should not write the attribute at all until
then: render `purchases` into the page **only for a shopper who has said
yes**.

- `consent="unknown"`: the widget shows one button, "Sort by flavor using
  what I've bought here", and one sentence, "My purchases stay with this
  store." (`strings="florida"` has its own words). Pressing the button fires
  `nose:consent`. Your page records the answer — on your side; NOSE records
  nothing — and then sets `purchases` and `consent="granted"`, or re-renders
  the page with them.
- `consent="denied"`: the widget shows nothing, loads nothing — not even its
  stylesheet — and sends nothing.

```js
const widget = document.querySelector('nose-matches');
widget.addEventListener('nose:consent', async (e) => {
  await recordConsent(e.detail.consent);              // yours: e.detail is { consent: "granted" }
  widget.setAttribute('purchases', JSON.stringify(await loadPurchases()));   // yours
  widget.setAttribute('consent', 'granted');
});
```

## 5. The events

Each bubbles out of the element (`composed`, so a listener on `document` hears it too).

| Event | `detail` | When |
|---|---|---|
| `nose:consent` | `{ consent: "granted" }` | The shopper pressed the consent button. |
| `nose:palate-removed` | `{ batchId, removed }` | The shopper took a batch out of their palate. |
| `nose:palate-restored` | `{ batchId, removed }` | They put it back. |

`removed` is the whole list of batch IDs now out of the palate. The widget
keeps it in the browser (`nose-matches-removed`); keep it on your side too if
you want it to follow the shopper to another device.

## 6. The A/B test

Give each shopper a group and keep it: `group="test"` shows the widget,
`group="control"` shows nothing, loads nothing and sends nothing, so the two
groups differ only by the widget. Your page assigns the groups and keeps the
list; NOSE never learns who is in which.

## 7. Your catalog

The feed is built from your catalog: one CSV row per batch you list, in
[`docs/B2B-CATALOG-FORMAT.md`](B2B-CATALOG-FORMAT.md) — `product_id`,
`batch_id`, `category`, `route`, `name`, `brand`, `coa_url` (the link to that
batch's lab report), `in_stock`, `product_url`, `thc_percent`, `cbd_percent`.
Send the whole catalog from your **server**, with your secret key, whenever it
changes:

```bash
curl -sS -X POST https://nose-app.com/.netlify/functions/b2b-catalog \
  -H "Authorization: Bearer $NOSE_SECRET_KEY" \
  -H "Content-Type: text/csv; charset=utf-8" \
  --data-binary @catalog.csv
```

- The secret key (`nsk_`…) belongs on your server only — never in a page, a
  repository or a URL.
- The reply holds counts only: `received`, `upserted`, `markedOutOfStock`,
  and each `refused` row by number with every reason. The format document
  lists every answer (401, 413, 422, 503).
- Batches you stop listing are kept, marked out of stock: a shopper's past
  purchases are usually sold out, and the widget still needs their profiles.
- NOSE then reads each listed batch's lab report once. A batch's card shows
  only what its own report says, never a guess from a strain name.

## If nothing shows

1. The browser's console: an integrity or CORS message means the tag is not
   the one in step 1 — copy the version and hash again. One line starting
   `nose-matches:` means an attribute, the key or the feed.
2. The CSP lines in step 2, in the policy your page actually sends.
3. Your page's origin must be one NOSE has on file for your store, exactly:
   `https`, the host, and a port if you use one.
4. `consent` and `group`: `denied` and `control` show nothing, by design.

Aroma and flavor only: nothing the widget shows is about effects, and the
match score is a hypothesis about flavor similarity that the votes exist to
test.
