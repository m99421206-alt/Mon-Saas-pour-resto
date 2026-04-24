const { getPool } = require("../config/database");

async function getPublicMenu(req, res) {
  try {
    var restaurantId = Number(req.params.restaurantId);
    if (!Number.isInteger(restaurantId) || restaurantId < 1) {
      return res.status(400).json({ message: "Identifiant de restaurant invalide." });
    }

    var pool = getPool();

    var [restaurants] = await pool.query(
      "SELECT id, name, description FROM restaurants WHERE id = ? LIMIT 1",
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
      "SELECT id, restaurant_id, category_id, name, price, image FROM products WHERE restaurant_id = ? ORDER BY id ASC",
      [restaurantId]
    );

    var productsByCategory = {};
    for (var i = 0; i < products.length; i += 1) {
      var p = products[i];
      if (!productsByCategory[p.category_id]) {
        productsByCategory[p.category_id] = [];
      }
      productsByCategory[p.category_id].push({
        id: p.id,
        name: p.name,
        price: p.price,
        image: p.image,
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
