/**
 * Crée la table admin_notifications sur une base existante.
 * Usage (depuis backend/) : npm run db:admin-notifications
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

  if (!(await tableExists(connection, database, "admin_notifications"))) {
    await connection.query(
      "CREATE TABLE admin_notifications (" +
        "id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, " +
        "type VARCHAR(48) NOT NULL, " +
        "restaurant_id INT UNSIGNED NULL, " +
        "user_id INT UNSIGNED NULL, " +
        "restaurant_name VARCHAR(160) NOT NULL DEFAULT '', " +
        "phone VARCHAR(32) NULL, " +
        "detail VARCHAR(2048) NULL, " +
        "link_url VARCHAR(255) NULL, " +
        "is_read TINYINT(1) NOT NULL DEFAULT 0, " +
        "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
        "PRIMARY KEY (id), " +
        "KEY idx_admin_notif_created (created_at), " +
        "KEY idx_admin_notif_read_created (is_read, created_at), " +
        "KEY idx_admin_notif_type (type), " +
        "CONSTRAINT fk_admin_notif_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE, " +
        "CONSTRAINT fk_admin_notif_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE SET NULL ON UPDATE CASCADE" +
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    console.log("Table admin_notifications créée.");
  } else {
    console.log("Table admin_notifications déjà présente.");
  }

  await connection.end();
  console.log("Migration notifications admin terminée.");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
