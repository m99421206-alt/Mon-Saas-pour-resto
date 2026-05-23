/**
 * Libellés affichage — clé plan stockée côté restaurant vs catalogue paramètres plateforme.
 */

function resolvePlanLabel(planKey, subscriptionPlans) {
  var k = String(planKey || "")
    .trim()
    .toLowerCase();
  if (!k || k === "trial") {
    return "Essai gratuit";
  }
  if (Array.isArray(subscriptionPlans)) {
    for (var i = 0; i < subscriptionPlans.length; i += 1) {
      var p = subscriptionPlans[i] || {};
      if (String(p.id || "")
        .trim()
        .toLowerCase() === k) {
        return String(p.name || p.id || k).trim() || k;
      }
    }
  }
  return k;
}

module.exports = {
  resolvePlanLabel: resolvePlanLabel,
};
