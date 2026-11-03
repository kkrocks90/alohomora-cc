-- Master flavour list. extra_price (whole rupees, may be 0) is added to the unit price of any product ordered in that flavour.
CREATE TABLE IF NOT EXISTS flavours (
  name TEXT PRIMARY KEY,
  extra_price INTEGER NOT NULL DEFAULT 0 CHECK (extra_price >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO flavours (name, extra_price, sort_order)
SELECT DISTINCT value, 0, 100 FROM products, json_each(products.flavours) WHERE value != '';

INSERT OR IGNORE INTO flavours (name, extra_price, sort_order) VALUES ('Assorted', 0, 200);
