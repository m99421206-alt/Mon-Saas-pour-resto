const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getPool } = require("../config/database");

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

    const [restaurantResult] = await connection.query(
      "INSERT INTO restaurants (user_id, name, description) VALUES (?, ?, ?)",
      [userId, restaurantName, null]
    );

    await connection.commit();

    const token = signToken({ userId: userId });

    return res.status(201).json({
      message: "Compte créé avec succès.",
      token: token,
      user: {
        id: userId,
        email: email,
      },
      restaurant: {
        id: restaurantResult.insertId,
        name: restaurantName,
      },
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
    const [rows] = await pool.query("SELECT id, email, password FROM users WHERE email = ? LIMIT 1", [email]);

    if (!rows.length) {
      return res.status(401).json({ message: "Email ou mot de passe incorrect." });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ message: "Email ou mot de passe incorrect." });
    }

    const [restaurants] = await pool.query(
      "SELECT id, name FROM restaurants WHERE user_id = ? ORDER BY id ASC LIMIT 1",
      [user.id]
    );

    const token = signToken({ userId: user.id });

    return res.status(200).json({
      message: "Connexion réussie.",
      token: token,
      user: {
        id: user.id,
        email: user.email,
      },
      restaurant: restaurants[0] || null,
    });
  } catch (error) {
    return res.status(500).json({ message: "Erreur serveur lors de la connexion." });
  }
}

module.exports = {
  register,
  login,
};
