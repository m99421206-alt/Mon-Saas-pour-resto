/**
 * Conversion batch des assets statiques PNG/JPG → WebP (originaux conservés).
 * Optionnel : mise à jour des références dans index.html, frontend/, docs/.
 *
 * Usage (depuis backend/) :
 *   npm run assets:webp                    # dry-run conversion
 *   npm run assets:webp -- --apply         # convertir les fichiers
 *   npm run assets:webp -- --apply --update-refs
 */

var fs = require("fs");
var path = require("path");
var sharp = require("sharp");

var repoRoot = path.join(__dirname, "../..");
var apply = process.argv.indexOf("--apply") !== -1;
var updateRefs = process.argv.indexOf("--update-refs") !== -1;

var SOURCE_EXTENSIONS = [".png", ".jpg", ".jpeg"];
var ICON_MAX_DIMENSION = 200;
var ICON_QUALITY = 85;
var PHOTO_QUALITY = 78;
var PHOTO_MAX_WIDTH = 1600;
var MAX_INPUT_PIXELS = 8192 * 8192;

var ASSET_DIRS = [
  path.join(repoRoot, "assets", "images", "icone"),
  path.join(repoRoot, "assets", "images", "design img"),
  path.join(repoRoot, "docs", "img"),
];

var REF_SCAN_DIRS = [
  path.join(repoRoot, "index.html"),
  path.join(repoRoot, "frontend"),
  path.join(repoRoot, "docs"),
];

var REF_EXTENSIONS = [".html", ".css", ".js"];

function walkFiles(dir, acc) {
  if (!fs.existsSync(dir)) {
    return acc;
  }
  var stat = fs.statSync(dir);
  if (stat.isFile()) {
    acc.push(dir);
    return acc;
  }
  fs.readdirSync(dir).forEach(function (name) {
    walkFiles(path.join(dir, name), acc);
  });
  return acc;
}

function listSourceAssets() {
  var files = [];
  ASSET_DIRS.forEach(function (dir) {
    walkFiles(dir, files);
  });
  return files.filter(function (filePath) {
    return SOURCE_EXTENSIONS.indexOf(path.extname(filePath).toLowerCase()) !== -1;
  });
}

function isIconPath(filePath) {
  return filePath.indexOf(path.join("assets", "images", "icone")) !== -1;
}

async function convertAsset(sourcePath) {
  var webpPath =
    sourcePath.slice(0, sourcePath.length - path.extname(sourcePath).length) + ".webp";

  if (fs.existsSync(webpPath)) {
    return { webpPath: webpPath, skipped: true, reason: "exists" };
  }

  var pipeline = sharp(sourcePath, {
    failOn: "none",
    limitInputPixels: MAX_INPUT_PIXELS,
  }).rotate();
  var metadata = await pipeline.metadata();
  var icon = isIconPath(sourcePath);
  var quality = icon ? ICON_QUALITY : PHOTO_QUALITY;

  if (!icon && metadata && metadata.width && metadata.width > PHOTO_MAX_WIDTH) {
    pipeline.resize({ width: PHOTO_MAX_WIDTH, withoutEnlargement: true });
  }

  if (icon && metadata && metadata.width && metadata.height) {
    var maxDim = Math.max(metadata.width, metadata.height);
    if (maxDim > ICON_MAX_DIMENSION * 4) {
      pipeline.resize({
        width: metadata.width >= metadata.height ? ICON_MAX_DIMENSION * 2 : undefined,
        height: metadata.height > metadata.width ? ICON_MAX_DIMENSION * 2 : undefined,
        withoutEnlargement: true,
      });
    }
  }

  await pipeline.webp({ quality: quality, effort: 4 }).toFile(webpPath);
  return { webpPath: webpPath, skipped: false };
}

function toRepoRelative(filePath) {
  return filePath.split(path.sep).join("/").replace(repoRoot.split(path.sep).join("/") + "/", "");
}

function collectRefFiles() {
  var files = [];
  REF_SCAN_DIRS.forEach(function (entry) {
    if (!fs.existsSync(entry)) {
      return;
    }
    if (fs.statSync(entry).isFile()) {
      files.push(entry);
      return;
    }
    walkFiles(entry, files);
  });
  return files.filter(function (filePath) {
    return REF_EXTENSIONS.indexOf(path.extname(filePath).toLowerCase()) !== -1;
  });
}

function updateReferences(conversions) {
  var refFiles = collectRefFiles();
  var report = [];

  conversions.forEach(function (entry) {
    var fromRel = toRepoRelative(entry.sourcePath);
    var toRel = toRepoRelative(entry.webpPath);
    var fromForward = fromRel;
    var toForward = toRel;
    var fromBack = fromRel.replace(/\//g, "\\");
    var toBack = toRel.replace(/\//g, "\\");

    refFiles.forEach(function (filePath) {
      var original = fs.readFileSync(filePath, "utf8");
      var updated = original;

      updated = updated.split(fromForward).join(toForward);
      updated = updated.split(fromBack).join(toBack);

      if (updated !== original) {
        if (apply) {
          fs.writeFileSync(filePath, updated, "utf8");
        }
        report.push({
          file: toRepoRelative(filePath),
          from: fromForward,
          to: toForward,
        });
      }
    });
  });

  return report;
}

async function main() {
  console.log("[assets-webp] Mode : " + (apply ? "APPLY" : "DRY-RUN"));
  if (updateRefs) {
    console.log("[assets-webp] Mise à jour des références : " + (apply ? "oui" : "simulation"));
  }

  var sources = listSourceAssets();
  console.log("[assets-webp] Fichiers source : " + sources.length);

  var conversions = [];
  var errors = [];

  for (var i = 0; i < sources.length; i += 1) {
    var sourcePath = sources[i];
    try {
      if (apply) {
        var result = await convertAsset(sourcePath);
        conversions.push({
          sourcePath: sourcePath,
          webpPath: result.webpPath,
          skipped: result.skipped,
        });
        console.log(
          "[assets-webp] " +
            (result.skipped ? "skip" : "ok") +
            " : " +
            toRepoRelative(sourcePath) +
            " → " +
            toRepoRelative(result.webpPath)
        );
      } else {
        var plannedWebp =
          sourcePath.slice(0, sourcePath.length - path.extname(sourcePath).length) + ".webp";
        conversions.push({ sourcePath: sourcePath, webpPath: plannedWebp, skipped: false });
        console.log(
          "[assets-webp] plan : " +
            toRepoRelative(sourcePath) +
            " → " +
            toRepoRelative(plannedWebp)
        );
      }
    } catch (err) {
      errors.push({ file: toRepoRelative(sourcePath), message: err.message || String(err) });
      console.error("[assets-webp] erreur : " + toRepoRelative(sourcePath) + " — " + err.message);
    }
  }

  if (updateRefs && conversions.length) {
    var refReport = updateReferences(conversions.filter(function (entry) {
      return !entry.skipped;
    }));
    console.log("[assets-webp] Fichiers code touchés : " + refReport.length);
    var reportPath = path.join(repoRoot, "backend", "scripts", "assets-webp-ref-report.json");
    if (apply) {
      fs.writeFileSync(reportPath, JSON.stringify(refReport, null, 2), "utf8");
      console.log("[assets-webp] Rapport : " + toRepoRelative(reportPath));
    }
  }

  if (errors.length) {
    console.log("[assets-webp] Erreurs : " + errors.length);
  }

  if (!apply) {
    console.log("[assets-webp] Dry-run terminé. Relancez avec --apply [--update-refs].");
  } else {
    console.log("[assets-webp] Conversion terminée.");
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
