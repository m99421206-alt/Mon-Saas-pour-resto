/**
 * Liste et actions abonnements (données sur table restaurants — 1 compte par resto traité comme abonné).
 */

var { getPool } = require("../config/database");
var { appendAudit, AUDIT_ACTIONS, ACTOR_TYPES } = require("../utils/auditLog");
var platformSettings = require("../services/platformSettings");
var subscriptionService = require("../services/subscriptionService");
var { resolvePlanLabel } = require("../utils/subscriptionLabels");
var {
  parseRestaurantIdParams,
  parseActivateBody,
  parseRenewBody,
  parseAdjustBody,
} = require("../validators/subscription");
var { sendValidationError } = require("../validators/helpers");

var ALLOWED_SUB = ["trial", "active", "expired", "suspended"];

function parsePositiveInt(value, fallback) {
  var n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return fallback;
  }
  return n;
}

function normalizeSub(raw) {
  var s = String(raw || "").trim().toLowerCase();
  return ALLOWED_SUB.indexOf(s) !== -1 ? s : "trial";
}

function normalizePlanKey(raw) {
  if (raw === undefined || raw === null) return null;
  var s = String(raw).trim().toLowerCase().slice(0, 48).replace(/[^a-z0-9_-]/g, "");
  return s === "" ? null : s;
}

function mapSubscriptionRow(r) {
  var drRaw = r.days_remaining;
  var dr =
    r.subscription_ends_at == null ? null : drRaw !== undefined && drRaw !== null ? Number(drRaw) : null;

  var planKeyRaw = r.subscription_plan_key;
  var planKey =
    planKeyRaw != null && String(planKeyRaw).trim() !== "" ?
      String(planKeyRaw).trim().toLowerCase()
    : null;
  var catalog = platformSettings.getSubscriptionPlansCatalog();
  var subscription_plan_label =
    resolvePlanLabel(planKey || "trial", catalog);

  return {
    restaurant_id: r.id,
    name: String(r.name || "").trim() || "—",
    subscription_status: normalizeSub(r.subscription_status),
    subscription_plan_key: planKey,
    subscription_plan_label: subscription_plan_label,
    subscription_started_at:
      r.subscription_started_at ? new Date(r.subscription_started_at).toISOString() : null,
    subscription_ends_at:
      r.subscription_ends_at ? new Date(r.subscription_ends_at).toISOString() : null,
    subscription_amount_cfa:
      Math.round(Number(r.subscription_amount_cfa !== undefined ? r.subscription_amount_cfa : 0)) || 0,
    days_remaining: dr !== null ? dr : null,
    owner_email: r.owner_email ? String(r.owner_email) : "",
    owner_phone:
      r.whatsapp != null && String(r.whatsapp).trim() !== "" ?
        String(r.whatsapp).trim()
      : "",
    logo_url: r.logo_url ? String(r.logo_url) : null,
  };
}

