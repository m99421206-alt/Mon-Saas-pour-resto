/**
 * Ajoute updated_at + index déduplication sur admin_notifications.
 * Usage (depuis backend/) : npm run db:admin-notifications-group
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

async function indexExists(connection, database, table, indexName) {
  var [rows] = await connection.query(
    "SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1",
    [database, table, indexName],
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

  if (!(await columnExists(connection, database, "admin_notifications", "updated_at"))) {
    await connection.query(
      "ALTER TABLE admin_notifications ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL AFTER created_at",
    );
    console.log("Colonne updated_at ajoutée.");
  } else {
    console.log("Colonne updated_at déjà présente.");
  }

  if (!(await indexExists(connection, database, "admin_notifications", "idx_admin_notif_dedupe"))) {
    await connection.query(
      "CREATE INDEX idx_admin_notif_dedupe ON admin_notifications (type, restaurant_id, is_read, id)",
    );
    console.log("Index idx_admin_notif_dedupe créé.");
  } else {
    console.log("Index idx_admin_notif_dedupe déjà présent.");
  }

  await connection.end();
  console.log("Migration notifications groupées terminée.");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
