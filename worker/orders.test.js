import assert from "node:assert/strict";
import test from "node:test";
import { parsePaidOrderNotes, savePaidOrder } from "./orders.js";

function createDatabase() {
  const rows = new Map();
  const customers = new Map();
  return {
    rows,
    customers,
    prepare(query) {
      return {
        bind(...values) {
          return {
            run: async () => {
              if (query.startsWith("INSERT INTO orders")) {
                const [orderId, paymentId, , customerName] = values;
                if (rows.has(orderId)) return;
                rows.set(orderId, {
                  payment_id: paymentId,
                  customer_name: customerName,
                  event_date: values[7],
                });
                return;
              }
              if (query.startsWith("UPDATE orders SET customer_id")) {
                rows.get(values[1]).customer_id = values[0];
                return;
              }
              throw new Error("Unexpected database write.");
            },
            first: async () => {
              if (query === "SELECT payment_id FROM orders WHERE order_id = ?") {
                return rows.get(values[0]) ?? null;
              }
              if (query.startsWith("INSERT INTO customers")) {
                const [customerId, customer_name, customer_phone, customer_email, default_address, created_at, updated_at] =
                  values;
                const existing = customers.get(customer_email);
                const customer = existing ?? { customer_id: customerId };
                Object.assign(customer, {
                  customer_name,
                  customer_phone,
                  customer_email,
                  default_address,
                  created_at,
                  updated_at,
                });
                customers.set(customer_email, customer);
                return { customer_id: customer.customer_id };
              }
              throw new Error("Unexpected database query.");
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
  eventDate: "2026-12-25",
  items: [{
    id: "product-1001",
    name: "Choco Cubes (Pack of 40)",
    quantity: 2,
    unitPriceRupees: 800,
    flavour: "Chocolate",
    wrapper: "A red wrapper with a birthday message",
  }],
  amountPaise: 160000,
  deliveryMethod: "Porter (manual booking)",
  distanceKm: 5.25,
};

function createPaidNotes(overrides = {}) {
  return {
    customer_name: "Customer Example",
    phone: "+911234567890",
    email: "customer@example.com",
    address: "123 Sample Street",
    event_date: "2026-12-25",
    items: JSON.stringify([["product-1001", 2, 800, "Chocolate", "A red wrapper with a birthday message"]]),
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
  assert.throws(
    () => parsePaidOrderNotes(paidOrder.orderId, paidOrder.paymentId, createPaidNotes({
      event_date: "2026-02-31",
    }), paidOrder.amountPaise),
    /invalid event date/i,
  );
  assert.equal(order.customerName, paidOrder.customerName);
  assert.equal(order.eventDate, paidOrder.eventDate);
  assert.equal(order.deliveryMethod, paidOrder.deliveryMethod);
  assert.deepEqual(order.items, paidOrder.items);
});

test("does not accept paid order notes with tampered price or delivery method", () => {
  assert.throws(
    () => parsePaidOrderNotes(paidOrder.orderId, paidOrder.paymentId, createPaidNotes({
      items: JSON.stringify([["product-1001", 1, 800]]),
    }), paidOrder.amountPaise),
    /amount does not match/,
  );
  assert.deepEqual(
    parsePaidOrderNotes(paidOrder.orderId, paidOrder.paymentId, createPaidNotes({
      items: JSON.stringify([["product-1001", 2, 801, "Chocolate", "A red wrapper with a birthday message"]]),
    }), 160200).items,
    [{
      id: "product-1001",
      name: "Choco Cubes (Pack of 40)",
      quantity: 2,
      unitPriceRupees: 801,
      flavour: "Chocolate",
      wrapper: "A red wrapper with a birthday message",
    }],
  );
  assert.throws(
    () => parsePaidOrderNotes(paidOrder.orderId, paidOrder.paymentId, createPaidNotes({
      delivery_method: "Porter (manual booking)",
      distance_km: "15.01",
    }), paidOrder.amountPaise),
    /invalid delivery method/,
  );
});

test("validates required flavours and wrapper descriptions and preserves product variants", () => {
  const notes = createPaidNotes({
    items: JSON.stringify([
      ["product-1001", 1, 800, "Dark Chocolate", "Floral"],
      ["product-1001", 1, 800, "Almonds", "A blue wrapper with a birthday note"],
    ]),
  });
  const order = parsePaidOrderNotes(paidOrder.orderId, paidOrder.paymentId, notes, 160000);
  assert.equal(order.items.length, 2);
  assert.equal(order.items[0].flavour, "Dark Chocolate");
  assert.equal(order.items[1].wrapper, "A blue wrapper with a birthday note");

  assert.throws(
    () => parsePaidOrderNotes(paidOrder.orderId, paidOrder.paymentId, createPaidNotes({
      items: JSON.stringify([["product-1001", 2, 800, "", "A red wrapper with a birthday message"]]),
    }), paidOrder.amountPaise),
    /invalid product, quantity, flavour, or wrapper/,
  );
  assert.throws(
    () => parsePaidOrderNotes(paidOrder.orderId, paidOrder.paymentId, createPaidNotes({
      items: JSON.stringify([["product-1001", 2, 800, "Chocolate", "  "]]),
    }), paidOrder.amountPaise),
    /invalid product, quantity, flavour, or wrapper/,
  );
  assert.throws(
    () => parsePaidOrderNotes(paidOrder.orderId, paidOrder.paymentId, createPaidNotes({
      items: JSON.stringify([["product-1001", 2, 800, "Chocolate", "x".repeat(121)]]),
    }), paidOrder.amountPaise),
    /invalid product, quantity, flavour, or wrapper/,
  );
  assert.throws(
    () => parsePaidOrderNotes(paidOrder.orderId, paidOrder.paymentId, createPaidNotes({
      items: JSON.stringify([
        ["product-1001", 1, 800, "Dark Chocolate", "Floral"],
        ["product-1001", 1, 800, "Dark Chocolate", "Floral"],
      ]),
    }), paidOrder.amountPaise),
    /duplicate product options/,
  );
});

test("continues to verify paid orders created before product options were added", () => {
  const order = parsePaidOrderNotes(
    paidOrder.orderId,
    paidOrder.paymentId,
    createPaidNotes({ items: JSON.stringify([["product-1001", 2, 800]]) }),
    paidOrder.amountPaise,
  );
  assert.equal(order.items[0].flavour, "Not selected (legacy order)");
  assert.equal(order.items[0].wrapper, "Not selected (legacy order)");
});

test("reconstructs a product order without flavour options", () => {
  const order = parsePaidOrderNotes(
    paidOrder.orderId,
    paidOrder.paymentId,
    createPaidNotes({
      items: JSON.stringify([["product-1002", 1, 2400, "", "A blue wrapper with a gift note"]]),
    }),
    240000,
  );
  assert.equal(order.items[0].name, "Treasure Tin - ₹120 Edition (Pack of 20)");
  assert.equal(order.items[0].flavour, "");
});

test("stores a verified paid order once", async () => {
  const database = createDatabase();
  await savePaidOrder(database, paidOrder);

  assert.equal(database.rows.size, 1);
  assert.equal(database.customers.size, 1);
  assert.equal(database.customers.get(paidOrder.customerEmail).customer_name, paidOrder.customerName);
  assert.equal(database.rows.get(paidOrder.orderId).customer_id, database.customers.get(paidOrder.customerEmail).customer_id);
  assert.deepEqual(database.rows.get(paidOrder.orderId), {
    payment_id: paidOrder.paymentId,
    customer_name: paidOrder.customerName,
    event_date: paidOrder.eventDate,
    customer_id: database.customers.get(paidOrder.customerEmail).customer_id,
  });
});

test("makes payment-verification retries idempotent", async () => {
  const database = createDatabase();
  await savePaidOrder(database, paidOrder);
  await savePaidOrder(database, paidOrder);
  assert.equal(database.rows.size, 1);
});

test("refreshes an existing customer record by email when saving a paid order", async () => {
  const database = createDatabase();
  database.customers.set(paidOrder.customerEmail, {
    customer_id: "cus_saved_customer",
    customer_name: "Old Name",
    customer_phone: "+911111111111",
    customer_email: paidOrder.customerEmail,
    default_address: "Old Address",
  });

  await savePaidOrder(database, paidOrder);

  assert.equal(database.customers.size, 1);
  assert.equal(database.customers.get(paidOrder.customerEmail).customer_id, "cus_saved_customer");
  assert.equal(database.customers.get(paidOrder.customerEmail).customer_name, paidOrder.customerName);
  assert.equal(database.customers.get(paidOrder.customerEmail).default_address, paidOrder.deliveryAddress);
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
