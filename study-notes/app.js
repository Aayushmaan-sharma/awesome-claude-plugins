/* MFL Centre, a storefront for buying and selling study notes.
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
   * visible gap on the policy pages instead of an invented detail. A trader
   * has to identify itself under the Companies Act and the E-Commerce
   * Regulations, and a plausible-looking placeholder is worse than an
   * obvious one. */
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
    shopName: "MFL Centre",
    locale: "en-GB",
    currency: "GBP",
    platformFeePct: 15,
    vatNote: "Prices include VAT on digital goods.",
    promos: { FRESHERS10: { pct: 10, label: "Freshers' week, 10% off" } },
  };

  const STORE_KEY = "mflcentre.v1";

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
  const blank = { cart: [], orders: [], listings: [], reviews: [], promo: null, account: null, theme: "dark" };

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
        JSON.stringify({
          cart: state.cart,
          orders: state.orders,
          listings: state.listings,
          reviews: state.reviews,
          promo: state.promo,
          account: state.account,
          theme: state.theme,
        }),
      );
    } catch {
      /* private browsing or storage disabled; the session still works */
    }
  }

  const state = {
    ...readStore(),
    query: "",
    level: "all",
    sort: "newest",
    route: { name: "browse", id: null },
    overlay: null, // "cart" | "checkout" | null
    lastFocus: null,
  };

  /* --------------------------------------------------------------------- theme */

  /* Three states, the way a theme control should have them: an explicit light
   * or dark, or "match system". Dark is the default, because that is what this
   * shop looks like. The choice is written to data-appearance rather than to
   * data-theme, which the artifact viewer owns. Writing there would mean
   * fighting the host over the same attribute. */
  const THEMES = ["system", "light", "dark"];

  function resolvedTheme() {
    if (state.theme === "light" || state.theme === "dark") return state.theme;
    const stamped = document.documentElement.dataset.theme;
    if (stamped === "light" || stamped === "dark") return stamped;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  function applyTheme() {
    document.documentElement.dataset.appearance = resolvedTheme();
  }

  function setTheme(value) {
    if (!THEMES.includes(value)) return;
    state.theme = value;
    writeStore();
    // Colours cross-fade only while switching. Leaving the transition on all
    // the time would make every hover and re-render feel laggy.
    const root = document.documentElement;
    root.classList.add("is-theming");
    clearTimeout(setTheme.timer);
    setTheme.timer = setTimeout(() => root.classList.remove("is-theming"), 340);
    applyTheme();
    syncChrome();
  }

  function watchSystemTheme() {
    const follow = () => {
      if (state.theme === "system") applyTheme();
    };
    if (window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      if (mq.addEventListener) mq.addEventListener("change", follow);
      else if (mq.addListener) mq.addListener(follow);
    }
    // The artifact viewer stamps data-theme when its reader picks a side.
    if (typeof MutationObserver === "function") {
      new MutationObserver(follow).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }
  }

  const THEME_ICONS = {
    system: '<rect x="2.6" y="4.2" width="14.8" height="9.6" rx="1.6"></rect><path d="M7.5 16.6h5"></path>',
    light:
      '<circle cx="10" cy="10" r="3.1"></circle><path d="M10 2.7v1.7M10 15.6v1.7M17.3 10h-1.7M4.4 10H2.7M15.16 4.84l-1.2 1.2M6.04 13.96l-1.2 1.2M15.16 15.16l-1.2-1.2M6.04 6.04l-1.2-1.2"></path>',
    dark: '<path d="M15.9 12.1A6.3 6.3 0 0 1 7.9 4.1a6.5 6.5 0 1 0 8 8Z"></path>',
  };
  const THEME_LABELS = { system: "Match system", light: "Light theme", dark: "Dark theme" };

  const themeControlMarkup = () => `
    <div class="themectl" role="group" aria-label="Colour theme">
      ${THEMES.map(
        (name) => `
        <button class="themebtn" type="button" data-action="theme" data-value="${name}" title="${esc(THEME_LABELS[name])}" aria-label="${esc(THEME_LABELS[name])}" aria-pressed="false">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${THEME_ICONS[name]}</svg>
        </button>`,
      ).join("")}
    </div>`;

  /* ------------------------------------------------------------------- account */

  /* There is no server here, so "signing in" records who you say you are and
   * nothing more. No password is asked for on the sign-in page, and none
   * should be: a build with no backend has nowhere safe to put one. See
   * README.md for wiring a real provider. */
  const signedIn = () => Boolean(state.account);

  function displayName() {
    if (!state.account) return "You";
    if (state.account.name) return state.account.name;
    return state.account.email
      .split("@")[0]
      .replace(/[._+-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function signIn({ provider, email, name }) {
    state.account = { provider, email, name: name || "", since: Date.now() };
    writeStore();
  }

  function signOut() {
    state.account = null;
    writeStore();
    location.hash = "#/";
    render();
    toast("Signed out. Anything you bought or listed is still on this device.");
  }

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

  /* The subject is part of the URL, so a subject page can be linked and
   * shared. Level, sort and search refine what is already on screen and stay
   * in memory, which is how a catalogue usually splits the two. */
  const activeSubject = () => (state.route.name === "browse" && state.route.id ? state.route.id : "all");

  function matchesNote(note, { subject, level, q }) {
    if (subject && subject !== "all" && note.subject !== subject) return false;
    if (level && level !== "all" && note.level !== level) return false;
    if (!q) return true;
    return [note.title, note.course, note.institution, subjectName(note.subject), note.level, note.summary, note.seller?.name]
      .join(" ")
      .toLowerCase()
      .includes(q);
  }

  const searchTerm = () => state.query.trim().toLowerCase();

  /* Each facet is counted against the other filters, not against the whole
   * catalogue, so a count of 4 always means four results when clicked. */
  function facetCounts(key, fixed) {
    const counts = new Map();
    for (const note of allNotes()) {
      if (matchesNote(note, { ...fixed, q: searchTerm() })) counts.set(note[key], (counts.get(note[key]) || 0) + 1);
    }
    return counts;
  }

  function filtered() {
    const list = allNotes().filter((n) => matchesNote(n, { subject: activeSubject(), level: state.level, q: searchTerm() }));
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
    return `<span class="todo"><span class="sr-only">Placeholder. The site owner still has to add </span>${esc(SITE_FIELDS[key] || key)}</span>`;
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
      "contents sheet, not the notes themselves. Connect your own file storage to",
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
          <a class="brand" href="#/" data-nav aria-label="${esc(CONFIG.shopName)} home">
            ${logoMarkup()}
            <span class="brand__word"><span class="brand__a">mfl</span><span class="brand__b">centre</span></span>
          </a>
          <div class="searchbar">
            <label class="sr-only" for="q">Search notes</label>
            <input id="q" type="search" placeholder="Search by language, exam board or topic" autocomplete="off">
          </div>
          <nav class="navlinks" aria-label="Main">
            <a class="navlink" href="#/" data-nav data-route="browse">Browse</a>
            <a class="navlink" href="#/sell" data-nav data-route="sell">Sell notes</a>
            <a class="navlink" href="#/library" data-nav data-route="library">Library</a>
            <a class="navlink" href="#/earnings" data-nav data-route="earnings">Earnings</a>
            <span id="nav-auth"></span>
            ${themeControlMarkup()}
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
    window.addEventListener("resize", () => {
      measureChrome();
      syncFacets();
    });

    $("#q").addEventListener("input", (e) => {
      state.query = e.target.value;
      if (state.route.name !== "browse") location.hash = "#/";
      else renderView();
    });
  }

  /* The mark: a white sheet of notes with an acute accent over it. The page,
   * because that is what the site sells and what it is made of; the accent,
   * because a diacritic is what says modern languages. Four flat shapes, so
   * the silhouette still reads at 16px. Colours come from the palette. */
  const logoMarkup = () => `
    <svg class="brand__mark" viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" focusable="false">
      <path class="brand__accent" d="M15.9 0.6 H18.9 L14.5 4.2 H12.1 Z" fill="var(--accent)"></path>
      <rect x="4.8" y="4.8" width="14.4" height="17.6" rx="2" fill="var(--ink)"></rect>
      <rect x="7.4" y="10" width="9.2" height="2" rx="1" fill="var(--paper)"></rect>
      <rect x="7.4" y="14.8" width="6" height="2" rx="1" fill="var(--paper)"></rect>
    </svg>`;

  const isWide = () => !window.matchMedia || window.matchMedia("(min-width: 900px)").matches;

  /* The facet list is a sidebar on a wide screen and a disclosure on a narrow
   * one. Same markup either way; only whether it starts open differs. */
  function syncFacets() {
    const facets = $("#facets");
    if (facets && isWide()) facets.open = true;
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
            <p>A marketplace for student-written notes in modern foreign languages. Sellers keep ${100 - CONFIG.platformFeePct}% of each sale.</p>
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

  const authNavMarkup = () =>
    signedIn()
      ? `<button class="navlink navlink--btn" type="button" data-action="sign-out">Sign out</button>`
      : `<a class="navlink" href="#/signin" data-nav data-route="signin">Sign in</a>`;

  let renderedAuth = null;

  function syncChrome() {
    $$('[data-action="theme"]').forEach((el) => {
      el.setAttribute("aria-pressed", String(el.dataset.value === state.theme));
    });
    const auth = signedIn() ? "in" : "out";
    if (auth !== renderedAuth) {
      const slot = $("#nav-auth");
      if (slot) slot.innerHTML = authNavMarkup();
      renderedAuth = auth;
    }
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

  /* Drawn icons rather than tick, cross and star characters. A glyph borrowed
   * from the text font renders at whatever weight and baseline that font
   * happens to give it, and a screen reader may read it out. These scale with
   * the text, take currentColor, and are hidden from assistive technology
   * because the words beside them already say it. */
  const ICON_PATHS = {
    check: '<path d="M3.3 8.5 6.6 11.8 12.7 4.7"></path>',
    close: '<path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8"></path>',
    back: '<path d="M9.8 3.6 5.4 8l4.4 4.4M5.6 8h6.8"></path>',
    star: '<path d="M8 2.1 9.75 5.8l4.05.56-2.93 2.82.7 4.02L8 11.3 4.43 13.2l.7-4.02L2.2 6.36l4.05-.56z" fill="currentColor" stroke="none"></path>',
    info: '<circle cx="8" cy="8" r="6"></circle><path d="M8 7.3v3.9"></path><path d="M8 4.9h.01"></path>',
    alert: '<path d="M8 2.8 14.3 13.3H1.7z"></path><path d="M8 6.6v3"></path><path d="M8 11.5h.01"></path>',
  };

  const icon = (name, cls = "") =>
    `<svg class="icon${cls ? ` ${cls}` : ""}" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`;

  /* ------------------------------------------------------------------ pieces */

  /* A few ruled lines of "writing" so a cover reads as a used page rather
   * than blank stock. Widths are seeded from the id, so a listing always
   * draws the same page. */
  const coverLines = (note) => {
    const rand = seeded(`${note.id}-cover`);
    return Array.from({ length: 4 }, () => `<span class="card__line" style="width:${34 + Math.floor(rand() * 44)}%"></span>`).join("");
  };

  const coverMarkup = (note) => `
    <span class="card__margin" aria-hidden="true"></span>
    <span class="card__lines" aria-hidden="true">${coverLines(note)}</span>
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
    return `<span class="rating">${icon("star", "rating__star")}${avg.toFixed(1)}<span class="rating__count">from ${count} ${count === 1 ? "review" : "reviews"}</span></span>`;
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
    if (owns(note.id)) return `<span class="owned">${icon("check")} In library</span>`;
    if (inCart(note.id))
      return `<button class="btn ${extra} btn--ghost" type="button" data-action="open-cart">View in cart</button>`;
    return `<button class="btn ${extra} btn--primary" type="button" data-action="add" data-id="${esc(note.id)}" aria-label="Add ${esc(note.title)} to cart">Add to cart</button>`;
  }

  /* ------------------------------------------------------------- browse view */

  const listJoin = (items) =>
    items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

  function browseView() {
    const notes = filtered();
    const subject = activeSubject();
    const subjectCounts = facetCounts("subject", { level: state.level });
    /* "All subjects" counts what removing only the subject filter would show,
     * so it agrees with the numbers beneath it whatever else is active. */
    const allCount = [...subjectCounts.values()].reduce((a, b) => a + b, 0);
      const levelCounts = facetCounts("level", { subject });
    const filtersOn = subject !== "all" || state.level !== "all" || Boolean(state.query.trim());

    const subjectItems = SUBJECTS.map((s) => {
      const count = subjectCounts.get(s.id) || 0;
      return `<li><a class="facet__item" href="#/s/${esc(s.id)}" data-nav${subject === s.id ? ' aria-current="page"' : ""}${count ? "" : ' data-empty="true"'}>
        <span>${esc(s.name)}</span><span class="facet__count">${count}</span></a></li>`;
    }).join("");

    const levelItems = [{ id: "all", name: "Any level" }, ...LEVELS.map((l) => ({ id: l, name: l }))]
      .map((l) => {
        const count = l.id === "all" ? [...levelCounts.values()].reduce((a, b) => a + b, 0) : levelCounts.get(l.id) || 0;
        return `<li><button class="facet__item" type="button" data-action="level" data-value="${esc(l.id)}" aria-pressed="${state.level === l.id}">
          <span>${esc(l.name)}</span><span class="facet__count">${count}</span></button></li>`;
      })
      .join("");

    const head =
      subject === "all"
        ? `<h1>Buy and sell modern-languages study notes.</h1>
           <p>Vocabulary decks, grammar tables, speaking answers, and notes on the set films and texts, written by students who took the course. Sellers keep ${100 - CONFIG.platformFeePct}% of what a buyer pays. Buyers download the file at checkout.</p>`
        : `<h1>${esc(subjectName(subject))}</h1>
           <p>${
             notes.length
               ? `Available at ${esc(listJoin(LEVELS.filter((l) => notes.some((n) => n.level === l))))}.`
               : "Nothing matches the filters you have set."
           }</p>`;

    return `
      <div class="shell">
        <div class="page-head page-head--catalogue">
          <p class="eyebrow">${subject === "all" ? "GCSE · A-Level · IB · Degree" : "Subject"}</p>
          ${head}
          ${
            subject === "all"
              ? `<div class="notice">
                   ${icon("info")}
                   <p><b>Sample catalogue.</b> These listings are examples so the shop opens in a working state. Payments aren't connected, so checkout records the order and unlocks the download.</p>
                 </div>`
              : ""
          }
        </div>

        <div class="catalogue">
          <details class="facets" id="facets"${isWide() ? " open" : ""}>
            <summary class="facets__summary">
              <span>Filters</span>
              <span class="facets__state">${filtersOn ? "Narrowed" : "All notes"}</span>
            </summary>
            <div class="facets__body">
              <nav class="facet" aria-label="Subjects">
                <h2 class="facet__head">Subject</h2>
                <ul>
                  <li><a class="facet__item" href="#/" data-nav${subject === "all" ? ' aria-current="page"' : ""}>
                    <span>All subjects</span><span class="facet__count">${allCount}</span></a></li>
                  ${subjectItems}
                </ul>
              </nav>
              <div class="facet">
                <h2 class="facet__head" id="level-head">Level</h2>
                <ul role="group" aria-labelledby="level-head">${levelItems}</ul>
              </div>
              ${
                filtersOn
                  ? `<button class="facets__clear" type="button" data-action="clear-filters">Clear filters</button>`
                  : ""
              }
            </div>
          </details>

          <section class="results" aria-label="Note packs">
            <div class="results__head">
              <p class="results__count">${notes.length} ${notes.length === 1 ? "pack" : "packs"}${
                state.query.trim() ? ` matching “${esc(state.query.trim())}”` : ""
              }</p>
              <div class="results__sort">
                <label for="sort">Sort</label>
                <select id="sort" data-action="sort">
                  <option value="newest"${state.sort === "newest" ? " selected" : ""}>Newest first</option>
                  <option value="rating"${state.sort === "rating" ? " selected" : ""}>Highest rated</option>
                  <option value="reviewed"${state.sort === "reviewed" ? " selected" : ""}>Most reviewed</option>
                  <option value="price-asc"${state.sort === "price-asc" ? " selected" : ""}>Price: low to high</option>
                  <option value="price-desc"${state.sort === "price-desc" ? " selected" : ""}>Price: high to low</option>
                </select>
              </div>
            </div>
            <div class="grid">
              ${
                notes.length
                  ? notes.map(cardMarkup).join("")
                  : `<div class="empty">
                       <h3>Nothing here yet</h3>
                       <p>No pack matches those filters. Try a different subject or level, or clear the search.</p>
                       <p class="empty__action"><button class="btn btn--primary" type="button" data-action="clear-filters">Clear filters</button></p>
                     </div>`
              }
            </div>
          </section>
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
                         <span class="rating">${icon("star", "rating__star")}${r.rating}<span class="sr-only"> out of 5</span></span>
                         <span class="verified">${icon("check")} Verified purchase</span>
                         <span class="review__when">${new Date(r.at).toLocaleDateString(CONFIG.locale)}</span>
                       </div>
                       <p>${esc(r.text)}</p>
                     </div>
                   </article>`,
                   )
                   .join("")}
               </div>`
            : `<p class="reviews__empty">No reviews yet. Reviews here are only ever written by people who bought the pack through this site. None are seeded, bought or written by us.</p>`
        }
        ${form}
      </section>`;
  }

  function detailView(note) {
    return `
      <div class="shell detail">
        <button class="backlink" type="button" data-action="back">${icon("back")} Back to all notes</button>
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
                     <p class="buypanel__owned">${icon("check")} Already in your library</p>`
                  : inCart(note.id)
                    ? `<button class="btn btn--wide" type="button" data-action="open-cart">Go to cart</button>
                       <button class="btn btn--ghost btn--wide" type="button" data-action="remove" data-id="${esc(note.id)}" aria-label="Remove ${esc(note.title)} from cart">Remove from cart</button>`
                    : `<button class="btn btn--primary btn--wide" type="button" data-action="add" data-id="${esc(note.id)}" aria-label="Add ${esc(note.title)} to cart">Add to cart</button>
                       <button class="btn btn--ghost btn--wide" type="button" data-action="buy-now" data-id="${esc(note.id)}">Buy now</button>`
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
                <p class="seller__label">Written by</p>
                <p class="seller__name">${esc(note.seller.name)}</p>
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
      seller: { name: displayName(), grade: draft.grade },
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
                <input id="f-title" name="title" value="${esc(draft.title)}" placeholder="German Cases: One Table, Every Ending" required aria-describedby="f-title-hint">
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
                  <input id="f-course" name="course" value="${esc(draft.course)}" placeholder="AQA 7662 or FREN1001">
                </div>
                <div class="field">
                  <label for="f-institution">Institution or exam board</label>
                  <input id="f-institution" name="institution" value="${esc(draft.institution)}" placeholder="AQA specification">
                </div>
              </div>
              <div class="formgrid formgrid--2">
                <div class="field">
                  <label for="f-pages">Pages or cards</label>
                  <input id="f-pages" name="pages" inputmode="numeric" value="${esc(draft.pages)}" placeholder="48">
                </div>
                <div class="field">
                  <label for="f-format">Format</label>
                  <select id="f-format" name="format">
                    ${["Typed PDF", "Handwritten scan", "Anki deck", "PDF + Anki", "PDF + audio", "PDF + dataset", "Notion export"]
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
                  <input id="f-grade" name="grade" value="${esc(draft.grade)}" placeholder="A* · 94%" aria-describedby="f-grade-hint">
                  <span class="hint" id="f-grade-hint">Optional. Shown to buyers as your own unverified statement.</span>
                </div>
              </div>
              <div class="field">
                <label for="f-summary">Summary</label>
                <textarea id="f-summary" name="summary" placeholder="Two or three sentences on what's inside and who it's for.">${esc(draft.summary)}</textarea>
              </div>
              <div class="field">
                <label for="f-contents">Contents, one per line</label>
                <textarea id="f-contents" name="contents" placeholder="Adjective endings: weak, mixed and strong&#10;Prepositions sorted by case&#10;120 drilled sentences with answers" aria-describedby="f-contents-hint">${esc(draft.contents)}</textarea>
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
              ${icon("info")}
              <p>Only list work you wrote yourself. Uploading a lecturer's slides or a textbook chapter is copyright infringement. See the <a href="#/policy/integrity" data-nav>copyright policy</a>.</p>
            </div>
          </div>
        </form>
      </div>`;
  }

  /* -------------------------------------------------------------- sign in */

  const gateMarkup = (heading, why) => `
    <div class="shell">
      <div class="page-head">
        <p class="eyebrow">Account</p>
        <h1>${esc(heading)}</h1>
        <p>${esc(why)}</p>
      </div>
      <div class="stack">
        <div class="empty">
          <p class="empty__action"><a class="btn btn--primary" href="#/signin" data-nav>Sign in</a></p>
        </div>
      </div>
    </div>`;

  /* A plain monogram, not Google's brand asset: this button does not perform
   * Google sign-in, so shipping their mark on it would say otherwise. When you
   * wire the real thing, use Google's official button per their guidelines. */
  const googleMark = `
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false" class="provider__mark">
      <path d="M20.2 12a8.2 8.2 0 1 1-2.4-5.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
      <path d="M20.2 12h-6.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
    </svg>`;

  function signinView() {
    if (signedIn()) {
      return `
        <div class="shell">
          <div class="page-head">
            <p class="eyebrow">Account</p>
            <h1>You're signed in</h1>
            <p>Signed in as ${esc(state.account.email)}${state.account.provider === "google" ? " with a Google demo session" : ""}.</p>
          </div>
          <div class="stack">
            <div class="panel authcard">
              <p class="authnote">Signing out leaves everything on this device. Your library, your listings and your earnings stay put.</p>
              <div class="authactions">
                <a class="btn btn--primary" href="#/earnings" data-nav>Go to earnings</a>
                <button class="btn btn--ghost" type="button" data-action="sign-out">Sign out</button>
              </div>
            </div>
          </div>
        </div>`;
    }

    return `
      <div class="shell">
        <div class="authwrap">
          <div class="page-head">
            <p class="eyebrow">Account</p>
            <h1>Sign in</h1>
            <p>You need an account to list notes and to be paid for them. Buying doesn't need one.</p>
          </div>
          <div class="panel authcard">
            <div class="demoflag">
              ${icon("alert", "demoflag__mark")}
              <p><b>Demo sign-in. Nothing is connected.</b> No password is asked for here, and none should be: a build with no backend has nowhere safe to keep one. Both options below create a local session on this device only.</p>
            </div>

            <button class="btn btn--wide provider" type="button" data-action="signin-google">
              ${googleMark} Continue with Google
            </button>
            <p class="authnote">Google sign-in isn't wired up in this build, so this creates a demo session instead of asking Google anything.</p>

            <div class="authsep"><span>or</span></div>

            <form id="signin-form" novalidate>
              <div class="field">
                <label for="s-email">Email address</label>
                <input id="s-email" name="email" type="email" autocomplete="email" placeholder="you@university.ac.uk" required aria-describedby="s-email-hint signin-error">
                <span class="hint" id="s-email-hint">A real build emails you a one-time link, so there's no password to create, forget or leak.</span>
              </div>
              <p class="formerror" id="signin-error" role="alert" hidden></p>
              <button class="btn btn--primary btn--wide" type="submit">Email me a sign-in link</button>
            </form>

            <p class="authfoot">Signing in means accepting the <a href="#/policy/terms" data-nav>terms</a> and the <a href="#/policy/privacy" data-nav>privacy policy</a>.</p>
          </div>
        </div>
      </div>`;
  }

  /* -------------------------------------------------------------- earnings */

  function earnings() {
    const mineIds = new Set(state.listings.map((n) => n.id));
    const sales = [];
    for (const order of state.orders) {
      for (const id of order.items) {
        if (!mineIds.has(id)) continue;
        const note = noteById(id);
        if (!note) continue;
        const fee = Math.round((note.price * CONFIG.platformFeePct) / 100);
        sales.push({ id, title: note.title, at: order.date, ref: order.ref, gross: note.price, fee, net: note.price - fee });
      }
    }
    sales.sort((a, b) => b.at - a.at);
    const gross = sales.reduce((sum, x) => sum + x.gross, 0);
    const fee = sales.reduce((sum, x) => sum + x.fee, 0);
    return { sales, gross, fee, net: gross - fee };
  }

  function monthlyNet(sales) {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(CONFIG.locale, { month: "short" }), net: 0 });
    }
    const index = new Map(months.map((m) => [m.key, m]));
    for (const sale of sales) {
      const d = new Date(sale.at);
      const bucket = index.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (bucket) bucket.net += sale.net;
    }
    return months;
  }

  function niceMax(value) {
    if (value <= 0) return 100;
    const magnitude = 10 ** Math.floor(Math.log10(value));
    for (const step of [1, 2, 2.5, 5, 10]) {
      if (value <= step * magnitude) return step * magnitude;
    }
    return 10 * magnitude;
  }

  const barPath = (x, top, w, h, r) => {
    const rr = Math.min(r, h, w / 2);
    return `M${x} ${top + h} V${top + rr} Q${x} ${top} ${x + rr} ${top} H${x + w - rr} Q${x + w} ${top} ${x + w} ${top + rr} V${top + h} Z`;
  };

  /* Net earnings by month. One series, so one hue and no legend; the title
   * says what is plotted and the table below carries every value. */
  function earningsChart(months) {
    const W = 560;
    const H = 208;
    const L = 58;
    const R = 10;
    const T = 18;
    const B = 40;
    const plotW = W - L - R;
    const plotH = H - T - B;
    const max = niceMax(Math.max(...months.map((m) => m.net)));
    const band = plotW / months.length;
    const barW = Math.min(24, band * 0.44);
    const yOf = (v) => T + plotH - (v / max) * plotH;
    const peak = months.reduce((a, b) => (b.net > a.net ? b : a), months[0]);

    const grid = [0, max / 2, max]
      .map(
        (v) =>
          `<line x1="${L}" y1="${yOf(v).toFixed(1)}" x2="${L + plotW}" y2="${yOf(v).toFixed(1)}" stroke="var(--rule)" stroke-width="1"></line>
           <text x="${L - 10}" y="${(yOf(v) + 4).toFixed(1)}" text-anchor="end" class="chart__tick">${money(v)}</text>`,
      )
      .join("");

    const bars = months
      .map((m, i) => {
        const x = L + i * band + (band - barW) / 2;
        const top = yOf(m.net);
        const h = T + plotH - top;
        const label = `${m.label}: ${money(m.net)}`;
        const mark = m.net > 0 ? `<path d="${barPath(x, top, barW, h, 4)}" fill="var(--accent)"></path>` : "";
        const value =
          m === peak && m.net > 0
            ? `<text x="${(x + barW / 2).toFixed(1)}" y="${(top - 7).toFixed(1)}" text-anchor="middle" class="chart__value">${money(m.net)}</text>`
            : "";
        return `<g class="chart__bar" data-tip="${esc(label)}">
            <rect x="${(L + i * band).toFixed(1)}" y="${T}" width="${band.toFixed(1)}" height="${plotH}" fill="transparent"></rect>
            ${mark}${value}
            <text x="${(L + i * band + band / 2).toFixed(1)}" y="${H - 16}" text-anchor="middle" class="chart__tick">${esc(m.label)}</text>
            <title>${esc(label)}</title>
          </g>`;
      })
      .join("");

    const summary = months.map((m) => `${m.label} ${money(m.net)}`).join(", ");
    return `
      <figure class="chart">
        <figcaption class="chart__title">Net earnings by month <span class="chart__sub">after the ${CONFIG.platformFeePct}% fee, last six months</span></figcaption>
        <div class="chartwrap">
          <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Net earnings by month. ${esc(summary)}." preserveAspectRatio="xMidYMid meet">
            ${grid}${bars}
          </svg>
          <div class="charttip" id="charttip" hidden></div>
        </div>
      </figure>`;
  }

  function earningsView() {
    if (!signedIn()) return gateMarkup("Sign in to see your earnings", "Earnings belong to an account, so we need to know whose they are.");

    const { sales, gross, fee, net } = earnings();
    const months = monthlyNet(sales);
    const mine = state.listings;

    return `
      <div class="shell">
        <div class="page-head">
          <p class="eyebrow">Seller</p>
          <h1>Earnings</h1>
          <p>Signed in as ${esc(state.account.email)}. Figures cover orders placed in this browser.</p>
        </div>

        <section class="balance" aria-labelledby="balance-head">
          <div>
            <p class="hero__label" id="balance-head">Earned after fees</p>
            <p class="hero__value">${money(net)}</p>
            <p class="hero__sub">Available to pay out. Nothing has been paid out yet. Payouts start once a payment provider is connected.</p>
          </div>
          <dl class="kpis">
            <div class="kpi"><dt>Gross sales</dt><dd>${money(gross)}</dd></div>
            <div class="kpi"><dt>${esc(CONFIG.shopName)} fee</dt><dd>−${money(fee)}</dd></div>
            <div class="kpi"><dt>Copies sold</dt><dd>${sales.length}</dd></div>
            <div class="kpi"><dt>Listings live</dt><dd>${mine.length}</dd></div>
          </dl>
        </section>

        ${
          sales.length
            ? earningsChart(months)
            : `<div class="empty empty--chart">
                 <h3>No sales yet</h3>
                 <p>${mine.length ? "Your listings are live. Earnings appear here the first time someone buys one." : "List a note pack and your earnings will show up here."}</p>
                 ${mine.length ? "" : '<p class="empty__action"><a class="btn btn--primary" href="#/sell" data-nav>List your notes</a></p>'}
               </div>`
        }

        ${
          sales.length
            ? `<section class="section" aria-labelledby="sales-head">
                 <h2 id="sales-head" class="section__head">Every sale</h2>
                 <div class="panel panel--flush">
                   <div class="tablewrap">
                     <table class="table">
                       <caption class="sr-only">Every sale, newest first</caption>
                       <thead><tr><th scope="col">Date</th><th scope="col">Listing</th><th scope="col">Order</th><th scope="col">Buyer paid</th><th scope="col">Fee</th><th scope="col">You keep</th></tr></thead>
                       <tbody>
                         ${sales
                           .map(
                             (x) => `<tr>
                               <td>${new Date(x.at).toLocaleDateString(CONFIG.locale)}</td>
                               <td>${esc(x.title)}</td>
                               <td><span class="mono cellsub">${esc(x.ref)}</span></td>
                               <td>${money(x.gross)}</td>
                               <td>−${money(x.fee)}</td>
                               <td>${money(x.net)}</td>
                             </tr>`,
                           )
                           .join("")}
                       </tbody>
                     </table>
                   </div>
                 </div>
               </section>`
            : ""
        }

        <section class="section" aria-labelledby="listings-head">
          <h2 id="listings-head" class="section__head">Your listings</h2>
          ${
            mine.length
              ? `<div class="panel panel--flush">
                   <div class="tablewrap">
                     <table class="table">
                       <caption class="sr-only">Your listings and what each has earned</caption>
                       <thead><tr><th scope="col">Listing</th><th scope="col">Level</th><th scope="col">Price</th><th scope="col">Sold</th><th scope="col">Earned</th></tr></thead>
                       <tbody>
                         ${mine
                           .map((n) => {
                             const copies = sales.filter((x) => x.id === n.id).length;
                             const earned = sales.filter((x) => x.id === n.id).reduce((sum, x) => sum + x.net, 0);
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
        </section>
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
                     <ul>${missing.map((k) => `<li><code>${esc(k)}</code>: ${esc(SITE_FIELDS[k])}</li>`).join("")}</ul>
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
          <button class="iconbtn" type="button" data-action="close-overlay" aria-label="Close cart">${icon("close")}</button>
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
            <button class="iconbtn" type="button" data-action="close-overlay" aria-label="Close checkout">${icon("close")}</button>
          </header>
          <form class="modal__body" id="checkout-form" novalidate>
            <div class="demoflag">
              ${icon("alert", "demoflag__mark")}
              <p><b>Demo checkout. No money moves.</b> There are no card fields here on purpose. Connect Stripe, Paddle or Lemon Squeezy before selling to real buyers; the README shows where the hook goes.</p>
            </div>
            <div class="field">
              <label for="c-email">Email for the download</label>
              <input id="c-email" name="email" type="email" autocomplete="email" value="${esc(state.account?.email || "")}" placeholder="alex@university.ac.uk" required aria-describedby="c-email-hint checkout-error">
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

  /* Restart a one-shot animation on an element that may already carry it. */
  function replay(el, className) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
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
    replay($("#cart-count"), "is-bumped");
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
    toast(`Order ${order.ref} placed. ${order.items.length} pack${order.items.length === 1 ? "" : "s"} added to your library.`);
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
      seller: { name: displayName(), grade: (draft.grade || "").trim() },
      summary: (draft.summary || "").trim() || "No summary yet. Add one to help buyers decide.",
      contents: contents.length ? contents : [["Contents to be added", 0]],
      includes: [`${Number(draft.pages) || "?"} ${draft.format.includes("Anki") ? "cards" : "pages"}, ${draft.format}`, "Instant download after purchase"],
    });
    Object.assign(draft, { title: "", course: "", institution: "", pages: "", grade: "", summary: "", contents: "" });
    writeStore();
    location.hash = `#/note/${id}`;
    toast("Listing published. It's live in the shop.");
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
      showError(error, "Write at least a sentence. It's what the next buyer reads.");
      $("#review-text").focus();
      return;
    }
    if (!owns(noteId) || hasReviewed(noteId)) return;

    /* `by` is the display name the buyer's account carries. */
    state.reviews.push({ id: `r-${Date.now().toString(36)}`, noteId, rating, text, at: Date.now(), by: displayName() });
    writeStore();
    renderView();
    toast("Review published");
  }

  function submitSignin(event) {
    event.preventDefault();
    const field = $("#s-email");
    const email = field.value.trim();
    const error = $("#signin-error");
    field.removeAttribute("aria-invalid");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      field.setAttribute("aria-invalid", "true");
      showError(error, "Enter an email address we can send the sign-in link to.");
      field.focus();
      return;
    }
    signIn({ provider: "email", email });
    location.hash = "#/earnings";
    toast("Signed in. A real build would email you a link first.");
  }

  /* Deliberately does not open anything that looks like a Google password
   * screen. This build cannot talk to Google, and a page that pretended to
   * would be a phishing lesson, not a demo. */
  function signinWithGoogle() {
    signIn({ provider: "google", email: "demo.seller@example.com", name: "Demo Seller" });
    location.hash = "#/earnings";
    toast("Signed in with a demo account. Google isn't connected in this build.");
  }

  function bindChartTooltip() {
    const wrap = $(".chartwrap");
    const tip = $("#charttip");
    if (!wrap || !tip) return;
    const hide = () => {
      tip.hidden = true;
    };
    wrap.addEventListener("pointerleave", hide);
    wrap.addEventListener("pointermove", (event) => {
      const bar = event.target.closest(".chart__bar");
      if (!bar) return hide();
      const box = wrap.getBoundingClientRect();
      tip.textContent = bar.dataset.tip;
      tip.hidden = false;
      const x = event.clientX - box.left;
      tip.style.left = `${Math.max(4, Math.min(box.width - tip.offsetWidth - 4, x - tip.offsetWidth / 2))}px`;
      tip.style.top = `${Math.max(0, event.clientY - box.top - tip.offsetHeight - 12)}px`;
    });
  }

  function clearAllData() {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      /* nothing stored to clear */
    }
    Object.assign(state, blank, { cart: [], orders: [], listings: [], reviews: [], promo: null, account: null, theme: "dark" });
    applyTheme();
    render();
    toast("Everything this site stored on your device has been deleted");
  }

  /* ------------------------------------------------------------------ routing */

  function parseHash() {
    const hash = location.hash.replace(/^#\/?/, "");
    const [head, id] = hash.split("/");
    if (head === "note" && id) return { name: "note", id };
    if (head === "s" && id) return { name: "browse", id };
    if (head === "policy" && id) return { name: "policy", id };
    if (head === "dashboard") return { name: "earnings", id: null }; // old link
    if (["sell", "library", "earnings", "signin"].includes(head)) return { name: head, id: null };
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
    } else if (name === "signin") {
      view.innerHTML = signinView();
      const form = $("#signin-form");
      if (form) form.addEventListener("submit", submitSignin);
    } else if (name === "sell") {
      if (!signedIn()) {
        view.innerHTML = gateMarkup("Sign in to list notes", "Listings are tied to an account so buyers know who wrote them and so you can be paid.");
        syncChrome();
        return;
      }
      view.innerHTML = sellView();
      const form = $("#sell-form");
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        publishListing(form);
      });
      /* Only the preview redraws as you type. Re-rendering the whole form
       * would take focus away mid-field and discard an edit that had not
       * been committed to the draft yet. Selects fire `input` too, so one
       * listener covers every control. */
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
    } else if (name === "library") {
      view.innerHTML = libraryView();
    } else if (name === "earnings") {
      view.innerHTML = earningsView();
      bindChartTooltip();
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
    const first = !state.started;
    const changed = first || next.name !== state.route.name || next.id !== state.route.id;
    state.route = next;
    if (state.overlay && changed) state.overlay = null;
    render();
    if (changed) {
      const view = $("#view");
      replay(view, "is-entering");
      if (!first) {
        window.scrollTo({ top: 0, behavior: "auto" });
        if (view) view.focus({ preventScroll: true });
      }
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
      case "sign-out":
        signOut();
        break;
      case "theme":
        setTheme(el.dataset.value);
        break;
      case "signin-google":
        signinWithGoogle();
        break;
      case "back":
        location.hash = "#/";
        break;
      case "level":
        state.level = el.dataset.value;
        renderView();
        break;
      case "clear-filters":
        state.level = "all";
        state.query = "";
        if ($("#q")) $("#q").value = "";
        if (activeSubject() === "all") renderView();
        else location.hash = "#/";
        break;
      default:
        break;
    }
  });

  document.addEventListener("change", (event) => {
    const el = event.target.closest("[data-action]");
    if (!el) return;
    if (el.dataset.action === "sort") {
      state.sort = el.value;
      renderView();
    }
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

  applyTheme();
  watchSystemTheme();
  mountChrome();
  onRoute();
})();
