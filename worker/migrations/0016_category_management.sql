-- Categories can be hidden from the storefront; categories already used by products are saved so they can be managed.
ALTER TABLE catalogue_categories ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO catalogue_categories (name, sort_order)
SELECT DISTINCT tag, 100 FROM products WHERE tag != '';
