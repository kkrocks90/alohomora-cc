CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL UNIQUE,
  payment_status TEXT NOT NULL CHECK (payment_status = 'paid'),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT NOT NULL DEFAULT '',
  delivery_address TEXT NOT NULL,
  items_json TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  currency TEXT NOT NULL CHECK (currency = 'INR'),
  delivery_method TEXT NOT NULL CHECK (
    delivery_method IN ('Porter (manual booking)', 'Courier (manual booking)')
  ),
  distance_km REAL NOT NULL CHECK (distance_km >= 0),
  policies_accepted TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_method ON orders (delivery_method);
