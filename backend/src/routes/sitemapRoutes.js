const express = require("express");
const sitemapController = require("../controllers/sitemapController");

const router = express.Router();

router.get("/sitemap.xml", sitemapController.getSitemap);

module.exports = router;
