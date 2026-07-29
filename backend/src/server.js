/**
 * Serveur Express — AfricaMenu API
 */

require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { validateJwtSecretAtStartup } = require("./config/jwtSecret");
const { validateAdminEmailsAtStartup } = require("./utils/platformAdmin");
const { buildHelmetCspDirectives } = require("./config/csp");
const { ping } = require("./config/database");

// Importation des routes
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const productRoutes = require("./routes/productRoutes");
const menuRoutes = require("./routes/menuRoutes");
const menuController = require("./controllers/menuController");
const adminRoutes = require("./routes/adminRoutes");
const restaurantRoutes = require("./routes/restaurantRoutes");
const sitemapRoutes = require("./routes/sitemapRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
var platformSettings = require("./services/platformSettings");

const isProduction = process.env.NODE_ENV === "production";
const app = express();

if (isProduction) {
  app.set("trust proxy", 1);
}

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || "0.0.0.0";
const LAN_URL = process.env.LAN_URL || "http://localhost:" + PORT;
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(function (origin) {
    return origin.trim();
  })
  .filter(Boolean);

function assertProductionConfig() {
  if (!isProduction) {
    return;
  }

  if (allowedOrigins.length === 0 || allowedOrigins.indexOf("*") !== -1) {
    throw new Error(
      "Configuration production invalide : CORS_ORIGIN doit contenir les origines exactes du frontend.",
    );
  }
  if (!process.env.DB_PASSWORD) {
    throw new Error(
      "Configuration production invalide : DB_PASSWORD doit être renseigné.",
    );
  }
}

// Validation au démarrage
validateJwtSecretAtStartup();
assertProductionConfig();
validateAdminEmailsAtStartup();

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
      (url.protocol === "http:" || url.protocol === "https:") &&
      isPrivateNetworkHost(url.hostname)
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
    (!isProduction && allowedOrigins.includes("*")) ||
    allowedOrigins.includes(origin) ||
    isAllowedDevOrigin(origin)
  ) {
    return true;
  }

  return false;
}

// Rate Limiters
var registerRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 10 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives. Réessayez dans une minute." },
});

var loginRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 20 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Trop de tentatives de connexion. Réessayez dans une minute.",
  },
});

var passwordResetNotifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 8 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de demandes. Réessayez dans une minute." },
});

// Middleware CORS
app.use(
  cors({
    origin: function (origin, callback) {
      if (isAllowedCorsOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origine CORS non autorisée."));
    },
    credentials: true,
  }),
);

// Middleware Sécurité Helmet
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: buildHelmetCspDirectives(isProduction, allowedOrigins),
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);

// Body Parser
app.use(express.json({ limit: "256kb" }));

// Servir le dossier des images /uploads publiquement
app.use(
  "/uploads",
  express.static(path.join(__dirname, "../uploads"), {
    maxAge: "30d",
    immutable: true,
    etag: true,
    lastModified: true,
    setHeaders: function (res) {
      res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
    },
  }),
);

// Route de santé API
app.get("/health", async function (req, res) {
  try {
    await ping();
    return res.json({ ok: true, service: "AfricaMenu-api", db: "up" });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      service: "AfricaMenu-api",
      db: "down",
      message: isProduction ? "Service indisponible." : error.message,
    });
  }
});

app.get("/api/health", async function (req, res) {
  try {
    await ping();
    return res.json({ ok: true, service: "AfricaMenu-api", db: "up" });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      service: "AfricaMenu-api",
      db: "down",
      message: isProduction ? "Service indisponible." : error.message,
    });
  }
});

// Rate limiting sur les routes d'authentification
app.post("/api/auth/register", registerRateLimiter);
app.post("/api/auth/login", loginRateLimiter);
app.post("/api/auth/password-reset-request", passwordResetNotifyLimiter);

/* -------------------------------------------------------------------------- */
/*                            ROUTES PUBLIQUES                                */
/* -------------------------------------------------------------------------- */

// Consultation du menu public client (SANS authentification JWT)
app.use("/api/menu", menuRoutes);
app.use("/menu", menuRoutes);
app.get("/restaurant/:restaurantSlug", menuController.getPublicMenu);
app.use(sitemapRoutes);

/* -------------------------------------------------------------------------- */
/*                            ROUTES SÉCURISÉES API                           */
/* -------------------------------------------------------------------------- */

// Authentification
app.use("/api/auth", authRoutes);

// Administration de la plateforme
app.use("/api/admin", adminRoutes);

// Compte utilisateur & tableau de bord (/api/me, etc.)
app.use("/api", userRoutes);

// Gestion du menu (Catégories & Produits)
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);

// Configuration du restaurant
app.use("/api/restaurant", restaurantRoutes);

// Upload d'images (harmonisé sous /api/upload et /upload)
app.use("/api/upload", uploadRoutes);
app.use("/upload", uploadRoutes);

/* -------------------------------------------------------------------------- */
/*                       GESTION DES ERREURS & 404                            */
/* -------------------------------------------------------------------------- */

platformSettings.refresh().catch(function (e) {
  console.warn("[platform_settings]", e.message || e);
});

// Route introuvable
app.use(function (req, res) {
  res.status(404).json({ message: "Route introuvable." });
});

// Gestionnaire d'erreurs global
app.use(function (err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  var status = err.status || err.statusCode || 500;
  if (status < 400 || status >= 600) {
    status = 500;
  }

  var message =
    isProduction && status >= 500
      ? "Erreur serveur."
      : err.message || "Erreur serveur.";

  if (!isProduction && status >= 500) {
    console.error(err);
  }

  res.status(status).json({ message: message });
});

// Démarrage du serveur
app.listen(PORT, HOST, function () {
  console.log("AfricaMenu API — http://localhost:" + PORT);
  console.log("AfricaMenu API réseau — " + LAN_URL);
});
