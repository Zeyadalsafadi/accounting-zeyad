import db from '../db.js';

export function getProductUnits(productId) {
  return db.prepare(`
    SELECT id, product_id, unit_name, conversion_factor, is_base, sort_order
    FROM product_units
    WHERE product_id = ?
    ORDER BY is_base DESC, sort_order ASC, id ASC
  `).all(productId);
}

export function getProductPriceTiers(productId) {
  return db.prepare(`
    SELECT
      t.id,
      t.product_id,
      t.product_unit_id,
      t.tier_code,
      t.tier_name,
      t.price_syp,
      u.unit_name
    FROM product_price_tiers t
    JOIN product_units u ON u.id = t.product_unit_id
    WHERE t.product_id = ?
    ORDER BY u.sort_order ASC, t.tier_code ASC, t.id ASC
  `).all(productId);
}

export function getProductCustomerPrices(productId) {
  return db.prepare(`
    SELECT
      cp.id,
      cp.product_id,
      cp.customer_id,
      cp.product_unit_id,
      cp.price_syp,
      cp.notes,
      u.unit_name,
      c.name AS customer_name
    FROM product_customer_prices cp
    JOIN product_units u ON u.id = cp.product_unit_id
    JOIN customers c ON c.id = cp.customer_id
    WHERE cp.product_id = ?
    ORDER BY c.name ASC, u.sort_order ASC, cp.id ASC
  `).all(productId);
}

export function enrichProducts(products) {
  return products.map((product) => ({
    ...product,
    units: getProductUnits(product.id),
    price_tiers: getProductPriceTiers(product.id),
    customer_prices: getProductCustomerPrices(product.id)
  }));
}

export function resolveProductUnit(productId, unitName = null) {
  if (unitName) {
    return db.prepare(`
      SELECT id, product_id, unit_name, conversion_factor, is_base, sort_order
      FROM product_units
      WHERE product_id = ? AND unit_name = ?
      ORDER BY id ASC
      LIMIT 1
    `).get(productId, unitName);
  }

  return db.prepare(`
    SELECT id, product_id, unit_name, conversion_factor, is_base, sort_order
    FROM product_units
    WHERE product_id = ?
    ORDER BY is_base DESC, sort_order ASC, id ASC
    LIMIT 1
  `).get(productId);
}

export function resolvePriceTier(productId, productUnitId, tierCode = null) {
  if (tierCode) {
    const exact = db.prepare(`
      SELECT id, product_id, product_unit_id, tier_code, tier_name, price_syp
      FROM product_price_tiers
      WHERE product_id = ? AND product_unit_id = ? AND tier_code = ?
      ORDER BY id ASC
      LIMIT 1
    `).get(productId, productUnitId, tierCode);
    if (exact) return exact;
  }

  return db.prepare(`
    SELECT id, product_id, product_unit_id, tier_code, tier_name, price_syp
    FROM product_price_tiers
    WHERE product_id = ? AND product_unit_id = ?
    ORDER BY CASE tier_code WHEN 'RETAIL' THEN 0 ELSE 1 END, id ASC
    LIMIT 1
  `).get(productId, productUnitId);
}

export function resolveCustomerPrice(productId, customerId, productUnitId) {
  if (!customerId) return null;
  return db.prepare(`
    SELECT
      cp.id,
      cp.product_id,
      cp.customer_id,
      cp.product_unit_id,
      cp.price_syp,
      cp.notes,
      c.name AS customer_name
    FROM product_customer_prices cp
    JOIN customers c ON c.id = cp.customer_id
    WHERE cp.product_id = ? AND cp.customer_id = ? AND cp.product_unit_id = ?
    ORDER BY cp.id ASC
    LIMIT 1
  `).get(productId, customerId, productUnitId);
}
