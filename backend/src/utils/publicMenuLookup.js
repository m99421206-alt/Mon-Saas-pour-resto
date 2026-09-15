/**
 * Résolution des identifiants de menu public.
 *
 * Les URLs canoniques sont /restaurant/<slug>, avec un secours historique
 * /menu/<id>. Number("0x10") === 16 et Number("1e2") === 100 : un slug
 * alphanumérique ne doit jamais être interprété via Number().
 */

"use strict";

function parseStrictPositiveIntId(value) {
  var s = String(value == null ? "" : value).trim();
  if (!/^[1-9][0-9]{0,15}$/.test(s)) {
    return null;
  }
  var n = Number(s);
  if (!Number.isSafeInteger(n) || n < 1) {
    return null;
  }
  return n;
}

/**
 * @param {string} param
 * @param {{ lookup?: string }|null|undefined} query
 * @returns {{ key: string, trySlug: boolean, tryId: number|null }}
 */
function getPublicMenuLookupPlan(param, query) {
  var key = String(param == null ? "" : param).trim();
  var id = parseStrictPositiveIntId(key);
  var lookup = String((query && query.lookup) || "")
    .trim()
    .toLowerCase();

  if (!key) {
    return { key: "", trySlug: false, tryId: null };
  }

  if (lookup === "slug") {
    return { key: key, trySlug: true, tryId: null };
  }

  if (id === null) {
    return { key: key, trySlug: true, tryId: null };
  }

  return { key: key, trySlug: false, tryId: id };
}

module.exports = {
  parseStrictPositiveIntId: parseStrictPositiveIntId,
  getPublicMenuLookupPlan: getPublicMenuLookupPlan,
};
