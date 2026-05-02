/**
 * Ajoute les colonnes de paramètres restaurant sur une base existante.
 * Usage (depuis backend/) : npm run db:settings
 */

require("dotenv").config();

var mysql = require("mysql2/promise");

async function columnExists(connection, database, table, column) {
  var [rows] = await connection.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1",
    [database, table, column]
  );
  return rows.length > 0;
}

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

  if (!(await columnExists(connection, database, "restaurants", "whatsapp"))) {
    await connection.query("ALTER TABLE restaurants ADD COLUMN whatsapp VARCHAR(32) NULL AFTER description");
  }

  if (!(await columnExists(connection, database, "restaurants", "logo_url"))) {
    await connection.query("ALTER TABLE restaurants ADD COLUMN logo_url VARCHAR(512) NULL AFTER whatsapp");
  }

  if (!(await columnExists(connection, database, "restaurants", "banner_url"))) {
    await connection.query("ALTER TABLE restaurants ADD COLUMN banner_url VARCHAR(512) NULL AFTER logo_url");
  }

  if (!(await columnExists(connection, database, "restaurants", "theme_color"))) {
    await connection.query(
      "ALTER TABLE restaurants ADD COLUMN theme_color VARCHAR(16) NOT NULL DEFAULT '#FF7A51' AFTER banner_url"
    );
  }

  if (!(await columnExists(connection, database, "products", "description"))) {
    await connection.query("ALTER TABLE products ADD COLUMN description TEXT NULL AFTER name");
  }

  if (!(await columnExists(connection, database, "products", "has_sizes"))) {
    await connection.query("ALTER TABLE products ADD COLUMN has_sizes TINYINT(1) NOT NULL DEFAULT 1 AFTER image");
  }

  if (!(await tableExists(connection, database, "product_variants"))) {
    await connection.query(
      "CREATE TABLE product_variants (" +
        "id INT UNSIGNED NOT NULL AUTO_INCREMENT, " +
        "product_id INT UNSIGNED NOT NULL, " +
        "name VARCHAR(100) NOT NULL, " +
        "price DECIMAL(10,2) NOT NULL DEFAULT 0.00, " +
        "image VARCHAR(512) NULL, " +
        "sort_order INT UNSIGNED NOT NULL DEFAULT 0, " +
        "PRIMARY KEY (id), " +
        "KEY idx_product_variants_product_id (product_id), " +
        "CONSTRAINT fk_product_variants_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE ON UPDATE CASCADE" +
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
  }

  await connection.end();
  console.log("Colonnes restaurant et produits vérifiées.");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
