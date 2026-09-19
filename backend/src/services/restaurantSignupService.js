/**
 * Création compte restaurant + utilisateur (inscription publique ou admin).
 */

"use strict";

const bcrypt = require("bcryptjs");
const { getPool } = require("../config/database");
const platformSettings = require("./platformSettings");
const { generateUniqueSlug } = require("../utils/generateSlug");

/**
 * @param {{
 *   email: string,
 *   password: string,
 *   restaurantName: string,
 *   fullName: string,
 *   whatsapp: string,
 *   quartier: string,
 * }} input
 */
async function createRestaurantAccount(input) {
  const email = input.email;
  const password = input.password;
  const restaurantName = input.restaurantName;
  const fullName = input.fullName;
  const principalPhoneDb = input.whatsapp;
  const cityDb = input.quartier;

  var connection = null;

  try {
    const pool = getPool();
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [existing] = await connection.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email],
    );
    if (existing.length) {
      await connection.rollback();
      var dupErr = new Error("EMAIL_IN_USE");
      dupErr.code = "EMAIL_IN_USE";
      throw dupErr;
    }

    const rounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;
    const passwordHash = await bcrypt.hash(password, rounds);

    const [userResult] = await connection.query(
      "INSERT INTO users (email, full_name, phone, password) VALUES (?, ?, ?, ?)",
      [email, fullName, principalPhoneDb, passwordHash],
    );

    const userId = userResult.insertId;

    const trialDays = platformSettings.getTrialPeriodDays();
    const restaurantSlug = await generateUniqueSlug(connection, restaurantName);

    const [restaurantResult] = await connection.query(
      "INSERT INTO restaurants " +
        "(user_id, name, slug, city, country, description, whatsapp, subscription_status, subscription_started_at, subscription_ends_at, subscription_amount_cfa, subscription_plan_key) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, 'trial', NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), 0, 'trial')",
      [
        userId,
        restaurantName,
        restaurantSlug,
        cityDb,
        null,
        null,
        principalPhoneDb,
        trialDays,
      ],
    );

    const restaurantId = restaurantResult.insertId;
    const [[restaurantRow]] = await connection.query(
      "SELECT id, name, slug, city, country, whatsapp, subscription_status, subscription_started_at, subscription_ends_at, subscription_plan_key, " +
        "COALESCE(onboarding_seen, 0) AS onboarding_seen, COALESCE(needs_setup_help, 0) AS needs_setup_help " +
        "FROM restaurants WHERE id = ? LIMIT 1",
      [restaurantId],
    );

    await connection.commit();

    return {
      userId: userId,
      restaurantId: restaurantId,
      restaurantRow: restaurantRow,
      email: email,
      fullName: fullName,
      restaurantName: restaurantName,
      whatsapp: principalPhoneDb,
      quartier: cityDb,
    };
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[createRestaurantAccount] rollback:", rollbackErr.message || rollbackErr);
        }
      }
    }
    throw err;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  createRestaurantAccount: createRestaurantAccount,
};
