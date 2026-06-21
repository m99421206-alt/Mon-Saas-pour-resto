const express = require("express");
const authController = require("../controllers/authController");
const publicNotifyController = require("../controllers/publicNotifyController");

const router = express.Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/password-reset-request", publicNotifyController.postPasswordResetRequest);

module.exports = router;
