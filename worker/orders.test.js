import assert from "node:assert/strict";
import test from "node:test";
import { parsePaidOrderNotes, savePaidOrder } from "./orders.js";

function createDatabase() {
  const rows = new Map();
  return {
    rows,
    prepare(query) {
      return {
        bind(...values) {
          return {
            run: async () => {
              if (!query.startsWith("INSERT INTO orders")) {
                throw new Error("Unexpected database write.");
              }
              const [orderId, paymentId, customerName] = values;
              if (rows.has(orderId)) return;
              rows.set(orderId, {
                payment_id: paymentId,
                customer_name: customerName,
              });
            },
            first: async () => {
              if (query !== "SELECT payment_id FROM orders WHERE order_id = ?") {
                throw new Error("Unexpected database query.");
              }
              return rows.get(values[0]) ?? null;
            },
          };
        },
      };
    },
  };
}

const paidOrder = {
  orderId: "order_test123",
  paymentId: "pay_test123",
  customerName: "Customer Example",
  customerPhone: "+911234567890",
  customerEmail: "customer@example.com",
  deliveryAddress: "123 Sample Street",
  items: [{ id: "midnight-dark", name: "Midnight Dark", quantity: 2, unitPriceRupees: 349 }],
  amountPaise: 69800,
  deliveryMethod: "Porter (manual booking)",
  distanceKm: 5.25,
};

function createPaidNotes(overrides = {}) {
  return {
    customer_name: "Customer Example",
    phone: "+911234567890",
    email: "customer@example.com",
    address: "123 Sample Street",
    items: JSON.stringify([["midnight-dark", 2, 349]]),
    delivery_method: "Porter (manual booking)",
    distance_km: "5.25",
    policies_ok: "terms_conditions, privacy_policy, shipping_policy",
    ...overrides,
  };
}

test("reconstructs verified order details from Razorpay order notes", () => {
  const order = parsePaidOrderNotes(
    paidOrder.orderId,
    paidOrder.paymentId,
    createPaidNotes(),
    paidOrder.amountPaise,
  );
  assert.equal(order.customerName, paidOrder.customerName);
  assert.equal(order.deliveryMethod, paidOrder.deliveryMethod);
  assert.deepEqual(order.items, paidOrder.items);
});

test("does not accept paid order notes with tampered price or delivery method", () => {
  assert.throws(
    () => parsePaidOrderNotes(paidOrder.orderId, paidOrder.paymentId, createPaidNotes({
      items: JSON.stringify([["midnight-dark", 1, 349]]),
    }), paidOrder.amountPaise),
    /amount does not match/,
  );
  assert.deepEqual(
    parsePaidOrderNotes(paidOrder.orderId, paidOrder.paymentId, createPaidNotes({
      items: JSON.stringify([["midnight-dark", 2, 350]]),
    }), 70000).items,
    [{ id: "midnight-dark", name: "Midnight Dark", quantity: 2, unitPriceRupees: 350 }],
  );
  assert.throws(
    () => parsePaidOrderNotes(paidOrder.orderId, paidOrder.paymentId, createPaidNotes({
      delivery_method: "Porter (manual booking)",
      distance_km: "15.01",
    }), paidOrder.amountPaise),
    /invalid delivery method/,
  );
});

test("stores a verified paid order once", async () => {
  const database = createDatabase();
  await savePaidOrder(database, paidOrder);

  assert.equal(database.rows.size, 1);
  assert.deepEqual(database.rows.get(paidOrder.orderId), {
    payment_id: paidOrder.paymentId,
    customer_name: paidOrder.customerName,
  });
});

test("makes payment-verification retries idempotent", async () => {
  const database = createDatabase();
  await savePaidOrder(database, paidOrder);
  await savePaidOrder(database, paidOrder);
  assert.equal(database.rows.size, 1);
});

test("does not accept a different payment for an existing order", async () => {
  const database = createDatabase();
  await savePaidOrder(database, paidOrder);

  await assert.rejects(
    savePaidOrder(database, { ...paidOrder, paymentId: "pay_different123", customerName: "Different Customer" }),
    /different recorded payment/,
  );
  assert.equal(database.rows.get(paidOrder.orderId).payment_id, paidOrder.paymentId);
  assert.equal(database.rows.get(paidOrder.orderId).customer_name, paidOrder.customerName);
});
