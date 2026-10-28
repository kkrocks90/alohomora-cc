import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";
import products from "../src/data/products.json" with { type: "json" };

const origin = "https://chocolatecircle.in";
const adminEmail = "alohomora.chocolatecircle@gmail.com";

function makeDatabase(order) {
  const database = {
    order,
    updates: [],
    prepare(sql) {
      return {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async first() {
          if (/SELECT email FROM customer_sessions/i.test(sql)) return { email: adminEmail };
          if (/FROM customers WHERE customer_id/i.test(sql)) {
            return {
              customer_id: "c1",
              customer_name: "Asha",
              customer_phone: "9876543210",
              customer_email: "asha@example.com",
              default_address: "1 Main Rd",
              city: "Chennai",
              state: "Tamil Nadu",
              pincode: "600001",
            };
          }
          if (/FROM custom_products WHERE name_key/i.test(sql)) return { product_id: "custom_test" };
          if (/FROM orders WHERE order_id/i.test(sql)) return database.order;
          return null;
        },
        async run() {
          if (/^\s*UPDATE orders SET/i.test(sql)) database.updates.push(this.values);
          return { meta: { changes: 1 } };
        },
      };
    },
  };
  return database;
}

function call(database, body) {
  const request = new Request("https://worker.test/admin/orders/update", {
    method: "POST",
    headers: { Origin: origin, Authorization: `Bearer ${"a".repeat(64)}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return worker.fetch(request, {
    ALLOWED_ORIGIN: origin,
    ADMIN_EMAIL: adminEmail,
    AUTH_TOKEN_SECRET: "test-secret",
    ORDERS_DB: database,
  });
}

const baseBody = {
  orderId: "CC-1",
  customerId: "c1",
  deliveryMethod: "Porter (manual booking)",
  eventDate: "",
  items: [{ id: "custom", custom: true, name: "Gift box", unitPriceRupees: 250, quantity: 4 }],
};

test("edits a manual order and recomputes the total", async () => {
  const database = makeDatabase({ payment_method: "manual", payment_status: "unpaid", amount_paise: 5000, payment_link_id: null });
  const response = await call(database, baseBody);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).amountPaise, 100000);
  assert.equal(database.updates.length, 1);
});

test("allows a price override on catalogue items", async () => {
  const database = makeDatabase({ payment_method: "manual", payment_status: "unpaid", amount_paise: 5000, payment_link_id: null });
  const product = products[0];
  const response = await call(database, {
    ...baseBody,
    items: [{ id: product.id, quantity: 2, unitPriceRupees: 100, flavour: product.flavours[0] ?? "", wrapper: "" }],
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).amountPaise, 20000);
});

test("refuses to edit non-manual orders", async () => {
  const database = makeDatabase({ payment_method: "razorpay", payment_status: "paid", amount_paise: 5000, payment_link_id: null });
  const response = await call(database, baseBody);
  assert.equal(response.status, 400);
  assert.equal(database.updates.length, 0);
});

test("returns 404 for unknown orders", async () => {
  const database = makeDatabase(null);
  const response = await call(database, baseBody);
  assert.equal(response.status, 404);
});
