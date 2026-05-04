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

function normalizeDescription(body) {
  if (!body || body.description == null || body.description === "") {
    return null;
  }
  if (typeof body.description !== "string") {
    return null;
  }
  return body.description.trim() || null;
}

function normalizeHasSizes(body) {
  if (!body || body.has_sizes == null) {
    return 1;
  }
  return body.has_sizes === true || body.has_sizes === 1 || body.has_sizes === "1" ? 1 : 0;
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

function normalizeVariants(body) {
  if (!body || !Array.isArray(body.variants)) {
    return [];
  }

  var variants = [];
  for (var i = 0; i < body.variants.length; i += 1) {
    var item = body.variants[i] || {};
    var name = typeof item.name === "string" ? item.name.trim() : "";
    var price = Number(item.price);
    var image = typeof item.image === "string" ? item.image.trim() : null;

    if (name && Number.isFinite(price) && price >= 0) {
      variants.push({
        name: name,
        price: Number(price.toFixed(2)),
        image: image || null,
        sort_order: variants.length,
      });
    }
  }

  return variants;
}

async function attachVariants(pool, products) {
  if (!products.length) {
    return products;
  }

  var ids = products.map(function (product) {
    return product.id;
  });
  var [variants] = await pool.query(
    "SELECT id, product_id, name, price, image, sort_order FROM product_variants WHERE product_id IN (?) ORDER BY product_id ASC, sort_order DESC, id DESC",
    [ids]
  );
  var byProduct = {};
  for (var i = 0; i < variants.length; i += 1) {
    var variant = variants[i];
    if (!byProduct[variant.product_id]) {
      byProduct[variant.product_id] = [];
    }
    byProduct[variant.product_id].push(variant);
  }

  return products.map(function (product) {
    product.variants = byProduct[product.id] || [];
    return product;
  });
}

async function replaceProductVariants(connection, productId, variants) {
  await connection.query("DELETE FROM product_variants WHERE product_id = ?", [productId]);

  for (var i = 0; i < variants.length; i += 1) {
    var variant = variants[i];
    await connection.query(
      "INSERT INTO product_variants (product_id, name, price, image, sort_order) VALUES (?, ?, ?, ?, ?)",
      [productId, variant.name, variant.price, variant.image, variant.sort_order]
    );
  }
}

async function listProducts(req, res) {
  try {
    var restaurantId = await getRestaurantIdForUser(req.user.id);
    if (!restaurantId) {
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    var pool = getPool();
    var [rows] = await pool.query(
      "SELECT id, restaurant_id, category_id, name, description, price, image, has_sizes FROM products WHERE restaurant_id = ? ORDER BY id DESC",
      [restaurantId]
    );
    rows = await attachVariants(pool, rows);
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
    var description = normalizeDescription(req.body);
    var hasSizes = normalizeHasSizes(req.body);
    var variants = normalizeVariants(req.body);
    if (hasSizes && !variants.length) {
      hasSizes = 0;
    }

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
    var connection = await pool.getConnection();
    var result;
    try {
      await connection.beginTransaction();
      var insertResult = await connection.query(
        "INSERT INTO products (restaurant_id, category_id, name, description, price, image, has_sizes) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [restaurantId, categoryId, name, description, price, image, hasSizes]
      );
      result = insertResult[0];
      await replaceProductVariants(connection, result.insertId, hasSizes ? variants : []);
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    return res.status(201).json({
      product: {
        id: result.insertId,
        restaurant_id: restaurantId,
        category_id: categoryId,
        name: name,
        description: description,
        price: price,
        image: image,
        has_sizes: hasSizes,
        variants: hasSizes ? variants : [],
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
    var description = normalizeDescription(req.body);
    var hasSizes = normalizeHasSizes(req.body);
    var variants = normalizeVariants(req.body);
    if (hasSizes && !variants.length) {
      hasSizes = 0;
    }

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
    var connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      var updateResult = await connection.query(
        "UPDATE products SET category_id = ?, name = ?, description = ?, price = ?, image = ?, has_sizes = ? WHERE id = ? AND restaurant_id = ?",
        [categoryId, name, description, price, image, hasSizes, productId, restaurantId]
      );
      var result = updateResult[0];

      if (result.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Produit introuvable." });
      }

      await replaceProductVariants(connection, productId, hasSizes ? variants : []);
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    return res.json({
      product: {
        id: productId,
        restaurant_id: restaurantId,
        category_id: categoryId,
        name: name,
        description: description,
        price: price,
        image: image,
        has_sizes: hasSizes,
        variants: hasSizes ? variants : [],
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
