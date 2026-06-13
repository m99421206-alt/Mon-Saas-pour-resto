const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const requireAuth = require("../middlewares/authMiddleware");
const requireRestaurantOwner = require("../middlewares/requireRestaurantOwner");
const requireRestaurantMenuEdit = require("../middlewares/subscriptionEditMiddleware");
var platformSettings = require("../services/platformSettings");
const { appendAudit, AUDIT_ACTIONS, getRestaurantIdForUserAudit } = require("../utils/auditLog");
const uploadImageValidation = require("../utils/uploadImageValidation");
const { optimizeUploadedImage } = require("../utils/optimizeUploadedImage");
const { registerUploadForRestaurant } = require("../utils/uploadOwnership");

const router = express.Router();
const uploadsDir = path.join(__dirname, "../../uploads");

fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const extension = path.extname(file.originalname).toLowerCase();
    if (uploadImageValidation.ALLOWED_EXTENSIONS.indexOf(extension) === -1) {
      return cb(new Error(uploadImageValidation.REJECT_MESSAGE));
    }
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9) + extension;
    cb(null, uniqueName);
  },
});

function buildUploadMw() {
  var max = platformSettings.getUploadMaxBytes();
  return multer({
    storage: storage,
    fileFilter: uploadImageValidation.createImageFileFilter(),
    limits: {
      fileSize: max,
    },
  });
}

async function logUploadFailure(req, reason) {
  await appendAudit({
    userId: req.user && req.user.id ? req.user.id : null,
    restaurantId: req.restaurantId || (req.user && req.user.id ? await getRestaurantIdForUserAudit(req.user.id) : null),
    action: AUDIT_ACTIONS.UPLOAD_IMAGE_FAILED,
    detail: "Upload image refusé : " + String(reason || "raison inconnue").slice(0, 240),
  });
}

router.use(requireAuth);
router.use(requireRestaurantOwner);

router.post("/", requireRestaurantMenuEdit, function (req, res) {
  var maxBytes = platformSettings.getUploadMaxBytes();
  var maxMb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;

  buildUploadMw().single("image")(req, res, async function (err) {
    try {
      if (err) {
        const message =
          err.code === "LIMIT_FILE_SIZE" ?
            "L’image dépasse la limite configurée (~" + maxMb + " Mo)."
          : err.message || "Upload impossible.";
        await logUploadFailure(req, message);
        return res.status(400).json({ message: message });
      }

      if (!req.file) {
        await logUploadFailure(req, "Aucune image reçue.");
        return res.status(400).json({ message: "Aucune image reçue." });
      }

      var imageCheck = await uploadImageValidation.validateUploadedImageFile(req.file);
      if (!imageCheck.ok) {
        await logUploadFailure(req, imageCheck.message);
        return res.status(400).json({ message: imageCheck.message });
      }

      // Compression + conversion WebP (réduit fortement le poids, sans changer le rendu).
      var optimized = await optimizeUploadedImage(req.file);
      if (optimized.rejected) {
        await logUploadFailure(req, optimized.message);
        return res.status(400).json({ message: optimized.message });
      }
      var finalFilename = optimized.filename || req.file.filename;

      var rid = req.restaurantId || (await getRestaurantIdForUserAudit(req.user.id));
      await registerUploadForRestaurant({
        restaurantId: rid,
        userId: req.user.id,
        filename: finalFilename,
      });

      await appendAudit({
        userId: req.user.id,
        restaurantId: rid,
        action: AUDIT_ACTIONS.UPLOAD_IMAGE,
        detail: "Upload image (« " + finalFilename + " »)",
      });

      return res.status(201).json({
        url: "/uploads/" + finalFilename,
      });
    } catch (innerErr) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[upload]", innerErr);
      }
      return res.status(500).json({
        message:
          process.env.NODE_ENV !== "production" && innerErr && innerErr.message
            ? "Erreur upload : " + innerErr.message
            : "Erreur lors de l’enregistrement de l’image.",
      });
    }
  });
});

module.exports = router;
