/**
 * Regenerates backend/config/catalog.php from the compiled lib/catalog.ts so
 * the two cannot drift by hand. CatalogParityTest enforces that they match.
 *
 * usage: node scripts/migration/gen-catalog-php.js <compiled-catalog.js>
 */
const fs = require("fs");
const path = require("path");

const { CATALOG } = require(process.argv[2]);

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

let out = `<?php

/**
 * Fallback catalogue, mirroring lib/catalog.ts in the app.
 *
 * Both are now generated from \`public.service_prices\`, which is the
 * authority: \`enforce_item_price\` looks each line up by \`item_id\` and
 * refuses anything it does not recognise. An earlier version of this file used
 * invented ids (\`tshirt\`, \`suit_2pc\`) that existed in neither the database
 * nor a real order, and every checkout failed on its line items because of it.
 *
 * Keys are the app's service keys; the ids inside are the database's.
 * Regenerate with scripts/migration/gen-catalog-php.js — do not hand-edit.
 */
return [
`;

for (const s of CATALOG) {
  out += `    '${esc(s.serviceId)}' => [\n`;
  for (const c of s.categories) {
    for (const i of c.items) {
      out += `        '${esc(i.itemId)}' => ['name' => '${esc(i.name)}', 'price' => ${i.price}],\n`;
    }
  }
  out += `    ],\n`;
}
out += `];\n`;

const target = path.join(__dirname, "..", "..", "backend", "config", "catalog.php");
fs.writeFileSync(target, out, "utf8");

const items = CATALOG.reduce((n, s) => n + s.categories.reduce((m, c) => m + c.items.length, 0), 0);
console.log(`wrote ${target} — ${CATALOG.length} services, ${items} items`);
