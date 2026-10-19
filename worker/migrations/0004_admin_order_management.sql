CREATE TABLE IF NOT EXISTS customers (
  customer_id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT NOT NULL DEFAULT '',
  default_address TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (customer_email COLLATE NOCASE);

CREATE TABLE orders_new (
  order_id TEXT PRIMARY KEY,
  payment_id TEXT UNIQUE,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('paid', 'unpaid')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('razorpay', 'manual')),
  order_status TEXT NOT NULL CHECK (
    order_status IN ('received', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled')
  ),
  customer_id TEXT REFERENCES customers (customer_id),
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
  event_date TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

INSERT INTO orders_new (
  order_id, payment_id, payment_status, payment_method, order_status, customer_id,
  customer_name, customer_phone, customer_email, delivery_address, items_json,
  amount_paise, currency, delivery_method, distance_km, policies_accepted,
  event_date, created_at
)
SELECT
  order_id, payment_id, payment_status, 'razorpay', 'received', NULL,
  customer_name, customer_phone, customer_email, delivery_address, items_json,
  amount_paise, currency, delivery_method, distance_km, policies_accepted,
  event_date, created_at
FROM orders;

DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_method ON orders (delivery_method);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders (customer_id);
