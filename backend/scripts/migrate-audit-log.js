/**
 * Crée la table audit_logs sur une base existante.
 * Usage (depuis backend/) : npm run db:audit-log
 */

require("dotenv").config();

var mysql = require("mysql2/promise");

async function tableExists(connection, database, table) {
  var [rows] = await connection.query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1",
    [database, table]
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

  if (!(await tableExists(connection, database, "audit_logs"))) {
    await connection.query(
      "CREATE TABLE audit_logs (" +
        "id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, " +
        "user_id INT UNSIGNED NULL, " +
        "restaurant_id INT UNSIGNED NULL, " +
        "action VARCHAR(96) NOT NULL, " +
        "detail VARCHAR(2048) NULL, " +
        "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
        "PRIMARY KEY (id), " +
        "KEY idx_audit_logs_created_at (created_at), " +
        "KEY idx_audit_logs_user_id (user_id), " +
        "CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE, " +
        "CONSTRAINT fk_audit_logs_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE SET NULL ON UPDATE CASCADE" +
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
  }

  await connection.end();
  console.log("Table audit_logs vérifiée.");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
