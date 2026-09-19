/**
 * CRM demandes d'installation — colonnes + table events.
 * Usage : npm run db:setup-assistance-crm (depuis backend/)
 */

require("dotenv/config");

var mysql = require("mysql2/promise");

async function tableExists(connection, database, table) {
  var [rows] = await connection.query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1",
    [database, table],
  );
  return rows.length > 0;
}

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
    console.error("Renseignez DB_USER et DB_NAME dans backend/.env");
    process.exit(1);
  }

  var connection = await mysql.createConnection({
    host: host,
    user: user,
    password: password,
    database: database,
  });

  try {
    if (!(await tableExists(connection, database, "setup_assistance_requests"))) {
      console.error(
        "Table setup_assistance_requests absente. Exécutez d'abord npm run db:setup-assistance.",
      );
      process.exit(1);
    }

    if (!(await columnExists(connection, database, "setup_assistance_requests", "last_contacted_at"))) {
      await connection.query(
        "ALTER TABLE setup_assistance_requests ADD COLUMN last_contacted_at TIMESTAMP NULL DEFAULT NULL AFTER linked_restaurant_id",
      );
      console.log("Colonne last_contacted_at ajoutée.");
    }

    if (!(await columnExists(connection, database, "setup_assistance_requests", "last_activity_at"))) {
      await connection.query(
        "ALTER TABLE setup_assistance_requests ADD COLUMN last_activity_at TIMESTAMP NULL DEFAULT NULL AFTER last_contacted_at",
      );
      console.log("Colonne last_activity_at ajoutée.");
      await connection.query(
        "UPDATE setup_assistance_requests SET last_activity_at = COALESCE(updated_at, created_at) WHERE last_activity_at IS NULL",
      );
    }

    if (!(await columnExists(connection, database, "setup_assistance_requests", "checklist_json"))) {
      await connection.query(
        "ALTER TABLE setup_assistance_requests ADD COLUMN checklist_json JSON NULL DEFAULT NULL AFTER last_activity_at",
      );
      console.log("Colonne checklist_json ajoutée.");
    }

    await connection.query(
      "ALTER TABLE setup_assistance_requests MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'new'",
    );

    if (!(await tableExists(connection, database, "setup_assistance_request_events"))) {
      await connection.query(
        "CREATE TABLE `setup_assistance_request_events` (" +
          "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, " +
          "`request_id` BIGINT UNSIGNED NOT NULL, " +
          "`event_type` VARCHAR(48) NOT NULL, " +
          "`detail` VARCHAR(2048) NULL, " +
          "`admin_user_id` INT UNSIGNED NULL, " +
          "`payload_json` JSON NULL, " +
          "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
          "PRIMARY KEY (`id`), " +
          "KEY `idx_setup_events_request_created` (`request_id`, `created_at`), " +
          "KEY `idx_setup_events_type` (`event_type`), " +
          "CONSTRAINT `fk_setup_events_request` FOREIGN KEY (`request_id`) REFERENCES `setup_assistance_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, " +
          "CONSTRAINT `fk_setup_events_admin` FOREIGN KEY (`admin_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE" +
          ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
      );
      console.log("Table setup_assistance_request_events créée.");
    } else {
      console.log("Table setup_assistance_request_events déjà présente.");
    }

    console.log("Migration CRM setup assistance terminée.");
  } finally {
    await connection.end();
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
