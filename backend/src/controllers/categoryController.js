const { getPool } = require("../config/database");
const { appendAuditFromRequest, AUDIT_ACTIONS } = require("../utils/auditLog");
const ownership = require("../utils/restaurantOwnership");
const { parseCategoryBody, parseCategoryIdParams } = require("../validators/category");
const { sendValidationError } = require("../validators/helpers");

function resolveRestaurantId(req) {
  return req.restaurantId || null;
}

function normalizeName(body) {
  var parsed = parseCategoryBody(body);
  if (!parsed.ok) {
    return { error: parsed.message };
  }
  return { name: parsed.data.name };
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
    var nameResult = normalizeName(req.body);
    if (nameResult.error) {
      return res.status(400).json({ message: nameResult.error });
    }
    var name = nameResult.name;

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
    var nameResult = normalizeName(req.body);
    if (nameResult.error) {
      return res.status(400).json({ message: nameResult.error });
    }
    var name = nameResult.name;

    var idParsed = parseCategoryIdParams(req.params);
    if (sendValidationError(idParsed, res)) {
      return;
    }
    var categoryId = idParsed.data.id;

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
    var idParsed = parseCategoryIdParams(req.params);
    if (sendValidationError(idParsed, res)) {
      return;
    }
    var categoryId = idParsed.data.id;

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
