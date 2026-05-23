/**
 * Table plateform_settings (réglages globaux JSON).
 * Usage (backend/) : npm run db:admin-platform-settings
 */

require("dotenv").config();

var mysql = require("mysql2/promise");

async function tableExists(connection, database, table) {
  var [rows] = await connection.query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1",
    [database, table],
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

  if (!(await tableExists(connection, database, "platform_settings"))) {
    await connection.query(
      "CREATE TABLE IF NOT EXISTS platform_settings (" +
        "setting_key VARCHAR(64) NOT NULL," +
        "setting_value LONGTEXT NOT NULL," +
        "PRIMARY KEY (setting_key)" +
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
  }

  await connection.end();
  console.log("Table platform_settings vérifiée.");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
