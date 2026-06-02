/**
 * Validation stricte des uploads image — whitelist + blocage extensions dangereuses + magic bytes.
 */

"use strict";

var fs = require("fs");
var path = require("path");

var ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
var ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

var BLOCKED_EXTENSIONS = [
  ".php",
  ".phtml",
  ".phar",
  ".exe",
  ".js",
  ".mjs",
  ".cjs",
  ".html",
  ".htm",
  ".svg",
  ".sh",
  ".bat",
  ".cmd",
  ".com",
  ".dll",
  ".msi",
  ".vbs",
  ".ps1",
  ".asp",
  ".aspx",
  ".jsp",
];

var REJECT_MESSAGE =
  "Type de fichier non autorisé. Formats acceptés : JPG, JPEG, PNG, WEBP.";

function hasBlockedExtensionInName(originalname) {
  var lower = String(originalname || "").toLowerCase();
  if (!lower) {
    return true;
  }

  return BLOCKED_EXTENSIONS.some(function (ext) {
    return lower.indexOf(ext) !== -1;
  });
}

function isAllowedUploadMeta(originalname, mimetype) {
  if (hasBlockedExtensionInName(originalname)) {
    return false;
  }

  var extension = path.extname(originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.indexOf(extension) === -1) {
    return false;
  }

  if (ALLOWED_MIME_TYPES.indexOf(String(mimetype || "").toLowerCase()) === -1) {
    return false;
  }

  return true;
}

function detectImageKind(buffer) {
  if (!buffer || buffer.length < 3) {
    return null;
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }

  return null;
}

function extensionMatchesKind(extension, kind) {
  if (kind === "jpeg") {
    return extension === ".jpg" || extension === ".jpeg";
  }
  if (kind === "png") {
    return extension === ".png";
  }
  if (kind === "webp") {
    return extension === ".webp";
  }
  return false;
}

function readFileHeader(filePath, length) {
  return new Promise(function (resolve, reject) {
    fs.open(filePath, "r", function (openErr, fd) {
      if (openErr) {
        return reject(openErr);
      }

      var buffer = Buffer.alloc(length);
      fs.read(fd, buffer, 0, length, 0, function (readErr, bytesRead) {
        fs.close(fd, function () {
          if (readErr) {
            return reject(readErr);
          }
          resolve(buffer.subarray(0, bytesRead));
        });
      });
    });
  });
}

function unlinkQuiet(filePath) {
  return new Promise(function (resolve) {
    fs.unlink(filePath, function () {
      resolve();
    });
  });
}

async function validateUploadedImageFile(file) {
  if (!file || !file.path) {
    return { ok: false, message: REJECT_MESSAGE };
  }

  var extension = path.extname(file.originalname || file.filename || "").toLowerCase();
  if (!isAllowedUploadMeta(file.originalname, file.mimetype)) {
    await unlinkQuiet(file.path);
    return { ok: false, message: REJECT_MESSAGE };
  }

  var header;
  try {
    header = await readFileHeader(file.path, 12);
  } catch (err) {
    await unlinkQuiet(file.path);
    return { ok: false, message: REJECT_MESSAGE };
  }

  var kind = detectImageKind(header);
  if (!kind || !extensionMatchesKind(extension, kind)) {
    await unlinkQuiet(file.path);
    return { ok: false, message: REJECT_MESSAGE };
  }

  return { ok: true, kind: kind };
}

function createImageFileFilter() {
  return function imageFileFilter(req, file, cb) {
    if (!isAllowedUploadMeta(file.originalname, file.mimetype)) {
      return cb(new Error(REJECT_MESSAGE));
    }
    return cb(null, true);
  };
}

module.exports = {
  ALLOWED_EXTENSIONS: ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES: ALLOWED_MIME_TYPES,
  REJECT_MESSAGE: REJECT_MESSAGE,
  isAllowedUploadMeta: isAllowedUploadMeta,
  createImageFileFilter: createImageFileFilter,
  validateUploadedImageFile: validateUploadedImageFile,
};
