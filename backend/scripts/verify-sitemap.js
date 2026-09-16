/**
 * Vérifie que /sitemap.xml contient au moins une balise <url><loc>.
 * Usage :
 *   node scripts/verify-sitemap.js
 *   node scripts/verify-sitemap.js https://africamenu.com/sitemap.xml
 */

"use strict";

var target = process.argv[2] || "http://127.0.0.1:4000/sitemap.xml";

async function main() {
  var response = await fetch(target);
  var body = await response.text();
  var contentType = response.headers.get("content-type") || "";

  console.log("URL:", target);
  console.log("HTTP:", response.status);
  console.log("Content-Type:", contentType);

  if (response.status !== 200) {
    throw new Error("Statut HTTP attendu : 200");
  }
  if (contentType.indexOf("xml") === -1) {
    throw new Error("Content-Type XML attendu");
  }
  if (body.indexOf("<urlset") === -1) {
    throw new Error("Balise <urlset> absente");
  }

  var locMatches = body.match(/<loc>[^<]+<\/loc>/g) || [];
  console.log("URLs trouvées:", locMatches.length);
  locMatches.slice(0, 5).forEach(function (line) {
    console.log(" ", line);
  });

  if (!locMatches.length) {
    throw new Error("Aucune balise <loc> — sitemap vide");
  }

  console.log("\nOK — sitemap valide");
}

main().catch(function (err) {
  console.error("FAIL —", err.message || err);
  process.exit(1);
});
