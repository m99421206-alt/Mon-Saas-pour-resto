/**
 * Identité PWA du menu public — manifest et icônes par restaurant.
 */

"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var { getPool } = require("../config/database");
var { normalizeStoredImageUrl } = require("../utils/imageUrlValidation");

var FALLBACK_ICON_PATH = path.join(
  __dirname,
  "../../../assets/images/icone/logo.svg",
);
var ALLOWED_ICON_SIZES = [32, 180, 192, 512];

var sharp = null;
try {
  sharp = require("sharp");
} catch (e) {
  sharp = null;
}

function isValidThemeColor(value) {
  return /^#[0-9A-Fa-f]{6}$/.test(String(value || "").trim());
}

function identityVersion(restaurant) {
  return crypto
    .createHash("sha1")
    .update(
      [
        String(restaurant.id),
        String(restaurant.logo_url || ""),
        String(restaurant.name || ""),
        String(restaurant.theme_color || ""),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 12);
}

function menuApiKey(restaurant) {
  if (restaurant.slug) {
    return String(restaurant.slug).trim();
  }
  return String(restaurant.id);
}

function publicMenuPath(restaurant) {
  if (restaurant.slug) {
    return "/restaurant/" + encodeURIComponent(String(restaurant.slug).trim());
  }
  return "/menu/" + encodeURIComponent(String(restaurant.id));
}

function getRequestOrigin(req) {
  var proto = req.get("x-forwarded-proto") || req.protocol || "https";
  var host = req.get("x-forwarded-host") || req.get("host") || "localhost";
  return String(proto).replace(/:$/, "") + "://" + host;
}

async function resolveRestaurantByParam(param) {
  var raw = String(param || "").trim();
  if (!raw.length) {
    return null;
  }

  var pool = getPool();
  var restaurantId = Number(raw);
  var useId = Number.isInteger(restaurantId) && restaurantId >= 1;
  var rows;

  if (useId) {
    var result = await pool.query(
      "SELECT id, name, description, logo_url, theme_color, slug, COALESCE(menu_suspended, 0) AS menu_suspended FROM restaurants WHERE id = ? LIMIT 1",
      [restaurantId],
    );
    rows = result[0];
  } else {
    var slugResult = await pool.query(
      "SELECT id, name, description, logo_url, theme_color, slug, COALESCE(menu_suspended, 0) AS menu_suspended FROM restaurants WHERE slug = ? LIMIT 1",
      [raw],
    );
    rows = slugResult[0];
  }

  if (!rows.length) {
    return null;
  }

  var row = rows[0];
  var ms = row.menu_suspended;
  if (ms === 1 || ms === true || ms === "1") {
    return { suspended: true };
  }

  return row;
}

function resolveLogoFilePath(logoUrl) {
  var normalized = normalizeStoredImageUrl(logoUrl);
  if (!normalized) {
    return null;
  }
  var filename = normalized.slice("/uploads/".length);
  if (!filename) {
    return null;
  }
  var filePath = path.join(__dirname, "../../uploads", filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return filePath;
}

function resolveSourceImagePath(restaurant) {
  var logoPath = resolveLogoFilePath(restaurant.logo_url);
  if (logoPath) {
    return logoPath;
  }
  if (fs.existsSync(FALLBACK_ICON_PATH)) {
    return FALLBACK_ICON_PATH;
  }
  return null;
}

async function renderIconPng(restaurant, size) {
  var targetSize = Number(size);
  if (!ALLOWED_ICON_SIZES.includes(targetSize)) {
    return null;
  }

  var sourcePath = resolveSourceImagePath(restaurant);
  if (!sourcePath) {
    return null;
  }

  if (!sharp) {
    var raw = await fs.promises.readFile(sourcePath);
    return raw;
  }

  return sharp(sourcePath)
    .resize(targetSize, targetSize, {
      fit: "cover",
      position: "center",
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

function buildManifest(restaurant, req) {
  var origin = getRequestOrigin(req);
  var key = encodeURIComponent(menuApiKey(restaurant));
  var version = identityVersion(restaurant);
  var iconBase = origin + "/api/menu/" + key + "/icons";
  var theme = isValidThemeColor(restaurant.theme_color)
    ? String(restaurant.theme_color).trim()
    : "#ffffff";
  var startPath = publicMenuPath(restaurant);
  var scopePath = startPath.endsWith("/") ? startPath : startPath + "/";

  return {
    id: "menu-" + String(restaurant.id),
    name: String(restaurant.name || "Menu restaurant").slice(0, 120),
    short_name: String(restaurant.name || "Menu").slice(0, 20),
    description: String(
      restaurant.description ||
        "Menu de " + String(restaurant.name || "restaurant"),
    ).slice(0, 240),
    start_url: startPath,
    scope: scopePath,
    display: "standalone",
    lang: "fr",
    theme_color: theme,
    background_color: "#ffffff",
    icons: [
      {
        src: iconBase + "/192.png?v=" + version,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: iconBase + "/512.png?v=" + version,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: iconBase + "/512.png?v=" + version,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

function manifestEtag(restaurant) {
  return '"' + identityVersion(restaurant) + '"';
}

function iconEtag(restaurant, size) {
  return '"' + identityVersion(restaurant) + "-" + String(size) + '"';
}

module.exports = {
  ALLOWED_ICON_SIZES: ALLOWED_ICON_SIZES,
  resolveRestaurantByParam: resolveRestaurantByParam,
  identityVersion: identityVersion,
  menuApiKey: menuApiKey,
  buildManifest: buildManifest,
  renderIconPng: renderIconPng,
  manifestEtag: manifestEtag,
  iconEtag: iconEtag,
};
