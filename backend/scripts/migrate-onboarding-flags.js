/**
 * Colonnes onboarding / demande d’assistance installation.
 * Usage : npm run db:onboarding (depuis backend/)
 */

require("dotenv/config");

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
    var addedSeen = false;

    if (!(await columnExists(connection, database, "restaurants", "onboarding_seen"))) {
      await connection.query(
        "ALTER TABLE restaurants ADD COLUMN onboarding_seen TINYINT(1) NOT NULL DEFAULT 0 AFTER theme_color",
      );
      console.log("Colonne onboarding_seen ajoutée.");
      addedSeen = true;
    }

    if (!(await columnExists(connection, database, "restaurants", "needs_setup_help"))) {
      await connection.query(
        "ALTER TABLE restaurants ADD COLUMN needs_setup_help TINYINT(1) NOT NULL DEFAULT 0 AFTER onboarding_seen",
      );
      console.log("Colonne needs_setup_help ajoutée.");
    }

    if (addedSeen) {
      await connection.query("UPDATE restaurants SET onboarding_seen = 1");
      console.log("Comptes déjà présents : onboarding_seen mis à 1 (seuls les nouveaux comptes verront l’onboarding).");
    }

    console.log("Migration onboarding terminée.");
  } finally {
    await connection.end();
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
