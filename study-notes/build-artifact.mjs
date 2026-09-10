/* Inline the stylesheet, the fonts and the scripts into a single-file page.
 *
 *   node build-artifact.mjs [outfile]
 *
 * The output has no <!doctype>, <html>, <head> or <body> wrapper: it is the
 * body content a Claude Artifact expects. Any static host will also serve it
 * as-is. Fonts become data: URIs so the single file still makes no
 * third-party request.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const here = import.meta.dirname;

// The accessibility statement says a failing contrast pair stops the build.
execFileSync(process.execPath, [resolve(here, "check-a11y.mjs"), "--quiet"], { stdio: "inherit" });
const outfile = resolve(process.argv[2] || resolve(here, "dist/artifact.html"));
const read = (name) => readFileSync(resolve(here, name), "utf8");

const scripts = ["catalog.js", "policies.js", "app.js"];
for (const name of scripts) {
  if (/<\/script/i.test(read(name))) throw new Error(`${name} contains </script and cannot be inlined`);
}

// url("fonts/x.woff2") -> url(data:font/woff2;base64,...)
let css = read("styles.css");
const fontRefs = [...css.matchAll(/url\("(fonts\/[^"]+\.woff2)"\)/g)];
if (!fontRefs.length) throw new Error("no font references found in styles.css");
for (const [whole, path] of fontRefs) {
  const base64 = readFileSync(resolve(here, path)).toString("base64");
  css = css.replace(whole, `url(data:font/woff2;base64,${base64})`);
}

const parts = [
  "<title>Notecase</title>",
  `<style>\n${css}</style>`,
  '<div id="app"></div>',
  ...scripts.map((name) => `<script>\n${read(name)}\n</script>`),
];

const html = `${parts.join("\n")}\n`;
mkdirSync(dirname(outfile), { recursive: true });
writeFileSync(outfile, html);
console.log(`${outfile} — ${(html.length / 1024).toFixed(1)} KB, ${fontRefs.length} fonts inlined`);
