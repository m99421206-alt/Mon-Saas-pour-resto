/**
 * Ajoute subscription_plan_key + backfill des dates d’essai sur les anciennes lignes (trial sans fin).
 * Usage : npm run db:subscription-plan-key
 */

require("dotenv").config();

var mysql = require("mysql2/promise");

async function columnExists(connection, database, table, column) {
  var [rows] = await connection.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1",
    [database, table, column],
  );
  return rows.length > 0;
}

async function main() {
  var host = process.env.DB_HOST || "127.0.0.1";
  var user = process.env.DB_USER;
  var password = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : "";
  var database = process.env.DB_NAME;

  if (!user || !database) {
    throw new Error("Renseignez DB_USER et DB_NAME dans backend/.env");
  }

  var trialBackfillDays = Number(process.env.TRIAL_BACKFILL_DAYS);
  if (!Number.isFinite(trialBackfillDays) || trialBackfillDays < 1 || trialBackfillDays > 365) {
    trialBackfillDays = 30;
  }

  var connection = await mysql.createConnection({
    host: host,
    user: user,
    password: password,
    database: database,
  });

  if (!(await columnExists(connection, database, "restaurants", "subscription_plan_key"))) {
    await connection.query(
      "ALTER TABLE restaurants ADD COLUMN subscription_plan_key VARCHAR(48) NULL DEFAULT NULL AFTER subscription_amount_cfa",
    );
    console.log("Colonne subscription_plan_key ajoutée.");
  }

  var [updLegacy] = await connection.query(
    "UPDATE restaurants SET subscription_plan_key = 'trial', " +
      "subscription_started_at = COALESCE(subscription_started_at, created_at), " +
      "subscription_ends_at = DATE_ADD(DATE(COALESCE(subscription_started_at, created_at)), INTERVAL ? DAY) " +
      "WHERE subscription_status = 'trial' AND subscription_ends_at IS NULL",
    [trialBackfillDays],
  );

  console.log(
    "Backfill dates d’essai (trial sans fin) — lignes mises à jour :",
    typeof updLegacy.affectedRows !== "undefined" ? updLegacy.affectedRows : 0,
    "(durée utilisée : " + trialBackfillDays + " j.)",
  );

  await connection.end();
  console.log("OK — subscription_plan_key vérifié.");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
