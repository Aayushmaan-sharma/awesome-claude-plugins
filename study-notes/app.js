/* Notecase — a storefront for buying and selling study notes.
 *
 * No build step, no framework, no dependencies, and no network requests:
 * the fonts are served from this directory and there is no analytics,
 * advertising or third-party embed anywhere in the page. State lives in
 * localStorage, so the shop runs from file://, a static host, or a
 * published artifact.
 *
 * Payments are NOT connected. Checkout records an order locally and
 * unlocks the download. See README.md before taking money from anyone.
 */

(() => {
  "use strict";

  /* Fill these in before you trade. Anything left blank shows up as a
   * visible gap on the policy pages instead of an invented detail — a
   * trader has to identify itself under the Companies Act and the
   * E-Commerce Regulations, and a plausible-looking placeholder is worse
   * than an obvious one. */
  const SITE = {
    legalName: "",
    companyNumber: "",
    vatNumber: "",
    address: "",
    contactEmail: "",
    country: "England and Wales",
    governingLaw: "England and Wales",
    policiesUpdated: "September 2026",
  };

  const SITE_FIELDS = {
    legalName: "your registered company or trading name",
    companyNumber: "your company number",
    vatNumber: "your VAT number",
    address: "your registered address",
    contactEmail: "your contact email address",
  };

  const CONFIG = {
    shopName: "Notecase",
    locale: "en-GB",
    currency: "GBP",
    platformFeePct: 15,
    vatNote: "Prices include VAT on digital goods.",
    promos: { FRESHERS10: { pct: 10, label: "Freshers' week, 10% off" } },
  };

  const STORE_KEY = "notecase.v1";

  /* ---------------------------------------------------------------- utils */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const money = (pence) =>
    new Intl.NumberFormat(CONFIG.locale, { style: "currency", currency: CONFIG.currency }).format(pence / 100);
  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const initials = (name) =>
    String(name || "?").split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();

  function seeded(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return () => {
      h += 0x6d2b79f5;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------- persistence */

  /* Deliberately not stored: name, address, institution, or anything else
   * a download does not need. The email is asked for at each checkout and
   * not kept in the browser afterwards. */
  const blank = { cart: [], orders: [], listings: [], reviews: [], promo: null };

  function readStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? { ...blank, ...JSON.parse(raw) } : { ...blank };
    } catch {
      return { ...blank };
    }
  }

  function writeStore() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ cart: state.cart, orders: state.orders, listings: state.listings, reviews: state.reviews, promo: state.promo }),
      );
    } catch {
      /* private browsing or storage disabled — the session still works */
    }
  }

  const state = {
    ...readStore(),
    query: "",
    subject: "all",
    level: "all",
    sort: "newest",
    route: { name: "browse", id: null },
    overlay: null, // "cart" | "checkout" | null
    lastFocus: null,
  };

  /* ---------------------------------------------------------------- catalogue */

  const subjectById = new Map(SUBJECTS.map((s) => [s.id, s]));

  function loadCatalogue() {
    // Swap this for a fetch() against your own API when you have one.
    return SAMPLE_NOTES;
  }

  const allNotes = () => [...state.listings, ...loadCatalogue()];
  const noteById = (id) => allNotes().find((n) => n.id === id) || null;
  const subjectName = (id) => (subjectById.get(id) || {}).name || id;
  const tintOf = (id) => (subjectById.get(id) || {}).tint ?? 90;

  const ownedIds = () => new Set(state.orders.flatMap((o) => o.items));
  const owns = (id) => ownedIds().has(id);
  const inCart = (id) => state.cart.includes(id);
  const unitLabel = (n) => (n.cards ? `${n.cards} cards` : `${n.pages} pages`);

  /* Ratings are computed from reviews left by people who actually bought
   * the pack. Nothing is seeded, so a new shop honestly shows none. */
  const reviewsFor = (id) => state.reviews.filter((r) => r.noteId === id).sort((a, b) => b.at - a.at);
  function ratingFor(id) {
    const list = reviewsFor(id);
    if (!list.length) return { avg: 0, count: 0 };
    return { avg: list.reduce((s, r) => s + r.rating, 0) / list.length, count: list.length };
  }
  const hasReviewed = (id) => state.reviews.some((r) => r.noteId === id);

  function filtered() {
    const q = state.query.trim().toLowerCase();
    const list = allNotes().filter((n) => {
      if (state.subject !== "all" && n.subject !== state.subject) return false;
      if (state.level !== "all" && n.level !== state.level) return false;
      if (!q) return true;
      return [n.title, n.course, n.institution, subjectName(n.subject), n.level, n.summary, n.seller?.name]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    const by = {
      newest: null, // catalogue order: listings published here sit at the front
      rating: (a, b) => ratingFor(b.id).avg - ratingFor(a.id).avg,
      reviewed: (a, b) => ratingFor(b.id).count - ratingFor(a.id).count,
      "price-asc": (a, b) => a.price - b.price,
      "price-desc": (a, b) => b.price - a.price,
    };
    const cmp = by[state.sort];
    return cmp ? list.sort(cmp) : list;
  }

  /* -------------------------------------------------------------- cart maths */

  const cartNotes = () => state.cart.map(noteById).filter(Boolean);

  function totals() {
    const items = cartNotes();
    const subtotal = items.reduce((sum, n) => sum + n.price, 0);
    const promo = state.promo && CONFIG.promos[state.promo] ? CONFIG.promos[state.promo] : null;
    const discount = promo ? Math.round((subtotal * promo.pct) / 100) : 0;
    return { items, subtotal, discount, promo, total: subtotal - discount };
  }

  /* ------------------------------------------------------- business details */

  const missingSiteFields = () => Object.keys(SITE_FIELDS).filter((k) => !String(SITE[k] || "").trim());

  function siteValue(key) {
    const value = String(SITE[key] || "").trim();
    if (value) return esc(value);
    return `<span class="todo"><span class="sr-only">Placeholder — the site owner still has to add </span>${esc(SITE_FIELDS[key] || key)}</span>`;
  }

  function fillTokens(text) {
    const direct = {
      name: esc(CONFIG.shopName),
      country: esc(SITE.country),
      governingLaw: esc(SITE.governingLaw),
      feePct: String(CONFIG.platformFeePct),
    };
    return esc(text).replace(/\{\{(\w+)\}\}/g, (whole, key) =>
      key in direct ? direct[key] : key in SITE_FIELDS ? siteValue(key) : whole,
    );
  }

  /* ------------------------------------------------------------ capabilities */

  let downloads = null;
  if (typeof window !== "undefined" && window.claude && typeof window.claude.use === "function") {
    window.claude
      .use("downloads")
      .then((cap) => {
        downloads = cap;
      })
      .catch(() => {});
  }

  function packFor(note, order) {
    const lines = [
      `# ${note.title}`,
      "",
      `${note.course} · ${note.institution} · ${note.level}`,
      `${unitLabel(note)} · ${note.format} · updated ${note.updated}`,
      `Written by ${note.seller.name}`,
      "",
      `Order ${order.ref} · ${new Date(order.date).toLocaleDateString(CONFIG.locale)}`,
      "Personal study licence: yours to read, print and annotate. Not for resale or redistribution.",
      "",
      "## Summary",
      note.summary,
      "",
      "## Contents",
      ...note.contents.map(([label, page], i) => `${String(i + 1).padStart(2, "0")}. ${label}${page ? `  ·  p.${page}` : ""}`),
      "",
      "## What's included",
      ...note.includes.map((line) => `- ${line}`),
      "",
      "---",
      `Downloaded from the ${CONFIG.shopName} demo storefront. This file is the listing's`,
      "contents sheet, not the notes themselves — connect your own file storage to",
      "deliver the real PDF or deck to buyers.",
    ];
    return lines.join("\n");
  }

  async function deliver(note, order) {
    const filename = `${note.id}-${note.course.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
    const body = packFor(note, order);
    if (downloads) {
      try {
        await downloads.save({ filename, data: body });
        toast(`Saved ${filename}`);
      } catch (err) {
        if (err && err.code === "declined") return;
        toast("That download could not be saved. Try again in a moment.");
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([body], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`Downloading ${filename}`);
  }

  /* ------------------------------------------------------------------ chrome */

  function mountChrome() {
    document.documentElement.lang = document.documentElement.lang || "en";
    let root = document.getElementById("app");
    if (!root) {
      root = document.createElement("div");
      root.id = "app";
      document.body.appendChild(root);
    }
    root.innerHTML = `
      <a class="skiplink" href="#view">Skip to main content</a>
      <header class="topbar">
        <div class="shell topbar__inner">
          <a class="brand" href="#/" data-nav>
            <span class="brand__dot" aria-hidden="true"></span>
            <span class="brand__word">${esc(CONFIG.shopName)}</span>
          </a>
          <div class="searchbar">
            <label class="sr-only" for="q">Search notes</label>
            <input id="q" type="search" placeholder="Search by module, course code or topic" autocomplete="off">
          </div>
          <nav class="navlinks" aria-label="Main">
            <a class="navlink" href="#/" data-nav data-route="browse">Browse</a>
            <a class="navlink" href="#/sell" data-nav data-route="sell">Sell notes</a>
            <a class="navlink" href="#/library" data-nav data-route="library">Library</a>
            <a class="navlink" href="#/dashboard" data-nav data-route="dashboard">Sales</a>
            <button class="btn btn--sm cartbtn" data-action="open-cart" type="button" id="cart-button" aria-expanded="false">
              Cart <span class="cartbtn__count" id="cart-count" aria-hidden="true">0</span>
              <span class="sr-only" id="cart-count-text">, empty</span>
            </button>
          </nav>
        </div>
      </header>
      <main id="view" tabindex="-1"></main>
      ${footerMarkup()}
      <div id="overlay"></div>
      <div id="toast-host" role="status" aria-live="polite"></div>`;

    measureChrome();
    window.addEventListener("resize", measureChrome);

    $("#q").addEventListener("input", (e) => {
      state.query = e.target.value;
      if (state.route.name !== "browse") location.hash = "#/";
      else renderView();
    });
  }

  /* Sticky offsets follow the real height of the bar, which changes when the
   * nav wraps on a narrow screen. */
  function measureChrome() {
    const bar = $(".topbar");
    if (bar) document.documentElement.style.setProperty("--topbar-h", `${bar.offsetHeight}px`);
  }

  function footerMarkup() {
    return `
      <footer class="footer">
        <div class="shell footer__grid">
          <div>
            <p class="footer__brand">${esc(CONFIG.shopName)}</p>
            <p>A marketplace for student-written study notes. Sellers keep ${100 - CONFIG.platformFeePct}% of each sale.</p>
            <p class="footer__legal">
              ${siteValue("legalName")} · Company number ${siteValue("companyNumber")} · VAT ${siteValue("vatNumber")}<br>
              ${siteValue("address")}<br>
              ${siteValue("contactEmail")}
            </p>
          </div>
          <nav aria-label="Policies">
            <p class="footer__head">Policies</p>
            <ul class="footer__links">
              ${POLICY_ORDER.map((slug) => `<li><a href="#/policy/${slug}" data-nav>${esc(POLICIES[slug].nav)}</a></li>`).join("")}
            </ul>
          </nav>
          <div>
            <p class="footer__head">Good to know</p>
            <ul class="footer__notes">
              <li>No cookies, no analytics, no third-party requests.</li>
              <li>Notes are a study aid. Don't submit anyone else's work as your own.</li>
              <li>Sample catalogue; payments are not connected.</li>
            </ul>
          </div>
        </div>
      </footer>`;
  }

  function syncChrome() {
    const count = state.cart.length;
    const badge = $("#cart-count");
    if (badge) badge.textContent = String(count);
    const badgeText = $("#cart-count-text");
    if (badgeText) badgeText.textContent = count === 0 ? ", empty" : `, ${count} ${count === 1 ? "pack" : "packs"}`;
    const cartBtn = $("#cart-button");
    if (cartBtn) cartBtn.setAttribute("aria-expanded", String(state.overlay === "cart"));
    $$("[data-route]").forEach((el) => {
      if (el.dataset.route === state.route.name) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
  }

  /* ------------------------------------------------------------------ pieces */

  const coverMarkup = (note) => `
    <span class="card__margin" aria-hidden="true"></span>
    <span class="card__code mono">${esc(note.course)}</span>
    <span class="card__inst">${esc(note.institution)}</span>
    <span class="card__fmt">${esc(note.format)} · ${esc(unitLabel(note))}</span>
    ${
      note.seller?.grade
        ? `<span class="card__grade"><span class="sr-only">Result the seller says they earned: </span>${esc(note.seller.grade)}</span>`
        : ""
    }`;

  function ratingMarkup(note) {
    const { avg, count } = ratingFor(note.id);
    if (!count) return `<span class="rating rating--none">No reviews yet</span>`;
    return `<span class="rating"><span class="rating__star" aria-hidden="true">★</span>${avg.toFixed(1)}<span class="rating__count">from ${count} ${count === 1 ? "review" : "reviews"}</span></span>`;
  }

  function cardMarkup(note) {
    return `
      <article class="card" style="--tint:${tintOf(note.subject)}">
        <button class="card__cover" type="button" data-action="open-note" data-id="${esc(note.id)}" aria-label="View listing: ${esc(note.title)}">
          ${coverMarkup(note)}
        </button>
        <div class="card__body">
          <div class="card__tags">
            <span class="tag">${esc(subjectName(note.subject))}</span>
            <span class="tag">${esc(note.level)}</span>
            ${note.mine ? '<span class="tag tag--mine">Your listing</span>' : ""}
          </div>
          <h3 class="card__title"><button type="button" data-action="open-note" data-id="${esc(note.id)}">${esc(note.title)}</button></h3>
          <p class="card__meta">
            <span>${esc(note.course)}</span><span>${esc(unitLabel(note))}</span><span>${esc(note.format)}</span>
          </p>
          ${ratingMarkup(note)}
          <div class="card__foot">
            <p class="price">${money(note.price)}</p>
            ${cartButton(note, "btn--sm")}
          </div>
        </div>
      </article>`;
  }

  function cartButton(note, extra = "") {
    if (owns(note.id)) return `<span class="owned"><span aria-hidden="true">✓</span> In library</span>`;
    if (inCart(note.id))
      return `<button class="btn ${extra} btn--ghost" type="button" data-action="open-cart">In cart — view</button>`;
    return `<button class="btn ${extra} btn--primary" type="button" data-action="add" data-id="${esc(note.id)}" aria-label="Add ${esc(note.title)} to cart">Add to cart</button>`;
  }

  /* ------------------------------------------------------------- browse view */

  function browseView() {
    const notes = filtered();
    const total = allNotes().length;
    const subjectsUsed = new Set(allNotes().map((n) => n.subject)).size;
    const levelsUsed = new Set(allNotes().map((n) => n.level)).size;

    const chips = [{ id: "all", name: "All subjects" }, ...SUBJECTS]
      .map(
        (s) =>
          `<button class="chip" type="button" data-action="subject" data-value="${esc(s.id)}" aria-pressed="${state.subject === s.id}">${esc(s.name)}</button>`,
      )
      .join("");

    return `
      <section class="band">
        <div class="shell band__inner">
          <div>
            <p class="eyebrow">Student-written study notes</p>
            <h1>Sell the notes you <span class="mark">already wrote</span>.</h1>
            <p class="band__lede">A storefront for lecture notes, essay banks, case grids and flashcard decks. Sellers keep ${100 - CONFIG.platformFeePct}% of every sale; buyers get the file the moment they check out.</p>
            <div class="band__actions">
              <a class="btn btn--primary" href="#/sell" data-nav>List your notes</a>
              <a class="btn btn--ghost" href="#/library" data-nav>Go to your library</a>
            </div>
          </div>
          <div>
            <div class="stats">
              <div class="stat"><p class="stat__num">${total}</p><p class="stat__label">Note packs listed</p></div>
              <div class="stat"><p class="stat__num">${subjectsUsed}</p><p class="stat__label">Subjects covered</p></div>
              <div class="stat"><p class="stat__num">${levelsUsed}</p><p class="stat__label">Levels covered</p></div>
            </div>
            <div class="notice">
              <span aria-hidden="true" class="mono">i</span>
              <p><b>Sample catalogue.</b> These listings are examples so the shop opens in a working state. Payments aren't connected — checkout records the order and unlocks the download.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="filters" aria-label="Filter and sort">
        <div class="shell filters__inner">
          <div class="chips" role="group" aria-label="Filter by subject">${chips}</div>
          <div class="filters__right">
            <label class="sr-only" for="level">Filter by level</label>
            <select id="level" data-action="level">
              <option value="all"${state.level === "all" ? " selected" : ""}>Any level</option>
              ${LEVELS.map((l) => `<option value="${esc(l)}"${state.level === l ? " selected" : ""}>${esc(l)}</option>`).join("")}
            </select>
            <label class="sr-only" for="sort">Sort listings</label>
            <select id="sort" data-action="sort">
              <option value="newest"${state.sort === "newest" ? " selected" : ""}>Newest first</option>
              <option value="rating"${state.sort === "rating" ? " selected" : ""}>Highest rated</option>
              <option value="reviewed"${state.sort === "reviewed" ? " selected" : ""}>Most reviewed</option>
              <option value="price-asc"${state.sort === "price-asc" ? " selected" : ""}>Price: low to high</option>
              <option value="price-desc"${state.sort === "price-desc" ? " selected" : ""}>Price: high to low</option>
            </select>
          </div>
        </div>
      </section>

      <div class="shell">
        <div class="resultline">
          <h2>${state.subject === "all" ? "All notes" : esc(subjectName(state.subject))}</h2>
          <p class="resultline__count">${notes.length} of ${total}${state.query ? ` matching “${esc(state.query)}”` : ""}</p>
        </div>
        <div class="grid">
          ${
            notes.length
              ? notes.map(cardMarkup).join("")
              : `<div class="empty">
                   <h3>Nothing matches that yet</h3>
                   <p>Try a broader subject, or clear the search. If you wrote these notes, list them yourself.</p>
                   <p class="empty__action"><a class="btn btn--primary" href="#/sell" data-nav>List your notes</a></p>
                 </div>`
          }
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------- detail view */

  function pagePreview(note) {
    const rand = seeded(note.id);
    return [1, 2, 3]
      .map((n) => {
        const locked = n === 3;
        const lines = Array.from({ length: 11 }, (_, i) => {
          const width = 45 + Math.floor(rand() * 52);
          const cls = i === 0 ? "page__line page__line--head" : rand() > 0.86 ? "page__line page__line--mark" : "page__line";
          return `<span class="${cls}" style="width:${i === 0 ? 62 : width}%"></span>`;
        }).join("");
        return `
          <div class="page${locked ? " page--locked" : ""}">
            <span class="page__margin" aria-hidden="true"></span>
            <div class="page__lines" aria-hidden="true">${lines}</div>
            ${locked ? `<div class="page__lock"><span>Locked</span><span>Unlocks at checkout</span></div>` : ""}
            <span class="page__num"><span class="sr-only">Sample page </span>${n}</span>
          </div>`;
      })
      .join("");
  }

  function reviewSection(note) {
    const list = reviewsFor(note.id);
    const { avg, count } = ratingFor(note.id);
    const canReview = owns(note.id) && !hasReviewed(note.id);

    const form = canReview
      ? `<form class="reviewform" id="review-form" novalidate>
           <h4>Review this pack</h4>
           <p class="reviewform__note">You bought this one, so your review will be marked as a verified purchase.</p>
           <fieldset class="stars">
             <legend>Your rating</legend>
             ${[1, 2, 3, 4, 5]
               .map(
                 (n) => `<label class="star"><input type="radio" name="rating" value="${n}" required><span>${n}<span class="sr-only"> out of 5</span></span></label>`,
               )
               .join("")}
           </fieldset>
           <div class="field">
             <label for="review-text">What should the next buyer know?</label>
             <textarea id="review-text" name="text" rows="3" required aria-describedby="review-error"></textarea>
           </div>
           <p class="formerror" id="review-error" role="alert" hidden></p>
           <button class="btn btn--primary" type="submit" data-id="${esc(note.id)}">Publish review</button>
         </form>`
      : owns(note.id)
        ? `<p class="reviews__meta">You've reviewed this pack. Thanks.</p>`
        : `<p class="reviews__meta">Only people who bought this pack can review it.</p>`;

    return `
      <section class="section" aria-labelledby="reviews-head">
        <h3 id="reviews-head">Reviews ${count ? `<span class="section__aside">${avg.toFixed(1)} average from ${count} verified ${count === 1 ? "purchase" : "purchases"}</span>` : ""}</h3>
        ${
          list.length
            ? `<div class="reviews">
                 ${list
                   .map(
                     (r) => `
                   <article class="review">
                     <div class="avatar" aria-hidden="true">${esc(initials(r.by))}</div>
                     <div>
                       <div class="review__head">
                         <span class="review__name">${esc(r.by)}</span>
                         <span class="rating"><span class="rating__star" aria-hidden="true">★</span>${r.rating}<span class="sr-only"> out of 5</span></span>
                         <span class="verified"><span aria-hidden="true">✓</span> Verified purchase</span>
                         <span class="review__when">${new Date(r.at).toLocaleDateString(CONFIG.locale)}</span>
                       </div>
                       <p>${esc(r.text)}</p>
                     </div>
                   </article>`,
                   )
                   .join("")}
               </div>`
            : `<p class="reviews__empty">No reviews yet. Reviews here are only ever written by people who bought the pack through this site — none are seeded, bought or written by us.</p>`
        }
        ${form}
      </section>`;
  }

  function detailView(note) {
    return `
      <div class="shell detail">
        <button class="backlink" type="button" data-action="back"><span aria-hidden="true">←</span> Back to all notes</button>
        <div class="detail__grid">
          <div>
            <div class="card__tags detail__tags">
              <span class="tag">${esc(subjectName(note.subject))}</span>
              <span class="tag">${esc(note.level)}</span>
              ${note.mine ? '<span class="tag tag--mine">Your listing</span>' : ""}
            </div>
            <h1>${esc(note.title)}</h1>
            <p class="detail__sub">
              <span>${esc(note.course)}</span><span>${esc(note.institution)}</span>
              <span>${esc(unitLabel(note))}</span><span>${esc(note.format)}</span>
              <span>Updated ${esc(note.updated)}</span>
            </p>
            <p class="detail__summary">${esc(note.summary)}</p>

            <section class="section" aria-labelledby="preview-head">
              <h3 id="preview-head">Inside the pack</h3>
              <div class="pages">${pagePreview(note)}</div>
              <p class="section__foot">Preview shows sample pages drawn from the pack's layout. The full ${esc(unitLabel(note))} unlock at checkout.</p>
            </section>

            <section class="section" aria-labelledby="contents-head">
              <h3 id="contents-head">Contents <span class="section__aside">${note.contents.length} sections</span></h3>
              <ul class="contents">
                ${note.contents
                  .map(([label, page]) => `<li><span>${esc(label)}</span><span class="pageno">${page ? `p.${page}` : ""}</span></li>`)
                  .join("")}
              </ul>
            </section>

            <section class="section" aria-labelledby="includes-head">
              <h3 id="includes-head">What you get</h3>
              <ul class="includes">${note.includes.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
            </section>

            ${reviewSection(note)}
          </div>

          <aside class="buypanel" aria-label="Buy this pack">
            <div class="buypanel__top">
              <div class="buypanel__price">
                <p class="price">${money(note.price)}</p>
                ${ratingMarkup(note)}
              </div>
              ${
                owns(note.id)
                  ? `<button class="btn btn--primary btn--wide" type="button" data-action="download" data-id="${esc(note.id)}" aria-label="Download ${esc(note.title)} again">Download again</button>
                     <p class="buypanel__owned"><span aria-hidden="true">✓</span> Already in your library</p>`
                  : inCart(note.id)
                    ? `<button class="btn btn--wide" type="button" data-action="open-cart">Go to cart</button>
                       <button class="btn btn--ghost btn--wide" type="button" data-action="remove" data-id="${esc(note.id)}" aria-label="Remove ${esc(note.title)} from cart">Remove from cart</button>`
                    : `<button class="btn btn--primary btn--wide" type="button" data-action="add" data-id="${esc(note.id)}" aria-label="Add ${esc(note.title)} to cart">Add to cart</button>
                       <button class="btn btn--ghost btn--wide" type="button" data-action="buy-now" data-id="${esc(note.id)}">Buy now — go straight to checkout</button>`
              }
            </div>
            <dl class="buypanel__rows">
              <div class="buyrow"><dt>Format</dt><dd>${esc(note.format)}</dd></div>
              <div class="buyrow"><dt>${note.cards ? "Cards" : "Pages"}</dt><dd>${note.cards || note.pages}</dd></div>
              <div class="buyrow"><dt>Last updated</dt><dd>${esc(note.updated)}</dd></div>
              <div class="buyrow"><dt>Delivery</dt><dd>Instant download</dd></div>
              ${
                note.seller.grade
                  ? `<div class="buyrow"><dt>Seller's stated result</dt><dd>${esc(note.seller.grade)} <span class="unverified">unverified</span></dd></div>`
                  : ""
              }
            </dl>
            <p class="licence"><b>Personal study licence.</b> Yours to read, print and annotate for your own study. Reselling or reposting the file isn't allowed. <a href="#/policy/terms" data-nav>Full terms</a>.</p>
            <div class="seller">
              <div class="avatar" aria-hidden="true">${esc(initials(note.seller.name))}</div>
              <div>
                <p class="seller__name">${esc(note.seller.name)}</p>
                <p class="seller__meta">Selling here since ${esc(note.seller.since || new Date().getFullYear())}</p>
              </div>
            </div>
          </aside>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------ library view */

  function libraryView() {
    const orders = [...state.orders].reverse();
    const notes = orders.flatMap((o) => o.items.map((id) => ({ note: noteById(id), order: o }))).filter((x) => x.note);

    return `
      <div class="shell">
        <div class="page-head">
          <p class="eyebrow">Your purchases</p>
          <h1>Library</h1>
          <p>Everything you've bought, ready to download again whenever you need it.</p>
        </div>
        <div class="stack">
          ${
            notes.length
              ? notes
                  .map(
                    ({ note, order }) => `
              <article class="libitem" style="--tint:${tintOf(note.subject)}">
                <div class="lineitem__thumb" aria-hidden="true"></div>
                <div>
                  <h2 class="libitem__title">${esc(note.title)}</h2>
                  <p class="libitem__meta">${esc(note.course)} · ${esc(unitLabel(note))} · ${esc(note.format)} · order ${esc(order.ref)}</p>
                </div>
                <div class="libitem__actions">
                  <button class="btn btn--sm btn--ghost" type="button" data-action="open-note" data-id="${esc(note.id)}" aria-label="View listing: ${esc(note.title)}">View listing</button>
                  <button class="btn btn--sm btn--primary" type="button" data-action="download" data-id="${esc(note.id)}" aria-label="Download ${esc(note.title)}">Download</button>
                </div>
              </article>`,
                  )
                  .join("")
              : `<div class="empty">
                   <h3>Nothing here yet</h3>
                   <p>Notes you buy land here straight after checkout.</p>
                   <p class="empty__action"><a class="btn btn--primary" href="#/" data-nav>Browse notes</a></p>
                 </div>`
          }
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------- sell view */

  const draft = {
    title: "",
    subject: "biology",
    level: "Undergraduate",
    course: "",
    institution: "",
    pages: "",
    format: "Typed PDF",
    price: "7.50",
    grade: "",
    summary: "",
    contents: "",
  };

  function draftNote() {
    return {
      id: "draft",
      title: draft.title || "Your note pack title",
      subject: draft.subject,
      course: draft.course || "COURSE 000",
      institution: draft.institution || "Your institution",
      level: draft.level,
      pages: Number(draft.pages) || 0,
      format: draft.format,
      price: Math.max(0, Math.round(parseFloat(draft.price || "0") * 100)),
      updated: new Date().toLocaleDateString(CONFIG.locale, { month: "short", year: "numeric" }),
      seller: { name: "You", grade: draft.grade },
      summary: draft.summary,
      contents: [],
      includes: [],
      mine: true,
    };
  }

  function sellView() {
    const preview = draftNote();
    const fee = Math.round((preview.price * CONFIG.platformFeePct) / 100);

    return `
      <div class="shell">
        <div class="page-head">
          <p class="eyebrow">Seller</p>
          <h1>List your notes</h1>
          <p>Describe the pack the way a buyer decides: which module it covers, how long it is, and what result it earned. Listings go live the moment you publish.</p>
        </div>
        <form class="sell__grid" id="sell-form" novalidate>
          <div class="panel">
            <h2>Listing details</h2>
            <div class="formgrid">
              <div class="field">
                <label for="f-title">Title</label>
                <input id="f-title" name="title" value="${esc(draft.title)}" placeholder="Reaction Mechanisms, Fully Drawn" required aria-describedby="f-title-hint">
                <span class="hint" id="f-title-hint">Say what the notes cover, not that they are notes.</span>
              </div>
              <div class="formgrid formgrid--2">
                <div class="field">
                  <label for="f-subject">Subject</label>
                  <select id="f-subject" name="subject">
                    ${SUBJECTS.map((s) => `<option value="${esc(s.id)}"${draft.subject === s.id ? " selected" : ""}>${esc(s.name)}</option>`).join("")}
                  </select>
                </div>
                <div class="field">
                  <label for="f-level">Level</label>
                  <select id="f-level" name="level">
                    ${LEVELS.map((l) => `<option value="${esc(l)}"${draft.level === l ? " selected" : ""}>${esc(l)}</option>`).join("")}
                  </select>
                </div>
              </div>
              <div class="formgrid formgrid--2">
                <div class="field">
                  <label for="f-course">Course code</label>
                  <input id="f-course" name="course" value="${esc(draft.course)}" placeholder="CHEM20200 or AQA 7402/3">
                </div>
                <div class="field">
                  <label for="f-institution">Institution or exam board</label>
                  <input id="f-institution" name="institution" value="${esc(draft.institution)}" placeholder="University of Bristol">
                </div>
              </div>
              <div class="formgrid formgrid--2">
                <div class="field">
                  <label for="f-pages">Pages or cards</label>
                  <input id="f-pages" name="pages" inputmode="numeric" value="${esc(draft.pages)}" placeholder="96">
                </div>
                <div class="field">
                  <label for="f-format">Format</label>
                  <select id="f-format" name="format">
                    ${["Typed PDF", "Handwritten scan", "Anki deck", "PDF + Anki", "PDF + code", "PDF + dataset", "Notion export"]
                      .map((f) => `<option value="${esc(f)}"${draft.format === f ? " selected" : ""}>${esc(f)}</option>`)
                      .join("")}
                  </select>
                </div>
              </div>
              <div class="formgrid formgrid--2">
                <div class="field">
                  <label for="f-price">Price in pounds</label>
                  <input id="f-price" name="price" inputmode="decimal" value="${esc(draft.price)}" placeholder="7.50">
                </div>
                <div class="field">
                  <label for="f-grade">Result you earned</label>
                  <input id="f-grade" name="grade" value="${esc(draft.grade)}" placeholder="First · 82%" aria-describedby="f-grade-hint">
                  <span class="hint" id="f-grade-hint">Optional. Shown to buyers as your own unverified statement.</span>
                </div>
              </div>
              <div class="field">
                <label for="f-summary">Summary</label>
                <textarea id="f-summary" name="summary" placeholder="Two or three sentences on what's inside and who it's for.">${esc(draft.summary)}</textarea>
              </div>
              <div class="field">
                <label for="f-contents">Contents, one per line</label>
                <textarea id="f-contents" name="contents" placeholder="Arrow-pushing conventions&#10;SN1 vs SN2 decision tree&#10;40 worked past-paper mechanisms" aria-describedby="f-contents-hint">${esc(draft.contents)}</textarea>
                <span class="hint" id="f-contents-hint">Buyers scan this before anything else.</span>
              </div>
              <label class="consent">
                <input type="checkbox" name="ownership" id="f-ownership" required>
                <span>I wrote these notes myself and I own the copyright in them. They contain no lecture slides, textbook material, past papers or anyone else's work, and they are not an assignment written for someone to submit.</span>
              </label>
              <p class="formerror" id="sell-error" role="alert" hidden></p>
              <button class="btn btn--primary btn--wide" type="submit">Publish listing</button>
            </div>
          </div>

          <div class="preview-sticky">
            <div>
              <p class="eyebrow preview-label">Live preview</p>
              <div class="grid preview-grid">${cardMarkup(preview)}</div>
            </div>
            <div class="panel">
              <h2 class="panel__sub">Your payout</h2>
              <div class="payout">
                <div class="payout__row"><span>Buyer pays</span><span>${money(preview.price)}</span></div>
                <div class="payout__row"><span>${esc(CONFIG.shopName)} fee (${CONFIG.platformFeePct}%)</span><span>−${money(fee)}</span></div>
                <div class="payout__row payout__row--sum"><span>You keep</span><span>${money(preview.price - fee)}</span></div>
              </div>
              <p class="panel__foot">${esc(CONFIG.vatNote)} You are responsible for tax on what you earn.</p>
            </div>
            <div class="notice notice--flush">
              <span aria-hidden="true" class="mono">i</span>
              <p>Only list work you wrote yourself. Uploading a lecturer's slides or a textbook chapter is copyright infringement — see the <a href="#/policy/integrity" data-nav>copyright policy</a>.</p>
            </div>
          </div>
        </form>
      </div>`;
  }

  /* ----------------------------------------------------------- sales overview */

  function dashboardView() {
    const mine = state.listings;
    const mineIds = new Set(mine.map((n) => n.id));
    const sold = state.orders.flatMap((o) => o.items.filter((id) => mineIds.has(id)).map((id) => ({ id, order: o })));
    const gross = sold.reduce((sum, s) => sum + (noteById(s.id)?.price || 0), 0);
    const fee = Math.round((gross * CONFIG.platformFeePct) / 100);

    return `
      <div class="shell">
        <div class="page-head">
          <p class="eyebrow">Seller</p>
          <h1>Your sales</h1>
          <p>Everything you've listed, and what it has earned. Figures cover orders placed in this browser.</p>
        </div>
        <div class="salesgrid">
          <div class="tile"><p class="tile__num">${mine.length}</p><p class="tile__label">Listings live</p></div>
          <div class="tile"><p class="tile__num">${sold.length}</p><p class="tile__label">Copies sold</p></div>
          <div class="tile"><p class="tile__num">${money(gross)}</p><p class="tile__label">Gross sales</p></div>
          <div class="tile"><p class="tile__num">${money(gross - fee)}</p><p class="tile__label">Your earnings</p></div>
        </div>
        <div class="stack">
          ${
            mine.length
              ? `<div class="panel panel--flush">
                   <div class="tablewrap">
                     <table class="table">
                       <caption class="sr-only">Your listings and their sales</caption>
                       <thead><tr><th scope="col">Listing</th><th scope="col">Level</th><th scope="col">Price</th><th scope="col">Sold</th><th scope="col">Earned</th></tr></thead>
                       <tbody>
                         ${mine
                           .map((n) => {
                             const copies = sold.filter((s) => s.id === n.id).length;
                             const earned = Math.round(copies * n.price * (1 - CONFIG.platformFeePct / 100));
                             return `<tr>
                               <td><button class="linkbtn linkbtn--strong" type="button" data-action="open-note" data-id="${esc(n.id)}">${esc(n.title)}</button><br><span class="mono cellsub">${esc(n.course)}</span></td>
                               <td>${esc(n.level)}</td>
                               <td>${money(n.price)}</td>
                               <td>${copies}</td>
                               <td>${money(earned)}</td>
                             </tr>`;
                           })
                           .join("")}
                       </tbody>
                     </table>
                   </div>
                 </div>`
              : `<div class="empty">
                   <h3>You haven't listed anything yet</h3>
                   <p>Your first listing takes about two minutes.</p>
                   <p class="empty__action"><a class="btn btn--primary" href="#/sell" data-nav>List your notes</a></p>
                 </div>`
          }
        </div>
      </div>`;
  }

  /* -------------------------------------------------------------- policy view */

  function policyView(slug) {
    const doc = POLICIES[slug];
    if (!doc) return notFoundView("That policy page doesn't exist.");
    const missing = missingSiteFields();

    const body = doc.blocks
      .map((block) => {
        const parts = block.body
          .map((item) => (typeof item === "string" ? `<p>${fillTokens(item)}</p>` : `<ul class="prose__list">${item.list.map((li) => `<li>${fillTokens(li)}</li>`).join("")}</ul>`))
          .join("");
        const action =
          block.action === "clear-data"
            ? `<p class="prose__action"><button class="btn btn--ghost" type="button" data-action="clear-data">Delete everything stored on this device</button></p>`
            : "";
        return `<section class="prose__section"><h2>${fillTokens(block.h)}</h2>${parts}${action}</section>`;
      })
      .join("");

    return `
      <div class="shell">
        <div class="page-head">
          <p class="eyebrow">Policies</p>
          <h1>${esc(doc.title)}</h1>
          <p>${fillTokens(doc.lede)}</p>
          <p class="page-head__meta">Last updated ${esc(SITE.policiesUpdated)}</p>
        </div>
        <div class="policy__grid">
          <nav class="policy__nav" aria-label="Policy pages">
            <ul>
              ${POLICY_ORDER.map(
                (s) =>
                  `<li><a href="#/policy/${s}" data-nav${s === slug ? ' aria-current="page"' : ""}>${esc(POLICIES[s].nav)}</a></li>`,
              ).join("")}
            </ul>
          </nav>
          <article class="prose">
            ${
              missing.length
                ? `<div class="setup" role="note">
                     <p class="setup__head">Before this page is publishable</p>
                     <p>${missing.length} required business ${missing.length === 1 ? "detail is" : "details are"} still blank. Fill in <code>SITE</code> at the top of <code>app.js</code>:</p>
                     <ul>${missing.map((k) => `<li><code>${esc(k)}</code> — ${esc(SITE_FIELDS[k])}</li>`).join("")}</ul>
                     <p>Nothing here is legal advice. Have a solicitor read these pages before you trade.</p>
                   </div>`
                : ""
            }
            ${body}
          </article>
        </div>
      </div>`;
  }

  const notFoundView = (message) => `
    <div class="shell">
      <div class="empty empty--page">
        <h1>Not found</h1>
        <p>${esc(message)}</p>
        <p class="empty__action"><a class="btn btn--primary" href="#/" data-nav>Browse notes</a></p>
      </div>
    </div>`;

  /* --------------------------------------------------------------- overlays */

  function cartMarkup() {
    const { items, subtotal, discount, promo, total } = totals();
    return `
      <div class="scrim" data-action="close-overlay"></div>
      <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
        <header class="drawer__head">
          <h2 id="cart-title">Cart <span class="drawer__count">${items.length} ${items.length === 1 ? "pack" : "packs"}</span></h2>
          <button class="iconbtn" type="button" data-action="close-overlay" aria-label="Close cart">✕</button>
        </header>
        <div class="drawer__body">
          ${
            items.length
              ? items
                  .map(
                    (n) => `
            <div class="lineitem" style="--tint:${tintOf(n.subject)}">
              <div class="lineitem__thumb" aria-hidden="true"></div>
              <div>
                <p class="lineitem__title">${esc(n.title)}</p>
                <p class="lineitem__meta">${esc(n.course)} · ${esc(unitLabel(n))}</p>
              </div>
              <div class="lineitem__right">
                <span class="price price--sm">${money(n.price)}</span>
                <button class="linkbtn" type="button" data-action="remove" data-id="${esc(n.id)}" aria-label="Remove ${esc(n.title)} from cart">Remove</button>
              </div>
            </div>`,
                  )
                  .join("")
              : `<p class="drawer__empty">Your cart is empty. Add a note pack and it'll show up here.</p>`
          }
          ${
            items.length
              ? `<div class="field promo">
                   <label for="promo">Discount code</label>
                   <div class="promo__row">
                     <input id="promo" value="${esc(state.promo || "")}" placeholder="FRESHERS10">
                     <button class="btn btn--ghost btn--sm" type="button" data-action="apply-promo">Apply code</button>
                   </div>
                   ${promo ? `<span class="hint hint--good">${esc(promo.label)} applied</span>` : ""}
                 </div>`
              : ""
          }
        </div>
        ${
          items.length
            ? `<div class="drawer__foot">
                 <div class="totals">
                   <div class="totals__row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
                   ${discount ? `<div class="totals__row totals__row--good"><span>Discount</span><span>−${money(discount)}</span></div>` : ""}
                   <div class="totals__row"><span>VAT</span><span>Included</span></div>
                   <div class="totals__row totals__row--sum"><span>Total</span><span>${money(total)}</span></div>
                 </div>
                 <button class="btn btn--primary btn--wide" type="button" data-action="checkout">Go to checkout</button>
                 <button class="btn btn--ghost btn--wide" type="button" data-action="close-overlay">Keep browsing</button>
               </div>`
            : ""
        }
      </aside>`;
  }

  function checkoutMarkup() {
    const { items, subtotal, discount, total } = totals();
    return `
      <div class="scrim" data-action="close-overlay"></div>
      <div class="modal">
        <div class="modal__card" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
          <header class="modal__head">
            <div>
              <p class="eyebrow">Step 2 of 2</p>
              <h2 id="checkout-title">Checkout</h2>
            </div>
            <button class="iconbtn" type="button" data-action="close-overlay" aria-label="Close checkout">✕</button>
          </header>
          <form class="modal__body" id="checkout-form" novalidate>
            <div class="demoflag">
              <span class="demoflag__mark" aria-hidden="true">!</span>
              <p><b>Demo checkout — no money moves.</b> There are no card fields here on purpose. Connect Stripe, Paddle or Lemon Squeezy before selling to real buyers; the README shows where the hook goes.</p>
            </div>
            <div class="field">
              <label for="c-email">Email for the download</label>
              <input id="c-email" name="email" type="email" autocomplete="email" placeholder="alex@university.ac.uk" required aria-describedby="c-email-hint checkout-error">
              <span class="hint" id="c-email-hint">Used to send the file and the receipt, and nothing else. We don't ask for your name or address because a download doesn't need them.</span>
            </div>
            <div class="receipt">
              ${items.map((n) => `<div class="receipt__row"><span>${esc(n.title)}</span><span>${money(n.price)}</span></div>`).join("")}
              ${discount ? `<div class="receipt__row receipt__row--good"><span>Discount</span><span>−${money(discount)}</span></div>` : ""}
              <div class="receipt__row receipt__row--sum"><span>Total</span><span>${money(total)}</span></div>
              <p class="receipt__note">${esc(CONFIG.vatNote)} Subtotal ${money(subtotal)}.</p>
            </div>
            <label class="consent">
              <input type="checkbox" name="terms" id="c-terms" required>
              <span>I agree to the <a href="#/policy/terms" data-nav>terms and conditions</a> and the <a href="#/policy/privacy" data-nav>privacy policy</a>.</span>
            </label>
            <label class="consent">
              <input type="checkbox" name="immediate" id="c-immediate" required>
              <span>I want the download straight away, and I understand that I lose my 14-day right to cancel once it starts. <a href="#/policy/refunds" data-nav>Refund policy</a>.</span>
            </label>
            <p class="formerror" id="checkout-error" role="alert" hidden></p>
          </form>
          <div class="modal__foot">
            <button class="btn btn--primary btn--wide" type="submit" form="checkout-form">Place demo order · ${money(total)}</button>
            <button class="btn btn--ghost btn--wide" type="button" data-action="open-cart">Back to cart</button>
          </div>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------- focus management */

  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function renderOverlay() {
    const host = $("#overlay");
    if (!host) return;
    const opening = Boolean(state.overlay);
    if (opening && !host.dataset.open) state.lastFocus = document.activeElement;

    host.innerHTML = state.overlay === "cart" ? cartMarkup() : state.overlay === "checkout" ? checkoutMarkup() : "";
    document.body.classList.toggle("is-locked", opening);

    if (opening) {
      const justOpened = host.dataset.open !== state.overlay;
      host.dataset.open = state.overlay;
      const form = $("#checkout-form");
      if (form) form.addEventListener("submit", submitCheckout);
      // Move focus in only when the dialog is new; a re-render behind an open
      // dialog (removing a line item, say) must not yank focus back to the top.
      if (justOpened) {
        const first = $(FOCUSABLE, $(".drawer, .modal__card", host) || host);
        if (first) first.focus();
      }
    } else if (host.dataset.open) {
      delete host.dataset.open;
      const back = state.lastFocus;
      state.lastFocus = null;
      if (back && document.contains(back)) back.focus();
    }
    syncChrome();
  }

  function keepFocusInside(event) {
    if (event.key !== "Tab" || !state.overlay) return;
    const dialog = $(".drawer, .modal__card");
    if (!dialog) return;
    const items = $$(FOCUSABLE, dialog).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!dialog.contains(active)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function toast(message) {
    const host = $("#toast-host");
    if (!host) return;
    host.innerHTML = `<div class="toast">${esc(message)}</div>`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      host.innerHTML = "";
    }, 4000);
  }

  function showError(el, message) {
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
  }

  /* ------------------------------------------------------------------ actions */

  function addToCart(id) {
    if (!id || owns(id) || inCart(id)) return;
    state.cart.push(id);
    writeStore();
    const note = noteById(id);
    toast(`${note ? note.title : "Note pack"} added to cart`);
    render();
  }

  function removeFromCart(id) {
    state.cart = state.cart.filter((x) => x !== id);
    if (!state.cart.length) state.promo = null;
    writeStore();
    render();
  }

  function submitCheckout(event) {
    event.preventDefault();
    const emailField = $("#c-email");
    const email = emailField.value.trim();
    const error = $("#checkout-error");
    const terms = $("#c-terms");
    const immediate = $("#c-immediate");

    emailField.removeAttribute("aria-invalid");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      emailField.setAttribute("aria-invalid", "true");
      showError(error, "Enter an email address we can send the download to.");
      emailField.focus();
      return;
    }
    if (!terms.checked) {
      showError(error, "Tick the box to accept the terms and the privacy policy.");
      terms.focus();
      return;
    }
    if (!immediate.checked) {
      showError(error, "We can only release the file if you agree to it downloading straight away.");
      immediate.focus();
      return;
    }

    const { total } = totals();
    const order = {
      ref: `NC-${Date.now().toString(36).toUpperCase().slice(-6)}`,
      date: Date.now(),
      items: [...state.cart],
      total,
      email,
      consent: { terms: true, immediateDelivery: true, at: Date.now() },
    };
    state.orders.push(order);
    state.cart = [];
    state.promo = null;
    state.overlay = null;
    writeStore();
    location.hash = "#/library";
    toast(`Order ${order.ref} placed — ${order.items.length} pack${order.items.length === 1 ? "" : "s"} in your library`);
  }

  function publishListing(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const error = $("#sell-error");
    Object.assign(draft, { ...data, ownership: undefined });

    if (!draft.title.trim()) {
      showError(error, "Give the listing a title so buyers know what it covers.");
      $("#f-title").focus();
      return;
    }
    if (!$("#f-ownership").checked) {
      showError(error, "Confirm you wrote these notes and own the copyright before publishing.");
      $("#f-ownership").focus();
      return;
    }

    const price = Math.max(0, Math.round(parseFloat(draft.price || "0") * 100));
    const id = `own-${Date.now().toString(36)}`;
    const contents = draft.contents
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => [line, 0]);

    state.listings.unshift({
      id,
      title: draft.title.trim(),
      subject: draft.subject,
      course: (draft.course || "").trim() || "No course code",
      institution: (draft.institution || "").trim() || "Independent",
      level: draft.level,
      pages: Number(draft.pages) || 0,
      format: draft.format,
      price,
      updated: new Date().toLocaleDateString(CONFIG.locale, { month: "short", year: "numeric" }),
      createdAt: Date.now(),
      mine: true,
      seller: { name: "You", grade: (draft.grade || "").trim(), since: String(new Date().getFullYear()) },
      summary: (draft.summary || "").trim() || "No summary yet — add one to help buyers decide.",
      contents: contents.length ? contents : [["Contents to be added", 0]],
      includes: [`${Number(draft.pages) || "?"} ${draft.format.includes("Anki") ? "cards" : "pages"}, ${draft.format}`, "Instant download after purchase"],
    });
    Object.assign(draft, { title: "", course: "", institution: "", pages: "", grade: "", summary: "", contents: "" });
    writeStore();
    location.hash = `#/note/${id}`;
    toast("Listing published — it's live in the shop");
  }

  function publishReview(form, noteId) {
    const error = $("#review-error");
    const rating = Number((form.querySelector('input[name="rating"]:checked') || {}).value || 0);
    const text = $("#review-text").value.trim();

    if (!rating) {
      showError(error, "Pick a rating from 1 to 5.");
      form.querySelector('input[name="rating"]').focus();
      return;
    }
    if (text.length < 10) {
      showError(error, "Write at least a sentence — it's what the next buyer reads.");
      $("#review-text").focus();
      return;
    }
    if (!owns(noteId) || hasReviewed(noteId)) return;

    /* `by` is the display name a real backend would attach to the buyer's
     * account. Locally there is no account, so the review is yours. */
    state.reviews.push({ id: `r-${Date.now().toString(36)}`, noteId, rating, text, at: Date.now(), by: "You" });
    writeStore();
    renderView();
    toast("Review published");
  }

  function clearAllData() {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      /* nothing stored to clear */
    }
    Object.assign(state, blank, { cart: [], orders: [], listings: [], reviews: [], promo: null });
    render();
    toast("Everything this site stored on your device has been deleted");
  }

  /* ------------------------------------------------------------------ routing */

  function parseHash() {
    const hash = location.hash.replace(/^#\/?/, "");
    const [head, id] = hash.split("/");
    if (head === "note" && id) return { name: "note", id };
    if (head === "policy" && id) return { name: "policy", id };
    if (["sell", "library", "dashboard"].includes(head)) return { name: head, id: null };
    return { name: "browse", id: null };
  }

  function renderView() {
    const view = $("#view");
    if (!view) return;
    const { name, id } = state.route;

    if (name === "note") {
      const note = noteById(id);
      view.innerHTML = note ? detailView(note) : notFoundView("That listing has gone. It may have been unpublished.");
      const reviewForm = $("#review-form");
      if (reviewForm)
        reviewForm.addEventListener("submit", (e) => {
          e.preventDefault();
          publishReview(reviewForm, id);
        });
    } else if (name === "policy") {
      view.innerHTML = policyView(id);
    } else if (name === "sell") {
      view.innerHTML = sellView();
      const form = $("#sell-form");
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        publishListing(form);
      });
      form.addEventListener("input", (e) => {
        if (!e.target.name || e.target.type === "checkbox") return;
        draft[e.target.name] = e.target.value;
        const preview = $(".preview-sticky");
        if (preview) {
          const fresh = document.createElement("div");
          fresh.innerHTML = sellView();
          preview.innerHTML = fresh.querySelector(".preview-sticky").innerHTML;
        }
      });
      form.addEventListener("change", (e) => {
        if (!e.target.name || e.target.type === "checkbox") return;
        draft[e.target.name] = e.target.value;
        renderView();
      });
    } else if (name === "library") {
      view.innerHTML = libraryView();
    } else if (name === "dashboard") {
      view.innerHTML = dashboardView();
    } else {
      view.innerHTML = browseView();
    }
    syncChrome();
  }

  function render() {
    renderView();
    renderOverlay();
  }

  function onRoute() {
    const next = parseHash();
    const changed = next.name !== state.route.name || next.id !== state.route.id;
    state.route = next;
    if (state.overlay && changed) state.overlay = null;
    render();
    if (changed) {
      window.scrollTo({ top: 0, behavior: "auto" });
      const view = $("#view");
      if (view && state.started) view.focus({ preventScroll: true });
    }
    state.started = true;
  }

  /* ------------------------------------------------------------------- events */

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-nav]")) return; // let the hash link do its work

    const el = event.target.closest("[data-action]");
    if (!el) return;
    const { action, id } = el.dataset;

    switch (action) {
      case "open-note":
        location.hash = `#/note/${id}`;
        break;
      case "add":
        addToCart(id);
        break;
      case "remove":
        removeFromCart(id);
        break;
      case "buy-now":
        addToCart(id);
        state.overlay = "checkout";
        renderOverlay();
        break;
      case "open-cart":
        state.overlay = "cart";
        renderOverlay();
        break;
      case "checkout":
        state.overlay = "checkout";
        renderOverlay();
        break;
      case "close-overlay":
        state.overlay = null;
        renderOverlay();
        break;
      case "apply-promo": {
        const code = ($("#promo").value || "").trim().toUpperCase();
        if (CONFIG.promos[code]) {
          state.promo = code;
          toast(CONFIG.promos[code].label);
        } else {
          state.promo = null;
          toast(`${code || "That code"} isn't a working code`);
        }
        writeStore();
        renderOverlay();
        break;
      }
      case "download": {
        const note = noteById(id);
        const order = state.orders.find((o) => o.items.includes(id));
        if (note && order) deliver(note, order);
        break;
      }
      case "clear-data":
        clearAllData();
        break;
      case "back":
        location.hash = "#/";
        break;
      case "subject":
        state.subject = el.dataset.value;
        renderView();
        break;
      default:
        break;
    }
  });

  document.addEventListener("change", (event) => {
    const el = event.target.closest("[data-action]");
    if (!el) return;
    if (el.dataset.action === "level") state.level = el.value;
    if (el.dataset.action === "sort") state.sort = el.value;
    if (["level", "sort"].includes(el.dataset.action)) renderView();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.overlay) {
      state.overlay = null;
      renderOverlay();
      return;
    }
    keepFocusInside(event);
  });

  window.addEventListener("hashchange", onRoute);

  mountChrome();
  onRoute();
})();
