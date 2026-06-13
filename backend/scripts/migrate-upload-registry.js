/**
 * Crée la table de registre des uploads pour rattacher les fichiers à un restaurant.
 * Usage (depuis backend/) : npm run db:upload-registry
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
    multipleStatements: true,
  });

  try {
    if (await tableExists(connection, database, "upload_files")) {
      console.log("Table upload_files déjà présente.");
      return;
    }

    await connection.query(
      "CREATE TABLE upload_files (" +
        "id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, " +
        "restaurant_id INT UNSIGNED NOT NULL, " +
        "user_id INT UNSIGNED NULL, " +
        "filename VARCHAR(255) NOT NULL, " +
        "url VARCHAR(512) NOT NULL, " +
        "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
        "PRIMARY KEY (id), " +
        "UNIQUE KEY uk_upload_files_filename (filename), " +
        "KEY idx_upload_files_restaurant_id (restaurant_id), " +
        "KEY idx_upload_files_user_id (user_id), " +
        "CONSTRAINT fk_upload_files_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE ON UPDATE CASCADE, " +
        "CONSTRAINT fk_upload_files_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE" +
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    console.log("Table upload_files créée.");
  } finally {
    await connection.end();
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
