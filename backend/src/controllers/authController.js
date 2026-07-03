const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getPool } = require("../config/database");
const { getJwtSecret } = require("../config/jwtSecret");
const { appendAudit, AUDIT_ACTIONS, ACTOR_TYPES } = require("../utils/auditLog");
const {
  createAdminNotification,
  NOTIFICATION_TYPES,
} = require("../services/adminNotificationService");
const platformSettings = require("../services/platformSettings");
const { normalizeWhatsapp } = require("../utils/whatsappNormalize");
const { isPlatformAdminEmail } = require("../utils/platformAdmin");
const loginLockout = require("../utils/loginLockout");
const { parseLoginBody, parseRegisterBody } = require("../validators/auth");
const { sendValidationError } = require("../validators/helpers");

function mapRestaurantAuth(row) {
  if (!row) return null;
  const locality =
    row.city != null && String(row.city).trim() !== "" ? String(row.city).trim() : null;
  return {
    id: row.id,
    name: row.name,
    /** Stocké dans `restaurants.city` (colonne BD = quartier du restaurant). */
    city: locality,
    /** Alias lisible (« quartier ») — égale à `city`. */
    quartier: locality,
    country: row.country != null && String(row.country).trim() !== "" ? String(row.country).trim() : null,
    whatsapp: row.whatsapp,
    subscription_status: row.subscription_status,
    subscription_started_at: row.subscription_started_at
      ? new Date(row.subscription_started_at).toISOString()
      : null,
    subscription_ends_at: row.subscription_ends_at
      ? new Date(row.subscription_ends_at).toISOString()
      : null,
    subscription_plan_key: row.subscription_plan_key || "trial",
    onboarding_seen: Boolean(row.onboarding_seen),
    needs_setup_help: Boolean(row.needs_setup_help),
  };
}

function signToken(payload) {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error("JWT_SECRET manquant dans le fichier .env");
  }
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  return jwt.sign(payload, secret, { expiresIn: expiresIn, algorithm: "HS256" });
}

async function logLoginFailure(params) {
  var email = String((params && params.email) || "").trim().toLowerCase();
  var reason = String((params && params.reason) || "invalid_credentials").slice(0, 80);
  var ip = String((params && params.ip) || "unknown").slice(0, 80);

  await appendAudit({
    userId: params && params.userId ? params.userId : null,
    restaurantId: null,
    action: AUDIT_ACTIONS.USER_LOGIN_FAILED,
    detail: "Échec connexion (" + reason + ") email=" + email.slice(0, 160) + " ip=" + ip,
  });
}

async function register(req, res) {
  var parsed = parseRegisterBody(req.body);
  if (sendValidationError(parsed, res)) {
    return;
  }
  var input = parsed.data;
  const email = input.email;
  const password = input.password;
  const restaurantName = input.restaurantName;
  const fullName = input.fullName;
  const principalPhoneDb = input.whatsapp;
  const cityDb = input.quartier;

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existing] = await connection.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (existing.length) {
      await connection.rollback();
      return res.status(409).json({ message: "Cet email est déjà utilisé." });
    }

    const rounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;
    const passwordHash = await bcrypt.hash(password, rounds);

    const [userResult] = await connection.query(
      "INSERT INTO users (email, full_name, phone, password) VALUES (?, ?, ?, ?)",
      [email, fullName, principalPhoneDb, passwordHash],
    );

    const userId = userResult.insertId;

    const trialDays = platformSettings.getTrialPeriodDays();
    const [restaurantResult] = await connection.query(
      "INSERT INTO restaurants " +
        "(user_id, name, city, country, description, whatsapp, subscription_status, subscription_started_at, subscription_ends_at, subscription_amount_cfa, subscription_plan_key) " +
        "VALUES (?, ?, ?, ?, ?, ?, 'trial', NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), 0, 'trial')",
      [userId, restaurantName, cityDb, null, null, principalPhoneDb, trialDays],
    );

    const restaurantId = restaurantResult.insertId;
    const [[restaurantRow]] = await connection.query(
      "SELECT id, name, city, country, whatsapp, subscription_status, subscription_started_at, subscription_ends_at, subscription_plan_key, " +
        "COALESCE(onboarding_seen, 0) AS onboarding_seen, COALESCE(needs_setup_help, 0) AS needs_setup_help " +
        "FROM restaurants WHERE id = ? LIMIT 1",
      [restaurantId],
    );

    await connection.commit();

    await appendAudit({
      userId: userId,
      restaurantId: restaurantId,
      actorType: ACTOR_TYPES.RESTAURANT,
      action: AUDIT_ACTIONS.USER_REGISTER,
      detail: "Inscription nouveau compte (« " + restaurantName + " », quartier : " + cityDb + ")",
    });

    await createAdminNotification({
      type: NOTIFICATION_TYPES.NEW_RESTAURANT,
      userId: userId,
      restaurantId: restaurantId,
      restaurantName: restaurantName,
      phone: principalPhoneDb,
      detail:
        "Restaurant : " +
        restaurantName +
        " — Téléphone : " +
        (principalPhoneDb || "—") +
        " — Quartier : " +
        cityDb,
      linkUrl: "admin-restaurants.html",
    });

    const token = signToken({ userId: userId });

    return res.status(201).json({
      message: "Compte créé avec succès.",
      token: token,
      is_platform_admin: isPlatformAdminEmail(email),
      user: {
        id: userId,
        email: email,
        full_name: fullName,
        phone: principalPhoneDb,
      },
      restaurant: mapRestaurantAuth(restaurantRow),
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ message: "Erreur serveur lors de l'inscription." });
  } finally {
    connection.release();
  }
}

