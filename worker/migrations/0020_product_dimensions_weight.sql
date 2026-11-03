-- Optional product dimensions and weight, shown on the product page when set.
ALTER TABLE products ADD COLUMN dimensions TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN weight TEXT NOT NULL DEFAULT '';
