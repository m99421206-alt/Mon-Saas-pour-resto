/**
 * Validation des liens internes affichés côté admin (anti open-redirect / javascript:).
 */

"use strict";

var DEFAULT_ADMIN_LINK = "admin-notifications.html";

function sanitizeAppLinkUrl(url, fallback) {
  var fb = String(fallback || DEFAULT_ADMIN_LINK).trim() || DEFAULT_ADMIN_LINK;
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

module.exports = {
  sanitizeAppLinkUrl: sanitizeAppLinkUrl,
  DEFAULT_ADMIN_LINK: DEFAULT_ADMIN_LINK,
};
