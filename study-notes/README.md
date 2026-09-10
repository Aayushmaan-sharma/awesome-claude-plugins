# Notecase — a storefront for selling study notes

A self-contained shop for lecture notes, essay banks, case grids and flashcard
decks. No build step, no framework, no dependencies, and no network requests:
open `index.html` and it runs.

```
study-notes/
├── index.html          page shell
├── styles.css          design tokens + components (light and dark)
├── catalog.js          sample catalogue — replace with your own listings
├── policies.js         terms, privacy, refunds, cookies, accessibility, copyright
├── app.js              storefront logic — SITE config lives at the top
├── fonts/              self-hosted OFL typefaces (+ OFL.txt)
├── check-a11y.mjs      contrast check over the real stylesheet
└── build-artifact.mjs  runs the check, then inlines everything into one file
```

## Run it

```sh
npx serve study-notes            # or just open study-notes/index.html
node check-a11y.mjs              # contrast report, exits non-zero on a failure
node build-artifact.mjs          # -> dist/artifact.html (single file, fonts inlined)
```

## What works

- **Browse** — search titles, course codes, institutions and summaries; filter by
  subject and level; sort by rating, review count, price or recency.
- **Listing pages** — contents with page numbers, sample-page preview with the
  rest locked, what's included, seller card, reviews.
- **Cart and checkout** — discount codes (`FRESHERS10`), VAT-inclusive totals,
  order references, and two consent steps that are recorded with the order.
- **Library** — every purchase, re-downloadable. Uses the Claude Artifacts
  `downloads` capability when the page runs as an artifact, a Blob download
  everywhere else.
- **Reviews** — only a buyer who owns a pack can review it, and every review
  shown is a real one. Nothing is seeded.
- **Selling** — listing form with a live card preview, a copyright declaration,
  and a payout breakdown net of the platform fee.
- **Sales** — copies sold and earnings per listing.

State lives in `localStorage` under `notecase.v1` and never leaves the device.

## Before you go live

`SITE` at the top of `app.js` is deliberately blank:

```js
const SITE = { legalName: "", companyNumber: "", vatNumber: "", address: "", contactEmail: "", … };
```

Every blank field shows up as a red placeholder on the policy pages and in the
footer, with a banner listing what's missing. Traders have to identify
themselves under the Companies Act and the E-Commerce Regulations, and a
plausible-looking invented address is worse than an obviously empty one.

The six policy pages in `policies.js` are drafts written against what this code
actually does. They are not legal advice — have a solicitor read them, and
rewrite them the moment you add a backend, because most of what privacy and
cookies say stops being true then.

## Payments are not connected

Checkout records the order locally and unlocks the download. There are
deliberately **no card fields** — collecting card details in a page that cannot
charge them would be worse than useless.

To take real money, replace the body of `submitCheckout()` in `app.js` with a
call to a payment provider, and create the order from the webhook that confirms
payment, never from the browser:

```js
// app.js — submitCheckout(), after the consent checks pass
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
   provider's equivalent), record the order and issue the download.
3. **Serve files through signed, expiring URLs**, not public storage links.
   `deliver()` in `app.js` is where a real download URL replaces the generated
   contents sheet.

Keep the consent record. `order.consent` stores that the buyer accepted the
terms and asked for immediate delivery, which is what makes the waiver of the
14-day cancellation right effective. Move it server-side with the order.

## How the compliance-shaped bits are built

- **No third-party requests.** Fonts are served from `fonts/` (SIL Open Font
  License, copyright holders in `fonts/OFL.txt`); the single-file build inlines
  them as `data:` URIs. There is no analytics, advertising, embed or CDN call
  anywhere, which is also why there is no cookie banner: the only storage is
  strictly necessary, and PECR exempts that. Add an analytics tag and you need
  real consent before it loads.
- **No fake reviews.** The catalogue ships with no ratings, review counts or
  seller sales tallies. Reviews are written by verified buyers only. Seeding
  them would breach the Digital Markets, Competition and Consumers Act 2024.
- **Data minimisation.** Checkout asks for an email address and nothing else —
  no name, no address, no institution. Nothing about the buyer is persisted
  beyond the order.
- **Contrast.** `check-a11y.mjs` parses the tokens out of `styles.css` and
  checks every text and control-boundary pair in both themes against WCAG 2.2.
  `build-artifact.mjs` runs it first, so a regression fails the build.
- **Keyboard and screen reader.** One `h1` per view, landmarks, a skip link,
  labelled controls, dialogs that trap focus and restore it on close, errors
  tied to their field and announced, and no information carried by colour alone.
  There are no images anywhere — covers and previews are drawn in CSS and hidden
  from assistive technology, with the same facts available as text.

## Making it yours

- **Catalogue** — edit `SAMPLE_NOTES` in `catalog.js`, or point
  `loadCatalogue()` in `app.js` at your API. `SUBJECTS` drives both the filter
  rail and the per-subject cover tint (`tint` is a hue, 0–360). Prices are in
  pence so arithmetic never drifts.
- **Identity** — palette, type scale and spacing are custom properties at the
  top of `styles.css`; both themes are defined there and nowhere else. Change a
  colour and re-run `check-a11y.mjs`.
- **Fee and currency** — `CONFIG` at the top of `app.js` (`platformFeePct`,
  `currency`, `locale`, `promos`).
