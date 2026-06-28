/**
 * Restauration d'une sauvegarde AfricaMenu (SQL + uploads)
 * Usage : npm run backup:restore -- ../backups/africamenu_YYYYMMDD_HHMMSS
 */

require("dotenv").config();

var childProcess = require("child_process");
var fs = require("fs");
var path = require("path");
var zlib = require("zlib");
var readline = require("readline");
var { pipeline } = require("stream/promises");

var backendRoot = path.join(__dirname, "..");
var uploadsDir = path.join(backendRoot, "uploads");

function requiredEnv(name) {
  var value = process.env[name];
  if (!value) {
    throw new Error("Variable manquante dans .env : " + name);
  }
  return value;
}

function resolveMysqlBinary() {
  var override = String(process.env.MYSQL_PATH || "").trim();
  if (override) {
    return override;
  }

  if (process.platform === "win32") {
    var candidates = [
      "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysql.exe",
      "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe",
      "C:\\Program Files\\MySQL\\MySQL Server 5.7\\bin\\mysql.exe",
      "C:\\xampp\\mysql\\bin\\mysql.exe",
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      if (fs.existsSync(candidates[i])) {
        return candidates[i];
      }
    }
  }

  return "mysql";
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

async function gunzipToTemp(gzPath) {
  var tempPath = gzPath.replace(/\.gz$/i, ".restore.tmp.sql");
  await pipeline(fs.createReadStream(gzPath), zlib.createGunzip(), fs.createWriteStream(tempPath));
  return tempPath;
}

async function restoreDatabase(sqlPath) {
  var host = process.env.DB_HOST || "127.0.0.1";
  var user = requiredEnv("DB_USER");
  var password = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : "";
  var database = requiredEnv("DB_NAME");
  var mysql = resolveMysqlBinary();

  var args = ["-h", host, "-u", user, database];
  if (password) {
    args.splice(4, 0, "-p" + password);
  }

  console.log("[restore] Import MySQL (« " + database + " »)…");

  return new Promise(function (resolve, reject) {
    var child = childProcess.spawn(mysql, args, { stdio: ["pipe", "pipe", "pipe"], shell: false });
    var stderr = "";
    var input = fs.createReadStream(sqlPath);

    child.stderr.on("data", function (chunk) {
      stderr += chunk.toString();
    });

    input.on("error", reject);
    child.on("error", reject);

    input.pipe(child.stdin);

    child.on("close", function (code) {
      if (code !== 0) {
        return reject(new Error((stderr || "mysql restore failed").trim()));
      }
      resolve();
    });
  });
}

async function restoreUploads(backupFolder, uploadsFileName) {
  if (!uploadsFileName) {
    console.log("[restore] Aucune archive uploads dans cette sauvegarde.");
    return;
  }

  var archivePath = path.join(backupFolder, uploadsFileName);
  if (!fs.existsSync(archivePath)) {
    throw new Error("Archive uploads introuvable : " + archivePath);
  }

  await fs.promises.mkdir(uploadsDir, { recursive: true });

  console.log("[restore] Extraction uploads/…");

  if (archivePath.toLowerCase().endsWith(".zip")) {
    var psScript =
      "Expand-Archive -Path '" +
      archivePath.replace(/'/g, "''") +
      "' -DestinationPath '" +
      backendRoot.replace(/'/g, "''") +
      "' -Force";
    await runCommand("powershell.exe", ["-NoProfile", "-Command", psScript], { shell: false });
    return;
  }

  await runCommand("tar", ["-xzf", archivePath, "-C", backendRoot], { shell: false });
}

function askConfirmation(message) {
  return new Promise(function (resolve) {
    if (process.argv.includes("--yes")) {
      return resolve(true);
    }

    var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message + " (oui/non) : ", function (answer) {
      rl.close();
      resolve(String(answer || "").trim().toLowerCase() === "oui");
    });
  });
}

async function main() {
  var backupFolder = path.resolve(process.argv[2] || "");
  if (!backupFolder || !fs.existsSync(backupFolder)) {
    throw new Error(
      "Indiquez le dossier de sauvegarde : npm run backup:restore -- ../backups/africamenu_YYYYMMDD_HHMMSS (ou menugo_* pour les anciennes sauvegardes)",
    );
  }

  var manifestPath = path.join(backupFolder, "manifest.json");
  var manifest = null;
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8"));
  }

  var sqlGzPath = path.join(backupFolder, (manifest && manifest.files && manifest.files.database) || "database.sql.gz");
  if (!fs.existsSync(sqlGzPath)) {
    throw new Error("Fichier SQL introuvable : " + sqlGzPath);
  }

  console.warn("[restore] ATTENTION : cette opération écrase la base « " + process.env.DB_NAME + " » et uploads/.");
  var confirmed = await askConfirmation("Confirmer la restauration");
  if (!confirmed) {
    console.log("[restore] Annulé.");
    return;
  }

  var tempSql = await gunzipToTemp(sqlGzPath);
  try {
    await restoreDatabase(tempSql);
  } finally {
    await fs.promises.unlink(tempSql).catch(function () {});
  }

  var uploadsFile = manifest && manifest.files ? manifest.files.uploads : null;
  if (!uploadsFile) {
    if (fs.existsSync(path.join(backupFolder, "uploads.zip"))) {
      uploadsFile = "uploads.zip";
    } else if (fs.existsSync(path.join(backupFolder, "uploads.tar.gz"))) {
      uploadsFile = "uploads.tar.gz";
    }
  }

  await restoreUploads(backupFolder, uploadsFile);
  console.log("[restore] Restauration terminée.");
}

main().catch(function (err) {
  console.error("[restore] Échec :", err.message || err);
  process.exit(1);
});
