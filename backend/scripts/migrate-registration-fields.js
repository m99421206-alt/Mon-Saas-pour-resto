/**
 * Champs inscription : users.full_name, users.phone (principal), restaurants.country.
 * Usage : npm run db:registration-fields (depuis backend/)
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
    if (!(await columnExists(connection, database, "users", "full_name"))) {
      await connection.query(
        "ALTER TABLE users ADD COLUMN full_name VARCHAR(160) NULL AFTER email",
      );
      console.log("Colonne users.full_name ajoutée.");
    } else {
      console.log("Colonne users.full_name déjà présente.");
    }

    if (!(await columnExists(connection, database, "users", "phone"))) {
      if (await columnExists(connection, database, "users", "full_name")) {
        await connection.query("ALTER TABLE users ADD COLUMN phone VARCHAR(32) NULL AFTER full_name");
      } else {
        await connection.query("ALTER TABLE users ADD COLUMN phone VARCHAR(32) NULL AFTER email");
      }
      console.log("Colonne users.phone ajoutée.");
    } else {
      console.log("Colonne users.phone déjà présente.");
    }

    if (!(await columnExists(connection, database, "restaurants", "country"))) {
      await connection.query(
        "ALTER TABLE restaurants ADD COLUMN country VARCHAR(100) NULL AFTER city",
      );
      console.log("Colonne restaurants.country ajoutée.");
    } else {
      console.log("Colonne restaurants.country déjà présente.");
    }

    console.log("Migration registration-fields terminée.");
  } finally {
    await connection.end();
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
