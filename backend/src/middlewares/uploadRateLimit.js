/**
 * Rate limit uploads d'images — par utilisateur authentifié + secours IP.
 * Appliqué avant Multer/Sharp (voir uploadRoutes.js).
 */

const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

const WINDOW_MS = 15 * 60 * 1000;
const UPLOAD_RATE_LIMIT_MESSAGE =
  "Trop de tentatives d'upload. Veuillez patienter avant de réessayer.";

function getUploadRateLimitConfig() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    UPLOAD_USER_MAX: isProduction ? 10 : 30,
    UPLOAD_IP_MAX: isProduction ? 30 : 60,
  };
}

function uploadRateLimitHandler(req, res, next, options) {
  res.status(options.statusCode).json({ error: UPLOAD_RATE_LIMIT_MESSAGE });
}

function buildUploadRateLimiters() {
  const config = getUploadRateLimitConfig();
  const uploadRateLimitBase = {
    windowMs: WINDOW_MS,
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    handler: uploadRateLimitHandler,
  };

  const uploadIpRateLimiter = rateLimit({
    ...uploadRateLimitBase,
    max: config.UPLOAD_IP_MAX,
    keyGenerator: function (req) {
      return (
        "upload:ip:" +
        ipKeyGenerator(req.ip || req.socket.remoteAddress || "unknown")
      );
    },
  });

  const uploadUserRateLimiter = rateLimit({
    ...uploadRateLimitBase,
    max: config.UPLOAD_USER_MAX,
    keyGenerator: function (req) {
      if (req.user && req.user.id) {
        return "upload:user:" + req.user.id;
      }
      return "upload:user:anon";
    },
  });

  return {
    uploadIpRateLimiter,
    uploadUserRateLimiter,
    UPLOAD_RATE_LIMIT_MESSAGE,
    UPLOAD_RATE_WINDOW_MS: WINDOW_MS,
    UPLOAD_USER_MAX: config.UPLOAD_USER_MAX,
    UPLOAD_IP_MAX: config.UPLOAD_IP_MAX,
  };
}

const defaultLimiters = buildUploadRateLimiters();

module.exports = {
  ...defaultLimiters,
  buildUploadRateLimiters,
};
