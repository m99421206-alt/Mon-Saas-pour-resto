const { getPool } = require("../config/database");
const subscriptionService = require("../services/subscriptionService");
const platformSettings = require("../services/platformSettings");
const { resolvePlanLabel } = require("../utils/subscriptionLabels");
const { appendAudit, AUDIT_ACTIONS } = require("../utils/auditLog");
const { isPlatformAdminEmail } = require("../utils/platformAdmin");

function catalogPlanKey(p) {
  return String((p || {}).id || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

/** Entrée catalogue correspondant à la clé (hors trial implicite). */
function matchCatalogPlan(planKey, catalog) {
  var k =
    planKey != null && String(planKey).trim() !== "" ?
      String(planKey).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "")
    : "";
  if (!k || k === "trial" || !Array.isArray(catalog)) {
    return null;
  }
  for (var i = 0; i < catalog.length; i += 1) {
    var ck = catalogPlanKey(catalog[i]);
    if (ck && ck === k) return catalog[i];
  }
  return null;
}

/**
 * Offre affichée « après expiration de l’essai » — premier plan catalogue avec prix &gt; 0,
 * sinon première entrée hors identifiant vide / trial-like.
 */
function pickPostTrialRenewalOffer(catalog) {
  if (!Array.isArray(catalog) || !catalog.length) return null;

  function rowMeta(p, idx) {
    var ck = catalogPlanKey(p);
    if (!ck) return null;
    var nm = resolvePlanLabel(ck, catalog);
    var pr = Math.round(Number((p || {}).price_cfa) || 0);
    var mo = Math.round(Number((p || {}).months) || 1);
    if (!Number.isFinite(mo) || mo < 1) mo = 1;
    return {
      idx: idx,
      plan_key: ck,
      plan_label: nm,
      price_cfa: pr >= 0 ? pr : 0,
      months: mo,
      isTrialLike: ck === "trial",
    };
  }

  var rows = [];
  for (var i = 0; i < catalog.length; i += 1) {
    var meta = rowMeta(catalog[i], i);
    if (!meta || meta.isTrialLike) continue;
    rows.push(meta);
  }
  if (!rows.length) return null;

  var paying = rows
    .filter(function (x) {
      return x.price_cfa > 0;
    })
    .sort(function (a, b) {
      return a.price_cfa - b.price_cfa || a.idx - b.idx;
    });
  var pick = paying[0];
  if (pick) {
    return {
      plan_key: pick.plan_key,
      plan_label: pick.plan_label,
      price_cfa: pick.price_cfa,
      months: pick.months,
    };
  }

  rows.sort(function (a, b) {
    return a.idx - b.idx;
  });
  pick = rows[0];
  return {
    plan_key: pick.plan_key,
    plan_label: pick.plan_label,
    price_cfa: pick.price_cfa,
    months: pick.months,
  };
}

/** Durée d’essai en jours (dates réelles sinon réglage plateforme). */
function computeTrialDisplayedDays(platformTrialDays, startedAtIso, endsAtIso) {
  if (startedAtIso && endsAtIso) {
    var a = new Date(startedAtIso).getTime();
    var b = new Date(endsAtIso).getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
      var approx = Math.round((b - a) / (24 * 3600 * 1000));
      if (approx >= 1) return approx;
    }
  }
  return platformTrialDays;
}

function normalizeSubStatus(raw) {
  var s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "active" || s === "expired" || s === "suspended") {
    return s;
  }
  return "trial";
}

function buildSubscriptionPayload(row) {
  var catalog = platformSettings.getSubscriptionPlansCatalog();
  var platformTrialDays = platformSettings.getTrialPeriodDays();

  var status = normalizeSubStatus(row.subscription_status);

  var rawPlan =
    row.subscription_plan_key != null && String(row.subscription_plan_key).trim() !== "" ?
      String(row.subscription_plan_key).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "")
    : "";
  var planKey = rawPlan !== "" ? rawPlan : "trial";

  var startedIso = row.subscription_started_at ? new Date(row.subscription_started_at).toISOString() : null;
  var endsIso = row.subscription_ends_at ? new Date(row.subscription_ends_at).toISOString() : null;

  var drRaw = row.days_remaining;
  var dr =
    row.subscription_ends_at == null ? null : drRaw !== undefined && drRaw !== null ? Number(drRaw) : null;

  var canEdit = status !== "expired" && status !== "suspended";

  var amountCfa =
    Math.round(Number(row.subscription_amount_cfa !== undefined ? row.subscription_amount_cfa : 0)) || 0;

  var catalogEntry = matchCatalogPlan(planKey, catalog);
  var catalogPriceCfa =
    catalogEntry != null ?
      Math.round(Number(catalogEntry.price_cfa !== undefined ? catalogEntry.price_cfa : 0))
    : null;

  var billingMonths = catalogEntry ? Math.round(Number(catalogEntry.months) || 1) : 1;
  if (!Number.isFinite(billingMonths) || billingMonths < 1) billingMonths = 1;

  var displayPriceCfa = 0;
  if (status === "trial") {
    displayPriceCfa = 0;
  } else if (amountCfa > 0) {
    displayPriceCfa = amountCfa;
  } else if (catalogPriceCfa != null) {
    displayPriceCfa = catalogPriceCfa;
  } else {
    displayPriceCfa = 0;
  }

  var trialDisplayDays = computeTrialDisplayedDays(platformTrialDays, startedIso, endsIso);
  var postTrialRenewal =
    status === "trial" || status === "expired" ? pickPostTrialRenewalOffer(catalog) : null;

  return {
    status: status,
    plan_key: planKey,
    plan_label: resolvePlanLabel(planKey, catalog),
    started_at: startedIso,
    ends_at: endsIso,
    amount_cfa: amountCfa,
    catalog_price_cfa: catalogPriceCfa,
    display_price_cfa: displayPriceCfa,
    billing_period_months: billingMonths,
    days_remaining: Number.isFinite(dr) ? dr : null,
    can_edit_menu: canEdit,
    trial_period_days_platform: platformTrialDays,
    trial_display_days: trialDisplayDays,
    post_trial_offer: postTrialRenewal,
    menu_public_always_visible: true,
  };
}

