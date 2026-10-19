CREATE TABLE orders_new (
  order_id TEXT PRIMARY KEY,
  payment_id TEXT UNIQUE,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('paid', 'unpaid')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('razorpay', 'manual', 'promo')),
  order_status TEXT NOT NULL CHECK (
    order_status IN ('received', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled')
  ),
  customer_id TEXT REFERENCES customers (customer_id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT NOT NULL DEFAULT '',
  delivery_address TEXT NOT NULL,
  items_json TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  product_subtotal_paise INTEGER NOT NULL CHECK (product_subtotal_paise >= 0),
  discount_paise INTEGER NOT NULL CHECK (discount_paise >= 0),
  promo_code TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL CHECK (currency = 'INR'),
  delivery_method TEXT NOT NULL CHECK (
    delivery_method IN ('Porter (manual booking)', 'Courier (manual booking)')
  ),
  distance_km REAL NOT NULL CHECK (distance_km >= 0),
  policies_accepted TEXT NOT NULL,
  event_date TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

INSERT INTO orders_new (
  order_id, payment_id, payment_status, payment_method, order_status, customer_id,
  customer_name, customer_phone, customer_email, delivery_address, items_json,
  amount_paise, product_subtotal_paise, discount_paise, promo_code, currency,
  delivery_method, distance_km, policies_accepted, event_date, created_at
)
SELECT
  order_id, payment_id, payment_status, payment_method, order_status, customer_id,
  customer_name, customer_phone, customer_email, delivery_address, items_json,
  amount_paise, amount_paise, 0, '', currency, delivery_method, distance_km,
  policies_accepted, event_date, created_at
FROM orders;

DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_method ON orders (delivery_method);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders (customer_id);

CREATE TABLE promo_codes (
  promo_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type TEXT NOT NULL CHECK (type IN ('percentage', 'fixed')),
  percentage INTEGER,
  target_type TEXT CHECK (target_type IN ('all', 'product', 'category')),
  target_value TEXT,
  amount_paise INTEGER,
  minimum_subtotal_paise INTEGER,
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  end_date TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  CHECK (
    (type = 'percentage' AND percentage BETWEEN 1 AND 100 AND target_type IS NOT NULL
      AND amount_paise IS NULL AND minimum_subtotal_paise IS NULL)
    OR
    (type = 'fixed' AND percentage IS NULL AND target_type IS NULL
      AND amount_paise > 0 AND minimum_subtotal_paise >= 0)
  )
);

CREATE INDEX idx_promo_codes_active ON promo_codes (active, end_date);

CREATE TABLE promo_redemptions (
  reservation_id TEXT PRIMARY KEY,
  promo_id TEXT NOT NULL REFERENCES promo_codes (promo_id),
  customer_email TEXT NOT NULL,
  order_id TEXT,
  promo_code TEXT NOT NULL,
  promo_name TEXT NOT NULL,
  subtotal_paise INTEGER NOT NULL CHECK (subtotal_paise >= 0),
  discount_paise INTEGER NOT NULL CHECK (discount_paise >= 0),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'redeemed', 'released')),
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_promo_redemptions_order ON promo_redemptions (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_promo_redemptions_usage ON promo_redemptions (promo_id, status, expires_at);
CREATE INDEX idx_promo_redemptions_customer ON promo_redemptions (promo_id, customer_email, status);
