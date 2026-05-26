const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getPool } = require("../config/database");
const { appendAudit, AUDIT_ACTIONS } = require("../utils/auditLog");
const platformSettings = require("../services/platformSettings");
const { normalizeWhatsapp } = require("../utils/whatsappNormalize");
const { isPlatformAdminEmail } = require("../utils/platformAdmin");

function mapRestaurantAuth(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").toLowerCase());
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET manquant dans le fichier .env");
  }
  return secret;
}

function signToken(payload) {
  const secret = getJwtSecret();
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  return jwt.sign(payload, secret, { expiresIn });
}

async function register(req, res) {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const restaurantName = String(req.body.restaurantName || "").trim() || "Mon restaurant";

  if (!email || !password) {
    return res.status(400).json({ message: "Email et mot de passe sont obligatoires." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Format d'email invalide." });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: "Le mot de passe doit contenir au moins 8 caractères." });
  }

  const whatsappNormalized = normalizeWhatsapp(req.body.whatsapp);
  if (whatsappNormalized === null) {
    return res.status(400).json({ message: "Le numéro WhatsApp pour les commandes est obligatoire." });
  }
  if (whatsappNormalized === false) {
    return res.status(400).json({ message: "Numéro WhatsApp invalide. Exemple : +22370000000" });
  }

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

    const [userResult] = await connection.query("INSERT INTO users (email, password) VALUES (?, ?)", [
      email,
      passwordHash,
    ]);

    const userId = userResult.insertId;

    const trialDays = platformSettings.getTrialPeriodDays();
    const [restaurantResult] = await connection.query(
      "INSERT INTO restaurants " +
        "(user_id, name, description, whatsapp, subscription_status, subscription_started_at, subscription_ends_at, subscription_amount_cfa, subscription_plan_key) " +
        "VALUES (?, ?, ?, ?, 'trial', NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), 0, 'trial')",
      [userId, restaurantName, null, whatsappNormalized, trialDays],
    );

    const restaurantId = restaurantResult.insertId;
    const [[restaurantRow]] = await connection.query(
      "SELECT id, name, whatsapp, subscription_status, subscription_started_at, subscription_ends_at, subscription_plan_key, " +
        "COALESCE(onboarding_seen, 0) AS onboarding_seen, COALESCE(needs_setup_help, 0) AS needs_setup_help " +
        "FROM restaurants WHERE id = ? LIMIT 1",
      [restaurantId],
    );

    await connection.commit();

    await appendAudit({
      userId: userId,
      restaurantId: restaurantId,
      action: AUDIT_ACTIONS.USER_REGISTER,
      detail: "Inscription nouveau compte (« " + restaurantName + " »)",
    });

    const token = signToken({ userId: userId });

    return res.status(201).json({
      message: "Compte créé avec succès.",
      token: token,
      is_platform_admin: isPlatformAdminEmail(email),
      user: {
        id: userId,
        email: email,
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
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!email || !password) {
    return res.status(400).json({ message: "Email et mot de passe sont obligatoires." });
  }

  try {
    const pool = getPool();
    const [rows] = await pool.query("SELECT id, email, password, account_status FROM users WHERE email = ? LIMIT 1", [
      email,
    ]);

    if (!rows.length) {
      return res.status(401).json({ message: "Email ou mot de passe incorrect." });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ message: "Email ou mot de passe incorrect." });
    }

    var accountStatus =
      user.account_status != null && String(user.account_status).trim() !== ""
        ? String(user.account_status).trim().toLowerCase()
        : "active";
    if (accountStatus === "suspended") {
      return res.status(403).json({ message: "Ce compte a été suspendu. Contactez l'administrateur." });
    }

    const [restaurants] = await pool.query(
      "SELECT id, name, whatsapp, subscription_status, subscription_started_at, subscription_ends_at, subscription_plan_key, subscription_amount_cfa, " +
        "COALESCE(onboarding_seen, 0) AS onboarding_seen, COALESCE(needs_setup_help, 0) AS needs_setup_help " +
        "FROM restaurants WHERE user_id = ? ORDER BY id ASC LIMIT 1",
      [user.id],
    );

    await appendAudit({
      userId: user.id,
      restaurantId: restaurants[0] ? restaurants[0].id : null,
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
