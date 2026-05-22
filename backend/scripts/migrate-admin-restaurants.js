/**
 * Colonnes admin restaurants : ville, abonnement, menu public suspendu, date création.
 * Usage (depuis backend/) : npm run db:admin-restaurants
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

async function indexExists(connection, database, indexName, table) {
  var [rows] = await connection.query(
    "SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1",
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

  if (!(await columnExists(connection, database, "restaurants", "city"))) {
    await connection.query("ALTER TABLE restaurants ADD COLUMN city VARCHAR(120) NULL AFTER name");
  }

  if (!(await columnExists(connection, database, "restaurants", "subscription_status"))) {
    await connection.query(
      "ALTER TABLE restaurants ADD COLUMN subscription_status VARCHAR(20) NOT NULL DEFAULT 'trial' AFTER city",
    );
  }

  if (!(await columnExists(connection, database, "restaurants", "menu_suspended"))) {
    await connection.query(
      "ALTER TABLE restaurants ADD COLUMN menu_suspended TINYINT(1) NOT NULL DEFAULT 0 AFTER subscription_status",
    );
  }

  if (!(await columnExists(connection, database, "restaurants", "created_at"))) {
    await connection.query(
      "ALTER TABLE restaurants ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER theme_color",
    );
  }

  if (!(await indexExists(connection, database, "idx_restaurants_subscription", "restaurants"))) {
    await connection.query("CREATE INDEX idx_restaurants_subscription ON restaurants (subscription_status)");
  }

  if (!(await indexExists(connection, database, "idx_restaurants_menu_suspended", "restaurants"))) {
    await connection.query("CREATE INDEX idx_restaurants_menu_suspended ON restaurants (menu_suspended)");
  }

  await connection.end();
  console.log("Colonnes admin restaurants vérifiées (city, subscription_status, menu_suspended, created_at).");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
