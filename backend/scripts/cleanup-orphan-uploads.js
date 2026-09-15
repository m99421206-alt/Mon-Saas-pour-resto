/**
 * Supprime les fichiers dans backend/uploads/ non référencés en base.
 * Usage :
 *   node scripts/cleanup-orphan-uploads.js          # simulation
 *   node scripts/cleanup-orphan-uploads.js --yes    # suppression réelle
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs = require("fs/promises");
const path = require("path");
const { getPool } = require("../src/config/database");

const uploadsDir = path.join(__dirname, "../uploads");
const apply = process.argv.includes("--yes");

async function tableExists(connection, database, tableName) {
  var [rows] = await connection.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1",
    [database, tableName]
  );
  return rows.length > 0;
}

async function loadReferencedFilenames(pool) {
  var referenced = new Set();
  var database = process.env.DB_NAME;

  function addFromUrl(url) {
    if (!url || typeof url !== "string" || url.indexOf("/uploads/") !== 0) {
      return;
    }
    var filename = path.basename(url);
    if (filename) {
      referenced.add(filename);
    }
  }

  var [restaurants] = await pool.query("SELECT logo_url, banner_url FROM restaurants");
  for (var i = 0; i < restaurants.length; i += 1) {
    addFromUrl(restaurants[i].logo_url);
    addFromUrl(restaurants[i].banner_url);
  }

  var [products] = await pool.query("SELECT image FROM products WHERE image IS NOT NULL AND image <> ''");
  for (var p = 0; p < products.length; p += 1) {
    addFromUrl(products[p].image);
  }

  var [variants] = await pool.query(
    "SELECT image FROM product_variants WHERE image IS NOT NULL AND image <> ''"
  );
  for (var v = 0; v < variants.length; v += 1) {
    addFromUrl(variants[v].image);
  }

  if (database && (await tableExists(pool, database, "upload_files"))) {
    var [registry] = await pool.query("SELECT filename, url FROM upload_files");
    for (var r = 0; r < registry.length; r += 1) {
      if (registry[r].filename) {
        referenced.add(String(registry[r].filename));
      }
      addFromUrl(registry[r].url);
    }
  }

  return referenced;
}

async function main() {
  var pool = getPool();
  var referenced = await loadReferencedFilenames(pool);
  var entries = await fs.readdir(uploadsDir, { withFileTypes: true });

  var orphans = [];
  for (var i = 0; i < entries.length; i += 1) {
    var entry = entries[i];
    if (!entry.isFile()) {
      continue;
    }
    if (!referenced.has(entry.name)) {
      orphans.push(entry.name);
    }
  }

  console.log(
    (apply ? "[cleanup]" : "[dry-run]") +
      " " +
      orphans.length +
      " fichier(s) orphelin(s) sur " +
      entries.length +
      " fichier(s) dans uploads/"
  );

  if (!orphans.length) {
    return;
  }

  for (var j = 0; j < orphans.length; j += 1) {
    var filePath = path.join(uploadsDir, orphans[j]);
    if (apply) {
      await fs.unlink(filePath);
      console.log("  supprimé : " + orphans[j]);
    } else {
      console.log("  orphelin : " + orphans[j]);
    }
  }

  if (!apply) {
    console.log("\nRelancez avec --yes pour supprimer réellement.");
  }
}

main()
  .then(function () {
    process.exit(0);
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });
