/**
 * Ajoute products.is_visible sur une base existante.
 * Usage (depuis backend/) : npm run db:product-is-visible
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

  if (!(await columnExists(connection, database, "products", "is_visible"))) {
    await connection.query(
      "ALTER TABLE products ADD COLUMN is_visible TINYINT(1) NOT NULL DEFAULT 1 AFTER has_sizes",
    );
    console.log("Colonne products.is_visible ajoutée (valeur par défaut : visible).");
  } else {
    console.log("Colonne products.is_visible déjà présente.");
  }

  await connection.end();
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
