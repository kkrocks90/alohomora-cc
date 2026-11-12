-- Optional category the flat discount applies to. NULL means every product.
ALTER TABLE flat_discount ADD COLUMN category TEXT;
