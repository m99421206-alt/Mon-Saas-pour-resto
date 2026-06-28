/**
 * Sauvegarde automatique AfricaMenu — base MySQL + dossier uploads/
 * Usage (depuis backend/) : npm run backup
 */

require("dotenv").config();

var childProcess = require("child_process");
var fs = require("fs");
var path = require("path");
var zlib = require("zlib");
var { pipeline } = require("stream/promises");

var backendRoot = path.join(__dirname, "..");
var uploadsDir = path.join(backendRoot, "uploads");
var defaultBackupRoot = path.join(backendRoot, "..", "backups");

function requiredEnv(name) {
  var value = process.env[name];
  if (!value) {
    throw new Error("Variable manquante dans .env : " + name);
  }
  return value;
}

function getBackupRoot() {
  var configured = String(process.env.BACKUP_DIR || "").trim();
  if (!configured) {
    return defaultBackupRoot;
  }
  return path.isAbsolute(configured) ? configured : path.join(backendRoot, configured);
}

function createStamp() {
  var now = new Date();
  function pad(n) {
    return String(n).padStart(2, "0");
  }
  return (
    now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    "_" +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

function resolveMysqldumpBinary() {
  var override = String(process.env.MYSQLDUMP_PATH || "").trim();
  if (override) {
    return override;
  }

  if (process.platform === "win32") {
    var candidates = [
      "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe",
      "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe",
      "C:\\Program Files\\MySQL\\MySQL Server 5.7\\bin\\mysqldump.exe",
      "C:\\xampp\\mysql\\bin\\mysqldump.exe",
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      if (fs.existsSync(candidates[i])) {
        return candidates[i];
      }
    }
  }

  return "mysqldump";
}

function runCommand(command, args, options) {
  return new Promise(function (resolve, reject) {
    var child = childProcess.spawn(command, args, Object.assign({ stdio: ["ignore", "pipe", "pipe"] }, options || {}));
    var stdout = "";
    var stderr = "";

    child.stdout.on("data", function (chunk) {
      stdout += chunk.toString();
    });
    child.stderr.on("data", function (chunk) {
      stderr += chunk.toString();
    });

    child.on("error", function (err) {
      reject(err);
    });

    child.on("close", function (code) {
      if (code !== 0) {
        return reject(new Error((stderr || stdout || command + " a échoué").trim()));
      }
      resolve({ stdout: stdout, stderr: stderr });
    });
  });
}

async function gzipFile(sourcePath, targetPath) {
  await pipeline(fs.createReadStream(sourcePath), zlib.createGzip(), fs.createWriteStream(targetPath));
  await fs.promises.unlink(sourcePath);
}

async function dumpDatabase(sqlPath) {
  var host = process.env.DB_HOST || "127.0.0.1";
  var user = requiredEnv("DB_USER");
  var password = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : "";
  var database = requiredEnv("DB_NAME");
  var mysqldump = resolveMysqldumpBinary();

  var args = [
    "-h",
    host,
    "-u",
    user,
    "--single-transaction",
    "--routines",
    "--triggers",
    "--set-gtid-purged=OFF",
    "--result-file=" + sqlPath,
    database,
  ];

  if (password) {
    args.splice(4, 0, "-p" + password);
  }

  console.log("[backup] Export MySQL (« " + database + " »)…");
  await runCommand(mysqldump, args, { shell: false });
}

async function archiveUploads(targetArchivePath) {
  if (!fs.existsSync(uploadsDir)) {
    await fs.promises.mkdir(uploadsDir, { recursive: true });
  }

  var files = await fs.promises.readdir(uploadsDir);
  if (!files.length) {
    console.log("[backup] Aucun fichier dans uploads/ — archive uploads ignorée.");
    return false;
  }

  console.log("[backup] Archive uploads/ (" + files.length + " fichier(s))…");

  if (process.platform === "win32") {
    var zipPath = targetArchivePath.replace(/\.tar\.gz$/i, ".zip");
    var psScript =
      "Compress-Archive -Path '" +
      uploadsDir.replace(/'/g, "''") +
      "\\*' -DestinationPath '" +
      zipPath.replace(/'/g, "''") +
      "' -Force";
    await runCommand("powershell.exe", ["-NoProfile", "-Command", psScript], { shell: false });
    return zipPath;
  }

  await runCommand("tar", ["-czf", targetArchivePath, "-C", backendRoot, "uploads"], { shell: false });
  return targetArchivePath;
}

async function writeManifest(folder, info) {
  var manifestPath = path.join(folder, "manifest.json");
  await fs.promises.writeFile(manifestPath, JSON.stringify(info, null, 2), "utf8");
}

function isBackupFolderName(name) {
  return name.indexOf("africamenu_") === 0 || name.indexOf("menugo_") === 0;
}

async function rotateBackups(backupRoot, retentionDays) {
  if (!Number.isFinite(retentionDays) || retentionDays < 1) {
    return;
  }

  var entries = await fs.promises.readdir(backupRoot, { withFileTypes: true });
  var cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  var removed = 0;

  for (var i = 0; i < entries.length; i += 1) {
    var entry = entries[i];
    if (!entry.isDirectory() || !isBackupFolderName(entry.name)) {
      continue;
    }

    var fullPath = path.join(backupRoot, entry.name);
    var stat = await fs.promises.stat(fullPath);
    if (stat.mtimeMs < cutoff) {
      await fs.promises.rm(fullPath, { recursive: true, force: true });
      removed += 1;
      console.log("[backup] Ancienne sauvegarde supprimée : " + entry.name);
    }
  }

  if (removed) {
    console.log("[backup] Rotation : " + removed + " sauvegarde(s) supprimée(s).");
  }
}

async function main() {
  var backupRoot = getBackupRoot();
  var retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 14);
  var stamp = createStamp();
  var backupFolder = path.join(backupRoot, "africamenu_" + stamp);
  var sqlPlainPath = path.join(backupFolder, "database.sql");
  var sqlGzPath = sqlPlainPath + ".gz";
  var uploadsArchivePath = path.join(backupFolder, "uploads.tar.gz");

  await fs.promises.mkdir(backupFolder, { recursive: true });

  await dumpDatabase(sqlPlainPath);
  await gzipFile(sqlPlainPath, sqlGzPath);

  var uploadsArchive = await archiveUploads(uploadsArchivePath);
  var uploadsFileName = uploadsArchive ? path.basename(uploadsArchive) : null;

  var manifest = {
    service: "AfricaMenu",
    created_at: new Date().toISOString(),
    database: process.env.DB_NAME,
    files: {
      database: path.basename(sqlGzPath),
      uploads: uploadsFileName,
    },
    retention_days: retentionDays,
  };

  await writeManifest(backupFolder, manifest);

  var dbStat = await fs.promises.stat(sqlGzPath);
  console.log("[backup] Terminé : " + backupFolder);
  console.log("[backup] SQL : " + path.basename(sqlGzPath) + " (" + Math.round(dbStat.size / 1024) + " Ko)");

  if (uploadsFileName) {
    var upStat = await fs.promises.stat(path.join(backupFolder, uploadsFileName));
    console.log("[backup] Uploads : " + uploadsFileName + " (" + Math.round(upStat.size / 1024) + " Ko)");
  }

  await rotateBackups(backupRoot, retentionDays);
}

main().catch(function (err) {
  console.error("[backup] Échec :", err.message || err);
  process.exit(1);
});
