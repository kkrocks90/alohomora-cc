ALTER TABLE orders ADD COLUMN amount_received_paise INTEGER NOT NULL DEFAULT 0;

UPDATE orders
SET amount_received_paise = amount_paise
WHERE payment_status = 'paid' AND payment_method <> 'promo';
