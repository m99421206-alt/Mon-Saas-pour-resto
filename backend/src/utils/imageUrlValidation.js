const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

function hasAllowedImageExtension(filename) {
  var lower = String(filename || "").toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.some(function (extension) {
    return lower.endsWith(extension);
  });
}

function normalizeStoredImageUrl(value) {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    return false;
  }

  var url = value.trim();
  if (!url) {
    return null;
  }

  if (url.indexOf("/uploads/") !== 0) {
    return false;
  }
  if (url.indexOf("\\") !== -1 || url.indexOf("..") !== -1 || /%2f|%5c/i.test(url)) {
    return false;
  }
  if (url.indexOf("?") !== -1 || url.indexOf("#") !== -1) {
    return false;
  }

  var filename = url.slice("/uploads/".length);
  if (!filename || filename.indexOf("/") !== -1 || !hasAllowedImageExtension(filename)) {
    return false;
  }

  return url;
}

module.exports = {
  normalizeStoredImageUrl: normalizeStoredImageUrl,
  ALLOWED_IMAGE_EXTENSIONS: ALLOWED_IMAGE_EXTENSIONS,
};
