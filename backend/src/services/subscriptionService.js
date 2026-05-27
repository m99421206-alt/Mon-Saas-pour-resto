/**
 * Cycle de vie abonnement par restaurant (essai gratuit, expiration, droits d’édition menu).
 * Données stockées sur la ligne `restaurants` (pas de table séparée — MVP scalable).
 */

var { getPool } = require("../config/database");
var platformSettings = require("./platformSettings");

function getTrialDays() {
  return platformSettings.getTrialPeriodDays();
}

/**
 * Si essai sans date de fin (anciens comptes) : aligne début + fin sur la durée configurée.
 */
async function backfillTrialEndIfMissing(connection, restaurantId) {
  var days = getTrialDays();
  await connection.query(
    "UPDATE restaurants SET " +
      "subscription_started_at = COALESCE(subscription_started_at, created_at), " +
      "subscription_ends_at = DATE_ADD(DATE(COALESCE(subscription_started_at, created_at)), INTERVAL ? DAY), " +
      "subscription_plan_key = COALESCE(NULLIF(TRIM(subscription_plan_key), ''), 'trial') " +
      "WHERE id = ? AND subscription_status = 'trial' AND subscription_ends_at IS NULL",
    [days, restaurantId],
  );
}

/**
 * Passe en `expired` si la date de fin est dépassée (statuts trial ou active).
 */
async function markExpiredIfPast(connection, restaurantId) {
  await connection.query(
    "UPDATE restaurants SET subscription_status = 'expired' " +
      "WHERE id = ? AND subscription_status IN ('trial', 'active') " +
      "AND subscription_ends_at IS NOT NULL AND DATE(subscription_ends_at) < CURDATE()",
    [restaurantId],
  );
}

/**
 * Met à jour l’état dérivé (backfill + expiration) dans une transaction courte.
 */
async function refreshRestaurantSubscriptionState(restaurantId) {
  if (!Number.isInteger(restaurantId) || restaurantId < 1) {
    return;
  }
  var pool = getPool();
  var conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await backfillTrialEndIfMissing(conn, restaurantId);
    await markExpiredIfPast(conn, restaurantId);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * @returns {Promise<{ ok: boolean, code?: string, message?: string, restaurantId?: number }>}
 */
async function assertCanEditRestaurantMenu(userId) {
  var pool = getPool();
  var [rows] = await pool.query(
    "SELECT id FROM restaurants WHERE user_id = ? ORDER BY id ASC LIMIT 1",
    [userId],
  );
  if (!rows.length) {
    return {
      ok: false,
      code: "NO_RESTAURANT",
      message: "Aucun restaurant associé à ce compte.",
    };
  }
  var rid = rows[0].id;
  await refreshRestaurantSubscriptionState(rid);
  var [subs] = await pool.query(
    "SELECT subscription_status FROM restaurants WHERE id = ? LIMIT 1",
    [rid],
  );
  var st = String(subs[0].subscription_status || "")
    .trim()
    .toLowerCase();
  if (st === "suspended") {
    return {
      ok: false,
      code: "SUBSCRIPTION_SUSPENDED",
      message:
        "Votre abonnement est suspendu. Contactez l’administrateur MenuGo pour réactiver l’édition du menu.",
    };
  }
  if (st === "expired") {
    return {
      ok: false,
      code: "SUBSCRIPTION_EXPIRED",
      message:
        "Votre période d’essai ou d’abonnement est terminée. Activez un abonnement pour modifier à nouveau votre menu (le menu public reste visible).",
    };
  }
  return { ok: true, restaurantId: rid };
}

/** Admin / lot — aligne tous les restaurants dont la échéance est passée sans passage par middleware propriétaire. */
async function expireAllPastDueGlobally() {
  var pool = getPool();
  await pool.query(
    "UPDATE restaurants SET subscription_status = 'expired' WHERE subscription_status IN ('trial', 'active') " +
      "AND subscription_ends_at IS NOT NULL AND DATE(subscription_ends_at) < CURDATE()",
  );
}

module.exports = {
  getTrialDays: getTrialDays,
  refreshRestaurantSubscriptionState: refreshRestaurantSubscriptionState,
  assertCanEditRestaurantMenu: assertCanEditRestaurantMenu,
  expireAllPastDueGlobally: expireAllPastDueGlobally,
};
