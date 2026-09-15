const { getPool } = require("../config/database");
const { getPublicMenuLookupPlan } = require("../utils/publicMenuLookup");

var PUBLIC_MENU_SELECT =
  "SELECT id, name, description, whatsapp, logo_url, banner_url, theme_color, slug, COALESCE(menu_suspended, 0) AS menu_suspended FROM restaurants";
var PUBLIC_MENU_SELECT_LEGACY =
  "SELECT id, name, description, whatsapp, logo_url, banner_url, theme_color, slug FROM restaurants";

async function fetchPublicRestaurantRow(pool, plan) {
  try {
    if (plan.trySlug) {
      var [bySlug] = await pool.query(
        PUBLIC_MENU_SELECT + " WHERE slug = ? LIMIT 1",
        [plan.key],
      );
      if (bySlug.length) {
        return bySlug[0];
      }
    }

    if (plan.tryId != null) {
      var [byId] = await pool.query(
        PUBLIC_MENU_SELECT + " WHERE id = ? LIMIT 1",
        [plan.tryId],
      );
      if (byId.length) {
        return byId[0];
      }
    }

    return null;
  } catch (pickErr) {
    if (!(pickErr && pickErr.code === "ER_BAD_FIELD_ERROR")) {
      throw pickErr;
    }
    if (plan.tryId == null) {
      return null;
    }
    var [legacyRows] = await pool.query(
      PUBLIC_MENU_SELECT_LEGACY + " WHERE id = ? LIMIT 1",
      [plan.tryId],
    );
    return legacyRows.length ? legacyRows[0] : null;
  }
}

async function getPublicMenu(req, res) {
  try {
    var param = String(
      req.params.restaurantId || req.params.restaurantSlug || "",
    ).trim();
    var query = req.query;
    if (req.params.restaurantSlug && !req.params.restaurantId) {
      query = Object.assign({}, req.query || {}, { lookup: "slug" });
    }
    var plan = getPublicMenuLookupPlan(param, query);
    if (!plan.key || (!plan.trySlug && plan.tryId == null)) {
      return res
        .status(400)
        .json({ message: "Identifiant de restaurant invalide." });
    }

    var pool = getPool();

    var row = await fetchPublicRestaurantRow(pool, plan);
    if (!row) {
      return res.status(404).json({ message: "Restaurant introuvable." });
    }

    var ms = row.menu_suspended;
    if (ms === 1 || ms === true || ms === "1") {
      return res
        .status(403)
        .json({ message: "Ce menu est temporairement indisponible." });
    }

    var resolvedRestaurantId = row.id;

    var [categories] = await pool.query(
      "SELECT id, restaurant_id, name FROM categories WHERE restaurant_id = ? ORDER BY id ASC",
      [resolvedRestaurantId],
    );

    var products;
    try {
      var productRows = await pool.query(
        "SELECT id, restaurant_id, category_id, name, description, price, image, has_sizes FROM products WHERE restaurant_id = ? AND is_visible = 1 ORDER BY id DESC",
        [resolvedRestaurantId],
      );
      products = productRows[0];
    } catch (productErr) {
      if (!(productErr && productErr.code === "ER_BAD_FIELD_ERROR")) {
        throw productErr;
      }
      var legacyProductRows = await pool.query(
        "SELECT id, restaurant_id, category_id, name, description, price, image, has_sizes FROM products WHERE restaurant_id = ? ORDER BY id DESC",
        [resolvedRestaurantId],
      );
      products = legacyProductRows[0];
    }

    var variantsByProduct = {};
    if (products.length) {
      var productIds = products.map(function (product) {
        return product.id;
      });
      var [variants] = await pool.query(
        "SELECT id, product_id, name, price, image, sort_order FROM product_variants WHERE product_id IN (?) ORDER BY product_id ASC, sort_order DESC, id DESC",
        [productIds],
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
      restaurant: {
        id: row.id,
        name: row.name,
        slug: row.slug || null,
        description: row.description,
        whatsapp: row.whatsapp,
        logo_url: row.logo_url,
        banner_url: row.banner_url,
        theme_color: row.theme_color,
      },
      categories: menu,
    });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur." });
  }
}

module.exports = {
  getPublicMenu: getPublicMenu,
};
