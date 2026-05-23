/**
 * Réglages plateforme — persistance clef plateform_config (JSON).
 * Cache mémoire aligné uploads + maintenance menu public sans requête par requête.
 */

var { getPool } = require("../config/database");

var KEY = "platform_config";

function getDefaults() {
  return {
    maintenance_mode: false,
    subscription_plans: [
      { id: "starter", name: "Starter", price_cfa: 0, months: 1 },
      { id: "pro", name: "Pro", price_cfa: 15000, months: 1 },
      { id: "business", name: "Business", price_cfa: 35000, months: 1 },
    ],
    /** Durée d’essai gratuit à l’inscription (jours), appliquée aux nouveaux restaurants. */
    trial_period_days: 30,
    upload_max_mb: 5,
  };
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj || {}));
}

function sanitizePlans(arr) {
  if (!Array.isArray(arr)) {
    return getDefaults().subscription_plans;
  }
  var out = [];
  for (var i = 0; i < Math.min(arr.length, 12); i += 1) {
    var p = arr[i] || {};
    var id = String(p.id || "plan_" + (i + 1))
      .trim()
      .toLowerCase()
      .slice(0, 48)
      .replace(/[^a-z0-9_-]/g, "_");
    var name = String(p.name || "Plan").trim().slice(0, 120) || "Plan";
    var price = Math.round(Number(p.price_cfa) || 0);
    if (price < 0) price = 0;
    if (price > 999999999) price = 999999999;
    var months = Math.round(Number(p.months) || 1);
    if (!Number.isInteger(months) || months < 1) months = 1;
    if (months > 240) months = 240;
    out.push({
      id: id || "plan_" + (i + 1),
      name: name,
      price_cfa: price,
      months: months,
    });
  }
  return out.length ? out : getDefaults().subscription_plans;
}

/** État fusionné défaut + BD (mémoire). */
var CACHE = deepClone(getDefaults());

function rebuildFromStored(storedRaw) {
  var base = getDefaults();
  var stored = {};
  if (storedRaw != null && String(storedRaw).trim()) {
    try {
      stored = typeof storedRaw === "string" ? JSON.parse(storedRaw) : storedRaw;
      if (!stored || typeof stored !== "object") {
        stored = {};
      }
    } catch (e) {
      stored = {};
    }
  }

  CACHE.maintenance_mode = Boolean(stored.maintenance_mode === true || stored.maintenance_mode === 1 || stored.maintenance_mode === "1");

  CACHE.subscription_plans = sanitizePlans(stored.subscription_plans);

  var tpd = Number(stored.trial_period_days);
  if (!Number.isFinite(tpd)) tpd = base.trial_period_days;
  CACHE.trial_period_days = Math.min(365, Math.max(1, Math.round(tpd)));

  var umb = Number(stored.upload_max_mb);
  if (!Number.isFinite(umb)) umb = base.upload_max_mb;
  CACHE.upload_max_mb = Math.min(64, Math.max(1, Math.round(umb)));
}

/**
 * Charge ou recharge la BD.
 */
async function refresh() {
  var pool = getPool();
  var [rows] = await pool.query("SELECT setting_value FROM platform_settings WHERE setting_key = ? LIMIT 1", [KEY]);

  var raw = rows.length ? rows[0].setting_value : null;
  if (typeof raw === "object" && raw !== null) {
    raw = JSON.stringify(raw);
  }
  rebuildFromStored(raw);
}

/**
 * Fusionne avec la validation puis persiste tout l’état CACHE.
 */
async function savePartial(patch) {
  if (!patch || typeof patch !== "object") {
    return { snapshot: getSnapshot(), persisted: false };
  }

  var touch =
    patch.maintenance_mode !== undefined ||
    patch.subscription_plans !== undefined ||
    patch.trial_period_days !== undefined ||
    patch.upload_max_mb !== undefined;

  if (!touch) {
    return { snapshot: getSnapshot(), persisted: false };
  }

  if (patch.maintenance_mode !== undefined) {
    CACHE.maintenance_mode = Boolean(
      patch.maintenance_mode === true || patch.maintenance_mode === 1 || patch.maintenance_mode === "1",
    );
  }

  if (patch.subscription_plans !== undefined) {
    CACHE.subscription_plans = sanitizePlans(patch.subscription_plans);
  }

  if (patch.trial_period_days !== undefined) {
    var tpd2 = Number(patch.trial_period_days);
    if (Number.isFinite(tpd2)) {
      CACHE.trial_period_days = Math.min(365, Math.max(1, Math.round(tpd2)));
    }
  }

  if (patch.upload_max_mb !== undefined) {
    var umb = Number(patch.upload_max_mb);
    if (Number.isFinite(umb)) {
      CACHE.upload_max_mb = Math.min(64, Math.max(1, Math.round(umb)));
    }
  }

  var json = JSON.stringify(CACHE);

  var pool = getPool();
  await pool.query(
    "INSERT INTO platform_settings (setting_key, setting_value) VALUES (?, ?) " +
      "ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)",
    [KEY, json],
  );

  rebuildFromStored(json);
  return { snapshot: getSnapshot(), persisted: true };
}

/** Snapshot JSON envoyé au front admin. */
function getSnapshot() {
  return deepClone({
    maintenance_mode: CACHE.maintenance_mode,
    subscription_plans: CACHE.subscription_plans,
    trial_period_days: CACHE.trial_period_days,
    upload_max_mb: CACHE.upload_max_mb,
  });
}

/** Lecture synchrone (cache déjà chargé au boot / après refresh admin). */
function getTrialPeriodDays() {
  var d = Number(CACHE.trial_period_days);
  if (!Number.isFinite(d) || d < 1) {
    return 30;
  }
  return Math.min(365, Math.round(d));
}

function getSubscriptionPlansCatalog() {
  return deepClone(CACHE.subscription_plans);
}

/** Menu public synchrone. */
function isMaintenanceEnabled() {
  return Boolean(CACHE.maintenance_mode === true || CACHE.maintenance_mode === 1 || CACHE.maintenance_mode === "1");
}

/** Multer synchrone — octets. */
function getUploadMaxBytes() {
  var mb = Number(CACHE.upload_max_mb);
  if (!Number.isFinite(mb) || mb < 1) {
    mb = 5;
  }
  mb = Math.min(64, mb);
  return Math.round(mb * 1024 * 1024);
}

module.exports = {
  KEY: KEY,
  refresh: refresh,
  savePartial: savePartial,
  getSnapshot: getSnapshot,
  isMaintenanceEnabled: isMaintenanceEnabled,
  getUploadMaxBytes: getUploadMaxBytes,
  getTrialPeriodDays: getTrialPeriodDays,
  getSubscriptionPlansCatalog: getSubscriptionPlansCatalog,
};
