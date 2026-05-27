const express = require("express");
const requireAuth = require("../middlewares/authMiddleware");
const requirePlatformAdmin = require("../middlewares/adminMiddleware");
const adminController = require("../controllers/adminController");
const adminUsersController = require("../controllers/adminUsersController");
const adminRestaurantsController = require("../controllers/adminRestaurantsController");
const adminSubscriptionsController = require("../controllers/adminSubscriptionsController");
const adminSettingsController = require("../controllers/adminSettingsController");
const adminSetupHelpController = require("../controllers/adminSetupHelpController");

var router = express.Router();


router.get("/stats", requireAuth, requirePlatformAdmin, adminController.getStats);
router.get("/activity", requireAuth, requirePlatformAdmin, adminController.getActivity);

router.get("/users", requireAuth, requirePlatformAdmin, adminUsersController.listUsers);
router.get("/users/:id", requireAuth, requirePlatformAdmin, adminUsersController.getUserDetail);
router.patch("/users/:id/status", requireAuth, requirePlatformAdmin, adminUsersController.patchUserStatus);
router.delete("/users/:id", requireAuth, requirePlatformAdmin, adminUsersController.deleteUser);

router.get("/restaurants", requireAuth, requirePlatformAdmin, adminRestaurantsController.listRestaurants);
router.get("/restaurants/:id", requireAuth, requirePlatformAdmin, adminRestaurantsController.getRestaurantDetail);
router.post(
  "/restaurants/:id/dashboard-access",
  requireAuth,
  requirePlatformAdmin,
  adminRestaurantsController.postRestaurantDashboardAccess,
);
router.patch(
  "/restaurants/:id/menu",
  requireAuth,
  requirePlatformAdmin,
  adminRestaurantsController.patchMenuSuspended,
);
router.delete("/restaurants/:id", requireAuth, requirePlatformAdmin, adminRestaurantsController.deleteRestaurant);

router.get("/subscriptions", requireAuth, requirePlatformAdmin, adminSubscriptionsController.listSubscriptions);
router.get(
  "/subscriptions/:restaurantId",
  requireAuth,
  requirePlatformAdmin,
  adminSubscriptionsController.getSubscriptionDetail,
);
router.post(
  "/subscriptions/:restaurantId/activate",
  requireAuth,
  requirePlatformAdmin,
  adminSubscriptionsController.postActivate,
);
router.post(
  "/subscriptions/:restaurantId/suspend",
  requireAuth,
  requirePlatformAdmin,
  adminSubscriptionsController.postSuspend,
);
router.post(
  "/subscriptions/:restaurantId/renew",
  requireAuth,
  requirePlatformAdmin,
  adminSubscriptionsController.postRenew,
);
router.patch(
  "/subscriptions/:restaurantId/adjust",
  requireAuth,
  requirePlatformAdmin,
  adminSubscriptionsController.patchAdjustSubscription,
);

router.get("/settings", requireAuth, requirePlatformAdmin, adminSettingsController.getSettings);
router.put("/settings", requireAuth, requirePlatformAdmin, adminSettingsController.putSettings);

router.get("/setup-help", requireAuth, requirePlatformAdmin, adminSetupHelpController.listSetupHelp);
router.post(
  "/restaurants/:id/setup-help/complete",
  requireAuth,
  requirePlatformAdmin,
  adminSetupHelpController.postSetupHelpComplete,
);

module.exports = router;

