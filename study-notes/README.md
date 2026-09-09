# Notecase — a storefront for selling study notes

A self-contained shop for lecture notes, essay banks, case grids and flashcard
decks. No build step, no framework, no dependencies: three files and a page
shell. Open `index.html` and it runs.

```
study-notes/
├── index.html          page shell
├── styles.css          design tokens + components (light and dark)
├── catalog.js          sample catalogue — replace with your own listings
├── app.js              storefront logic
└── build-artifact.mjs  inlines everything into one file
```

## Run it

```sh
# anything that serves static files
npx serve study-notes
# or just open study-notes/index.html in a browser
```

Single-file build, for hosts (or Claude Artifacts) that want one page:

```sh
node build-artifact.mjs            # -> dist/artifact.html
node build-artifact.mjs out.html
```

## What works

- **Browse** — search across titles, course codes, institutions and summaries;
  filter by subject and level; sort by reviews, rating, price or recency.
- **Listing pages** — contents with page numbers, sample-page preview with the
  rest locked, what's included, seller card, reviews.
- **Cart and checkout** — discount codes (`FRESHERS10` is wired up), VAT-inclusive
  totals, order records with references.
- **Library** — every purchase, re-downloadable forever. Uses the Claude
  Artifacts `downloads` capability when the page runs as an artifact, and a Blob
  download everywhere else.
- **Selling** — a listing form with a live preview of the card buyers will see,
  and a payout breakdown net of the platform fee.
- **Sales** — copies sold and earnings per listing.

State lives in `localStorage` under `notecase.v1`, so a buyer's cart, orders and
listings survive a reload but stay on their own device.

## Payments are not connected

Checkout records the order locally and unlocks the download. There are
deliberately **no card fields** — collecting card details in a page that cannot
charge them would be worse than useless.

To take real money, replace the body of `submitCheckout()` in `app.js` with a
call to a payment provider and create the order from the webhook that confirms
payment, never from the browser:

```js
// app.js — submitCheckout()
const res = await fetch("/api/checkout", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ items: state.cart, email }),
});
const { url } = await res.json();
location.href = url;                 // Stripe Checkout / Paddle / Lemon Squeezy
```

Your server then needs three things this front end deliberately does not do:

1. **Price on the server.** Look prices up from your own database — never trust
   the amounts the page sends.
2. **Fulfil from the webhook.** On `checkout.session.completed` (or your
   provider's equivalent), record the order and issue a download.
3. **Serve files through signed, expiring URLs**, not public storage links.
   `deliver()` in `app.js` is where a real download URL replaces the generated
   contents sheet.

## Making it yours

- **Catalogue** — edit `SAMPLE_NOTES` in `catalog.js`, or point
  `loadCatalogue()` in `app.js` at your API. `SUBJECTS` drives both the filter
  rail and the per-subject cover tint (`tint` is a hue, 0–360). Prices are in
  pence so arithmetic never drifts.
- **Identity** — the palette, type scale and spacing are CSS custom properties
  at the top of `styles.css`; both themes are defined there and nowhere else.
- **Fee and currency** — `CONFIG` at the top of `app.js` (`platformFeePct`,
  `currency`, `locale`, `promos`).

## Before you sell to real students

- Sellers may only list work they wrote themselves. Lecture slides, textbook
  chapters and past papers belong to whoever holds their copyright.
- Say plainly that notes are a study aid, not work to submit. Most universities
  treat submitting bought work as academic misconduct, and several jurisdictions
  regulate contract-cheating services.
- Digital goods sold in the UK and EU are VAT-rated at the buyer's location, and
  the consumer right to cancel is waived only if the buyer agrees before the
  download starts.
- Have a takedown route for copyright complaints, and a refund policy — digital
  files can't be returned.

None of that is legal advice; it's the shortlist worth taking to someone who
gives it.
