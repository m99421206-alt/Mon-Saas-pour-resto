/**
 * URLs publiques canoniques du menu client.
 * Format préféré : /restaurant/<slug>
 * Secours sans slug : /menu/<id>
 */
(function () {
  "use strict";

  function resolvePublicSiteOrigin() {
    var cfg = window.MenuGo_CONFIG || {};
    var raw =
      typeof cfg.PUBLIC_SITE_ORIGIN === "string"
        ? cfg.PUBLIC_SITE_ORIGIN.trim().replace(/\/+$/, "")
        : "";
    return raw.length ? raw : window.location.origin;
  }

  function buildPublicMenuPath(restaurant) {
    if (!restaurant) {
      return "";
    }

    var slug =
      restaurant.slug != null ? String(restaurant.slug).trim() : "";
    if (slug) {
      return "/restaurant/" + encodeURIComponent(slug);
    }

    var id = restaurant.id;
    if (id != null && String(id).trim() !== "") {
      return "/menu/" + encodeURIComponent(String(id));
    }

    return "";
  }

  function buildPublicMenuUrl(restaurant, options) {
    var opts = options || {};
    var path = buildPublicMenuPath(restaurant);
    if (!path) {
      return "";
    }

    if (opts.relative || opts.origin === false) {
      return path;
    }

    var origin =
      opts.origin != null && String(opts.origin).trim() !== ""
        ? String(opts.origin).trim().replace(/\/+$/, "")
        : resolvePublicSiteOrigin();

    return origin + path;
  }

  window.MenuGo_PublicMenuUrl = {
    resolvePublicSiteOrigin: resolvePublicSiteOrigin,
    buildPublicMenuPath: buildPublicMenuPath,
    buildPublicMenuUrl: buildPublicMenuUrl,
  };
})();
