-- Shop-facing order numbers (CC-YYMMDD-XXXXX) are now the order_id; the Razorpay order id is kept separately.
ALTER TABLE orders ADD COLUMN razorpay_order_id TEXT;

CREATE TABLE order_id_map (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);

INSERT INTO order_id_map (old_id, new_id)
SELECT order_id, 'CC-' || substr(created_at, 3, 2) || substr(created_at, 6, 2) || substr(created_at, 9, 2) || '-' || upper(substr(hex(randomblob(4)), 1, 5))
FROM orders
WHERE order_id LIKE 'order\_%' ESCAPE '\';

UPDATE orders SET razorpay_order_id = order_id WHERE order_id IN (SELECT old_id FROM order_id_map);

UPDATE promo_redemptions
SET order_id = (SELECT new_id FROM order_id_map WHERE old_id = promo_redemptions.order_id)
WHERE order_id IN (SELECT old_id FROM order_id_map);

UPDATE orders
SET order_id = (SELECT new_id FROM order_id_map WHERE old_id = orders.order_id)
WHERE order_id IN (SELECT old_id FROM order_id_map);

DROP TABLE order_id_map;

CREATE UNIQUE INDEX idx_orders_razorpay_order ON orders (razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;
