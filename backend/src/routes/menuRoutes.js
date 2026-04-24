const express = require("express");
const menuController = require("../controllers/menuController");

const router = express.Router();

router.get("/:restaurantId", menuController.getPublicMenu);

module.exports = router;
