require("dotenv").config();

var mysql = require("mysql2/promise");
var { generateSlug, generateUniqueSlug } = require("../src/utils/generateSlug");

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

async function fillMissingSlugs(connection) {
  var [rows] = await connection.query(
    "SELECT id, name FROM restaurants WHERE slug IS NULL OR slug = '' ORDER BY id ASC",
  );

  for (var i = 0; i < rows.length; i += 1) {
    var row = rows[i];
    var baseSlug = generateSlug(row.name);
    if (!baseSlug) {
      baseSlug = "restaurant" + String(row.id);
    }

    var uniqueSlug = await generateUniqueSlug(connection, baseSlug, row.id);
    await connection.query("UPDATE restaurants SET slug = ? WHERE id = ?", [
      uniqueSlug,
      row.id,
    ]);
    console.log("Restaurant #" + row.id + " slug généré : " + uniqueSlug);
  }
}

async function main() {
  var host = process.env.DB_HOST || "127.0.0.1";
  var user = process.env.DB_USER;
  var password =
    process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : "";
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

  if (!(await columnExists(connection, database, "restaurants", "slug"))) {
    await connection.query(
      "ALTER TABLE restaurants ADD COLUMN slug VARCHAR(180) NULL AFTER name",
    );
    console.log("Colonne slug ajoutée à restaurants.");
  } else {
    console.log("Colonne slug existe déjà dans restaurants.");
  }

  await fillMissingSlugs(connection);

  if (
    !(await indexExists(
      connection,
      database,
      "uk_restaurants_slug",
      "restaurants",
    ))
  ) {
    await connection.query(
      "ALTER TABLE restaurants ADD UNIQUE INDEX uk_restaurants_slug (slug)",
    );
    console.log("Index unique uk_restaurants_slug créé.");
  } else {
    console.log("Index unique uk_restaurants_slug existe déjà.");
  }

  await connection.end();
  console.log("Migration slug restaurants terminée.");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
