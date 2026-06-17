/**
 * Migration one-shot : convertit les uploads PNG/JPG existants en WebP et met à jour les URLs en base.
 * Les originaux sont conservés sur disque (backup).
 *
 * Usage (depuis backend/) :
 *   npm run db:uploads-webp              # dry-run (défaut)
 *   npm run db:uploads-webp -- --apply   # exécution réelle
 */

require("dotenv").config();

var fs = require("fs");
var path = require("path");
var mysql = require("mysql2/promise");
var sharp = require("sharp");

var uploadsDir = path.join(__dirname, "../uploads");
var apply = process.argv.indexOf("--apply") !== -1;
var MAX_WIDTH = 1600;
var WEBP_QUALITY = 78;
var MAX_INPUT_PIXELS = 8192 * 8192;

var SOURCE_EXTENSIONS = [".png", ".jpg", ".jpeg"];

var URL_COLUMNS = [
  { table: "restaurants", column: "logo_url" },
  { table: "restaurants", column: "banner_url" },
  { table: "products", column: "image" },
  { table: "product_variants", column: "image" },
];

async function tableExists(connection, database, table) {
  var [rows] = await connection.query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1",
    [database, table]
  );
  return rows.length > 0;
}

function listSourceUploads() {
  if (!fs.existsSync(uploadsDir)) {
    return [];
  }
  return fs
    .readdirSync(uploadsDir)
    .filter(function (name) {
      var ext = path.extname(name).toLowerCase();
      return SOURCE_EXTENSIONS.indexOf(ext) !== -1;
    })
    .map(function (name) {
      return path.join(uploadsDir, name);
    });
}

async function convertFileToWebp(sourcePath) {
  var dir = path.dirname(sourcePath);
  var baseName = path.basename(sourcePath, path.extname(sourcePath));
  var webpName = baseName + ".webp";
  var webpPath = path.join(dir, webpName);

  if (fs.existsSync(webpPath)) {
    return { webpName: webpName, skipped: true, reason: "webp_exists" };
  }

  var pipeline = sharp(sourcePath, {
    failOn: "none",
    limitInputPixels: MAX_INPUT_PIXELS,
  }).rotate();
  var metadata = await pipeline.metadata();

  if (metadata && metadata.width && metadata.width > MAX_WIDTH) {
    pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
  }

  await pipeline.webp({ quality: WEBP_QUALITY, effort: 4 }).toFile(webpPath);
  return { webpName: webpName, skipped: false };
}

function buildUrlMap(convertedFiles) {
  var map = {};
  convertedFiles.forEach(function (entry) {
    var oldUrl = "/uploads/" + entry.sourceName;
    var newUrl = "/uploads/" + entry.webpName;
    map[oldUrl] = newUrl;
  });
  return map;
}

async function countUrlReferences(connection, url) {
  var total = 0;
  var i;
  for (i = 0; i < URL_COLUMNS.length; i += 1) {
    var spec = URL_COLUMNS[i];
    var [rows] = await connection.query(
      "SELECT COUNT(*) AS total FROM `" + spec.table + "` WHERE `" + spec.column + "` = ?",
      [url]
    );
    total += rows[0].total;
  }
  if (await tableExists(connection, process.env.DB_NAME, "upload_files")) {
    var [uploadRows] = await connection.query(
      "SELECT COUNT(*) AS total FROM upload_files WHERE url = ? OR filename = ?",
      [url, path.basename(url)]
    );
    total += uploadRows[0].total;
  }
  return total;
}

async function updateDatabaseUrls(connection, database, urlMap) {
  var stats = { columns: 0, uploadFiles: 0 };
  var oldUrl;
  var newUrl;

  for (oldUrl in urlMap) {
    if (!Object.prototype.hasOwnProperty.call(urlMap, oldUrl)) {
      continue;
    }
    newUrl = urlMap[oldUrl];
    var i;
    for (i = 0; i < URL_COLUMNS.length; i += 1) {
      var spec = URL_COLUMNS[i];
      var [result] = await connection.query(
        "UPDATE `" + spec.table + "` SET `" + spec.column + "` = ? WHERE `" + spec.column + "` = ?",
        [newUrl, oldUrl]
      );
      stats.columns += result.affectedRows || 0;
    }

    if (await tableExists(connection, database, "upload_files")) {
      var [uploadResult] = await connection.query(
        "UPDATE upload_files SET url = ?, filename = ? WHERE url = ? OR filename = ?",
        [newUrl, path.basename(newUrl), oldUrl, path.basename(oldUrl)]
      );
      stats.uploadFiles += uploadResult.affectedRows || 0;
    }
  }

  return stats;
}

async function main() {
  if (!process.env.DB_USER || !process.env.DB_NAME) {
    throw new Error("Renseignez DB_USER et DB_NAME dans backend/.env");
  }

  var sources = listSourceUploads();
  console.log("[uploads-webp] Mode : " + (apply ? "APPLY" : "DRY-RUN"));
  console.log("[uploads-webp] Fichiers source : " + sources.length);

  if (!sources.length) {
    console.log("[uploads-webp] Aucun PNG/JPG à convertir dans uploads/.");
    return;
  }

  var convertedFiles = [];
  var errors = [];

  for (var s = 0; s < sources.length; s += 1) {
    var sourcePath = sources[s];
    var sourceName = path.basename(sourcePath);
    try {
      if (apply) {
        var result = await convertFileToWebp(sourcePath);
        convertedFiles.push({
          sourceName: sourceName,
          webpName: result.webpName,
          skipped: result.skipped,
        });
        console.log(
          "[uploads-webp] " +
            (result.skipped ? "skip" : "ok") +
            " : " +
            sourceName +
            " → " +
            result.webpName
        );
      } else {
        var webpName = path.basename(sourceName, path.extname(sourceName)) + ".webp";
        convertedFiles.push({ sourceName: sourceName, webpName: webpName, skipped: false });
        console.log("[uploads-webp] plan : " + sourceName + " → " + webpName);
      }
    } catch (err) {
      errors.push({ file: sourceName, message: err.message || String(err) });
      console.error("[uploads-webp] erreur : " + sourceName + " — " + (err.message || err));
    }
  }

  var urlMap = buildUrlMap(convertedFiles.filter(function (entry) {
    return !entry.skipped;
  }));

  var connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : "",
    database: process.env.DB_NAME,
  });

  try {
    var refCount = 0;
    var oldUrlKey;
    for (oldUrlKey in urlMap) {
      if (Object.prototype.hasOwnProperty.call(urlMap, oldUrlKey)) {
        refCount += await countUrlReferences(connection, oldUrlKey);
      }
    }
    console.log("[uploads-webp] Références DB à mettre à jour : " + refCount);

    if (apply && Object.keys(urlMap).length) {
      var stats = await updateDatabaseUrls(connection, process.env.DB_NAME, urlMap);
      console.log(
        "[uploads-webp] DB mise à jour — colonnes : " +
          stats.columns +
          ", upload_files : " +
          stats.uploadFiles
      );
    }
  } finally {
    await connection.end();
  }

  if (errors.length) {
    console.log("[uploads-webp] Erreurs : " + errors.length);
  }

  if (!apply) {
    console.log("[uploads-webp] Dry-run terminé. Relancez avec --apply pour exécuter.");
  } else {
    console.log("[uploads-webp] Migration terminée.");
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
