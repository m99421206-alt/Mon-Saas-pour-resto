/**
 * Ajoute les index de performance utilisés par le menu public et l'audit.
 * Usage (depuis backend/) : npm run db:performance-indexes
 */

require("dotenv").config();

var mysql = require("mysql2/promise");

async function indexExists(connection, database, table, indexName) {
  var [rows] = await connection.query(
    "SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1",
    [database, table, indexName]
  );
  return rows.length > 0;
}

async function addIndexIfMissing(connection, database, table, indexName, sql) {
  if (await indexExists(connection, database, table, indexName)) {
    console.log("Index " + indexName + " déjà présent.");
    return;
  }
  await connection.query(sql);
  console.log("Index " + indexName + " ajouté.");
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

  try {
    await addIndexIfMissing(
      connection,
      database,
      "users",
      "idx_users_created_at",
      "ALTER TABLE users ADD INDEX idx_users_created_at (created_at)"
    );
    await addIndexIfMissing(
      connection,
      database,
      "restaurants",
      "idx_restaurants_subscription_ends_at",
      "ALTER TABLE restaurants ADD INDEX idx_restaurants_subscription_ends_at (subscription_ends_at)"
    );
    await addIndexIfMissing(
      connection,
      database,
      "restaurants",
      "idx_restaurants_sub_status_ends",
      "ALTER TABLE restaurants ADD INDEX idx_restaurants_sub_status_ends (subscription_status, subscription_ends_at)"
    );
    await addIndexIfMissing(
      connection,
      database,
      "restaurants",
      "idx_restaurants_created_at",
      "ALTER TABLE restaurants ADD INDEX idx_restaurants_created_at (created_at)"
    );
    await addIndexIfMissing(
      connection,
      database,
      "restaurants",
      "idx_restaurants_needs_setup_help",
      "ALTER TABLE restaurants ADD INDEX idx_restaurants_needs_setup_help (needs_setup_help)"
    );
    await addIndexIfMissing(
      connection,
      database,
      "products",
      "idx_products_public_menu",
      "ALTER TABLE products ADD INDEX idx_products_public_menu (restaurant_id, is_visible, category_id, id)"
    );
    await addIndexIfMissing(
      connection,
      database,
      "products",
      "idx_products_created_at",
      "ALTER TABLE products ADD INDEX idx_products_created_at (created_at)"
    );
    await addIndexIfMissing(
      connection,
      database,
      "product_variants",
      "idx_product_variants_menu_order",
      "ALTER TABLE product_variants ADD INDEX idx_product_variants_menu_order (product_id, sort_order, id)"
    );
    await addIndexIfMissing(
      connection,
      database,
      "audit_logs",
      "idx_audit_logs_restaurant_id",
      "ALTER TABLE audit_logs ADD INDEX idx_audit_logs_restaurant_id (restaurant_id)"
    );
    await addIndexIfMissing(
      connection,
      database,
      "audit_logs",
      "idx_audit_logs_restaurant_created",
      "ALTER TABLE audit_logs ADD INDEX idx_audit_logs_restaurant_created (restaurant_id, created_at)"
    );
    await addIndexIfMissing(
      connection,
      database,
      "audit_logs",
      "idx_audit_logs_action_created",
      "ALTER TABLE audit_logs ADD INDEX idx_audit_logs_action_created (action, created_at)"
    );
  } finally {
    await connection.end();
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
