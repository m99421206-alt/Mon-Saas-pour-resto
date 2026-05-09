/**
 * Serveur Express — AfricaMenu API
 * Étape 2 : JSON body, CORS, variables d’environnement, port configurable.
 */

require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const productRoutes = require("./routes/productRoutes");
const menuRoutes = require("./routes/menuRoutes");
const restaurantRoutes = require("./routes/restaurantRoutes");
const uploadRoutes = require("./routes/uploadRoutes");

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || "0.0.0.0";
const LAN_URL = process.env.LAN_URL || "http://localhost:" + PORT;
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(function (origin) {
    return origin.trim();
  })
  .filter(Boolean);
const devFrontendPorts = (process.env.DEV_FRONTEND_PORTS || "5500,5501,5173,3000")
  .split(",")
  .map(function (port) {
    return port.trim();
  })
  .filter(Boolean);

function isPrivateNetworkHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.indexOf("192.168.") === 0 ||
    hostname.indexOf("10.") === 0 ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function isAllowedDevOrigin(origin) {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  try {
    var url = new URL(origin);
    return (
      url.protocol === "http:" &&
      isPrivateNetworkHost(url.hostname) &&
      devFrontendPorts.includes(url.port)
    );
  } catch (error) {
    return false;
  }
}

function isAllowedCorsOrigin(origin) {
  if (!origin) {
    return true;
  }

  if (
    allowedOrigins.includes("*") ||
    allowedOrigins.includes(origin) ||
    isAllowedDevOrigin(origin)
  ) {
    return true;
  }

  return false;
}

/* Corps des requêtes en JSON (POST / PUT) */
app.use(express.json());

/* Images uploadées par les restaurants */
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

/* Autoriser le frontend (autre origine) à appeler l’API — affiné à l’étape 10 */
app.use(
  cors({
    origin: function (origin, callback) {
      if (isAllowedCorsOrigin(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origine CORS non autorisée."));
    },
    credentials: true,
  })
);

/* Route de santé : utile pour vérifier que le serveur tourne */
app.get("/health", function (req, res) {
  res.json({ ok: true, service: "africamenu-api" });
});

/* Authentification (étape 5) */
app.use("/", authRoutes);

/* Routes protégées sous /api (étape 6 — middleware JWT) */
app.use("/api", userRoutes);
/* CRUD catégories (étape 7) — JWT requis */
app.use("/api/categories", categoryRoutes);
/* CRUD produits (étape 8) — JWT requis */
app.use("/api/products", productRoutes);
/* Paramètres restaurant — JWT requis */
app.use("/api/restaurant", restaurantRoutes);
/* Upload images — JWT requis */
app.use("/upload", uploadRoutes);
/* Menu public client (étape 9) — sans JWT */
app.use("/menu", menuRoutes);

app.listen(PORT, HOST, function () {
  console.log("AfricaMenu API — http://localhost:" + PORT);
  console.log("AfricaMenu API réseau — " + LAN_URL);
});
