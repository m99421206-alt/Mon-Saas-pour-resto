const { getPool } = require("../config/database");

async function getPublicMenu(req, res) {
  try {
    var restaurantId = Number(req.params.restaurantId);
    if (!Number.isInteger(restaurantId) || restaurantId < 1) {
      return res.status(400).json({ message: "Identifiant de restaurant invalide." });
    }

    var pool = getPool();

    var [restaurants] = await pool.query(
      "SELECT id, name, description, whatsapp, logo_url, banner_url, theme_color FROM restaurants WHERE id = ? LIMIT 1",
      [restaurantId]
    );
    if (!restaurants.length) {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }

    var [categories] = await pool.query(
      "SELECT id, restaurant_id, name FROM categories WHERE restaurant_id = ? ORDER BY id ASC",
      [restaurantId]
    );

    var [products] = await pool.query(
      "SELECT id, restaurant_id, category_id, name, description, price, image, has_sizes FROM products WHERE restaurant_id = ? ORDER BY id DESC",
      [restaurantId]
    );

    var variantsByProduct = {};
    if (products.length) {
      var productIds = products.map(function (product) {
        return product.id;
      });
      var [variants] = await pool.query(
        "SELECT id, product_id, name, price, image, sort_order FROM product_variants WHERE product_id IN (?) ORDER BY product_id ASC, sort_order DESC, id DESC",
        [productIds]
      );
      for (var v = 0; v < variants.length; v += 1) {
        var variant = variants[v];
        if (!variantsByProduct[variant.product_id]) {
          variantsByProduct[variant.product_id] = [];
        }
        variantsByProduct[variant.product_id].push({
          id: variant.id,
          name: variant.name,
          price: variant.price,
          image: variant.image,
        });
      }
    }

    var productsByCategory = {};
    for (var i = 0; i < products.length; i += 1) {
      var p = products[i];
      if (!productsByCategory[p.category_id]) {
        productsByCategory[p.category_id] = [];
      }
      productsByCategory[p.category_id].push({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        image: p.image,
        has_sizes: p.has_sizes,
        variants: variantsByProduct[p.id] || [],
      });
    }

    var menu = [];
    for (var j = 0; j < categories.length; j += 1) {
      var c = categories[j];
      menu.push({
        id: c.id,
        name: c.name,
        products: productsByCategory[c.id] || [],
      });
    }

    return res.json({
      restaurant: restaurants[0],
      categories: menu,
    });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

module.exports = {
  getPublicMenu: getPublicMenu,
};
