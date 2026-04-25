const express = require("express");
const requireAuth = require("../middlewares/authMiddleware");
const restaurantController = require("../controllers/restaurantController");

const router = express.Router();

router.use(requireAuth);

router.get("/", restaurantController.getMyRestaurant);
router.put("/", restaurantController.updateMyRestaurant);

module.exports = router;
