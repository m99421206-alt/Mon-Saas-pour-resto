/**
 * Table setup_assistance_requests + reprise des demandes existantes.
 * Usage : npm run db:setup-assistance (depuis backend/)
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

function parseInstallationDetail(detail) {
  var text = String(detail || "");
  var fullName = "—";
  var city = "—";
  var gerantMatch = text.match(/Gérant\s*:\s*([^—]+)/i);
  var cityMatch = text.match(/Ville\s*:\s*(.+)$/i);
  if (gerantMatch) {
    fullName = String(gerantMatch[1]).trim() || "—";
  }
  if (cityMatch) {
    city = String(cityMatch[1]).trim() || "—";
  }
  return { fullName: fullName, city: city };
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
    var created = false;
    if (!(await tableExists(connection, database, "setup_assistance_requests"))) {
      await connection.query(
        "CREATE TABLE `setup_assistance_requests` (" +
          "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, " +
          "`source` VARCHAR(16) NOT NULL COMMENT 'landing ou onboarding', " +
          "`restaurant_id` INT UNSIGNED NULL, " +
          "`restaurant_name` VARCHAR(160) NOT NULL DEFAULT '', " +
          "`contact_name` VARCHAR(160) NOT NULL DEFAULT '', " +
          "`phone` VARCHAR(32) NULL, " +
          "`city` VARCHAR(120) NULL, " +
          "`status` VARCHAR(24) NOT NULL DEFAULT 'new', " +
          "`linked_restaurant_id` INT UNSIGNED NULL, " +
          "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
          "`updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP, " +
          "PRIMARY KEY (`id`), " +
          "KEY `idx_setup_assist_status_created` (`status`, `created_at`), " +
          "KEY `idx_setup_assist_restaurant` (`restaurant_id`), " +
          "KEY `idx_setup_assist_linked` (`linked_restaurant_id`), " +
          "KEY `idx_setup_assist_source` (`source`), " +
          "CONSTRAINT `fk_setup_assist_restaurant` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants` (`id`) ON DELETE SET NULL ON UPDATE CASCADE, " +
          "CONSTRAINT `fk_setup_assist_linked_restaurant` FOREIGN KEY (`linked_restaurant_id`) REFERENCES `restaurants` (`id`) ON DELETE SET NULL ON UPDATE CASCADE" +
          ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
      );
      console.log("Table setup_assistance_requests créée.");
      created = true;
    } else {
      console.log("Table setup_assistance_requests déjà présente.");
    }

    var importedLanding = 0;
    var importedOnboarding = 0;

    if (await tableExists(connection, database, "admin_notifications")) {
      var [notifRows] = await connection.query(
        "SELECT restaurant_name, phone, detail, created_at FROM admin_notifications WHERE type = 'installation_request' ORDER BY id ASC",
      );

      for (var i = 0; i < notifRows.length; i += 1) {
        var n = notifRows[i];
        var restaurantName = String(n.restaurant_name || "").trim().slice(0, 160);
        var phone = n.phone != null ? String(n.phone).trim().slice(0, 32) : "";
        if (!restaurantName) {
          continue;
        }

        var [[dup]] = await connection.query(
          "SELECT id FROM setup_assistance_requests " +
            "WHERE source = 'landing' AND restaurant_name = ? AND IFNULL(phone, '') = ? LIMIT 1",
          [restaurantName, phone],
        );
        if (dup) {
          continue;
        }

        var parsed = parseInstallationDetail(n.detail);
        await connection.query(
          "INSERT INTO setup_assistance_requests " +
            "(source, restaurant_id, restaurant_name, contact_name, phone, city, status, linked_restaurant_id, created_at) " +
            "VALUES ('landing', NULL, ?, ?, ?, ?, 'new', NULL, ?)",
          [
            restaurantName,
            parsed.fullName,
            phone || null,
            parsed.city !== "—" ? parsed.city : null,
            n.created_at || new Date(),
          ],
        );
        importedLanding += 1;
      }
    }

    var [pendingRestaurants] = await connection.query(
      "SELECT r.id, r.name, r.whatsapp, r.city, r.created_at, u.full_name " +
        "FROM restaurants r INNER JOIN users u ON u.id = r.user_id " +
        "WHERE COALESCE(r.needs_setup_help, 0) = 1",
    );

    for (var j = 0; j < pendingRestaurants.length; j += 1) {
      var r = pendingRestaurants[j];
      var rid = Number(r.id);
      var [[existingOnb]] = await connection.query(
        "SELECT id FROM setup_assistance_requests WHERE source = 'onboarding' AND restaurant_id = ? LIMIT 1",
        [rid],
      );
      if (existingOnb) {
        continue;
      }

      await connection.query(
        "INSERT INTO setup_assistance_requests " +
          "(source, restaurant_id, restaurant_name, contact_name, phone, city, status, linked_restaurant_id, created_at) " +
          "VALUES ('onboarding', ?, ?, ?, ?, ?, 'new', ?, ?)",
        [
          rid,
          String(r.name || "").trim().slice(0, 160) || "—",
          r.full_name != null && String(r.full_name).trim() !== "" ?
            String(r.full_name).trim().slice(0, 160)
          : "—",
          r.whatsapp != null && String(r.whatsapp).trim() !== "" ?
            String(r.whatsapp).trim().slice(0, 32)
          : null,
          r.city != null && String(r.city).trim() !== "" ? String(r.city).trim().slice(0, 120) : null,
          rid,
          r.created_at || new Date(),
        ],
      );
      importedOnboarding += 1;
    }

    console.log(
      "Migration setup_assistance_requests terminée" +
        (created ? " (table créée)" : "") +
        " — landing importées: " +
        importedLanding +
        ", onboarding importées: " +
        importedOnboarding +
        ".",
    );
  } finally {
    await connection.end();
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
