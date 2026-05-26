const express = require("express");
const requireAuth = require("../middlewares/authMiddleware");
const userController = require("../controllers/userController");

const router = express.Router();

router.get("/me", requireAuth, userController.getMe);

router.post("/me/onboarding/mark-seen", requireAuth, userController.postOnboardingMarkSeen);
router.post("/me/onboarding/request-help", requireAuth, userController.postOnboardingRequestHelp);

module.exports = router;
