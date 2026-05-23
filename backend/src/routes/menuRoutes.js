const express = require("express");
var menuController = require("../controllers/menuController");
var platformSettings = require("../services/platformSettings");

const router = express.Router();

router.use(function maintenanceGate(req, res, next) {
  if (platformSettings.isMaintenanceEnabled()) {
    return res.status(503).json({
      message: "La plateforme est en maintenance. Réessayez un peu plus tard.",
      maintenance: true,
    });
  }
  next();
});

router.get("/:restaurantId", menuController.getPublicMenu);

module.exports = router;
