/**
 * Génère un slug à partir du nom d'un restaurant.
 * - minuscules
 * - suppression des accents
 * - espaces remplacés par des tirets
 * - suppression des caractères spéciaux
 *
 * Exemple : "Restaurant du Mali !" → "restaurant-du-mali"
 */
function generateSlug(name) {
  if (name == null) {
    return "";
  }

  var text = String(name).trim().toLowerCase();
  if (!text.length) {
    return "";
  }

  // Supprime les accents en utilisant Unicode normalization.
  var normalized = text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

  var slug = normalized
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug;
}

function generateUniqueSlug(connection, rawName, excludeId) {
  var baseSlug = generateSlug(rawName);
  if (!baseSlug) {
    baseSlug = "restaurant";
  }

  if (baseSlug.length > 170) {
    baseSlug = baseSlug.slice(0, 170).replace(/-+$/g, "");
  }

  var candidate = baseSlug;
  var suffix = 0;

  return new Promise(async function (resolve, reject) {
    try {
      while (true) {
        var query = "SELECT id FROM restaurants WHERE slug = ?";
        var params = [candidate];
        if (excludeId != null) {
          query += " AND id <> ?";
          params.push(excludeId);
        }

        var [rows] = await connection.query(query, params);
        if (!rows.length) {
          return resolve(candidate);
        }

        suffix += 1;
        candidate = baseSlug + "-" + suffix;
        if (candidate.length > 180) {
          candidate = candidate.slice(0, 180);
        }
      }
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generateSlug: generateSlug,
  generateUniqueSlug: generateUniqueSlug,
};
