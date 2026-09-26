/**
 * Vérifie que /sitemap.xml contient au moins une balise <url><loc>.
 * Usage :
 *   node scripts/verify-sitemap.js
 *   node scripts/verify-sitemap.js https://www.africamenu.com/sitemap.xml
 */

"use strict";

var CANONICAL_ORIGIN = "https://www.africamenu.com";
var target = process.argv[2] || "http://127.0.0.1:4000/sitemap.xml";

function assertWwwCanonicalLocs(body, checkOrigin) {
  if (!checkOrigin) {
    return;
  }
  var locMatches = body.match(/<loc>([^<]+)<\/loc>/g) || [];
  for (var i = 0; i < locMatches.length; i += 1) {
    var inner = locMatches[i].replace(/<\/?loc>/g, "");
    if (inner.indexOf(CANONICAL_ORIGIN) !== 0) {
      throw new Error(
        "URL non canonique dans le sitemap : " +
          inner +
          " (attendu préfixe " +
          CANONICAL_ORIGIN +
          ")",
      );
    }
  }
}

async function main() {
  var response = await fetch(target);
  var body = await response.text();
  var contentType = response.headers.get("content-type") || "";
  var checkWww =
    target.indexOf("africamenu.com") !== -1 &&
    target.indexOf("127.0.0.1") === -1 &&
    target.indexOf("localhost") === -1;

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

  assertWwwCanonicalLocs(body, checkWww);

  if (checkWww) {
    console.log("Canonique www : OK");
  }

  console.log("\nOK — sitemap valide");
}

main().catch(function (err) {
  console.error("FAIL —", err.message || err);
  process.exit(1);
});
