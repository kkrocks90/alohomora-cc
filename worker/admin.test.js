import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";

const adminToken = "a".repeat(64);
const nonAdminToken = "b".repeat(64);
const origin = "https://chocolatecircle.in";

function makeDatabase(email) {
  const database = {
    email,
    customers: new Map(),
    orders: new Map(),
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async first() {
          if (/SELECT email FROM customer_sessions/i.test(sql)) return { email: database.email };
          if (/FROM customers WHERE customer_id/i.test(sql)) return database.customers.get(this.values[0]) ?? null;
          return null;
        },
        async all() {
          if (/FROM customers/i.test(sql)) return { results: [...database.customers.values()] };
          if (/FROM orders/i.test(sql)) return { results: [...database.orders.values()] };
          return { results: [] };
        },
        async run() {
          if (/INSERT INTO customers/i.test(sql)) {
            const [customerId, customer_name, customer_phone, customer_email, default_address, created_at, updated_at] =
              this.values;
            database.customers.set(customerId, {
              customer_id: customerId,
              customer_name,
              customer_phone,
              customer_email,
              default_address,
              created_at,
              updated_at,
            });
            return { meta: { changes: 1 } };
          }
          if (/INSERT INTO orders/i.test(sql)) {
            const [
              order_id, customer_id, customer_name, customer_phone, customer_email, delivery_address,
              items_json, amount_paise, delivery_method, event_date, created_at,
            ] = this.values;
            database.orders.set(order_id, {
              order_id,
              payment_id: null,
              payment_status: "unpaid",
              payment_method: "manual",
              order_status: "received",
              customer_id,
              customer_name,
              customer_phone,
              customer_email,
              delivery_address,
              items_json,
              amount_paise,
              currency: "INR",
              delivery_method,
              event_date,
              created_at,
            });
            return { meta: { changes: 1 } };
          }
          if (/UPDATE orders SET order_status/i.test(sql)) {
            const [orderStatus, orderId] = this.values;
            const order = database.orders.get(orderId);
            if (!order) return { meta: { changes: 0 } };
            order.order_status = orderStatus;
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
      return statement;
    },
  };
  return database;
}

function makeRequest(path, { token = adminToken, body = {} } = {}) {
  return new Request(`https://checkout.example.com${path}`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("admin endpoints reject signed-in non-admin accounts", async () => {
  const env = {
    ALLOWED_ORIGIN: origin,
    ADMIN_EMAIL: "alohomora.chocolatecircle@gmail.com",
    AUTH_TOKEN_SECRET: "test-secret",
    ORDERS_DB: makeDatabase("customer@example.com"),
  };
  const response = await worker.fetch(makeRequest("/admin/data", { token: nonAdminToken }), env);
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /admin access/i);
});

test("admin can save a customer and create an unpaid order at catalog price", async () => {
  const database = makeDatabase("alohomora.chocolatecircle@gmail.com");
  const env = {
    ALLOWED_ORIGIN: origin,
    ADMIN_EMAIL: "alohomora.chocolatecircle@gmail.com",
    AUTH_TOKEN_SECRET: "test-secret",
    ORDERS_DB: database,
  };

  const customerResponse = await worker.fetch(makeRequest("/admin/customers/create", {
    body: {
      name: "Customer Example",
      phone: "+911234567890",
      email: "customer@example.com",
      address: "123 Sample Street",
    },
  }), env);
  assert.equal(customerResponse.status, 201);
  const { customer } = await customerResponse.json();
  assert.equal(database.customers.size, 1);

  const orderResponse = await worker.fetch(makeRequest("/admin/orders/create", {
    body: {
      customerId: customer.customerId,
      address: "456 Gift Street",
      deliveryMethod: "Porter (manual booking)",
      eventDate: "2026-12-25",
      items: [{ id: "product-1001", quantity: 2, flavour: "Dark Chocolate", wrapper: "Blue gift wrap" }],
    },
  }), env);
  assert.equal(orderResponse.status, 201);
  const { orderId } = await orderResponse.json();
  const order = database.orders.get(orderId);
  assert.equal(order.payment_id, null);
  assert.equal(order.payment_status, "unpaid");
  assert.equal(order.payment_method, "manual");
  assert.equal(order.amount_paise, 160000);
  assert.equal(order.delivery_address, "456 Gift Street");
  assert.equal(JSON.parse(order.items_json)[0].unitPriceRupees, 800);

  const dashboardResponse = await worker.fetch(makeRequest("/admin/data"), env);
  assert.equal(dashboardResponse.status, 200);
  const dashboard = await dashboardResponse.json();
  assert.equal(dashboard.orders[0].orderId, orderId);
  assert.equal(dashboard.orders[0].paymentStatus, "unpaid");
  assert.equal(dashboard.customers[0].customerId, customer.customerId);

  const statusResponse = await worker.fetch(makeRequest("/admin/orders/update-status", {
    body: { orderId, orderStatus: "preparing" },
  }), env);
  assert.equal(statusResponse.status, 200);
  assert.equal(database.orders.get(orderId).order_status, "preparing");
});

test("admin manual order validates product flavour availability and status values", async () => {
  const database = makeDatabase("alohomora.chocolatecircle@gmail.com");
  const customer = {
    customer_id: "cus_1",
    customer_name: "Customer Example",
    customer_phone: "+911234567890",
    customer_email: "customer@example.com",
    default_address: "123 Sample Street",
  };
  database.customers.set(customer.customer_id, customer);
  const env = {
    ALLOWED_ORIGIN: origin,
    ADMIN_EMAIL: "alohomora.chocolatecircle@gmail.com",
    AUTH_TOKEN_SECRET: "test-secret",
    ORDERS_DB: database,
  };

  const invalidFlavour = await worker.fetch(makeRequest("/admin/orders/create", {
    body: {
      customerId: customer.customer_id,
      deliveryMethod: "Porter (manual booking)",
      items: [{ id: "product-1001", quantity: 1, flavour: "Unavailable", wrapper: "" }],
    },
  }), env);
  assert.equal(invalidFlavour.status, 400);

  const invalidStatus = await worker.fetch(makeRequest("/admin/orders/update-status", {
    body: { orderId: "missing", orderStatus: "paid" },
  }), env);
  assert.equal(invalidStatus.status, 400);
});
