const express = require("express");
const requireAuth = require("../middlewares/authMiddleware");
const userController = require("../controllers/userController");

const router = express.Router();

router.get("/me", requireAuth, userController.getMe);

module.exports = router;
