/**
 * Détermine si un email est administrateur plateforme (même logique que adminMiddleware).
 */

function isPlatformAdminEmail(email) {
  var normalized = String(email || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return false;
  }
  var raw = process.env.ADMIN_EMAILS || "";
  var allow = raw
    .split(",")
    .map(function (s) {
      return s.trim().toLowerCase();
    })
    .filter(Boolean);

  if (!allow.length) {
    return false;
  }

  return allow.indexOf(normalized) !== -1;
}

module.exports = {
  isPlatformAdminEmail: isPlatformAdminEmail,
};
