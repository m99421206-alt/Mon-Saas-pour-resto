const { getPool } = require("../config/database");
const { removeUnusedUploads } = require("../utils/uploadCleanup");
const { appendAuditFromRequest, AUDIT_ACTIONS } = require("../utils/auditLog");
const ownership = require("../utils/restaurantOwnership");
const uploadOwnership = require("../utils/uploadOwnership");
const { parseProductBody, parseProductIdParams } = require("../validators/product");

function resolveRestaurantId(req) {
  if (req.restaurantId) {
    return req.restaurantId;
  }
  return null;
}

function collectProductUploadUrls(image, variants) {
  var urls = [];
  if (image) {
    urls.push(image);
  }
  (variants || []).forEach(function (variant) {
    if (variant.image) {
      urls.push(variant.image);
    }
  });
  return urls;
}

async function rejectIfUploadUrlsForbidden(res, restaurantId, image, variants) {
  var uploadStatus = await uploadOwnership.assertUploadUrlsAllowedForRestaurant(
    collectProductUploadUrls(image, variants),
    restaurantId
  );
  if (uploadStatus === "forbidden") {
    await removeUnusedUploads(collectProductUploadUrls(image, variants));
    uploadOwnership.sendUploadForbidden(res);
    return true;
  }
  if (uploadStatus === "invalid") {
    await removeUnusedUploads(collectProductUploadUrls(image, variants));
    res.status(400).json({ message: "Image invalide. Utilisez une image uploadée par AfricaMenu." });
    return true;
  }
  return false;
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

async function replaceProductVariants(pool, productId, variants) {
  await pool.query("DELETE FROM product_variants WHERE product_id = ?", [productId]);

  for (var i = 0; i < variants.length; i += 1) {
    var variant = variants[i];
    await pool.query(
      "INSERT INTO product_variants (product_id, name, price, image, sort_order) VALUES (?, ?, ?, ?, ?)",
      [productId, variant.name, variant.price, variant.image, variant.sort_order]
    );
  }
}

async function listProducts(req, res) {
  try {
    var restaurantId = resolveRestaurantId(req);
    if (!restaurantId) {
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    var pool = getPool();
    var [rows] = await pool.query(
      "SELECT id, restaurant_id, category_id, name, description, price, image, has_sizes, is_visible FROM products WHERE restaurant_id = ? ORDER BY id DESC",
      [restaurantId]
    );
    rows = await attachVariants(pool, rows);
    return res.json({ products: rows });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function createProduct(req, res) {
  var parsed = parseProductBody(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ message: parsed.message });
  }
  var p = parsed.data;
  var name = p.name;
  var price = p.price;
  var categoryId = p.categoryId;
  var image = p.image;
  var description = p.description;
  var hasSizes = p.hasSizes;
  var isVisible = p.isVisible;
  var variants = p.variants;

  try {
    var restaurantId = resolveRestaurantId(req);
    if (!restaurantId) {
      await removeUnusedUploads(collectProductUploadUrls(image, variants));
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    var categoryOwnership = await ownership.assertCategoryOwnedByRestaurant(categoryId, restaurantId);
    if (categoryOwnership === "forbidden") {
      await removeUnusedUploads(collectProductUploadUrls(image, variants));
      return ownership.sendForbidden(res);
    }
    if (categoryOwnership === "not_found") {
      await removeUnusedUploads(collectProductUploadUrls(image, variants));
      return res.status(400).json({ message: "La catégorie n'appartient pas à votre restaurant." });
    }

    if (await rejectIfUploadUrlsForbidden(res, restaurantId, image, variants)) {
      return;
    }

    var pool = getPool();
    var connection = await pool.getConnection();
    var productId;

    try {
      await connection.beginTransaction();

      var [result] = await connection.query(
        "INSERT INTO products (restaurant_id, category_id, name, description, price, image, has_sizes, is_visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [restaurantId, categoryId, name, description, price, image, hasSizes, isVisible]
      );
      productId = result.insertId;

      await replaceProductVariants(connection, productId, hasSizes ? variants : []);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    await appendAuditFromRequest(req, {
      userId: req.user.id,
      restaurantId: restaurantId,
      action: AUDIT_ACTIONS.PRODUCT_CREATE,
      detail: "Ajout produit « " + String(name).slice(0, 160) + " »",
    });

    return res.status(201).json({
      product: {
        id: productId,
        restaurant_id: restaurantId,
        category_id: categoryId,
        name: name,
        description: description,
        price: price,
        image: image,
        has_sizes: hasSizes,
        is_visible: isVisible,
        variants: hasSizes ? variants : [],
      },
    });
  } catch (err) {
    await removeUnusedUploads(collectProductUploadUrls(image, variants));
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function updateProduct(req, res) {
  var idParsed = parseProductIdParams(req.params);
  if (!idParsed.ok) {
    return res.status(400).json({ message: idParsed.message });
  }
  var productId = idParsed.data.id;

  var parsed = parseProductBody(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ message: parsed.message });
  }
  var p = parsed.data;
  var name = p.name;
  var price = p.price;
  var categoryId = p.categoryId;
  var image = p.image;
  var description = p.description;
  var hasSizes = p.hasSizes;
  var isVisible = p.isVisible;
  var variants = p.variants;

  try {
    var restaurantId = resolveRestaurantId(req);
    if (!restaurantId) {
      await removeUnusedUploads(collectProductUploadUrls(image, variants));
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    var productOwnership = await ownership.assertProductOwnedByRestaurant(productId, restaurantId);
    if (productOwnership === "forbidden") {
      await removeUnusedUploads(collectProductUploadUrls(image, variants));
      return ownership.sendForbidden(res);
    }
    if (productOwnership === "not_found") {
      await removeUnusedUploads(collectProductUploadUrls(image, variants));
      return res.status(404).json({ message: "Produit introuvable." });
    }

    var categoryOwnership = await ownership.assertCategoryOwnedByRestaurant(categoryId, restaurantId);
    if (categoryOwnership === "forbidden") {
      await removeUnusedUploads(collectProductUploadUrls(image, variants));
      return ownership.sendForbidden(res);
    }
    if (categoryOwnership === "not_found") {
      await removeUnusedUploads(collectProductUploadUrls(image, variants));
      return res.status(400).json({ message: "La catégorie n'appartient pas à votre restaurant." });
    }

    if (await rejectIfUploadUrlsForbidden(res, restaurantId, image, variants)) {
      return;
    }

    var pool = getPool();
    var connection = await pool.getConnection();
    var oldImages = [];

    try {
      await connection.beginTransaction();

      var [existingProducts] = await connection.query(
        "SELECT image FROM products WHERE id = ? AND restaurant_id = ? LIMIT 1",
        [productId, restaurantId]
      );
      var [existingVariants] = await connection.query("SELECT image FROM product_variants WHERE product_id = ?", [
        productId,
      ]);

      if (existingProducts.length && existingProducts[0].image && existingProducts[0].image !== image) {
        oldImages.push(existingProducts[0].image);
      }
      existingVariants.forEach(function (variant) {
        if (variant.image) {
          oldImages.push(variant.image);
        }
      });

      var [result] = await connection.query(
        "UPDATE products SET category_id = ?, name = ?, description = ?, price = ?, image = ?, has_sizes = ?, is_visible = ? WHERE id = ? AND restaurant_id = ?",
        [categoryId, name, description, price, image, hasSizes, isVisible, productId, restaurantId]
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Produit introuvable." });
      }

      await replaceProductVariants(connection, productId, hasSizes ? variants : []);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      if (connection) {
        connection.release();
      }
    }

    await removeUnusedUploads(oldImages);

    await appendAuditFromRequest(req, {
      userId: req.user.id,
      restaurantId: restaurantId,
      action: AUDIT_ACTIONS.PRODUCT_UPDATE,
      detail: "Modification produit « " + String(name).slice(0, 160) + " »",
    });

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
        is_visible: isVisible,
        variants: hasSizes ? variants : [],
      },
    });
  } catch (err) {
    await removeUnusedUploads(collectProductUploadUrls(image, variants));
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

async function deleteProduct(req, res) {
  try {
    var idParsed = parseProductIdParams(req.params);
    if (!idParsed.ok) {
      return res.status(400).json({ message: idParsed.message });
    }
    var productId = idParsed.data.id;

    var restaurantId = resolveRestaurantId(req);
    if (!restaurantId) {
      return res.status(404).json({ message: "Aucun restaurant associé à ce compte." });
    }

    var productOwnership = await ownership.assertProductOwnedByRestaurant(productId, restaurantId);
    if (productOwnership === "forbidden") {
      return ownership.sendForbidden(res);
    }
    if (productOwnership === "not_found") {
      return res.status(404).json({ message: "Produit introuvable." });
    }

    var pool = getPool();
    var [existingProducts] = await pool.query(
      "SELECT image, name FROM products WHERE id = ? AND restaurant_id = ? LIMIT 1",
      [productId, restaurantId]
    );
    var [existingVariants] = await pool.query("SELECT image FROM product_variants WHERE product_id = ?", [productId]);
    var oldImages = [];

    if (existingProducts.length && existingProducts[0].image) {
      oldImages.push(existingProducts[0].image);
    }
    existingVariants.forEach(function (variant) {
      if (variant.image) {
        oldImages.push(variant.image);
      }
    });

    var [result] = await pool.query("DELETE FROM products WHERE id = ? AND restaurant_id = ?", [
      productId,
      restaurantId,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Produit introuvable." });
    }

    var pname = existingProducts.length && existingProducts[0].name ? String(existingProducts[0].name) : "";

    await removeUnusedUploads(oldImages);

    await appendAuditFromRequest(req, {
      userId: req.user.id,
      restaurantId: restaurantId,
      action: AUDIT_ACTIONS.PRODUCT_DELETE,
      detail: pname
        ? "Suppression produit « " + pname.slice(0, 160) + " »"
        : "Suppression produit",
    });

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