/**
 * Profil compte connecté + état abonnement (pour dashboard resto et garde front).
 */
async function getMe(req, res) {
  try {
    var pool = getPool();
    var [users] = await pool.query("SELECT id, email, full_name, phone FROM users WHERE id = ? LIMIT 1", [req.user.id]);

    if (!users.length) {
      return res.status(404).json({ message: "Utilisateur introuvable." });
    }

    var [restaurants] = await pool.query(
      "SELECT r.id, r.name, r.city, r.country, r.description, r.whatsapp, r.logo_url, r.banner_url, r.theme_color, " +
        "r.subscription_status, r.subscription_plan_key, r.subscription_started_at, r.subscription_ends_at, r.subscription_amount_cfa, " +
        "COALESCE(r.onboarding_seen, 0) AS onboarding_seen, COALESCE(r.needs_setup_help, 0) AS needs_setup_help, " +
        "CASE WHEN r.subscription_ends_at IS NULL THEN NULL ELSE GREATEST(0, DATEDIFF(DATE(r.subscription_ends_at), CURDATE())) END AS days_remaining " +
        "FROM restaurants r WHERE r.user_id = ? ORDER BY r.id ASC LIMIT 1",
      [req.user.id],
    );

    var baseRestaurant = restaurants[0] || null;
    var subscriptionPayload = null;

    if (baseRestaurant) {
      await subscriptionService.refreshRestaurantSubscriptionState(baseRestaurant.id);
      var [again] = await pool.query(
        "SELECT r.id, r.name, r.city, r.country, r.description, r.whatsapp, r.logo_url, r.banner_url, r.theme_color, " +
          "r.subscription_status, r.subscription_plan_key, r.subscription_started_at, r.subscription_ends_at, r.subscription_amount_cfa, " +
          "COALESCE(r.onboarding_seen, 0) AS onboarding_seen, COALESCE(r.needs_setup_help, 0) AS needs_setup_help, " +
          "CASE WHEN r.subscription_ends_at IS NULL THEN NULL ELSE GREATEST(0, DATEDIFF(DATE(r.subscription_ends_at), CURDATE())) END AS days_remaining " +
          "FROM restaurants r WHERE r.id = ? LIMIT 1",
        [baseRestaurant.id],
      );
      baseRestaurant = again[0];
      subscriptionPayload = buildSubscriptionPayload(baseRestaurant);
    }

    var restaurantPublic = baseRestaurant ?
      (function () {
        var locality =
          baseRestaurant.city != null && String(baseRestaurant.city).trim() !== "" ?
            String(baseRestaurant.city).trim()
          : null;
        return {
          id: baseRestaurant.id,
          name: baseRestaurant.name,
          /** Colonne BD `restaurants.city` (quartier). */
          city: locality,
          quartier: locality,
          country:
            baseRestaurant.country != null && String(baseRestaurant.country).trim() !== "" ?
              String(baseRestaurant.country).trim()
            : null,
          description: baseRestaurant.description,
          whatsapp: baseRestaurant.whatsapp,
          logo_url: baseRestaurant.logo_url,
          banner_url: baseRestaurant.banner_url,
          theme_color: baseRestaurant.theme_color,
          onboarding_seen: Boolean(baseRestaurant.onboarding_seen),
          needs_setup_help: Boolean(baseRestaurant.needs_setup_help),
        };
      })()
    : null;

    return res.json({
      user: users[0],
      is_platform_admin: isPlatformAdminEmail(users[0].email),
      restaurant: restaurantPublic,
      subscription: subscriptionPayload,
      plans_catalog: platformSettings.getSubscriptionPlansCatalog(),
    });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function postOnboardingMarkSeen(req, res) {
  try {
    var pool = getPool();
    var [rows] = await pool.query("SELECT id FROM restaurants WHERE user_id = ? ORDER BY id ASC LIMIT 1", [
      req.user.id,
    ]);
    if (!rows.length) {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }
    await pool.query("UPDATE restaurants SET onboarding_seen = 1 WHERE id = ?", [rows[0].id]);
    return res.json({ ok: true, onboarding_seen: true });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function postOnboardingRequestHelp(req, res) {
  try {
    var pool = getPool();
    var [rows] = await pool.query(
      "SELECT id, name FROM restaurants WHERE user_id = ? ORDER BY id ASC LIMIT 1",
      [req.user.id],
    );
    if (!rows.length) {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }
    var rid = rows[0].id;
    await pool.query("UPDATE restaurants SET needs_setup_help = 1, onboarding_seen = 1 WHERE id = ?", [rid]);
    await appendAudit({
      userId: req.user.id,
      restaurantId: rid,
      action: AUDIT_ACTIONS.ONBOARDING_SETUP_REQUEST,
      detail: "Demande d’accompagnement installation (« " + String(rows[0].name || "") + " »)",
    });
    return res.json({ ok: true, needs_setup_help: true, onboarding_seen: true });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

module.exports = {
  getMe: getMe,
  postOnboardingMarkSeen: postOnboardingMarkSeen,
  postOnboardingRequestHelp: postOnboardingRequestHelp,
};
