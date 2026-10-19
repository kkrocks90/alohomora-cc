import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.js";
import {
  getCustomerOrders,
  logoutCustomer,
  normalizeCustomerEmail,
  requestLoginCode,
  updateCustomerProfile,
  verifyLoginCode,
} from "./customer-auth.js";

const configuredEnv = {
  ALLOWED_ORIGIN: "https://shop.example.com",
  AUTH_TOKEN_SECRET: "a-secret-with-at-least-32-characters",
  LOGIN_FROM_EMAIL: "Shop <orders@example.com>",
  RESEND_API_KEY: "test-resend-key",
};

test("normalizes valid customer email and rejects malformed addresses", () => {
  assert.equal(normalizeCustomerEmail("  Customer@Example.com "), "customer@example.com");
  assert.equal(normalizeCustomerEmail("not-an-email"), null);
  assert.equal(normalizeCustomerEmail(""), null);
});

test("signed-in customers can save profile details tied to their verified email", async () => {
  const database = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => {
              if (/SELECT email FROM customer_sessions/i.test(sql)) {
                return { email: "customer@example.com" };
              }
              if (/INSERT INTO customers/i.test(sql)) {
                assert.equal(values[3], "customer@example.com");
                assert.equal(values[1], "Customer Example");
                assert.equal(values[2], "+911234567890");
                assert.equal(values[4], "123 Sample Street");
                return { customer_id: values[0] };
              }
              return null;
            },
          };
        },
      };
    },
  };
  const response = await updateCustomerProfile(
    new Request("https://checkout.example.com/auth/profile/update", {
      method: "POST",
      headers: { Authorization: `Bearer ${"a".repeat(64)}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: " Customer Example ",
        phone: " +911234567890 ",
        address: " 123 Sample Street ",
        city: " Chennai ",
        state: " Tamil Nadu ",
        pincode: "600001",
      }),
    }),
    { ...configuredEnv, ORDERS_DB: database },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.profile, {
    name: "Customer Example",
    phone: "+911234567890",
    email: "customer@example.com",
    address: "123 Sample Street",
    city: "Chennai",
    state: "Tamil Nadu",
    pincode: "600001",
  });
});

test("first-time customers can request a code without revealing account existence", async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 200 });
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const database = {
    prepare(sql) {
      assert.match(sql, /INSERT INTO customer_login_codes/i);
      return {
        bind(email) {
          assert.equal(email, "customer@example.com");
          return { run: async () => ({ meta: { changes: 1 } }) };
        },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://checkout.example.com/auth/request-code", {
      method: "POST",
      headers: {
        Origin: configuredEnv.ALLOWED_ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "Customer@Example.com" }),
    }),
    { ...configuredEnv, ORDERS_DB: database },
  );

  assert.equal(response.status, 202);
  assert.match((await response.json()).message, /if we can send a sign-in code/i);
});

test("customer sign-in code endpoint requires configured email delivery", async () => {
  const response = await worker.fetch(
    new Request("https://checkout.example.com/auth/request-code", {
      method: "POST",
      headers: {
        Origin: configuredEnv.ALLOWED_ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "customer@example.com" }),
    }),
    { ...configuredEnv, ORDERS_DB: {}, RESEND_API_KEY: "" },
  );

  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not configured/i);
});

test("CORS preflight permits authorization for account sessions", async () => {
  const response = await worker.fetch(
    new Request("https://checkout.example.com/auth/orders", {
      method: "OPTIONS",
      headers: { Origin: configuredEnv.ALLOWED_ORIGIN },
    }),
    configuredEnv,
  );

  assert.equal(response.status, 204);
  assert.match(response.headers.get("Access-Control-Allow-Headers") ?? "", /Authorization/i);
});

test("one-time email code grants access to paid orders and logout revokes the session", async (context) => {
  const database = {
    challenge: null,
    sessions: new Map(),
    customers: new Map(),
    prepare(sql) {
      return {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async first() {
          if (/SELECT code_hash, expires_at, attempts/i.test(sql)) {
            const challenge = database.challenge;
            return this.values[0] === challenge?.email
              ? {
                  code_hash: challenge.codeHash,
                  expires_at: challenge.expiresAt,
                  attempts: challenge.attempts,
                }
              : null;
          }
          if (/SELECT email FROM customer_sessions/i.test(sql)) {
            const [tokenHash, now] = this.values;
            const session = database.sessions.get(tokenHash);
            return session?.expiresAt > now ? { email: session.email } : null;
          }
          return null;
        },
        async run() {
          if (/INSERT INTO customer_login_codes/i.test(sql)) {
            const [email, codeHash, expiresAt, resendAfter] = this.values;
            if (database.challenge && database.challenge.resendAfter > this.values[4]) {
              return { meta: { changes: 0 } };
            }
            database.challenge = { email, codeHash, expiresAt, resendAfter, attempts: 0 };
            return { meta: { changes: 1 } };
          }
          if (/UPDATE customer_login_codes/i.test(sql)) {
            const [email, now, maxAttempts] = this.values;
            if (!database.challenge || database.challenge.email !== email ||
                database.challenge.expiresAt <= now || database.challenge.attempts >= maxAttempts) {
              return { meta: { changes: 0 } };
            }
            database.challenge.attempts += 1;
            return { meta: { changes: 1 } };
          }
          if (/DELETE FROM customer_login_codes/i.test(sql)) {
            const [email, codeHash] = this.values;
            if (database.challenge?.email === email && database.challenge.codeHash === codeHash) {
              database.challenge = null;
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          if (/INSERT INTO customer_sessions/i.test(sql)) {
            const [tokenHash, email, expiresAt] = this.values;
            database.sessions.set(tokenHash, { email, expiresAt });
            return { meta: { changes: 1 } };
          }
          if (/INSERT INTO customers/i.test(sql)) {
            const [customerId, email, createdAt, updatedAt] = this.values;
            if (![...database.customers.values()].some((customer) => customer.email === email)) {
              database.customers.set(customerId, {
                customerId,
                name: "",
                phone: "",
                email,
                address: "",
                createdAt,
                updatedAt,
              });
            }
            return { meta: { changes: 1 } };
          }
          if (/DELETE FROM customer_sessions/i.test(sql)) {
            return { meta: { changes: database.sessions.delete(this.values[0]) ? 1 : 0 } };
          }
          return { meta: { changes: 0 } };
        },
        async all() {
          return {
            results: [
              {
                order_id: "order_test123",
                payment_status: "paid",
                items_json: JSON.stringify([{ id: "midnight-dark", name: "Midnight Dark", quantity: 1 }]),
                amount_paise: 50000,
                currency: "INR",
                delivery_method: "Porter (manual booking)",
                created_at: "2026-10-14T00:00:00.000Z",
                customer_name: "Customer Example",
                customer_phone: "+911234567890",
                delivery_address: "123 Sample Street",
                event_date: "2026-12-25",
              },
              {
                order_id: "manual_test456",
                payment_status: "unpaid",
                items_json: JSON.stringify([{ id: "midnight-dark", name: "Midnight Dark", quantity: 1 }]),
                amount_paise: 50000,
                currency: "INR",
                delivery_method: "Courier (manual booking)",
                created_at: "2026-10-15T00:00:00.000Z",
                customer_name: "Customer Example",
                customer_phone: "+911234567890",
                delivery_address: "456 Sample Street",
                event_date: "",
              },
            ],
          };
        },
      };
    },
  };
  const originalFetch = globalThis.fetch;
  let emailBody = "";
  globalThis.fetch = async (_url, init) => {
    emailBody = String(init?.body ?? "");
    return new Response("{}", { status: 200 });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const env = { ...configuredEnv, ORDERS_DB: database };
  const makeRequest = (path, body, token) => new Request(`https://checkout.example.com${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const sent = await requestLoginCode(
    makeRequest("/auth/request-code", { email: "Customer@Example.com" }),
    env,
  );
  assert.equal(sent.status, 202);
  const code = JSON.parse(emailBody).text.match(/\b\d{6}\b/)?.[0];
  assert.ok(code);

  const verified = await verifyLoginCode(
    makeRequest("/auth/verify-code", { email: "customer@example.com", code }),
    env,
  );
  assert.equal(verified.status, 200);
  assert.match(verified.body.token, /^[0-9a-f]{64}$/);
  assert.equal(database.customers.size, 1);
  assert.equal([...database.customers.values()][0].email, "customer@example.com");

  const orders = await getCustomerOrders(
    makeRequest("/auth/orders", undefined, verified.body.token),
    env,
  );
  assert.equal(orders.status, 200);
  assert.equal(orders.body.orders[0].orderId, "order_test123");
  assert.equal(orders.body.orders[0].customerName, "Customer Example");
  assert.equal(orders.body.orders[0].customerPhone, "+911234567890");
  assert.equal(orders.body.orders[0].deliveryAddress, "123 Sample Street");
  assert.equal(orders.body.orders[0].eventDate, "2026-12-25");
  assert.equal(orders.body.orders[1].orderId, "manual_test456");
  assert.equal(orders.body.orders[1].status, "unpaid");

  const replay = await verifyLoginCode(
    makeRequest("/auth/verify-code", { email: "customer@example.com", code }),
    env,
  );
  assert.equal(replay.status, 401);

  assert.equal((await logoutCustomer(makeRequest("/auth/logout", undefined, verified.body.token), env)).status, 200);
  assert.equal((await getCustomerOrders(makeRequest("/auth/orders", undefined, verified.body.token), env)).status, 401);
});
