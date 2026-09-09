/* Notecase — a storefront for buying and selling study notes.
 *
 * No build step, no framework. State lives in localStorage so the shop
 * works from a file:// URL, a static host, or a published artifact.
 *
 * Payments are NOT connected. Checkout records an order locally and
 * unlocks the download; see README.md for wiring a real payment
 * provider before taking money from anyone.
 */

(() => {
  "use strict";

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
  const money = (pence) =>
    new Intl.NumberFormat(CONFIG.locale, { style: "currency", currency: CONFIG.currency }).format(pence / 100);
  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const initials = (name) =>
    String(name || "?")
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] || "")
      .join("")
      .toUpperCase();

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

  const blank = { cart: [], orders: [], listings: [], promo: null, buyer: null };

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
      localStorage.setItem(STORE_KEY, JSON.stringify({ cart: state.cart, orders: state.orders, listings: state.listings, promo: state.promo, buyer: state.buyer }));
    } catch {
      /* private browsing, storage disabled — the session still works */
    }
  }

  const state = {
    ...readStore(),
    query: "",
    subject: "all",
    level: "all",
    sort: "popular",
    route: { name: "browse", id: null },
    overlay: null, // "cart" | "checkout" | null
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

  function filtered() {
    const q = state.query.trim().toLowerCase();
    let list = allNotes().filter((n) => {
      if (state.subject !== "all" && n.subject !== state.subject) return false;
      if (state.level !== "all" && n.level !== state.level) return false;
      if (!q) return true;
      return [n.title, n.course, n.institution, subjectName(n.subject), n.level, n.summary, n.seller?.name]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    const by = {
      popular: (a, b) => b.ratingCount - a.ratingCount,
      rating: (a, b) => b.rating - a.rating,
      "price-asc": (a, b) => a.price - b.price,
      "price-desc": (a, b) => b.price - a.price,
      newest: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    };
    return list.sort(by[state.sort] || by.popular);
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

  /* ------------------------------------------------------------ capabilities */

  let downloads = null;
  if (typeof window !== "undefined" && window.claude && typeof window.claude.use === "function") {
    window.claude.use("downloads").then((cap) => {
      downloads = cap;
    }).catch(() => {});
  }

  function packFor(note, order) {
    const lines = [
      `# ${note.title}`,
      "",
      `${note.course} · ${note.institution} · ${note.level}`,
      `${unitLabel(note)} · ${note.format} · updated ${note.updated}`,
      `Written by ${note.seller.name}${note.seller.grade ? ` (${note.seller.grade})` : ""}`,
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
    let root = document.getElementById("app");
    if (!root) {
      root = document.createElement("div");
      root.id = "app";
      document.body.appendChild(root);
    }
    root.innerHTML = `
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
            <button class="btn btn--sm cartbtn" data-action="open-cart" type="button">
              Cart <span class="cartbtn__count" id="cart-count">0</span>
            </button>
          </nav>
        </div>
      </header>
      <main id="view"></main>
      <footer class="footer">
        <div class="shell footer__inner">
          <p><strong>${esc(CONFIG.shopName)}</strong> — a storefront template for selling study notes. Sample catalogue; payments are not connected.</p>
          <p>Notes are study aids. Don't submit anyone else's work as your own.</p>
        </div>
      </footer>
      <div id="overlay"></div>
      <div id="toast-host" aria-live="polite"></div>`;

    $("#q").addEventListener("input", (e) => {
      state.query = e.target.value;
      if (state.route.name !== "browse") {
        location.hash = "#/";
      } else {
        renderView();
      }
    });
  }

  function syncChrome() {
    const count = state.cart.length;
    const badge = $("#cart-count");
    if (badge) badge.textContent = String(count);
    document.querySelectorAll("[data-route]").forEach((el) => {
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
    ${note.seller?.grade ? `<span class="card__grade">${esc(note.seller.grade)}</span>` : ""}`;

  const ratingMarkup = (note) =>
    note.ratingCount
      ? `<span class="rating"><span class="rating__star" aria-hidden="true">★</span>${note.rating.toFixed(1)}<span style="color:var(--ink-3)">(${note.ratingCount})</span></span>`
      : `<span class="rating" style="color:var(--ink-3)">No reviews yet</span>`;

  function cardMarkup(note) {
    const mine = Boolean(note.mine);
    return `
      <article class="card" style="--tint:${tintOf(note.subject)}">
        <button class="card__cover" type="button" data-action="open-note" data-id="${esc(note.id)}" aria-label="View ${esc(note.title)}">
          ${coverMarkup(note)}
        </button>
        <div class="card__body">
          <div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap">
            <span class="tag">${esc(subjectName(note.subject))}</span>
            <span class="tag">${esc(note.level)}</span>
            ${mine ? '<span class="tag tag--mine">Your listing</span>' : ""}
            ${note.isNew ? '<span class="tag tag--new">New</span>' : ""}
          </div>
          <h3 class="card__title"><button type="button" data-action="open-note" data-id="${esc(note.id)}">${esc(note.title)}</button></h3>
          <p class="card__meta">
            <span>${esc(note.course)}</span><span>${esc(unitLabel(note))}</span><span>${esc(note.format)}</span>
          </p>
          ${ratingMarkup(note)}
          <div class="card__foot">
            <p class="price">${money(note.price)}${note.listPrice && note.listPrice > note.price ? `<span class="price--was">${money(note.listPrice)}</span>` : ""}</p>
            ${cartButton(note, "btn--sm")}
          </div>
        </div>
      </article>`;
  }

  function cartButton(note, extra = "") {
    if (owns(note.id)) return `<span class="owned"><span aria-hidden="true">✓</span> In library</span>`;
    if (inCart(note.id))
      return `<button class="btn ${extra} btn--ghost" type="button" data-action="open-cart">In cart</button>`;
    return `<button class="btn ${extra} btn--primary" type="button" data-action="add" data-id="${esc(note.id)}">Add to cart</button>`;
  }

  /* ------------------------------------------------------------- browse view */

  function browseView() {
    const notes = filtered();
    const total = allNotes().length;
    const avg = (allNotes().reduce((s, n) => s + (n.rating || 0), 0) / total).toFixed(2);
    const subjectsUsed = new Set(allNotes().map((n) => n.subject)).size;

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
            <p class="eyebrow">Notes that already earned the grade</p>
            <h1>Sell the notes you <span class="mark">already wrote</span>.</h1>
            <p class="band__lede">A storefront for lecture notes, essay banks, case grids and flashcard decks. Sellers keep ${100 - CONFIG.platformFeePct}% of every sale; buyers get the file the moment they check out.</p>
            <div class="band__actions">
              <a class="btn btn--primary" href="#/sell" data-nav>List your notes</a>
              <a class="btn btn--ghost" href="#/library" data-nav>Your library</a>
            </div>
          </div>
          <div>
            <div class="stats">
              <div class="stat"><p class="stat__num">${total}</p><p class="stat__label">Note packs listed</p></div>
              <div class="stat"><p class="stat__num">${subjectsUsed}</p><p class="stat__label">Subjects covered</p></div>
              <div class="stat"><p class="stat__num">${avg}</p><p class="stat__label">Average rating</p></div>
            </div>
            <div class="notice">
              <span aria-hidden="true" class="mono">i</span>
              <p><b>Sample catalogue.</b> These listings are examples so the shop opens in a working state. Payments aren't connected — checkout records the order and unlocks the download.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="filters">
        <div class="shell filters__inner">
          <div class="chips" role="group" aria-label="Filter by subject">${chips}</div>
          <div class="filters__right">
            <label class="sr-only" for="level">Level</label>
            <select id="level" data-action="level">
              <option value="all"${state.level === "all" ? " selected" : ""}>Any level</option>
              ${LEVELS.map((l) => `<option value="${esc(l)}"${state.level === l ? " selected" : ""}>${esc(l)}</option>`).join("")}
            </select>
            <label class="sr-only" for="sort">Sort</label>
            <select id="sort" data-action="sort">
              <option value="popular"${state.sort === "popular" ? " selected" : ""}>Most reviewed</option>
              <option value="rating"${state.sort === "rating" ? " selected" : ""}>Highest rated</option>
              <option value="newest"${state.sort === "newest" ? " selected" : ""}>Newest</option>
              <option value="price-asc"${state.sort === "price-asc" ? " selected" : ""}>Price: low to high</option>
              <option value="price-desc"${state.sort === "price-desc" ? " selected" : ""}>Price: high to low</option>
            </select>
          </div>
        </div>
      </section>

      <div class="shell">
        <div class="resultline">
          <h2 style="font-size:var(--step-2)">${state.subject === "all" ? "All notes" : esc(subjectName(state.subject))}</h2>
          <p class="resultline__count">${notes.length} of ${total}${state.query ? ` matching “${esc(state.query)}”` : ""}</p>
        </div>
        <div class="grid">
          ${
            notes.length
              ? notes.map(cardMarkup).join("")
              : `<div class="empty">
                   <h3>Nothing matches that yet</h3>
                   <p>Try a broader subject, or clear the search. If you wrote these notes, list them yourself.</p>
                   <p style="margin-top:1rem"><a class="btn btn--primary" href="#/sell" data-nav>List your notes</a></p>
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
            ${
              locked
                ? `<div class="page__lock"><span>Locked</span><span>${esc(unitLabel(note))} unlock<br>after purchase</span></div>`
                : ""
            }
            <span class="page__num">${n}</span>
          </div>`;
      })
      .join("");
  }

  function detailView(note) {
    const t = note.contents.length;
    return `
      <div class="shell detail">
        <button class="backlink" type="button" data-action="back"><span aria-hidden="true">←</span> All notes</button>
        <div class="detail__grid">
          <div>
            <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.9rem">
              <span class="tag">${esc(subjectName(note.subject))}</span>
              <span class="tag">${esc(note.level)}</span>
              ${note.mine ? '<span class="tag tag--mine">Your listing</span>' : ""}
            </div>
            <h2>${esc(note.title)}</h2>
            <p class="detail__sub">
              <span>${esc(note.course)}</span><span>${esc(note.institution)}</span>
              <span>${esc(unitLabel(note))}</span><span>${esc(note.format)}</span>
              <span>Updated ${esc(note.updated)}</span>
            </p>
            <p class="detail__summary">${esc(note.summary)}</p>

            <section class="section">
              <h3>Inside the pack</h3>
              <div class="pages">${pagePreview(note)}</div>
              <p style="margin-top:.7rem;font-size:.8125rem;color:var(--ink-3)">Preview shows sample pages. The full ${esc(unitLabel(note))} download unlocks at checkout.</p>
            </section>

            <section class="section">
              <h3>Contents <span class="mono" style="font-size:.75rem;color:var(--ink-3);font-weight:400">${t} sections</span></h3>
              <ul class="contents">
                ${note.contents
                  .map(([label, page]) => `<li><span>${esc(label)}</span><span class="pageno">${page ? `p.${page}` : ""}</span></li>`)
                  .join("")}
              </ul>
            </section>

            <section class="section">
              <h3>What you get</h3>
              <ul class="includes">${note.includes.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
            </section>

            ${
              note.reviews && note.reviews.length
                ? `<section class="section">
                     <h3>Reviews <span class="mono" style="font-size:.75rem;color:var(--ink-3);font-weight:400">${note.rating.toFixed(1)} average from ${note.ratingCount}</span></h3>
                     <div class="reviews">
                       ${note.reviews
                         .map(
                           (r) => `
                         <article class="review">
                           <div class="avatar" aria-hidden="true">${esc(initials(r.name))}</div>
                           <div>
                             <div class="review__head">
                               <span class="review__name">${esc(r.name)}</span>
                               <span class="rating"><span class="rating__star" aria-hidden="true">★</span>${r.rating}</span>
                               ${r.verified ? '<span class="verified"><span aria-hidden="true">✓</span> Verified purchase</span>' : ""}
                               <span class="review__when">${esc(r.when)}</span>
                             </div>
                             <p>${esc(r.text)}</p>
                           </div>
                         </article>`,
                         )
                         .join("")}
                     </div>
                   </section>`
                : ""
            }
          </div>

          <aside class="buypanel">
            <div class="buypanel__top">
              <div class="buypanel__price">
                <p class="price">${money(note.price)}${note.listPrice && note.listPrice > note.price ? `<span class="price--was">${money(note.listPrice)}</span>` : ""}</p>
                ${ratingMarkup(note)}
              </div>
              ${
                owns(note.id)
                  ? `<button class="btn btn--primary btn--wide" type="button" data-action="download" data-id="${esc(note.id)}">Download again</button>
                     <p style="font-size:.8125rem;color:var(--tick);text-align:center"><span aria-hidden="true">✓</span> Already in your library</p>`
                  : inCart(note.id)
                    ? `<button class="btn btn--wide" type="button" data-action="open-cart">Go to cart</button>
                       <button class="btn btn--ghost btn--wide" type="button" data-action="remove" data-id="${esc(note.id)}">Remove from cart</button>`
                    : `<button class="btn btn--primary btn--wide" type="button" data-action="add" data-id="${esc(note.id)}">Add to cart</button>
                       <button class="btn btn--ghost btn--wide" type="button" data-action="buy-now" data-id="${esc(note.id)}">Buy now</button>`
              }
            </div>
            <dl class="buypanel__rows">
              <div class="buyrow"><dt>Format</dt><dd>${esc(note.format)}</dd></div>
              <div class="buyrow"><dt>${note.cards ? "Cards" : "Pages"}</dt><dd>${note.cards || note.pages}</dd></div>
              <div class="buyrow"><dt>Last updated</dt><dd>${esc(note.updated)}</dd></div>
              <div class="buyrow"><dt>Delivery</dt><dd>Instant download</dd></div>
            </dl>
            <p class="licence"><b>Personal study licence.</b> Yours to read, print and annotate for your own study. Reselling or reposting the file isn't allowed.</p>
            <div class="seller">
              <div class="avatar" aria-hidden="true">${esc(initials(note.seller.name))}</div>
              <div>
                <p class="seller__name">${esc(note.seller.name)}</p>
                <p class="seller__meta">${esc(note.seller.grade || "Seller")} · ${note.seller.sales ? `${note.seller.sales.toLocaleString(CONFIG.locale)} sales` : "New seller"}${note.seller.since ? ` · since ${esc(note.seller.since)}` : ""}</p>
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
          <h2>Library</h2>
          <p>Everything you've bought, ready to download again whenever you need it. Downloads never expire.</p>
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
                  <h3 class="libitem__title">${esc(note.title)}</h3>
                  <p class="libitem__meta">${esc(note.course)} · ${esc(unitLabel(note))} · ${esc(note.format)} · order ${esc(order.ref)}</p>
                </div>
                <div class="libitem__actions">
                  <button class="btn btn--sm btn--ghost" type="button" data-action="open-note" data-id="${esc(note.id)}">View listing</button>
                  <button class="btn btn--sm btn--primary" type="button" data-action="download" data-id="${esc(note.id)}">Download</button>
                </div>
              </article>`,
                  )
                  .join("")
              : `<div class="empty">
                   <h3>Nothing here yet</h3>
                   <p>Notes you buy land here straight after checkout.</p>
                   <p style="margin-top:1rem"><a class="btn btn--primary" href="#/" data-nav>Browse notes</a></p>
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
    const priceP = Math.max(0, Math.round(parseFloat(draft.price || "0") * 100));
    return {
      id: "draft",
      title: draft.title || "Your note pack title",
      subject: draft.subject,
      course: draft.course || "COURSE 000",
      institution: draft.institution || "Your institution",
      level: draft.level,
      pages: Number(draft.pages) || 0,
      format: draft.format,
      price: priceP,
      rating: 0,
      ratingCount: 0,
      updated: new Date().toLocaleDateString(CONFIG.locale, { month: "short", year: "numeric" }),
      seller: { name: "You", grade: draft.grade, sales: 0 },
      summary: draft.summary,
      contents: [],
      includes: [],
      reviews: [],
    };
  }

  function sellView() {
    const preview = draftNote();
    const priceP = preview.price;
    const fee = Math.round((priceP * CONFIG.platformFeePct) / 100);

    return `
      <div class="shell">
        <div class="page-head">
          <p class="eyebrow">Seller</p>
          <h2>List your notes</h2>
          <p>Describe the pack the way a buyer decides: which module it covers, how long it is, and what result it earned. Listings go live the moment you publish.</p>
        </div>
        <form class="sell__grid" id="sell-form" novalidate>
          <div class="panel">
            <h3>Listing details</h3>
            <div class="formgrid">
              <div class="field">
                <label for="f-title">Title</label>
                <input id="f-title" name="title" value="${esc(draft.title)}" placeholder="Reaction Mechanisms, Fully Drawn" required>
                <span class="hint">Say what the notes cover, not that they are notes.</span>
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
                  <label for="f-price">Price (£)</label>
                  <input id="f-price" name="price" inputmode="decimal" value="${esc(draft.price)}" placeholder="7.50">
                </div>
                <div class="field">
                  <label for="f-grade">Result you earned</label>
                  <input id="f-grade" name="grade" value="${esc(draft.grade)}" placeholder="First · 82%">
                  <span class="hint">Optional, but it sells.</span>
                </div>
              </div>
              <div class="field">
                <label for="f-summary">Summary</label>
                <textarea id="f-summary" name="summary" placeholder="Two or three sentences on what's inside and who it's for.">${esc(draft.summary)}</textarea>
              </div>
              <div class="field">
                <label for="f-contents">Contents, one per line</label>
                <textarea id="f-contents" name="contents" placeholder="Arrow-pushing conventions&#10;SN1 vs SN2 decision tree&#10;40 worked past-paper mechanisms">${esc(draft.contents)}</textarea>
                <span class="hint">Buyers scan this before anything else.</span>
              </div>
              <button class="btn btn--primary btn--wide" type="submit">Publish listing</button>
            </div>
          </div>

          <div class="preview-sticky">
            <div>
              <p class="eyebrow" style="margin-bottom:.6rem">Live preview</p>
              <div class="grid" style="grid-template-columns:minmax(0,1fr);padding-bottom:0">${cardMarkup({ ...preview, mine: true })}</div>
            </div>
            <div class="panel">
              <h3 style="font-size:var(--step-1)">Your payout</h3>
              <div class="payout">
                <div class="payout__row"><span>Buyer pays</span><span>${money(priceP)}</span></div>
                <div class="payout__row"><span>${CONFIG.shopName} fee (${CONFIG.platformFeePct}%)</span><span>−${money(fee)}</span></div>
                <div class="payout__row payout__row--sum"><span>You keep</span><span>${money(priceP - fee)}</span></div>
              </div>
              <p style="font-size:.75rem;color:var(--ink-3);margin-top:.8rem">${esc(CONFIG.vatNote)} Payouts run weekly once a payment provider is connected.</p>
            </div>
            <div class="notice" style="margin-top:0">
              <span aria-hidden="true" class="mono">i</span>
              <p>Only list work you wrote yourself. Uploading a lecturer's slides or a textbook chapter is copyright infringement, and the listing will be removed.</p>
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
          <h2>Your sales</h2>
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
              ? `<div class="panel" style="padding:0">
                   <div class="tablewrap">
                     <table class="table">
                       <thead><tr><th>Listing</th><th>Level</th><th>Price</th><th>Sold</th><th>Earned</th></tr></thead>
                       <tbody>
                         ${mine
                           .map((n) => {
                             const copies = sold.filter((s) => s.id === n.id).length;
                             const earned = Math.round(copies * n.price * (1 - CONFIG.platformFeePct / 100));
                             return `<tr>
                               <td><button class="linkbtn" type="button" data-action="open-note" data-id="${esc(n.id)}" style="font-size:.875rem;color:var(--ink)">${esc(n.title)}</button><br><span class="mono" style="font-size:.75rem;color:var(--ink-3)">${esc(n.course)}</span></td>
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
                   <p style="margin-top:1rem"><a class="btn btn--primary" href="#/sell" data-nav>List your notes</a></p>
                 </div>`
          }
        </div>
      </div>`;
  }

  /* --------------------------------------------------------------- overlays */

  function cartMarkup() {
    const { items, subtotal, discount, promo, total } = totals();
    return `
      <div class="scrim" data-action="close-overlay"></div>
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="Cart">
        <header class="drawer__head">
          <h2>Cart <span class="mono" style="font-size:.8125rem;color:var(--ink-3);font-weight:400">${items.length} ${items.length === 1 ? "pack" : "packs"}</span></h2>
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
                <span class="price" style="font-size:.9375rem">${money(n.price)}</span>
                <button class="linkbtn" type="button" data-action="remove" data-id="${esc(n.id)}">Remove</button>
              </div>
            </div>`,
                  )
                  .join("")
              : `<p style="color:var(--ink-2)">Your cart is empty. Add a note pack and it'll show up here.</p>`
          }
          ${
            items.length
              ? `<div class="field" style="margin-top:.5rem">
                   <label for="promo">Discount code</label>
                   <div style="display:flex;gap:.5rem">
                     <input id="promo" placeholder="FRESHERS10" value="${esc(state.promo || "")}">
                     <button class="btn btn--ghost btn--sm" type="button" data-action="apply-promo">Apply</button>
                   </div>
                   ${promo ? `<span class="hint" style="color:var(--tick)">${esc(promo.label)} applied</span>` : ""}
                 </div>`
              : ""
          }
        </div>
        ${
          items.length
            ? `<div class="drawer__foot">
                 <div class="totals">
                   <div class="totals__row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
                   ${discount ? `<div class="totals__row" style="color:var(--tick)"><span>Discount</span><span>−${money(discount)}</span></div>` : ""}
                   <div class="totals__row"><span>VAT</span><span>Included</span></div>
                   <div class="totals__row totals__row--sum"><span>Total</span><span>${money(total)}</span></div>
                 </div>
                 <button class="btn btn--primary btn--wide" type="button" data-action="checkout">Checkout</button>
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
        <div class="modal__card" role="dialog" aria-modal="true" aria-label="Checkout">
          <header class="modal__head">
            <div>
              <p class="eyebrow">Step 2 of 2</p>
              <h2>Checkout</h2>
            </div>
            <button class="iconbtn" type="button" data-action="close-overlay" aria-label="Close checkout">✕</button>
          </header>
          <form class="modal__body" id="checkout-form" novalidate>
            <div class="demoflag">
              <span class="demoflag__mark" aria-hidden="true">!</span>
              <p><b>Demo checkout — no money moves.</b> There are no card fields here on purpose. Connect Stripe, Paddle or Lemon Squeezy before selling to real buyers; the README shows where the hook goes.</p>
            </div>
            <div class="formgrid formgrid--2">
              <div class="field">
                <label for="c-name">Name</label>
                <input id="c-name" name="name" value="${esc(state.buyer?.name || "")}" placeholder="Alex Doyle" required>
              </div>
              <div class="field">
                <label for="c-email">Email for the download</label>
                <input id="c-email" name="email" type="email" value="${esc(state.buyer?.email || "")}" placeholder="alex@university.ac.uk" required>
              </div>
            </div>
            <div class="receipt">
              ${items.map((n) => `<div class="receipt__row"><span>${esc(n.title)}</span><span>${money(n.price)}</span></div>`).join("")}
              ${discount ? `<div class="receipt__row" style="color:var(--tick)"><span>Discount</span><span>−${money(discount)}</span></div>` : ""}
              <div class="receipt__row" style="border-top:1px solid var(--rule);padding-top:.5rem;font-weight:600"><span>Total</span><span>${money(total)}</span></div>
              <p style="font-size:.75rem;color:var(--ink-3)">${esc(CONFIG.vatNote)} Subtotal ${money(subtotal)}.</p>
            </div>
            <p id="checkout-error" style="color:var(--pen);font-size:.8125rem" hidden></p>
          </form>
          <div class="modal__foot">
            <button class="btn btn--primary btn--wide" type="submit" form="checkout-form">Place demo order · ${money(total)}</button>
            <button class="btn btn--ghost btn--wide" type="button" data-action="open-cart">Back to cart</button>
          </div>
        </div>
      </div>`;
  }

  function renderOverlay() {
    const host = $("#overlay");
    if (!host) return;
    host.innerHTML = state.overlay === "cart" ? cartMarkup() : state.overlay === "checkout" ? checkoutMarkup() : "";
    document.body.style.overflow = state.overlay ? "hidden" : "";
    if (state.overlay === "checkout") {
      const form = $("#checkout-form");
      if (form) form.addEventListener("submit", submitCheckout);
      const name = $("#c-name");
      if (name) name.focus();
    }
  }

  function toast(message) {
    const host = $("#toast-host");
    if (!host) return;
    host.innerHTML = `<div class="toast">${esc(message)}</div>`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      host.innerHTML = "";
    }, 3200);
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
    const name = $("#c-name").value.trim();
    const email = $("#c-email").value.trim();
    const error = $("#checkout-error");
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      error.hidden = false;
      error.textContent = !name ? "Add a name so the receipt has someone on it." : "That email doesn't look right — the download link goes there.";
      return;
    }
    const { total } = totals();
    const order = {
      ref: `NC-${Date.now().toString(36).toUpperCase().slice(-6)}`,
      date: Date.now(),
      items: [...state.cart],
      total,
      name,
      email,
    };
    state.orders.push(order);
    state.buyer = { name, email };
    state.cart = [];
    state.promo = null;
    state.overlay = null;
    writeStore();
    location.hash = "#/library";
    toast(`Order ${order.ref} placed — ${order.items.length} pack${order.items.length === 1 ? "" : "s"} in your library`);
  }

  function publishListing(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    Object.assign(draft, data);
    if (!draft.title.trim()) {
      toast("Give the listing a title first");
      $("#f-title").focus();
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
      rating: 0,
      ratingCount: 0,
      updated: new Date().toLocaleDateString(CONFIG.locale, { month: "short", year: "numeric" }),
      createdAt: Date.now(),
      isNew: true,
      mine: true,
      seller: { name: "You", grade: (draft.grade || "").trim(), sales: 0, since: String(new Date().getFullYear()) },
      summary: (draft.summary || "").trim() || "No summary yet — add one to help buyers decide.",
      contents: contents.length ? contents : [["Contents to be added", 0]],
      includes: [`${Number(draft.pages) || "?"} ${draft.format.includes("Anki") ? "cards" : "pages"}, ${draft.format}`, "Instant download after purchase"],
      reviews: [],
    });
    Object.assign(draft, { title: "", course: "", institution: "", pages: "", grade: "", summary: "", contents: "" });
    writeStore();
    location.hash = `#/note/${id}`;
    toast("Listing published — it's live in the shop");
  }

  /* ------------------------------------------------------------------ routing */

  function parseHash() {
    const hash = location.hash.replace(/^#\/?/, "");
    const [head, id] = hash.split("/");
    if (head === "note" && id) return { name: "note", id };
    if (["sell", "library", "dashboard"].includes(head)) return { name: head, id: null };
    return { name: "browse", id: null };
  }

  function renderView() {
    const view = $("#view");
    if (!view) return;
    if (state.route.name === "note") {
      const note = noteById(state.route.id);
      view.innerHTML = note
        ? detailView(note)
        : `<div class="shell"><div class="empty" style="margin-block:4rem"><h3>That listing has gone</h3><p>It may have been unpublished.</p><p style="margin-top:1rem"><a class="btn btn--primary" href="#/" data-nav>Browse notes</a></p></div></div>`;
    } else if (state.route.name === "sell") {
      view.innerHTML = sellView();
      const form = $("#sell-form");
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        publishListing(form);
      });
      form.addEventListener("input", (e) => {
        if (!e.target.name) return;
        draft[e.target.name] = e.target.value;
        const preview = $(".preview-sticky");
        if (preview) {
          const fresh = document.createElement("div");
          fresh.innerHTML = sellView();
          preview.innerHTML = fresh.querySelector(".preview-sticky").innerHTML;
        }
      });
      form.addEventListener("change", (e) => {
        if (!e.target.name) return;
        draft[e.target.name] = e.target.value;
        renderView();
      });
    } else if (state.route.name === "library") {
      view.innerHTML = libraryView();
    } else if (state.route.name === "dashboard") {
      view.innerHTML = dashboardView();
    } else {
      view.innerHTML = browseView();
    }
    syncChrome();
  }

  function render() {
    renderView();
    renderOverlay();
    syncChrome();
  }

  function onRoute() {
    const next = parseHash();
    const changed = next.name !== state.route.name || next.id !== state.route.id;
    state.route = next;
    if (state.overlay && changed) state.overlay = null;
    render();
    if (changed) window.scrollTo({ top: 0, behavior: "auto" });
  }

  /* ------------------------------------------------------------------- events */

  document.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-nav]");
    if (nav) return; // let the hash link do its work

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
    }
  });

  window.addEventListener("hashchange", onRoute);

  mountChrome();
  onRoute();
})();
