# Studyshelf, a storefront for selling study notes

A self-contained shop for student-written study notes across twenty subjects,
from languages and sciences to humanities and law. No build step, no framework,
no dependencies, and no network requests: open `index.html` and it runs.

```
study-notes/
├── index.html          page shell
├── styles.css          design tokens + components (single dark theme)
├── catalog.js          sample catalogue, grouped into subjects, replace it
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
  and a payout breakdown net of the platform fee. Requires an account.
- **Earnings** — what you've made after fees as the headline figure, gross and
  fee alongside it, net earnings by month, every individual sale, and per-listing
  totals. Requires an account.
- **Accounts** — sign in by email link or with Google. See below: neither is
  connected, and neither asks for a password.
- **Theme** — light, dark, or match system, from the header. The choice is
  written to `data-appearance` rather than `data-theme`, which the Claude
  Artifacts viewer owns; "match system" follows both that host stamp and
  `prefers-color-scheme`, live.

State lives in `localStorage` under `studyshelf.v1` and never leaves the device.

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

## Deploying it, and the domain

The build is a folder of static files, so any static host will serve it:
Cloudflare Pages, Netlify, GitHub Pages, S3 behind CloudFront, or a plain
nginx root. There is nothing to run server-side until you connect payments.

Put it on your own domain rather than a host's subdomain. A shop on
`something.pages.dev` reads as a side project, and you cannot move providers
later without breaking every link anyone saved. Buy the name, point an `A` or
`CNAME` record at your host, and turn on the automatic certificate every one of
those providers offers. Then set the canonical URL in `index.html` and use the
same domain for the sender address on receipts, so the email and the site agree.

## Sign-in is not connected either

`#/signin` offers the two options a notes marketplace normally offers — a one-time
email link, and Google — and **neither is wired to anything**. Both create a local
session so the seller pages have someone to belong to.

Two deliberate choices worth keeping when you wire the real thing:

- **No password field, anywhere.** A front end with no backend has nowhere safe to
  put a password, and students reuse passwords. Magic links and federated sign-in
  avoid the problem rather than managing it. If you do add passwords, they are
  hashed server-side with argon2/bcrypt and never touch `localStorage`.
- **No imitation Google screen.** The button carries a plain monogram, not Google's
  brand asset, because it does not perform Google sign-in. A page that mimicked
  Google's login to collect a password would be a phishing kit, whatever the intent.
  When you connect the real thing, use [Google Identity Services](https://developers.google.com/identity/gsi/web/guides/overview)
  and its official button, verify the returned ID token **on your server** against
  Google's JWKS, and check `aud`, `iss` and `exp` before trusting it.

Replace `signIn()` in `app.js` with a call that stores a session your server
issued, and treat everything the browser says about identity as a claim until the
server has checked it.

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
  checks every text and control-boundary pair against WCAG 2.2, on both grounds
  the design uses — the black desk and the white paper. `build-artifact.mjs`
  runs it first, so a regression fails the build.
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
  top of `styles.css`. Dark is the base and the default: `:root` carries it
  complete, so a page that never runs JS still renders a whole theme. Light is
  a designed alternate under `[data-appearance="light"]`, redefining only the
  tokens that change — its own steps against its own grounds, not an inversion.
  `--sheet-*` are the paper colours and stay the same in both. Change a colour
  and re-run `check-a11y.mjs`, which checks both themes.
- **Fee and currency** — `CONFIG` at the top of `app.js` (`platformFeePct`,
  `currency`, `locale`, `promos`).
