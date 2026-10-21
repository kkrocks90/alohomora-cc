import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";

const origin = "https://chocolatecircle.in";
const adminEmail = "alohomora.chocolatecircle@gmail.com";

function makeDatabase() {
  const database = {
    order: {
      order_id: "CC-1",
      payment_status: "unpaid",
      payment_method: "manual",
      amount_paise: 135000,
      customer_name: "Asha",
      customer_phone: "9876543210",
      customer_email: "",
      payment_link_id: null,
      payment_link_url: null,
    },
    prepare(sql) {
      return {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async first() {
          if (/SELECT email FROM customer_sessions/i.test(sql)) return { email: adminEmail };
          if (/FROM orders WHERE payment_link_id/i.test(sql)) {
            return this.values[0] === database.order.payment_link_id ? database.order : null;
          }
          if (/FROM orders WHERE order_id/i.test(sql)) return database.order;
          return null;
        },
        async run() {
          if (/SET payment_link_id/i.test(sql)) {
            [database.order.payment_link_id, database.order.payment_link_url] = this.values;
          }
          if (/SET payment_status = 'paid', payment_id/i.test(sql)) {
            database.order.payment_status = "paid";
            database.order.payment_id = this.values[0];
            database.order.payment_method = "razorpay";
          }
          if (/SET payment_status = 'paid' WHERE/i.test(sql)) database.order.payment_status = "paid";
          return { meta: { changes: 1 } };
        },
      };
    },
  };
  return database;
}

function adminRequest(path, body) {
  return new Request(`https://worker.test${path}`, {
    method: "POST",
    headers: { Origin: origin, Authorization: `Bearer ${"a".repeat(64)}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeEnv(database) {
  return {
    ALLOWED_ORIGIN: origin,
    ADMIN_EMAIL: adminEmail,
    AUTH_TOKEN_SECRET: "test-secret",
    RAZORPAY_KEY_ID: "key",
    RAZORPAY_KEY_SECRET: "secret",
    RAZORPAY_WEBHOOK_SECRET: "whsec",
    ORDERS_DB: database,
  };
}

async function sign(body, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

test("admin can create and reuse a payment link for an unpaid manual order", async (context) => {
  const database = makeDatabase();
  const calls = [];
  context.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: "plink_1", short_url: "https://rzp.io/i/abc" }), { status: 200 });
  });
  const env = makeEnv(database);
  const first = await worker.fetch(adminRequest("/admin/orders/payment-link", { orderId: "CC-1" }), env);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).paymentLinkUrl, "https://rzp.io/i/abc");
  assert.equal(calls[0].body.amount, 135000);
  assert.equal(calls[0].body.reference_id, "CC-1");
  const second = await worker.fetch(adminRequest("/admin/orders/payment-link", { orderId: "CC-1" }), env);
  assert.equal((await second.json()).reused, true);
  assert.equal(calls.length, 1);
});

test("payment link webhook marks the order paid only with a valid signature", async () => {
  const database = makeDatabase();
  database.order.payment_link_id = "plink_1";
  const env = makeEnv(database);
  const body = JSON.stringify({
    event: "payment_link.paid",
    payload: {
      payment_link: { entity: { id: "plink_1", status: "paid", amount_paid: 135000 } },
      payment: { entity: { id: "pay_1", amount: 135000 } },
    },
  });
  const bad = await worker.fetch(
    new Request("https://worker.test/razorpay/webhook", { method: "POST", headers: { "X-Razorpay-Signature": "0".repeat(64) }, body }),
    env,
  );
  assert.equal(bad.status, 400);
  assert.equal(database.order.payment_status, "unpaid");
  const good = await worker.fetch(
    new Request("https://worker.test/razorpay/webhook", { method: "POST", headers: { "X-Razorpay-Signature": await sign(body, "whsec") }, body }),
    env,
  );
  assert.equal(good.status, 200);
  assert.equal(database.order.payment_status, "paid");
  assert.equal(database.order.payment_id, "pay_1");
});

test("admin can mark a manual order as paid", async () => {
  const database = makeDatabase();
  const response = await worker.fetch(adminRequest("/admin/orders/mark-paid", { orderId: "CC-1" }), makeEnv(database));
  assert.equal(response.status, 200);
  assert.equal(database.order.payment_status, "paid");
});