async function listSubscriptions(req, res) {
  try {
    var pool = getPool();
    await subscriptionService.expireAllPastDueGlobally();

    var page = parsePositiveInt(req.query.page, 1);
    var pageSize = Math.min(parsePositiveInt(req.query.pageSize, 12), 100);
    var offset = (page - 1) * pageSize;

    var qRaw = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 160) : "";
    var statusFilter =
      typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "all";

    var conditions = [];
    var vals = [];

    if (qRaw) {
      var like = "%" + qRaw + "%";
      conditions.push("(r.name LIKE ? OR u.email LIKE ?)");
      vals.push(like, like);
    }

    if (statusFilter !== "all" && ALLOWED_SUB.indexOf(statusFilter) !== -1) {
      conditions.push("r.subscription_status = ?");
      vals.push(statusFilter);
    }

    var whereClause = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    var [[countRow]] = await pool.query(
      "SELECT COUNT(*) AS n FROM restaurants r INNER JOIN users u ON u.id = r.user_id " + whereClause,
      vals,
    );

    var total = Number(countRow.n) || 0;
    var totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

    var listVals = vals.slice();
    listVals.push(pageSize, offset);

    var [rows] = await pool.query(
      "SELECT r.id, r.name, r.logo_url, r.whatsapp, r.subscription_plan_key, r.subscription_status, r.subscription_started_at, " +
        "r.subscription_ends_at, r.subscription_amount_cfa, u.email AS owner_email, " +
        "CASE WHEN r.subscription_ends_at IS NULL THEN NULL ELSE GREATEST(0, DATEDIFF(DATE(r.subscription_ends_at), CURDATE())) END AS days_remaining " +
        "FROM restaurants r " +
        "INNER JOIN users u ON u.id = r.user_id " +
        whereClause +
        " ORDER BY r.id DESC LIMIT ? OFFSET ?",
      listVals,
    );

    var items = rows.map(mapSubscriptionRow);

    return res.json({
      subscriptions: items,
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: totalPages,
      /** Catalogue édité dans Admin → Paramètres (liste déroulante côté front). */
      subscription_plans: platformSettings.getSubscriptionPlansCatalog(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Impossible de charger les abonnements." });
  }
}

async function getSubscriptionDetail(req, res) {
  try {
    var idParsed = parseRestaurantIdParams(req.params);
    if (sendValidationError(idParsed, res)) {
      return;
    }
    var id = idParsed.data.restaurantId;

    var pool = getPool();
    await subscriptionService.expireAllPastDueGlobally();
    await subscriptionService.refreshRestaurantSubscriptionState(id);

    var [rows] = await pool.query(
      "SELECT r.id, r.name, r.city, r.description, r.logo_url, r.subscription_plan_key, r.subscription_status, r.subscription_started_at, " +
        "r.subscription_ends_at, r.subscription_amount_cfa, r.menu_suspended, r.created_at, u.email AS owner_email, " +
        "(SELECT COUNT(*) FROM products p WHERE p.restaurant_id = r.id) AS product_count, " +
        "CASE WHEN r.subscription_ends_at IS NULL THEN NULL ELSE GREATEST(0, DATEDIFF(DATE(r.subscription_ends_at), CURDATE())) END AS days_remaining " +
        "FROM restaurants r INNER JOIN users u ON u.id = r.user_id WHERE r.id = ? LIMIT 1",
      [id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }

    var raw = rows[0];
    var ms = raw.menu_suspended;
    var menuSuspended = ms === 1 || ms === true || ms === "1";

    var cityStr = raw.city ? String(raw.city) : null;
    return res.json({
      subscription: Object.assign({}, mapSubscriptionRow(raw), {
        city: cityStr,
        quartier: cityStr,
        description: raw.description ? String(raw.description) : "",
        menu_suspended: menuSuspended,
        product_count: Number(raw.product_count) || 0,
        restaurant_created_at: raw.created_at ? new Date(raw.created_at).toISOString() : null,
      }),
      subscription_plans: platformSettings.getSubscriptionPlansCatalog(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function postActivate(req, res) {
  try {
    var idParsed = parseRestaurantIdParams(req.params);
    if (sendValidationError(idParsed, res)) {
      return;
    }
    var bodyParsed = parseActivateBody(req.body);
    if (sendValidationError(bodyParsed, res)) {
      return;
    }
    var id = idParsed.data.restaurantId;
    var periodDays = bodyParsed.data.period_days;
    var amountMaybe = bodyParsed.data.subscription_amount_cfa;
    var planKeyMaybe = bodyParsed.data.subscription_plan_key;

    var pool = getPool();
    var adminId = Number(req.user.id);

    var [[target]] = await pool.query("SELECT id, name FROM restaurants WHERE id = ? LIMIT 1", [id]);
    if (!target) {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }

    if (planKeyMaybe) {
      if (amountMaybe != null && Number.isFinite(amountMaybe) && amountMaybe >= 0) {
        await pool.query(
          "UPDATE restaurants SET subscription_status = 'active', " +
            "subscription_started_at = COALESCE(subscription_started_at, NOW()), " +
            "subscription_ends_at = CASE WHEN subscription_ends_at IS NULL OR DATE(subscription_ends_at) < CURDATE() THEN DATE_ADD(NOW(), INTERVAL ? DAY) ELSE subscription_ends_at END, " +
            "subscription_amount_cfa = ?, subscription_plan_key = ? WHERE id = ? LIMIT 1",
          [periodDays, Math.round(amountMaybe), planKeyMaybe, id],
        );
      } else {
        await pool.query(
          "UPDATE restaurants SET subscription_status = 'active', " +
            "subscription_started_at = COALESCE(subscription_started_at, NOW()), " +
            "subscription_ends_at = CASE WHEN subscription_ends_at IS NULL OR DATE(subscription_ends_at) < CURDATE() THEN DATE_ADD(NOW(), INTERVAL ? DAY) ELSE subscription_ends_at END, " +
            "subscription_plan_key = ? WHERE id = ? LIMIT 1",
          [periodDays, planKeyMaybe, id],
        );
      }
    } else if (amountMaybe != null && Number.isFinite(amountMaybe) && amountMaybe >= 0) {
      await pool.query(
        "UPDATE restaurants SET subscription_status = 'active', " +
          "subscription_started_at = COALESCE(subscription_started_at, NOW()), " +
          "subscription_ends_at = CASE WHEN subscription_ends_at IS NULL OR DATE(subscription_ends_at) < CURDATE() THEN DATE_ADD(NOW(), INTERVAL ? DAY) ELSE subscription_ends_at END, " +
          "subscription_amount_cfa = ? WHERE id = ? LIMIT 1",
        [periodDays, Math.round(amountMaybe), id],
      );
    } else {
      await pool.query(
        "UPDATE restaurants SET subscription_status = 'active', " +
          "subscription_started_at = COALESCE(subscription_started_at, NOW()), " +
          "subscription_ends_at = CASE WHEN subscription_ends_at IS NULL OR DATE(subscription_ends_at) < CURDATE() THEN DATE_ADD(NOW(), INTERVAL ? DAY) ELSE subscription_ends_at END " +
          "WHERE id = ? LIMIT 1",
        [periodDays, id],
      );
    }

    await appendAudit({
      userId: adminId,
      restaurantId: id,
      actorType: ACTOR_TYPES.ADMIN,
      action: AUDIT_ACTIONS.SUBSCRIPTION_ACTIVATE,
      detail:
        "Activation / prolongation admin — « " + String(target.name || id) + " » (" + periodDays + " j.)",
    });

    return res.json({ ok: true, restaurant_id: id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur lors de l’activation." });
  }
}

async function postSuspend(req, res) {
  try {
    var idParsed = parseRestaurantIdParams(req.params);
    if (sendValidationError(idParsed, res)) {
      return;
    }
    var id = idParsed.data.restaurantId;

    var pool = getPool();
    var adminId = Number(req.user.id);

    var [[target]] = await pool.query("SELECT id, name FROM restaurants WHERE id = ? LIMIT 1", [id]);
    if (!target) {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }

    await pool.query("UPDATE restaurants SET subscription_status = 'suspended' WHERE id = ? LIMIT 1", [id]);

    await appendAudit({
      userId: adminId,
      restaurantId: id,
      actorType: ACTOR_TYPES.ADMIN,
      action: AUDIT_ACTIONS.SUBSCRIPTION_SUSPEND,
      detail: "Suspension abonnement admin — « " + String(target.name || id) + " »",
    });

    return res.json({ ok: true, restaurant_id: id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur lors de la suspension." });
  }
}

async function postRenew(req, res) {
  try {
    var idParsed = parseRestaurantIdParams(req.params);
    if (sendValidationError(idParsed, res)) {
      return;
    }
    var bodyParsed = parseRenewBody(req.body);
    if (sendValidationError(bodyParsed, res)) {
      return;
    }
    var id = idParsed.data.restaurantId;
    var months = bodyParsed.data.months;
    var amountMaybe = bodyParsed.data.subscription_amount_cfa;
    var planKeyMaybe = bodyParsed.data.subscription_plan_key;

    var pool = getPool();
    var adminId = Number(req.user.id);

    var [[target]] = await pool.query("SELECT id, name FROM restaurants WHERE id = ? LIMIT 1", [id]);
    if (!target) {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }

    if (planKeyMaybe) {
      if (amountMaybe != null && Number.isFinite(amountMaybe) && amountMaybe >= 0) {
        await pool.query(
          "UPDATE restaurants SET subscription_status = 'active', subscription_started_at = COALESCE(subscription_started_at, NOW()), " +
            "subscription_ends_at = DATE_ADD(GREATEST(CURDATE(), COALESCE(DATE(subscription_ends_at), CURDATE())), INTERVAL ? MONTH), " +
            "subscription_amount_cfa = ?, subscription_plan_key = ? WHERE id = ? LIMIT 1",
          [months, Math.round(amountMaybe), planKeyMaybe, id],
        );
      } else {
        await pool.query(
          "UPDATE restaurants SET subscription_status = 'active', subscription_started_at = COALESCE(subscription_started_at, NOW()), " +
            "subscription_ends_at = DATE_ADD(GREATEST(CURDATE(), COALESCE(DATE(subscription_ends_at), CURDATE())), INTERVAL ? MONTH), " +
            "subscription_plan_key = ? WHERE id = ? LIMIT 1",
          [months, planKeyMaybe, id],
        );
      }
    } else if (amountMaybe != null && Number.isFinite(amountMaybe) && amountMaybe >= 0) {
      await pool.query(
        "UPDATE restaurants SET subscription_status = 'active', subscription_started_at = COALESCE(subscription_started_at, NOW()), " +
          "subscription_ends_at = DATE_ADD(GREATEST(CURDATE(), COALESCE(DATE(subscription_ends_at), CURDATE())), INTERVAL ? MONTH), " +
          "subscription_amount_cfa = ? WHERE id = ? LIMIT 1",
        [months, Math.round(amountMaybe), id],
      );
    } else {
      await pool.query(
        "UPDATE restaurants SET subscription_status = 'active', subscription_started_at = COALESCE(subscription_started_at, NOW()), " +
          "subscription_ends_at = DATE_ADD(GREATEST(CURDATE(), COALESCE(DATE(subscription_ends_at), CURDATE())), INTERVAL ? MONTH) WHERE id = ? LIMIT 1",
        [months, id],
      );
    }

    await appendAudit({
      userId: adminId,
      restaurantId: id,
      actorType: ACTOR_TYPES.ADMIN,
      action: AUDIT_ACTIONS.SUBSCRIPTION_RENEW,
      detail:
        "Renouvellement admin (« " + String(target.name || id) + " », +" + months + " mois)",
    });

    return res.json({ ok: true, restaurant_id: id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur lors du renouvellement." });
  }
}

/**
 * Ajuster échéance et/ou clé de plan sans repasser par les assistants activate/renew (admin).
 */
async function patchAdjustSubscription(req, res) {
  try {
    var idParsed = parseRestaurantIdParams(req.params);
    if (sendValidationError(idParsed, res)) {
      return;
    }
    var bodyParsed = parseAdjustBody(req.body);
    if (sendValidationError(bodyParsed, res)) {
      return;
    }
    var id = idParsed.data.restaurantId;
    var endsExplicit = bodyParsed.data.endsExplicit;
    var addDaysNum = bodyParsed.data.addDays;
    var touchesPlan = bodyParsed.data.touchesPlan;
    var planClean = bodyParsed.data.planKey;
    var touchesEndByDate = Boolean(endsExplicit);
    var touchesEndByDays = addDaysNum != null;

    var pool = getPool();
    var adminId = Number(req.user.id);

    var [[target]] = await pool.query(
      "SELECT id, name, subscription_status FROM restaurants WHERE id = ? LIMIT 1",
      [id],
    );
    if (!target) {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }

    var conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (touchesEndByDate) {
        await conn.query("UPDATE restaurants SET subscription_ends_at = ? WHERE id = ? LIMIT 1", [
          endsExplicit + " 23:59:59",
          id,
        ]);
      }

      if (touchesEndByDays) {
        await conn.query(
          "UPDATE restaurants SET subscription_ends_at = DATE_ADD(" +
            "GREATEST(CURDATE(), COALESCE(DATE(subscription_ends_at), CURDATE())), INTERVAL ? DAY) " +
            "WHERE id = ? LIMIT 1",
          [Math.round(addDaysNum), id],
        );
      }

      if (touchesPlan) {
        await conn.query("UPDATE restaurants SET subscription_plan_key = ? WHERE id = ? LIMIT 1", [
          planClean,
          id,
        ]);
      }

      await conn.query(
        "UPDATE restaurants SET subscription_status = CASE " +
          "WHEN LOWER(TRIM(COALESCE(subscription_status,''))) = 'suspended' THEN 'suspended' " +
          "WHEN subscription_ends_at IS NOT NULL AND DATE(subscription_ends_at) < CURDATE() THEN 'expired' " +
          "ELSE 'active' END WHERE id = ? LIMIT 1",
        [id],
      );

      await conn.commit();
    } catch (txnErr) {
      await conn.rollback();
      throw txnErr;
    } finally {
      conn.release();
    }

    await appendAudit({
      userId: adminId,
      restaurantId: id,
      actorType: ACTOR_TYPES.ADMIN,
      action: AUDIT_ACTIONS.SUBSCRIPTION_ADJUST,
      detail: "Ajustement durée/plan admin — « " + String(target.name || id) + " »",
    });

    return res.json({ ok: true, restaurant_id: id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur lors de l’ajustement." });
  }
}

/** Abonnements à surveiller (échéance ≤ 3 jours). */
async function listExpiringSubscriptions(req, res) {
  try {
    var pool = getPool();
    await subscriptionService.expireAllPastDueGlobally();

    var maxDays = 3;
    var [rows] = await pool.query(
      "SELECT r.id, r.name, r.logo_url, r.whatsapp, r.subscription_plan_key, r.subscription_status, " +
        "r.subscription_started_at, r.subscription_ends_at, r.subscription_amount_cfa, u.email AS owner_email, " +
        "CASE WHEN r.subscription_ends_at IS NULL THEN NULL ELSE GREATEST(0, DATEDIFF(DATE(r.subscription_ends_at), CURDATE())) END AS days_remaining " +
        "FROM restaurants r " +
        "INNER JOIN users u ON u.id = r.user_id " +
        "WHERE r.subscription_ends_at IS NOT NULL " +
        "AND r.subscription_ends_at >= CURDATE() " +
        "AND r.subscription_ends_at < DATE_ADD(CURDATE(), INTERVAL ? DAY) " +
        "AND r.subscription_status <> 'suspended' " +
        "ORDER BY days_remaining ASC, r.name ASC " +
        "LIMIT 60",
      [maxDays + 1],
    );

    var items = rows.map(function (r) {
      var mapped = mapSubscriptionRow(r);
      mapped.owner_phone =
        r.whatsapp != null && String(r.whatsapp).trim() !== "" ?
          String(r.whatsapp).trim()
        : "";
      return mapped;
    });

    return res.json({ items: items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Impossible de charger les abonnements à surveiller." });
  }
}

module.exports = {
  listSubscriptions: listSubscriptions,
  listExpiringSubscriptions: listExpiringSubscriptions,
  getSubscriptionDetail: getSubscriptionDetail,
  postActivate: postActivate,
  postSuspend: postSuspend,
  postRenew: postRenew,
  patchAdjustSubscription: patchAdjustSubscription,
};
