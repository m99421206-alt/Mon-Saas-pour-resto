/**
 * Serveur Express — AfricaMenu API
 * Étape 2 : JSON body, CORS, variables d’environnement, port configurable.
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const productRoutes = require("./routes/productRoutes");
const menuRoutes = require("./routes/menuRoutes");

const app = express();
const PORT = Number(process.env.PORT) || 4000;

/* Corps des requêtes en JSON (POST / PUT) */
app.use(express.json());

/* Autoriser le frontend (autre origine) à appeler l’API — affiné à l’étape 10 */
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true,
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
/* Menu public client (étape 9) — sans JWT */
app.use("/menu", menuRoutes);

app.listen(PORT, function () {
  console.log("AfricaMenu API — http://localhost:" + PORT);
});
