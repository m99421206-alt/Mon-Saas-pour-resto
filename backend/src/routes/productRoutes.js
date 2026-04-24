const express = require("express");
const requireAuth = require("../middlewares/authMiddleware");
const productController = require("../controllers/productController");

const router = express.Router();

router.use(requireAuth);

router.get("/", productController.listProducts);
router.post("/", productController.createProduct);
router.put("/:id", productController.updateProduct);
router.delete("/:id", productController.deleteProduct);

module.exports = router;
