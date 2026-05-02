const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const requireAuth = require("../middlewares/authMiddleware");

const router = express.Router();
const uploadsDir = path.join(__dirname, "../../uploads");
const allowedMimeTypes = ["image/jpeg", "image/png"];
const allowedExtensions = [".jpg", ".jpeg", ".png"];

fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Le nom unique évite d'écraser une image déjà uploadée.
    const extension = path.extname(file.originalname).toLowerCase();
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9) + extension;
    cb(null, uniqueName);
  },
});

function imageFileFilter(req, file, cb) {
  const extension = path.extname(file.originalname).toLowerCase();
  const validType = allowedMimeTypes.includes(file.mimetype);
  const validExtension = allowedExtensions.includes(extension);

  if (!validType || !validExtension) {
    return cb(new Error("Seules les images JPG et PNG sont acceptées."));
  }

  return cb(null, true);
}

const upload = multer({
  storage: storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
});

router.use(requireAuth);

router.post("/", function (req, res) {
  upload.single("image")(req, res, function (err) {
    if (err) {
      const message =
        err.code === "LIMIT_FILE_SIZE" ? "L'image ne doit pas dépasser 2MB." : err.message || "Upload impossible.";
      return res.status(400).json({ message: message });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Aucune image reçue." });
    }

    return res.status(201).json({
      url: "/uploads/" + req.file.filename,
    });
  });
});

module.exports = router;
