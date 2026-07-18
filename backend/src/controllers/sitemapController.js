const { getPool } = require("../config/database");

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
  return [
    "  <url>",
    "    <loc>" + escapeXml(entry.loc) + "</loc>",
    entry.lastmod
      ? "    <lastmod>" + escapeXml(entry.lastmod) + "</lastmod>"
      : null,
    entry.changefreq
      ? "    <changefreq>" + escapeXml(entry.changefreq) + "</changefreq>"
      : null,
    entry.priority
      ? "    <priority>" + escapeXml(entry.priority) + "</priority>"
      : null,
    "  </url>",
  ]
    .filter(Boolean)
    .join("\n");
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
    return req.protocol + "://" + host;
  }

  return "https://africamenu.com";
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
    {
      loc: baseUrl + "/frontend/pages/login.html",
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    },
    {
      loc: baseUrl + "/frontend/pages/register.html",
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    },
  ];
}

async function getSitemap(req, res) {
  try {
    var baseUrl = getSiteOrigin(req);
    var pool = getPool();

    var [restaurants] = await pool.query(
      "SELECT slug, created_at FROM restaurants WHERE slug IS NOT NULL AND TRIM(slug) <> '' AND COALESCE(menu_suspended, 0) = 0 ORDER BY created_at DESC",
    );

    var urls = getStaticPages(baseUrl);
    for (var i = 0; i < restaurants.length; i += 1) {
      var restaurant = restaurants[i];
      if (!restaurant || !restaurant.slug) {
        continue;
      }

      urls.push({
        loc:
          baseUrl +
          "/restaurant/" +
          encodeURIComponent(String(restaurant.slug)),
        lastmod:
          formatDate(restaurant.created_at) ||
          new Date().toISOString().slice(0, 10),
        changefreq: "weekly",
        priority: "0.6",
      });
    }

    var xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      urls.map(buildUrlEntry).join("\n"),
      "</urlset>",
    ].join("\n");

    res.setHeader("Content-Type", "application/xml");
    return res.send(xml);
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

module.exports = {
  getSitemap,
};
