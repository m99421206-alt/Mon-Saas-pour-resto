/**
 * Applique sql/schema.sql sur la base indiquée par .env
 * Usage (depuis le dossier backend/) : npm run db:schema
 */

require("dotenv").config();

var fs = require("fs");
var path = require("path");
var mysql = require("mysql2/promise");

async function main() {
  var host = process.env.DB_HOST || "127.0.0.1";
  var user = process.env.DB_USER;
  var password = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : "";
  var database = process.env.DB_NAME;

  if (!user || !database) {
    throw new Error("Renseignez DB_USER et DB_NAME dans backend/.env");
  }

  var sqlPath = path.join(__dirname, "..", "sql", "schema.sql");
  var sql = fs.readFileSync(sqlPath, "utf8");

  var connection = await mysql.createConnection({
    host: host,
    user: user,
    password: password,
    database: database,
    multipleStatements: true,
  });

  await connection.query(sql);
  await connection.end();

  console.log("Schéma appliqué sur la base « " + database + " ».");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
