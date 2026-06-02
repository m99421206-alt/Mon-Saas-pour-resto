const express = require("express");
const requireAuth = require("../middlewares/authMiddleware");
const requireRestaurantOwner = require("../middlewares/requireRestaurantOwner");
const requireRestaurantMenuEdit = require("../middlewares/subscriptionEditMiddleware");
const productController = require("../controllers/productController");

const router = express.Router();

router.use(requireAuth);
router.use(requireRestaurantOwner);

router.get("/", productController.listProducts);
router.post("/", requireRestaurantMenuEdit, productController.createProduct);
router.put("/:id", requireRestaurantMenuEdit, productController.updateProduct);
router.delete("/:id", requireRestaurantMenuEdit, productController.deleteProduct);

module.exports = router;
