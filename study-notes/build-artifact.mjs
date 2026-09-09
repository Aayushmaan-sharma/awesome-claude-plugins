/* Inline styles.css, catalog.js and app.js into a single-file page.
 *
 *   node build-artifact.mjs [outfile]
 *
 * The output has no <!doctype>, <html>, <head> or <body> wrapper: it is
 * the body content a Claude Artifact expects. Any static host will also
 * serve it as-is.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const here = import.meta.dirname;
const outfile = resolve(process.argv[2] || resolve(here, "dist/artifact.html"));
const read = (name) => readFileSync(resolve(here, name), "utf8");

const FONTS =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600;700&family=Instrument+Sans:wght@400;500;600&family=Spline+Sans+Mono:wght@400;500;600&display=swap">';

const parts = [
  "<title>Notecase</title>",
  FONTS,
  `<style>\n${read("styles.css")}</style>`,
  '<div id="app"></div>',
  `<script>\n${read("catalog.js")}\n</script>`,
  `<script>\n${read("app.js")}\n</script>`,
];

for (const name of ["catalog.js", "app.js"]) {
  if (/<\/script/i.test(read(name))) throw new Error(`${name} contains </script and cannot be inlined`);
}

const html = `${parts.join("\n")}\n`;

mkdirSync(dirname(outfile), { recursive: true });
writeFileSync(outfile, html);
console.log(`${outfile} — ${(html.length / 1024).toFixed(1)} KB`);
