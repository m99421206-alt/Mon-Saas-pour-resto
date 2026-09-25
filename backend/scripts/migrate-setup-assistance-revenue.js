/**
 * Revenus installations clé en main — montant enregistré une seule fois par demande.
 * Usage : npm run db:setup-assistance-revenue (depuis backend/)
 */

require("dotenv/config");

var mysql = require("mysql2/promise");
var installationPricing = require("../src/config/installationPricing");

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

    if (!(await columnExists(connection, database, "setup_assistance_requests", "installation_price_cfa"))) {
      await connection.query(
        "ALTER TABLE setup_assistance_requests ADD COLUMN installation_price_cfa INT UNSIGNED NULL DEFAULT NULL AFTER checklist_json",
      );
      console.log("Colonne installation_price_cfa ajoutée.");
    } else {
      console.log("Colonne installation_price_cfa déjà présente.");
    }

    if (!(await columnExists(connection, database, "setup_assistance_requests", "installation_price_currency"))) {
      await connection.query(
        "ALTER TABLE setup_assistance_requests ADD COLUMN installation_price_currency VARCHAR(8) NULL DEFAULT NULL AFTER installation_price_cfa",
      );
      console.log("Colonne installation_price_currency ajoutée.");
    } else {
      console.log("Colonne installation_price_currency déjà présente.");
    }

    var price = installationPricing.INSTALLATION_PRICE_CFA;
    var currency = installationPricing.INSTALLATION_PRICE_CURRENCY;

    var [backfill] = await connection.query(
      "UPDATE setup_assistance_requests SET installation_price_cfa = ?, installation_price_currency = ? " +
        "WHERE status = 'completed' AND installation_price_cfa IS NULL",
      [price, currency],
    );
    console.log(
      "Demandes terminées mises à jour : " + (backfill.affectedRows || 0) + " ligne(s).",
    );

    console.log("Migration revenus installations terminée.");
  } finally {
    await connection.end();
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
