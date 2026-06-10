/**
 * Restauration d'une sauvegarde MenuGo (SQL + uploads)
 * Usage : npm run backup:restore -- ../backups/menugo_YYYYMMDD_HHMMSS
 */

require("dotenv").config();

var childProcess = require("child_process");
var fs = require("fs");
var path = require("path");
var zlib = require("zlib");
var readline = require("readline");
var { pipeline } = require("stream/promises");

var backendRoot = path.join(__dirname, "..");
function getUploadsDir(root) {
  return path.join(root || backendRoot, "uploads");
}

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

async function createRestoreTempRoot(root) {
  var parent = path.dirname(root || backendRoot);
  return fs.promises.mkdtemp(path.join(parent, ".uploads-restore-"));
}

async function normalizePreparedUploads(tempRoot) {
  var extractedUploadsDir = path.join(tempRoot, "uploads");
  if (fs.existsSync(extractedUploadsDir)) {
    return extractedUploadsDir;
  }

  await fs.promises.mkdir(extractedUploadsDir, { recursive: true });
  var entries = await fs.promises.readdir(tempRoot);
  for (var i = 0; i < entries.length; i += 1) {
    var entry = entries[i];
    if (entry === "uploads") {
      continue;
    }
    await fs.promises.rename(path.join(tempRoot, entry), path.join(extractedUploadsDir, entry));
  }
  return extractedUploadsDir;
}

async function prepareUploadsRestore(backupFolder, uploadsFileName, root) {
  var targetRoot = root || backendRoot;
  var tempRoot = await createRestoreTempRoot(targetRoot);

  try {
    if (!uploadsFileName) {
      console.log("[restore] Aucune archive uploads dans cette sauvegarde — uploads/ sera restauré vide.");
      await fs.promises.mkdir(path.join(tempRoot, "uploads"), { recursive: true });
      return { tempRoot: tempRoot, uploadsDir: path.join(tempRoot, "uploads") };
    }

    var archivePath = path.join(backupFolder, uploadsFileName);
    if (!fs.existsSync(archivePath)) {
      throw new Error("Archive uploads introuvable : " + archivePath);
    }

    console.log("[restore] Vérification et préparation uploads/…");

    if (archivePath.toLowerCase().endsWith(".zip")) {
      var psScript =
        "Expand-Archive -Path '" +
        archivePath.replace(/'/g, "''") +
        "' -DestinationPath '" +
        tempRoot.replace(/'/g, "''") +
        "' -Force";
      await runCommand("powershell.exe", ["-NoProfile", "-Command", psScript], { shell: false });
    } else {
      await runCommand("tar", ["-xzf", archivePath, "-C", tempRoot], { shell: false });
    }

    return { tempRoot: tempRoot, uploadsDir: await normalizePreparedUploads(tempRoot) };
  } catch (err) {
    await fs.promises.rm(tempRoot, { recursive: true, force: true }).catch(function () {});
    throw err;
  }
}

async function replaceUploadsDirectory(prepared, root) {
  var targetRoot = root || backendRoot;
  var targetUploadsDir = getUploadsDir(targetRoot);
  var previousUploadsDir = path.join(targetRoot, ".uploads-before-restore-" + Date.now());
  var hadPreviousUploads = fs.existsSync(targetUploadsDir);

  await fs.promises.mkdir(targetRoot, { recursive: true });

  try {
    if (hadPreviousUploads) {
      await fs.promises.rename(targetUploadsDir, previousUploadsDir);
    }
    await fs.promises.rename(prepared.uploadsDir, targetUploadsDir);
    await fs.promises.rm(previousUploadsDir, { recursive: true, force: true }).catch(function () {});
    await fs.promises.rm(prepared.tempRoot, { recursive: true, force: true }).catch(function () {});
  } catch (err) {
    if (!fs.existsSync(targetUploadsDir) && hadPreviousUploads && fs.existsSync(previousUploadsDir)) {
      await fs.promises.rename(previousUploadsDir, targetUploadsDir).catch(function () {});
    }
    throw err;
  }
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
    throw new Error("Indiquez le dossier de sauvegarde : npm run backup:restore -- ../backups/menugo_YYYYMMDD_HHMMSS");
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

  var uploadsFile = manifest && manifest.files ? manifest.files.uploads : null;
  if (!uploadsFile) {
    if (fs.existsSync(path.join(backupFolder, "uploads.zip"))) {
      uploadsFile = "uploads.zip";
    } else if (fs.existsSync(path.join(backupFolder, "uploads.tar.gz"))) {
      uploadsFile = "uploads.tar.gz";
    }
  }

  console.warn("[restore] ATTENTION : cette opération écrase la base « " + process.env.DB_NAME + " » et uploads/.");
  var confirmed = await askConfirmation("Confirmer la restauration");
  if (!confirmed) {
    console.log("[restore] Annulé.");
    return;
  }

  var preparedUploads = await prepareUploadsRestore(backupFolder, uploadsFile, backendRoot);
  var tempSql = null;
  try {
    tempSql = await gunzipToTemp(sqlGzPath);
    await restoreDatabase(tempSql);
    await replaceUploadsDirectory(preparedUploads, backendRoot);
  } finally {
    if (tempSql) {
      await fs.promises.unlink(tempSql).catch(function () {});
    }
    await fs.promises.rm(preparedUploads.tempRoot, { recursive: true, force: true }).catch(function () {});
  }

  console.log("[restore] Restauration terminée.");
}

if (require.main === module) {
  main().catch(function (err) {
    console.error("[restore] Échec :", err.message || err);
    process.exit(1);
  });
}

module.exports = {
  prepareUploadsRestore: prepareUploadsRestore,
  replaceUploadsDirectory: replaceUploadsDirectory,
};
