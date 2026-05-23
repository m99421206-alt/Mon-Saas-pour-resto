const express = require("express");
const requireAuth = require("../middlewares/authMiddleware");
const requireRestaurantMenuEdit = require("../middlewares/subscriptionEditMiddleware");
const restaurantController = require("../controllers/restaurantController");

const router = express.Router();

router.use(requireAuth);

router.get("/", restaurantController.getMyRestaurant);
router.put("/", requireRestaurantMenuEdit, restaurantController.updateMyRestaurant);

module.exports = router;
