/**
 * Serveur Express — AfricaMenu API
 * Étape 2 : JSON body, CORS, variables d’environnement, port configurable.
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

/**
 * Hors production : tout origine HTTP/HTTPS depuis localhost ou LAN privé est acceptée,
 * quel que soit le port (5500 mais aussi 8080, 63342 Live Server variant, etc.).
 * Sinon l’inscription / login peuvent « échouer » alors que le seul problème était le CORS.
 */
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

/* CORS avant les routes — préflight inclus (évite blocages inscription / login en dev). */
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

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: buildHelmetCspDirectives(isProduction, allowedOrigins),
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);

/* Corps des requêtes en JSON (POST / PUT) */
app.use(express.json({ limit: "256kb" }));

/* Images uploadées par les restaurants.
   Les noms de fichiers sont uniques (timestamp + aléatoire), le contenu ne change
   jamais : on peut donc activer un cache navigateur long + immutable. */
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

/* Route de santé : serveur + base de données */
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

/* Limitation globale inscription ; login : 5 échecs → blocage (loginLockout.js) */
app.post("/register", registerRateLimiter);
app.post("/login", loginRateLimiter);
app.post("/password-reset-request", passwordResetNotifyLimiter);

/* Authentification (étape 5) */
app.use("/", authRoutes);

/* Administration plateforme — avant /api (évite middleware compte resto sur /api/admin/*) */
app.use("/api/admin", adminRoutes);
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
app.use(sitemapRoutes);
/* Menu public client (étape 9) — sans JWT */
app.use("/menu", menuRoutes);
app.get("/restaurant/:restaurantSlug", menuController.getPublicMenu);

platformSettings.refresh().catch(function (e) {
  console.warn("[platform_settings]", e.message || e);
});

app.use(function (req, res) {
  res.status(404).json({ message: "Route introuvable." });
});

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

app.listen(PORT, HOST, function () {
  console.log("AfricaMenu API — http://localhost:" + PORT);
  console.log("AfricaMenu API réseau — " + LAN_URL);
});
