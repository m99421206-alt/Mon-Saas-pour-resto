const { getPool } = require("../config/database");

async function getRestaurantIdForUser(userId) {
  var pool = getPool();
  var [rows] = await pool.query(
    "SELECT id FROM restaurants WHERE user_id = ? ORDER BY id ASC LIMIT 1",
    [userId]
  );
  return rows.length ? rows[0].id : null;
}

async function categoryBelongsToRestaurant(categoryId, restaurantId) {
  var pool = getPool();
  var [rows] = await pool.query(
    "SELECT id FROM categories WHERE id = ? AND restaurant_id = ? LIMIT 1",
    [categoryId, restaurantId]
  );
  return rows.length > 0;
}

function normalizeName(body) {
  if (!body || typeof body.name !== "string") {
    return null;
  }
  var n = body.name.trim();
  return n.length ? n : null;
}

function normalizeImage(body) {
  if (!body || body.image == null || body.image === "") {
    return null;
  }
  if (typeof body.image !== "string") {
    return null;
  }
  return body.image.trim() || null;
}

function normalizeCategoryId(body) {
  var id = Number(body && body.category_id);
  if (!Number.isInteger(id) || id < 1) {
    return null;
  }
  return id;
}

function normalizePrice(body) {
  var value = Number(body && body.price);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return Number(value.toFixed(2));
}

async function listProducts(req, res) {
  try {
    var restaurantId = await getRestaurantIdForUser(req.user.id);
    if (!restaurantId) {
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    var pool = getPool();
    var [rows] = await pool.query(
      "SELECT id, restaurant_id, category_id, name, price, image FROM products WHERE restaurant_id = ? ORDER BY id ASC",
      [restaurantId]
    );
    return res.json({ products: rows });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function createProduct(req, res) {
  try {
    var name = normalizeName(req.body);
    var price = normalizePrice(req.body);
    var categoryId = normalizeCategoryId(req.body);
    var image = normalizeImage(req.body);

    if (!name) {
      return res.status(400).json({ message: "Le nom du produit est requis." });
    }
    if (price == null) {
      return res.status(400).json({ message: "Le prix doit être un nombre positif ou nul." });
    }
    if (!categoryId) {
      return res.status(400).json({ message: "category_id est requis et doit être valide." });
    }

    var restaurantId = await getRestaurantIdForUser(req.user.id);
    if (!restaurantId) {
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    var allowedCategory = await categoryBelongsToRestaurant(categoryId, restaurantId);
    if (!allowedCategory) {
      return res.status(400).json({ message: "La catégorie n'appartient pas à votre restaurant." });
    }

    var pool = getPool();
    var [result] = await pool.query(
      "INSERT INTO products (restaurant_id, category_id, name, price, image) VALUES (?, ?, ?, ?, ?)",
      [restaurantId, categoryId, name, price, image]
    );

    return res.status(201).json({
      product: {
        id: result.insertId,
        restaurant_id: restaurantId,
        category_id: categoryId,
        name: name,
        price: price,
        image: image,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function updateProduct(req, res) {
  try {
    var productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId < 1) {
      return res.status(400).json({ message: "Identifiant de produit invalide." });
    }

    var name = normalizeName(req.body);
    var price = normalizePrice(req.body);
    var categoryId = normalizeCategoryId(req.body);
    var image = normalizeImage(req.body);

    if (!name) {
      return res.status(400).json({ message: "Le nom du produit est requis." });
    }
    if (price == null) {
      return res.status(400).json({ message: "Le prix doit être un nombre positif ou nul." });
    }
    if (!categoryId) {
      return res.status(400).json({ message: "category_id est requis et doit être valide." });
    }

    var restaurantId = await getRestaurantIdForUser(req.user.id);
    if (!restaurantId) {
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    var allowedCategory = await categoryBelongsToRestaurant(categoryId, restaurantId);
    if (!allowedCategory) {
      return res.status(400).json({ message: "La catégorie n'appartient pas à votre restaurant." });
    }

    var pool = getPool();
    var [result] = await pool.query(
      "UPDATE products SET category_id = ?, name = ?, price = ?, image = ? WHERE id = ? AND restaurant_id = ?",
      [categoryId, name, price, image, productId, restaurantId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Produit introuvable." });
    }

    return res.json({
      product: {
        id: productId,
        restaurant_id: restaurantId,
        category_id: categoryId,
        name: name,
        price: price,
        image: image,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function deleteProduct(req, res) {
  try {
    var productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId < 1) {
      return res.status(400).json({ message: "Identifiant de produit invalide." });
    }

    var restaurantId = await getRestaurantIdForUser(req.user.id);
    if (!restaurantId) {
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    var pool = getPool();
    var [result] = await pool.query("DELETE FROM products WHERE id = ? AND restaurant_id = ?", [
      productId,
      restaurantId,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Produit introuvable." });
    }

    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

module.exports = {
  listProducts: listProducts,
  createProduct: createProduct,
  updateProduct: updateProduct,
  deleteProduct: deleteProduct,
};
