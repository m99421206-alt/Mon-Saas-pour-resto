/**
 * AfricaMenu — utilitaires DOM sûrs (XSS).
 * Chargé après dompurify.min.js (optionnel) sur les pages applicatives.
 */
(function () {
  "use strict";

  var DEFAULT_APP_URL = "admin-notifications.html";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * HTML limité (badges admin) — DOMPurify si disponible, sinon escapeHtml strict.
   */
  function sanitizeHtml(html) {
    var raw = String(html == null ? "" : html);
    if (typeof window.DOMPurify !== "undefined" && window.DOMPurify.sanitize) {
      return window.DOMPurify.sanitize(raw, {
        ALLOWED_TAGS: ["span", "strong", "em", "small", "br", "p", "b", "i"],
        ALLOWED_ATTR: ["class", "role", "aria-label", "aria-hidden"],
      });
    }
    return escapeHtml(raw);
  }

  function setText(el, value) {
    if (el) {
      el.textContent = value == null ? "" : String(value);
    }
  }

  function setHtml(el, html) {
    if (el) {
      el.innerHTML = sanitizeHtml(html);
    }
  }

  function sanitizeAppUrl(url, fallback) {
    var fb = String(fallback || DEFAULT_APP_URL).trim() || DEFAULT_APP_URL;
    var raw = String(url || "").trim();
    if (!raw) {
      return fb;
    }
    if (/^(javascript|data|vbscript):/i.test(raw)) {
      return fb;
    }
    if (/^https?:\/\//i.test(raw)) {
      return fb;
    }
    if (/^[a-z]+:/i.test(raw)) {
      return fb;
    }
    if (raw.indexOf("..") !== -1 || raw.indexOf("\\") !== -1) {
      return fb;
    }
    if (!/^[a-zA-Z0-9_\-./?=&%+#]+$/.test(raw)) {
      return fb;
    }
    return raw.slice(0, 255);
  }

  function sanitizeImageSrc(url, apiBase) {
    var raw = String(url || "").trim();
    if (!raw) {
      return "";
    }
    if (/^(javascript|data|vbscript):/i.test(raw)) {
      return "";
    }

    var normalized = raw.replace(/\\/g, "/");
    if (/^https?:\/\//i.test(normalized)) {
      return normalized;
    }
    if (normalized.indexOf("..") !== -1 || /%2f|%5c/i.test(raw)) {
      return "";
    }

    var relative = normalized.replace(/^\.\//, "");
    if (relative.indexOf("/uploads/") === 0) {
      relative = relative.slice("/uploads/".length);
    } else if (relative.indexOf("uploads/") === 0) {
      relative = relative.slice("uploads/".length);
    } else if (relative === "/uploads" || relative === "uploads") {
      relative = "";
    } else if (relative.indexOf("/") === 0) {
      relative = relative.slice(1);
    }

    if (!relative || !/\.(webp|jpe?g|png)$/i.test(relative)) {
      return "";
    }

    var base = String(apiBase || "").replace(/\/+$/, "");
    return base ? base + "/" + relative : "/uploads/" + relative;
  }

  window.MenuGo_DomSafe = {
    escapeHtml: escapeHtml,
    sanitizeHtml: sanitizeHtml,
    setText: setText,
    setHtml: setHtml,
    sanitizeAppUrl: sanitizeAppUrl,
    sanitizeImageSrc: sanitizeImageSrc,
  };
})();
