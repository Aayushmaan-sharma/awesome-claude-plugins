/* Contrast check for the palette in styles.css.
 *
 *   node check-a11y.mjs
 *
 * Reads the tokens straight out of the stylesheet so it checks what ships,
 * not a copy. Exits non-zero if any pair falls below its WCAG 2.2 threshold:
 * 4.5:1 for text, 3:1 for the boundary of a control the user has to find.
 *
 * Both themes are checked, and within each the two grounds the design uses:
 * the UI surfaces, and the white sheets used for covers, preview pages and
 * cart thumbnails. Light only redefines the tokens that change, so it is
 * merged over dark here exactly as the cascade merges it in the browser.
 *
 * 1.4.11 asks whether a control's edge is discernible against what sits behind
 * it, not whether its border contrasts with its own fill. Surfaces filled with
 * --mark (primary button, grade stamp) all carry a 1px --ink border, so the
 * check is that border against the page.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8");

function tokensFrom(blockStart) {
  const at = css.indexOf(blockStart);
  if (at === -1) throw new Error(`missing block: ${blockStart}`);
  const body = css.slice(at, css.indexOf("}", at));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(([, k, v]) => [k, v.toLowerCase()]));
}

const dark = tokensFrom(":root {");
const themes = { dark, light: { ...dark, ...tokensFrom(':root[data-appearance="light"] {') } };

const relLum = (hex) => {
  const c = hex
    .replace("#", "")
    .match(/../g)
    .map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const PAIRS = [
  // the desk
  ["ink", "paper", 4.5, "body text on the page"],
  ["ink", "surface", 4.5, "body text on a card"],
  ["ink", "sunken", 4.5, "text on a tag or sunken panel"],
  ["ink-2", "paper", 4.5, "secondary text on the page"],
  ["ink-2", "surface", 4.5, "secondary text on a card"],
  ["ink-2", "sunken", 4.5, "tag text"],
  ["ink-3", "paper", 4.5, "hints and page numbers on the page"],
  ["ink-3", "surface", 4.5, "hints and page numbers on a card"],
  ["accent", "paper", 4.5, "accent marks on the page"],
  ["accent", "surface", 4.5, "accent marks on a card"],
  ["accent-hi", "surface", 3, "a chart bar under the pointer"],
  ["tick", "surface", 4.5, "success text on a card"],
  ["tick", "paper", 4.5, "success text on the page"],
  ["pen", "surface", 4.5, "error text on a card"],
  ["pen", "paper", 4.5, "error text on the page"],

  // actions
  ["on-action", "action", 4.5, "primary button label"],
  ["on-action", "action-hover", 4.5, "primary button label on hover"],
  ["paper", "ink", 4.5, "toast and pressed chip"],
  ["action", "paper", 3, "primary button edge against the page"],
  ["action", "surface", 3, "primary button edge against a card"],
  ["field-border", "paper", 3, "input and chip border on the page"],
  ["field-border", "surface", 3, "input border on a card"],

  // the white sheets: covers, sample pages, cart thumbnails
  ["sheet-ink", "sheet", 4.5, "course code stamped on a cover"],
  ["sheet-ink-2", "sheet", 4.5, "institution, format and page numbers on paper"],
  ["sheet-ink", "sheet-mark", 4.5, "text under a marker stroke on paper"],
  ["sheet-edge", "paper", 3, "the paper's drawn edge against the page"],
  ["sheet-ink", "sheet-line", 3, "ruled text bars against the page they sit on"],
  ["sheet-edge", "sheet", 3, "the grade chip's border on a cover"],
];

const quiet = process.argv.includes("--quiet");
let failed = 0;
for (const [name, t] of Object.entries(themes)) {
  if (!quiet) console.log(`\n${name}`);
  for (const [fg, bg, min, what] of PAIRS) {
    if (!t[fg] || !t[bg]) throw new Error(`${name}: token --${!t[fg] ? fg : bg} is not defined`);
    const r = ratio(t[fg], t[bg]);
    const ok = r + 1e-9 >= min;
    if (!ok) failed += 1;
    if (!quiet || !ok) console.log(`  ${ok ? "ok  " : "FAIL"}  ${r.toFixed(2)}  (min ${min})  --${fg} on --${bg} — ${what}`);
  }
}

if (!quiet || failed) console.log(failed ? `\n${failed} pair(s) below threshold` : "\nall pairs pass");
process.exit(failed ? 1 : 0);
