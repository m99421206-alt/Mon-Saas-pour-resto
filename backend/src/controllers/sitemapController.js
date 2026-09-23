const { getPool } = require("../config/database");

/** Domaine canonique (aligné Google Search Console / canonical homepage). */
var CANONICAL_SITE_ORIGIN = "https://www.africamenu.com";

/**
 * Slugs de test/dev — exclus du sitemap sans modification MySQL.
 * Les menus restent accessibles ; menu_suspended reste le levier admin en prod.
 */
var SITEMAP_EXCLUDED_SLUGS = new Set(["u", "mou", "leh", "test-2"]);

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDate(value) {
  if (!value) {
    return null;
  }
  var date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function buildUrlEntry(entry) {
  if (!entry || !entry.loc) {
    return "";
  }

  var lines = ["  <url>", "    <loc>" + escapeXml(entry.loc) + "</loc>"];
  if (entry.lastmod) {
    lines.push("    <lastmod>" + escapeXml(entry.lastmod) + "</lastmod>");
  }
  if (entry.changefreq) {
    lines.push("    <changefreq>" + escapeXml(entry.changefreq) + "</changefreq>");
  }
  if (entry.priority != null && entry.priority !== "") {
    lines.push("    <priority>" + escapeXml(entry.priority) + "</priority>");
  }
  lines.push("  </url>");
  return lines.join("\n");
}

function buildSitemapXml(urls) {
  var body = urls.map(buildUrlEntry).filter(Boolean).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    body,
    "</urlset>",
  ].join("\n");
}

function getSiteOrigin(req) {
  var explicitOrigin = String(
    process.env.SITE_ORIGIN || process.env.PUBLIC_SITE_ORIGIN || "",
  ).trim();
  if (explicitOrigin) {
    return explicitOrigin.replace(/\/$/, "");
  }

  var host = req.get("host");
  if (host) {
    var protocol = req.protocol || "https";
    var normalizedHost = String(host).replace(/^www\./i, "");
    if (normalizedHost === "africamenu.com") {
      return "https://www.africamenu.com";
    }
    return protocol + "://" + host;
  }

  return CANONICAL_SITE_ORIGIN;
}

function getStaticPages(baseUrl) {
  var today = new Date().toISOString().slice(0, 10);

  return [
    {
      loc: baseUrl + "/",
      lastmod: today,
      changefreq: "daily",
      priority: "1.0",
    },
  ];
}

function isMissingMenuSuspendedColumn(err) {
  return err && (err.code === "ER_BAD_FIELD_ERROR" || err.errno === 1054);
}

async function fetchPublicRestaurants(pool) {
  var queryWithMenuFilter =
    "SELECT slug, created_at FROM restaurants " +
    "WHERE slug IS NOT NULL AND TRIM(slug) <> '' AND COALESCE(menu_suspended, 0) = 0 " +
    "ORDER BY created_at DESC";

  try {
    var [rows] = await pool.query(queryWithMenuFilter);
    return rows;
  } catch (err) {
    if (!isMissingMenuSuspendedColumn(err)) {
      throw err;
    }
  }

  var [fallbackRows] = await pool.query(
    "SELECT slug, created_at FROM restaurants " +
      "WHERE slug IS NOT NULL AND TRIM(slug) <> '' " +
      "ORDER BY created_at DESC",
  );
  return fallbackRows;
}

function isSitemapExcludedSlug(slug) {
  return SITEMAP_EXCLUDED_SLUGS.has(String(slug || "").trim().toLowerCase());
}

function appendRestaurantUrls(urls, baseUrl, restaurants) {
  var seen = new Set(
    urls.map(function (entry) {
      return entry.loc;
    }),
  );

  for (var i = 0; i < restaurants.length; i += 1) {
    var restaurant = restaurants[i];
    if (!restaurant || !restaurant.slug) {
      continue;
    }

    var slug = String(restaurant.slug).trim();
    if (!slug || isSitemapExcludedSlug(slug)) {
      continue;
    }

    var loc = baseUrl + "/restaurant/" + encodeURIComponent(slug);
    if (seen.has(loc)) {
      continue;
    }
    seen.add(loc);

    urls.push({
      loc: loc,
      lastmod:
        formatDate(restaurant.created_at) ||
        new Date().toISOString().slice(0, 10),
      changefreq: "weekly",
      priority: "0.6",
    });
  }
}

async function getSitemap(req, res) {
  var baseUrl = getSiteOrigin(req);
  var urls = getStaticPages(baseUrl);

  try {
    var pool = getPool();
    var restaurants = await fetchPublicRestaurants(pool);
    appendRestaurantUrls(urls, baseUrl, restaurants);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[sitemap]", err);
    }
  }

  if (!urls.length) {
    urls.push({
      loc: baseUrl + "/",
      lastmod: new Date().toISOString().slice(0, 10),
      changefreq: "daily",
      priority: "1.0",
    });
  }

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  return res.status(200).send(buildSitemapXml(urls));
}

module.exports = {
  getSitemap,
  CANONICAL_SITE_ORIGIN,
  SITEMAP_EXCLUDED_SLUGS,
  isSitemapExcludedSlug,
};
