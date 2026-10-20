-- Admin-defined custom fields shown on product pages (scope = 'product') or at checkout (scope = 'checkout').
CREATE TABLE custom_fields (
  field_id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('product', 'checkout')),
  label TEXT NOT NULL,
  type TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  required INTEGER NOT NULL DEFAULT 0,
  placeholder TEXT NOT NULL DEFAULT '',
  help_text TEXT NOT NULL DEFAULT '',
  applies_to_json TEXT NOT NULL DEFAULT '{"mode":"all","values":[]}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- Checkout-level answers (a snapshot with labels). Product-level answers are stored on each item in items_json.
ALTER TABLE orders ADD COLUMN custom_json TEXT NOT NULL DEFAULT '';

-- Answers captured when a payment order is created, copied onto the order once payment is verified.
CREATE TABLE pending_order_custom (
  order_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
