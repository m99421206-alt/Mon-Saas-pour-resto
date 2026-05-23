const express = require("express");
const requireAuth = require("../middlewares/authMiddleware");
const requireRestaurantMenuEdit = require("../middlewares/subscriptionEditMiddleware");
const categoryController = require("../controllers/categoryController");

const router = express.Router();

router.use(requireAuth);

router.get("/", categoryController.listCategories);
router.post("/", requireRestaurantMenuEdit, categoryController.createCategory);
router.put("/:id", requireRestaurantMenuEdit, categoryController.updateCategory);
router.delete("/:id", requireRestaurantMenuEdit, categoryController.deleteCategory);

module.exports = router;
