import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.js";
import {
  getCustomerOrders,
  logoutCustomer,
  normalizeCustomerEmail,
  requestLoginCode,
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

test("customer email-code requests do not reveal whether an order email exists", async () => {
  const database = {
    prepare(sql) {
      assert.match(sql, /SELECT 1 AS found FROM orders/i);
      return {
        bind(email) {
          assert.equal(email, "customer@example.com");
          return { first: async () => null };
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
  assert.match((await response.json()).message, /if a paid order is associated/i);
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
    prepare(sql) {
      return {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async first() {
          if (/SELECT 1 AS found FROM orders/i.test(sql)) return { found: 1 };
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
          if (/DELETE FROM customer_sessions/i.test(sql)) {
            return { meta: { changes: database.sessions.delete(this.values[0]) ? 1 : 0 } };
          }
          return { meta: { changes: 0 } };
        },
        async all() {
          return {
            results: [{
              order_id: "order_test123",
              payment_status: "paid",
              items_json: JSON.stringify([{ id: "midnight-dark", name: "Midnight Dark", quantity: 1 }]),
              amount_paise: 50000,
              currency: "INR",
              delivery_method: "Porter (manual booking)",
              created_at: "2026-10-14T00:00:00.000Z",
            }],
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

  const orders = await getCustomerOrders(
    makeRequest("/auth/orders", undefined, verified.body.token),
    env,
  );
  assert.equal(orders.status, 200);
  assert.equal(orders.body.orders[0].orderId, "order_test123");

  const replay = await verifyLoginCode(
    makeRequest("/auth/verify-code", { email: "customer@example.com", code }),
    env,
  );
  assert.equal(replay.status, 401);

  assert.equal((await logoutCustomer(makeRequest("/auth/logout", undefined, verified.body.token), env)).status, 200);
  assert.equal((await getCustomerOrders(makeRequest("/auth/orders", undefined, verified.body.token), env)).status, 401);
});
