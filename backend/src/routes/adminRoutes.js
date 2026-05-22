const express = require("express");
const requireAuth = require("../middlewares/authMiddleware");
const requirePlatformAdmin = require("../middlewares/adminMiddleware");
const adminController = require("../controllers/adminController");
const adminUsersController = require("../controllers/adminUsersController");
const adminRestaurantsController = require("../controllers/adminRestaurantsController");

var router = express.Router();

router.get("/stats", requireAuth, requirePlatformAdmin, adminController.getStats);
router.get("/activity", requireAuth, requirePlatformAdmin, adminController.getActivity);

router.get("/users", requireAuth, requirePlatformAdmin, adminUsersController.listUsers);
router.get("/users/:id", requireAuth, requirePlatformAdmin, adminUsersController.getUserDetail);
router.patch("/users/:id/status", requireAuth, requirePlatformAdmin, adminUsersController.patchUserStatus);
router.delete("/users/:id", requireAuth, requirePlatformAdmin, adminUsersController.deleteUser);

router.get("/restaurants", requireAuth, requirePlatformAdmin, adminRestaurantsController.listRestaurants);
router.get("/restaurants/:id", requireAuth, requirePlatformAdmin, adminRestaurantsController.getRestaurantDetail);
router.patch(
  "/restaurants/:id/menu",
  requireAuth,
  requirePlatformAdmin,
  adminRestaurantsController.patchMenuSuspended,
);
router.delete("/restaurants/:id", requireAuth, requirePlatformAdmin, adminRestaurantsController.deleteRestaurant);

module.exports = router;
