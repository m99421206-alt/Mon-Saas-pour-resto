const express = require("express");
const authController = require("../controllers/authController");
const publicNotifyController = require("../controllers/publicNotifyController");

const router = express.Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/password-reset-request", publicNotifyController.postPasswordResetRequest);
router.post("/installation-request", publicNotifyController.postInstallationRequest);

module.exports = router;
