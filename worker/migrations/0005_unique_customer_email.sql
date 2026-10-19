UPDATE customers
SET customer_email = lower(trim(customer_email))
WHERE customer_email <> '';

UPDATE orders
SET customer_email = lower(trim(customer_email))
WHERE customer_email <> '';

WITH ranked_customers AS (
  SELECT
    customer_id,
    lower(trim(customer_email)) AS normalized_email,
    row_number() OVER (
      PARTITION BY lower(trim(customer_email))
      ORDER BY updated_at DESC, created_at ASC, customer_id ASC
    ) AS rank
  FROM customers
  WHERE customer_email <> ''
)
UPDATE orders
SET customer_id = (
  SELECT customer_id
  FROM ranked_customers
  WHERE ranked_customers.normalized_email = lower(trim(orders.customer_email))
    AND ranked_customers.rank = 1
)
WHERE customer_email <> ''
  AND EXISTS (
    SELECT 1
    FROM ranked_customers
    WHERE ranked_customers.normalized_email = lower(trim(orders.customer_email))
  );

WITH ranked_customers AS (
  SELECT
    customer_id,
    row_number() OVER (
      PARTITION BY lower(trim(customer_email))
      ORDER BY updated_at DESC, created_at ASC, customer_id ASC
    ) AS rank
  FROM customers
  WHERE customer_email <> ''
)
DELETE FROM customers
WHERE customer_id IN (
  SELECT customer_id FROM ranked_customers WHERE rank > 1
);

WITH ranked_orders AS (
  SELECT
    customer_name,
    customer_phone,
    customer_email,
    delivery_address,
    created_at,
    row_number() OVER (
      PARTITION BY lower(trim(customer_email))
      ORDER BY created_at DESC, order_id DESC
    ) AS rank
  FROM orders
  WHERE customer_email <> ''
)
INSERT INTO customers (
  customer_id,
  customer_name,
  customer_phone,
  customer_email,
  default_address,
  created_at,
  updated_at
)
SELECT
  'cus_' || lower(hex(randomblob(16))),
  customer_name,
  customer_phone,
  lower(trim(customer_email)),
  delivery_address,
  created_at,
  created_at
FROM ranked_orders
WHERE rank = 1
  AND NOT EXISTS (
    SELECT 1
    FROM customers
    WHERE customers.customer_email = lower(trim(ranked_orders.customer_email)) COLLATE NOCASE
  );

UPDATE orders
SET customer_id = (
  SELECT customer_id
  FROM customers
  WHERE customers.customer_email = lower(trim(orders.customer_email)) COLLATE NOCASE
)
WHERE customer_email <> '';

CREATE UNIQUE INDEX idx_customers_unique_email
  ON customers (customer_email COLLATE NOCASE)
  WHERE customer_email <> '';
