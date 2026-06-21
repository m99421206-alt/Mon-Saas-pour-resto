const express = require("express");
const requireAuth = require("../middlewares/authMiddleware");
const userController = require("../controllers/userController");

const router = express.Router();

router.use(requireAuth);

router.get("/me", userController.getMe);

router.post("/me/onboarding/mark-seen", userController.postOnboardingMarkSeen);
router.post("/me/onboarding/request-help", userController.postOnboardingRequestHelp);
router.post("/me/admin-notify", userController.postAdminNotify);

module.exports = router;
