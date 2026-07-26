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
  .map((origin) => origin.trim())
  .filter(Boolean);

function assertProductionConfig() {
  if (!isProduction) return;
  if (allowedOrigins.length === 0 || allowedOrigins.indexOf("*") !== -1) {
    throw new Error("CORS_ORIGIN invalide en production.");
  }
  if (!process.env.DB_PASSWORD) {
    throw new Error("DB_PASSWORD doit être renseigné.");
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

function isAllowedDevOrigin(origin) {
  if (process.env.NODE_ENV === "production") return false;
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
  if (!origin) return true;
  return (
    (!isProduction && allowedOrigins.includes("*")) ||
    allowedOrigins.includes(origin) ||
    isAllowedDevOrigin(origin)
  );
}

/* Middlewares de sécurité & parsing */
app.use(
  cors({
    origin: function (origin, callback) {
      if (isAllowedCorsOrigin(origin)) return callback(null, true);
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

app.use(express.json({ limit: "256kb" }));

/* Fichiers statiques uploads */
app.use(
  "/uploads",
  express.static(path.join(__dirname, "../uploads"), {
    maxAge: "30d",
    immutable: true,
    etag: true,
    lastModified: true,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
    },
  }),
);

/* Healthcheck */
app.get("/health", async (req, res) => {
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

// =================================================================
//                 ROUTAGE STRICT ET CLAIR DE L'API
// =================================================================

/* 1. Authentification */
app.use("/api/auth", authRoutes);
app.use("/auth", authRoutes); // Rétro-compatibilité

/* 2. Utilisateurs & Profil (/api/me et /api/users) */
app.use("/api/me", userRoutes);
app.use("/api/users", userRoutes);

/* 3. Administration */
app.use("/api/admin", adminRoutes);

/* 4. Données métier (Espace client/Resto) */
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/restaurant", restaurantRoutes);
app.use("/api/upload", uploadRoutes);

/* 5. Menus Publics */
app.use("/api/menu", menuRoutes);
app.use("/menu", menuRoutes);
app.get("/restaurant/:restaurantSlug", menuController.getPublicMenu);

/* Sitemap */
app.use(sitemapRoutes);

/*
 * Fallback d'authentification pour les requêtes à la racine (/login, /register, etc.)
 * CORRECTION : Utilisation de app.use au lieu de app.post pour capturer correctement
 * les sous-routes définies dans authRoutes.
 */
app.use("/", authRoutes);

// =================================================================
//                     GESTION DES ERREURS
// =================================================================

/* 404 : Si aucune route ci-dessus n'a répondu, renvoyer du JSON et JAMAIS du HTML */
app.use((req, res) => {
  res.status(404).json({ ok: false, message: "Route API introuvable." });
});

/* Gestion globale des erreurs serveur */
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  let status = err.status || err.statusCode || 500;
  if (status < 400 || status >= 600) status = 500;

  const message =
    isProduction && status >= 500
      ? "Erreur serveur."
      : err.message || "Erreur serveur.";

  if (!isProduction && status >= 500) {
    console.error(err);
  }

  res.status(status).json({ ok: false, message: message });
});

platformSettings.refresh().catch((e) => {
  console.warn("[platform_settings]", e.message || e);
});

app.listen(PORT, HOST, () => {
  console.log("AfricaMenu API — http://localhost:" + PORT);
});
