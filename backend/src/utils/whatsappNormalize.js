/**
 * Normalise le numéro WhatsApp pour commandes clients (aligné sur restaurantController).
 * @returns {string|null} numéro avec indicatif type +223…
 * @returns {false} si saisi mais invalide
 */
function normalizeWhatsapp(value) {
  if (value == null) {
    return null;
  }
  var text = String(value).trim();
  if (!text.length) {
    return null;
  }
  var cleaned = text.replace(/\s+/g, "");
  if (!/^\+?[0-9]{8,20}$/.test(cleaned)) {
    return false;
  }
  return cleaned;
}

module.exports = {
  normalizeWhatsapp: normalizeWhatsapp,
};
