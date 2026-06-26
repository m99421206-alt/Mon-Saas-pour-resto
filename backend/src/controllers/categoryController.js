const { getPool } = require("../config/database");
const { appendAuditFromRequest, AUDIT_ACTIONS } = require("../utils/auditLog");
const ownership = require("../utils/restaurantOwnership");

function resolveRestaurantId(req) {
  return req.restaurantId || null;
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
    var restaurantId = resolveRestaurantId(req);
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

    var restaurantId = resolveRestaurantId(req);
    if (!restaurantId) {
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    var pool = getPool();
    var [result] = await pool.query(
      "INSERT INTO categories (restaurant_id, name) VALUES (?, ?)",
      [restaurantId, name]
    );

    await appendAuditFromRequest(req, {
      userId: req.user.id,
      restaurantId: restaurantId,
      action: AUDIT_ACTIONS.CATEGORY_CREATE,
      detail: "Ajout catégorie « " + String(name).slice(0, 160) + " »",
    });

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

    var restaurantId = resolveRestaurantId(req);
    if (!restaurantId) {
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    var categoryOwnership = await ownership.assertCategoryOwnedByRestaurant(categoryId, restaurantId);
    if (categoryOwnership === "forbidden") {
      return ownership.sendForbidden(res);
    }
    if (categoryOwnership === "not_found") {
      return res.status(404).json({ message: "Catégorie introuvable." });
    }

    var pool = getPool();
    var [result] = await pool.query(
      "UPDATE categories SET name = ? WHERE id = ? AND restaurant_id = ?",
      [name, categoryId, restaurantId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Catégorie introuvable." });
    }

    await appendAuditFromRequest(req, {
      userId: req.user.id,
      restaurantId: restaurantId,
      action: AUDIT_ACTIONS.CATEGORY_UPDATE,
      detail: "Modification catégorie « " + String(name).slice(0, 160) + " »",
    });

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

    var restaurantId = resolveRestaurantId(req);
    if (!restaurantId) {
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    var categoryOwnership = await ownership.assertCategoryOwnedByRestaurant(categoryId, restaurantId);
    if (categoryOwnership === "forbidden") {
      return ownership.sendForbidden(res);
    }
    if (categoryOwnership === "not_found") {
      return res.status(404).json({ message: "Catégorie introuvable." });
    }

    var pool = getPool();
    var [cats] = await pool.query("SELECT name FROM categories WHERE id = ? AND restaurant_id = ? LIMIT 1", [
      categoryId,
      restaurantId,
    ]);
    var catName = cats.length && cats[0].name ? String(cats[0].name) : "";

    var [result] = await pool.query("DELETE FROM categories WHERE id = ? AND restaurant_id = ?", [
      categoryId,
      restaurantId,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Catégorie introuvable." });
    }

    await appendAuditFromRequest(req, {
      userId: req.user.id,
      restaurantId: restaurantId,
      action: AUDIT_ACTIONS.CATEGORY_DELETE,
      detail: catName
        ? "Suppression catégorie « " + catName.slice(0, 160) + " »"
        : "Suppression catégorie",
    });

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
