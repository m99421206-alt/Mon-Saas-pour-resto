const { getPool } = require("../config/database");

async function getRestaurantIdForUser(userId) {
  var pool = getPool();
  var [rows] = await pool.query(
    "SELECT id FROM restaurants WHERE user_id = ? ORDER BY id ASC LIMIT 1",
    [userId]
  );
  return rows.length ? rows[0].id : null;
}

function normalizeName(body) {
  if (!body || typeof body.name !== "string") {
    return null;
  }
  var n = body.name.trim();
  return n.length ? n : null;
}

async function listCategories(req, res) {
  try {
    var restaurantId = await getRestaurantIdForUser(req.user.id);
    if (!restaurantId) {
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    var pool = getPool();
    var [rows] = await pool.query(
      "SELECT id, restaurant_id, name FROM categories WHERE restaurant_id = ? ORDER BY id ASC",
      [restaurantId]
    );
    return res.json({ categories: rows });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function createCategory(req, res) {
  try {
    var name = normalizeName(req.body);
    if (!name) {
      return res.status(400).json({ message: "Le nom de la catégorie est requis." });
    }

    var restaurantId = await getRestaurantIdForUser(req.user.id);
    if (!restaurantId) {
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    var pool = getPool();
    var [result] = await pool.query(
      "INSERT INTO categories (restaurant_id, name) VALUES (?, ?)",
      [restaurantId, name]
    );

    return res.status(201).json({
      category: {
        id: result.insertId,
        restaurant_id: restaurantId,
        name: name,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function updateCategory(req, res) {
  try {
    var name = normalizeName(req.body);
    if (!name) {
      return res.status(400).json({ message: "Le nom de la catégorie est requis." });
    }

    var categoryId = Number(req.params.id);
    if (!Number.isInteger(categoryId) || categoryId < 1) {
      return res.status(400).json({ message: "Identifiant de catégorie invalide." });
    }

    var restaurantId = await getRestaurantIdForUser(req.user.id);
    if (!restaurantId) {
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    var pool = getPool();
    var [result] = await pool.query(
      "UPDATE categories SET name = ? WHERE id = ? AND restaurant_id = ?",
      [name, categoryId, restaurantId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Catégorie introuvable." });
    }

    return res.json({
      category: {
        id: categoryId,
        restaurant_id: restaurantId,
        name: name,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function deleteCategory(req, res) {
  try {
    var categoryId = Number(req.params.id);
    if (!Number.isInteger(categoryId) || categoryId < 1) {
      return res.status(400).json({ message: "Identifiant de catégorie invalide." });
    }

    var restaurantId = await getRestaurantIdForUser(req.user.id);
    if (!restaurantId) {
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    var pool = getPool();
    var [products] = await pool.query(
      "SELECT id FROM products WHERE restaurant_id = ? AND category_id = ? LIMIT 1",
      [restaurantId, categoryId]
    );

    if (products.length > 0) {
      return res.status(409).json({
        message: "Impossible de supprimer une catégorie qui contient encore des produits.",
      });
    }

    var [result] = await pool.query("DELETE FROM categories WHERE id = ? AND restaurant_id = ?", [
      categoryId,
      restaurantId,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Catégorie introuvable." });
    }

    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

module.exports = {
  listCategories: listCategories,
  createCategory: createCategory,
  updateCategory: updateCategory,
  deleteCategory: deleteCategory,
};
