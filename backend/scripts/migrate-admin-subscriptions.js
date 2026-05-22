/**
 * Dates et montant d’abonnement sur restaurants (lié subscription_status existant).
 * Usage (backend/) : npm run db:admin-subscriptions
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

  var connection = await mysql.createConnection({
    host: host,
    user: user,
    password: password,
    database: database,
  });

  if (!(await columnExists(connection, database, "restaurants", "subscription_started_at"))) {
    await connection.query(
      "ALTER TABLE restaurants ADD COLUMN subscription_started_at TIMESTAMP NULL DEFAULT NULL AFTER subscription_status",
    );
  }

  if (!(await columnExists(connection, database, "restaurants", "subscription_ends_at"))) {
    await connection.query(
      "ALTER TABLE restaurants ADD COLUMN subscription_ends_at TIMESTAMP NULL DEFAULT NULL AFTER subscription_started_at",
    );
  }

  if (!(await columnExists(connection, database, "restaurants", "subscription_amount_cfa"))) {
    await connection.query(
      "ALTER TABLE restaurants ADD COLUMN subscription_amount_cfa DECIMAL(12,0) NOT NULL DEFAULT 0 AFTER subscription_ends_at",
    );
  }

  await connection.end();
  console.log("Colonnes subscription (started_at, ends_at, amount_cfa) vérifiées sur restaurants.");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
