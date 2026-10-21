-- Admin-only products typed in while creating manual orders. They are never shown in the store.
CREATE TABLE custom_products (
  product_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
