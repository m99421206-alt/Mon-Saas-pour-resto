const express = require("express");
const requireAuth = require("../middlewares/authMiddleware");
const requireRestaurantOwner = require("../middlewares/requireRestaurantOwner");
const userController = require("../controllers/userController");

const router = express.Router();

router.use(requireAuth);
router.use(requireRestaurantOwner);

router.get("/me", userController.getMe);

router.post("/me/onboarding/mark-seen", userController.postOnboardingMarkSeen);
router.post("/me/onboarding/request-help", userController.postOnboardingRequestHelp);

module.exports = router;
