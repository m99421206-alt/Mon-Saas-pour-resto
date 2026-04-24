const express = require("express");
const requireAuth = require("../middlewares/authMiddleware");
const categoryController = require("../controllers/categoryController");

const router = express.Router();

router.use(requireAuth);

router.get("/", categoryController.listCategories);
router.post("/", categoryController.createCategory);
router.put("/:id", categoryController.updateCategory);
router.delete("/:id", categoryController.deleteCategory);

module.exports = router;