async function login(req, res) {
  var parsed = parseLoginBody(req.body);
  if (sendValidationError(parsed, res)) {
    return;
  }
  const email = parsed.data.email;
  const password = parsed.data.password;
  const clientIp = loginLockout.getClientIp(req);

  var lockCheck = loginLockout.checkLockout(email, clientIp);
  if (!lockCheck.allowed) {
    await logLoginFailure({ email: email, ip: clientIp, reason: "locked" });
    return loginLockout.sendLockoutResponse(res, lockCheck.retryAfterSeconds);
  }

  try {
    const pool = getPool();
    const [rows] = await pool.query(
      "SELECT id, email, full_name, phone, password, account_status FROM users WHERE email = ? LIMIT 1",
      [email],
    );

    if (!rows.length) {
      var failUnknown = loginLockout.recordFailure(email, clientIp);
      await logLoginFailure({ email: email, ip: clientIp, reason: "unknown_email" });
      if (!failUnknown.allowed) {
        return loginLockout.sendLockoutResponse(res, failUnknown.retryAfterSeconds);
      }
      return res.status(401).json({ message: "Email ou mot de passe incorrect." });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      var failBadPassword = loginLockout.recordFailure(email, clientIp);
      await logLoginFailure({ userId: user.id, email: email, ip: clientIp, reason: "bad_password" });
      if (!failBadPassword.allowed) {
        return loginLockout.sendLockoutResponse(res, failBadPassword.retryAfterSeconds);
      }
      return res.status(401).json({ message: "Email ou mot de passe incorrect." });
    }

    loginLockout.recordSuccess(email, clientIp);

    var accountStatus =
      user.account_status != null && String(user.account_status).trim() !== ""
        ? String(user.account_status).trim().toLowerCase()
        : "active";
    if (accountStatus === "suspended") {
      return res.status(403).json({ message: "Ce compte a été suspendu. Contactez l'administrateur." });
    }

    const [restaurants] = await pool.query(
      "SELECT r.id, r.name, r.city, r.country, r.whatsapp, r.subscription_status, r.subscription_started_at, r.subscription_ends_at, r.subscription_plan_key, r.subscription_amount_cfa, " +
        "COALESCE(r.onboarding_seen, 0) AS onboarding_seen, COALESCE(r.needs_setup_help, 0) AS needs_setup_help " +
        "FROM restaurants r WHERE r.user_id = ? ORDER BY r.id ASC LIMIT 1",
      [user.id],
    );

    await appendAudit({
      userId: user.id,
      restaurantId: restaurants[0] ? restaurants[0].id : null,
      actorType: ACTOR_TYPES.RESTAURANT,
      action: AUDIT_ACTIONS.USER_LOGIN,
      detail: "Connexion utilisateur",
    });

    const token = signToken({ userId: user.id });

    return res.status(200).json({
      message: "Connexion réussie.",
      token: token,
      is_platform_admin: isPlatformAdminEmail(user.email),
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name != null && String(user.full_name).trim() !== "" ? String(user.full_name).trim() : null,
        phone: user.phone != null && String(user.phone).trim() !== "" ? String(user.phone).trim() : null,
      },
      restaurant: restaurants[0] ? mapRestaurantAuth(restaurants[0]) : null,
    });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur lors de la connexion." });
  }
}

module.exports = {
  register,
  login,
};
