import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.js";

let testFetch = globalThis.fetch;
Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  get: () => async (url, init) => {
    const target = String(url);
    if (target.startsWith("https://api.postalpincode.in/")) {
      return Response.json([{ Status: "Success", PostOffice: [{ District: "Chennai", State: "Tamil Nadu" }] }]);
    }
    if (target.startsWith("https://nominatim.openstreetmap.org/")) {
      return Response.json([{ lat: "0", lon: "0" }]);
    }
    return testFetch(url, init);
  },
  set: (replacement) => {
    testFetch = replacement;
  },
});

const authenticatedOrdersDb = {
  prepare(sql) {
    return {
      bind() {
        return {
          first: async () => /SELECT email FROM customer_sessions/i.test(sql)
            ? { email: "customer@example.com" }
            : null,
          all: async () => ({ results: [] }),
        };
      },
    };
  },
};

const sessionHeaders = { Authorization: `Bearer ${"a".repeat(64)}` };

test("promo quotes accept repeated products with different cart variants", async () => {
  const promo = {
    promo_id: "promo_quote",
    name: "All products",
    code: "CC-ALL",
    type: "percentage",
    percentage: 10,
    target_type: "all",
    target_value: "",
    amount_paise: null,
    minimum_subtotal_paise: null,
    max_redemptions: null,
    end_date: null,
    active: 1,
  };
  const database = {
    prepare(sql) {
      return {
        bind() {
          return {
            first: async () => {
              if (/SELECT email FROM customer_sessions/i.test(sql)) return { email: "customer@example.com" };
              if (/SELECT \* FROM promo_codes/i.test(sql)) return promo;
              return null;
            },
          };
        },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://checkout.example.com/promos/quote", {
      method: "POST",
      headers: {
        Origin: "https://shop.example.com",
        "Content-Type": "application/json",
        ...sessionHeaders,
      },
      body: JSON.stringify({
        code: "CC-ALL",
        items: [
          { id: "product-1001", quantity: 1 },
          { id: "product-1001", quantity: 1 },
        ],
      }),
    }),
    { ALLOWED_ORIGIN: "https://shop.example.com", ORDERS_DB: database },
  );

  assert.equal(response.status, 200);
  const quote = await response.json();
  assert.equal(quote.subtotalPaise, 160000);
  assert.equal(quote.discountPaise, 16000);
  assert.equal(quote.payablePaise, 144000);
});

test("featured promo endpoint is public and returns a random eligible offer", async () => {
  let query = "";
  const database = {
    prepare(sql) {
      query = sql;
      return {
        bind(...values) {
          assert.equal(values.length, 2);
          return {
            all: async () => ({
              results: [{
                name: "Treat yourself",
                code: "CC-SWEET",
                type: "percentage",
                percentage: 15,
                target_type: "product",
                target_value: "product-1001",
                amount_paise: null,
                minimum_subtotal_paise: null,
                end_date: "2026-10-31",
              }],
            }),
          };
        },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://checkout.example.com/promos/featured", {
      headers: { Origin: "https://shop.example.com" },
    }),
    { ALLOWED_ORIGIN: "https://shop.example.com", ORDERS_DB: database },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://shop.example.com");
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=60, s-maxage=60");
  assert.match(query, /p\.active = 1/);
  assert.match(query, /p\.end_date IS NULL OR p\.end_date >= \?/);
  assert.match(query, /COUNT\(DISTINCT r\.customer_email\)/);
  assert.deepEqual(await response.json(), {
    promo: {
      name: "Treat yourself",
      code: "CC-SWEET",
      type: "percentage",
      percentage: 15,
      targetType: "product",
      targetLabel: "Choco Cubes (Pack of 40)",
      amountPaise: null,
      minimumSubtotalPaise: null,
      endDate: "2026-10-31",
    },
  });
});

test("featured promo endpoint returns no offer when none are eligible", async () => {
  const database = {
    prepare() {
      return { bind() { return { all: async () => ({ results: [] }) }; } };
    },
  };
  const response = await worker.fetch(
    new Request("https://checkout.example.com/promos/featured", {
      headers: { Origin: "https://shop.example.com" },
    }),
    { ALLOWED_ORIGIN: "https://shop.example.com", ORDERS_DB: database },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { promo: null });
});

test("does not create a payment order when the D1 database is not bound", async () => {
  const response = await worker.fetch(
    new Request("https://checkout.example.com/orders", {
      method: "POST",
      headers: {
        Origin: "https://shop.example.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items: [{ id: "midnight-dark", quantity: 1 }] }),
    }),
    { ALLOWED_ORIGIN: "https://shop.example.com" },
  );

  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /order database is not configured/i);
});

test("rejects checkout PIN codes that are not six-digit Indian postal codes", async () => {
  const response = await worker.fetch(
    new Request("https://checkout.example.com/orders", {
      method: "POST",
      headers: {
        Origin: "https://shop.example.com",
        "Content-Type": "application/json",
        ...sessionHeaders,
      },
      body: JSON.stringify({
        items: [{ id: "product-1001", quantity: 1, flavour: "Chocolate", wrapper: "Blue gift wrap" }],
        customer: {
          name: "Customer Example",
          phone: "+911234567890",
          email: "customer@example.com",
          address: "123 Sample Street",
          city: "Chennai",
          state: "Tamil Nadu",
          pincode: "60001",
          policyConsent: true,
        },
        deliveryLocation: { latitude: 13.08, longitude: 80.27 },
      }),
    }),
    {
      ALLOWED_ORIGIN: "https://shop.example.com",
      STORE_LATITUDE: "13.08",
      STORE_LONGITUDE: "80.27",
      ORDERS_DB: authenticatedOrdersDb,
      RAZORPAY_KEY_ID: "test_key",
      RAZORPAY_KEY_SECRET: "test_secret",
    },
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /six-digit Indian PIN code/i);
});

test("products without customisation accept an empty wrapper and reject a custom one", async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const payload = JSON.parse(String(init?.body));
    return Response.json({ id: "order_test123", amount: payload.amount, currency: "INR" });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const send = (wrapper) => worker.fetch(
    new Request("https://checkout.example.com/orders", {
      method: "POST",
      headers: { Origin: "https://shop.example.com", "Content-Type": "application/json", ...sessionHeaders },
      body: JSON.stringify({
        items: [{ id: "product-1047", quantity: 1, flavour: "", wrapper }],
        customer: {
          name: "Customer Example",
          phone: "+911234567890",
          email: "customer@example.com",
          address: "123 Sample Street",
          city: "Chennai",
          state: "Tamil Nadu",
          pincode: "600001",
          policyConsent: true,
        },
        deliveryLocation: { latitude: 0, longitude: 0 },
      }),
    }),
    {
      ALLOWED_ORIGIN: "https://shop.example.com",
      STORE_LATITUDE: "0",
      STORE_LONGITUDE: "0",
      ORDERS_DB: authenticatedOrdersDb,
      RAZORPAY_KEY_ID: "test_key",
      RAZORPAY_KEY_SECRET: "test_secret",
    },
  );
  assert.equal((await send("")).status, 201);
  const rejected = await send("Pink flowers");
  assert.equal(rejected.status, 400);
  assert.match((await rejected.json()).error, /flavour.*wrapper/i);
});

test("requires flavour and wrapper selections before creating a payment order", async () => {
  const response = await worker.fetch(
    new Request("https://checkout.example.com/orders", {
      method: "POST",
      headers: {
        Origin: "https://shop.example.com",
        "Content-Type": "application/json",
        ...sessionHeaders,
      },
      body: JSON.stringify({
        items: [{ id: "midnight-dark", quantity: 1 }],
        customer: {
          name: "Customer Example",
          phone: "+911234567890",
          email: "customer@example.com",
          address: "123 Sample Street",
          city: "Chennai",
          state: "Tamil Nadu",
          pincode: "600001",
          policyConsent: true,
        },
        deliveryLocation: { latitude: 0, longitude: 0 },
      }),
    }),
    {
      ALLOWED_ORIGIN: "https://shop.example.com",
      STORE_LATITUDE: "0",
      STORE_LONGITUDE: "0",
      ORDERS_DB: authenticatedOrdersDb,
      RAZORPAY_KEY_ID: "test_key",
      RAZORPAY_KEY_SECRET: "test_secret",
    },
  );

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /flavour.*wrapper/i);
});

test("includes different selected variants in the Razorpay order notes", async (context) => {
  const originalFetch = globalThis.fetch;
  let notes;
  globalThis.fetch = async (_url, init) => {
    const payload = JSON.parse(String(init?.body));
    notes = payload.notes;
    return Response.json({
      id: "order_test123",
      amount: payload.amount,
      currency: "INR",
    });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const items = [
    ["Chocolate", "pink flowers and a birthday message"],
    ["Dark Chocolate", "blue stars and silver lettering"],
    ["Crispies", "green leaves with a gold ribbon"],
    ["Almonds", "lavender wrapper with happy birthday"],
    ["Nuts", "red hearts and a handwritten note"],
    ["Butterscotch", "cream paper with a blue bow"],
    ["Strawberry", "yellow sunflowers and green trim"],
    ["White Chocolate", "purple dots and a small gift tag"],
  ].map(([flavour, wrapper]) => ({
    id: "product-1001",
    quantity: 1,
    flavour,
    wrapper,
  }));

  const response = await worker.fetch(
    new Request("https://checkout.example.com/orders", {
      method: "POST",
      headers: {
        Origin: "https://shop.example.com",
        "Content-Type": "application/json",
        ...sessionHeaders,
      },
      body: JSON.stringify({
        items,
        customer: {
          name: "Customer Example",
          phone: "+911234567890",
          email: "customer@example.com",
          address: "123 Sample Street",
          city: "Chennai",
          state: "Tamil Nadu",
          pincode: "600001",
          policyConsent: true,
        },
        deliveryLocation: { latitude: 0, longitude: 0 },
      }),
    }),
    {
      ALLOWED_ORIGIN: "https://shop.example.com",
      STORE_LATITUDE: "0",
      STORE_LONGITUDE: "0",
      ORDERS_DB: authenticatedOrdersDb,
      RAZORPAY_KEY_ID: "test_key",
      RAZORPAY_KEY_SECRET: "test_secret",
    },
  );

  assert.equal(response.status, 201);
  const itemNoteParts = Object.entries(notes)
    .filter(([key]) => /^items(?:_[1-7])?$/.test(key))
    .sort(([first], [second]) => {
      const firstIndex = first === "items" ? 0 : Number(first.slice("items_".length));
      const secondIndex = second === "items" ? 0 : Number(second.slice("items_".length));
      return firstIndex - secondIndex;
    })
    .map(([, value]) => value);
  assert.ok(itemNoteParts.length > 1);
  const parsedItems = JSON.parse(itemNoteParts.join(""));
  assert.equal(parsedItems.length, items.length);
  assert.deepEqual(parsedItems[0], [
    "product-1001",
    1,
    800,
    "Chocolate",
    "pink flowers and a birthday message",
  ]);
  assert.deepEqual(parsedItems.at(-1), [
    "product-1001",
    1,
    800,
    "White Chocolate",
    "purple dots and a small gift tag",
  ]);
  assert.deepEqual(JSON.parse(notes.delivery), {
    m: "P",
    d: "0.00",
    c: "Chennai",
    s: "Tamil Nadu",
    p: "600001",
    ok: "1",
  });
});

test("accepts products with no flavour selector when wrapper design is provided", async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const payload = JSON.parse(String(init?.body));
    return Response.json({
      id: "order_no_flavour",
      amount: payload.amount,
      currency: "INR",
    });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await worker.fetch(
    new Request("https://checkout.example.com/orders", {
      method: "POST",
      headers: {
        Origin: "https://shop.example.com",
        "Content-Type": "application/json",
        ...sessionHeaders,
      },
      body: JSON.stringify({
        items: [{
          id: "product-1002",
          quantity: 1,
          flavour: "",
          wrapper: "A red wrapper with a birthday message",
        }],
        customer: {
          name: "Customer Example",
          phone: "+911234567890",
          email: "customer@example.com",
          address: "123 Sample Street",
          city: "Chennai",
          state: "Tamil Nadu",
          pincode: "600001",
          policyConsent: true,
        },
        deliveryLocation: { latitude: 0, longitude: 0 },
      }),
    }),
    {
      ALLOWED_ORIGIN: "https://shop.example.com",
      STORE_LATITUDE: "0",
      STORE_LONGITUDE: "0",
      ORDERS_DB: authenticatedOrdersDb,
      RAZORPAY_KEY_ID: "test_key",
      RAZORPAY_KEY_SECRET: "test_secret",
    },
  );

  assert.equal(response.status, 201);
});

test("requires a signed-in customer before creating or verifying a payment", async () => {
  const unauthenticatedDatabase = {
    prepare() {
      return { bind() { return { first: async () => null }; } };
    },
  };
  for (const path of ["/orders", "/verify"]) {
    const response = await worker.fetch(
      new Request(`https://checkout.example.com${path}`, {
        method: "POST",
        headers: {
          Origin: "https://shop.example.com",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }),
      {
        ALLOWED_ORIGIN: "https://shop.example.com",
        STORE_LATITUDE: "0",
        STORE_LONGITUDE: "0",
        ORDERS_DB: unauthenticatedDatabase,
        RAZORPAY_KEY_ID: "test_key",
        RAZORPAY_KEY_SECRET: "test_secret",
      },
    );
    assert.equal(response.status, 401, `${path} must reject unsigned requests`);
  }
});

test("prevents a signed-in customer from ordering under a different email", async () => {
  const response = await worker.fetch(
    new Request("https://checkout.example.com/orders", {
      method: "POST",
      headers: {
        Origin: "https://shop.example.com",
        "Content-Type": "application/json",
        ...sessionHeaders,
      },
      body: JSON.stringify({
        items: [{ id: "product-1002", quantity: 1, flavour: "", wrapper: "A green wrapper" }],
        customer: {
          name: "Customer Example",
          phone: "+911234567890",
          email: "different@example.com",
          address: "123 Sample Street",
          city: "Chennai",
          state: "Tamil Nadu",
          pincode: "600001",
          policyConsent: true,
        },
        deliveryLocation: { latitude: 0, longitude: 0 },
      }),
    }),
    {
      ALLOWED_ORIGIN: "https://shop.example.com",
      STORE_LATITUDE: "0",
      STORE_LONGITUDE: "0",
      ORDERS_DB: authenticatedOrdersDb,
      RAZORPAY_KEY_ID: "test_key",
      RAZORPAY_KEY_SECRET: "test_secret",
    },
  );
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /match the signed-in account/i);
});

test("validates event dates and includes selected dates in payment notes", async (context) => {
  const originalFetch = globalThis.fetch;
  let notes;
  globalThis.fetch = async (_url, init) => {
    notes = JSON.parse(String(init?.body)).notes;
    return Response.json({ id: "order_event123", amount: 240000, currency: "INR" });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const customer = {
    name: "Customer Example",
    phone: "+911234567890",
    email: "customer@example.com",
    address: "123 Sample Street",
    city: "Chennai",
    state: "Tamil Nadu",
    pincode: "600001",
    policyConsent: true,
  };
  const createRequest = (eventDate) => worker.fetch(
    new Request("https://checkout.example.com/orders", {
      method: "POST",
      headers: {
        Origin: "https://shop.example.com",
        "Content-Type": "application/json",
        ...sessionHeaders,
      },
      body: JSON.stringify({
        items: [{ id: "product-1002", quantity: 1, flavour: "", wrapper: "A blue gift wrapper" }],
        customer: { ...customer, eventDate },
        deliveryLocation: { latitude: 0, longitude: 0 },
      }),
    }),
    {
      ALLOWED_ORIGIN: "https://shop.example.com",
      STORE_LATITUDE: "0",
      STORE_LONGITUDE: "0",
      ORDERS_DB: authenticatedOrdersDb,
      RAZORPAY_KEY_ID: "test_key",
      RAZORPAY_KEY_SECRET: "test_secret",
    },
  );

  const invalid = await createRequest("2026-02-31");
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /valid event date/i);

  const futureDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const valid = await createRequest(futureDate);
  assert.equal(valid.status, 201);
  assert.equal(notes.event_date, futureDate);
});

test("only the signed-in order owner can verify payment and receive the order reference", async (context) => {
  const originalFetch = globalThis.fetch;
  const orderId = "order_verified123";
  const paymentId = "pay_verified123";
  const amount = 80000;
  const secret = "test_secret";
  const notes = {
    customer_name: "Customer Example",
    phone: "+911234567890",
    email: "customer@example.com",
    address: "123 Sample Street",
    items: JSON.stringify([[
      "product-1001",
      1,
      800,
      "Chocolate",
      "A red wrapper with a birthday message",
    ]]),
    delivery_method: "Porter (manual booking)",
    distance_km: "5.25",
    policies_ok: "terms_conditions, privacy_policy, shipping_policy",
  };
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBytes = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${orderId}|${paymentId}`),
  ));
  const signature = Array.from(signatureBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const databaseFor = (email) => {
    const savedOrders = new Map();
    return {
      savedOrders,
      prepare(sql) {
        return {
          bind(...values) {
            return {
              first: async () => {
                if (/SELECT email FROM customer_sessions/i.test(sql)) return { email };
                if (/SELECT payment_id FROM orders/i.test(sql)) {
                  return savedOrders.get(values[0]) ?? null;
                }
                if (/INSERT INTO customers/i.test(sql)) return { customer_id: "cus_customer" };
                return null;
              },
              run: async () => {
                if (/INSERT INTO orders/i.test(sql)) {
                  savedOrders.set(values[0], { payment_id: values[1] });
                }
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    };
  };
  globalThis.fetch = async (url) => {
    if (String(url).includes("/payments/")) {
      return Response.json({
        id: paymentId,
        order_id: orderId,
        status: "captured",
        currency: "INR",
        amount,
      });
    }
    return Response.json({
      id: orderId,
      currency: "INR",
      status: "paid",
      amount,
      amount_due: 0,
      amount_paid: amount,
      notes,
    });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  for (const [email, expectedStatus] of [
    ["different@example.com", 403],
    ["customer@example.com", 200],
  ]) {
    const database = databaseFor(email);
    const response = await worker.fetch(
      new Request("https://checkout.example.com/verify", {
        method: "POST",
        headers: {
          Origin: "https://shop.example.com",
          "Content-Type": "application/json",
          ...sessionHeaders,
        },
        body: JSON.stringify({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature,
        }),
      }),
      {
        ALLOWED_ORIGIN: "https://shop.example.com",
        ORDERS_DB: database,
        RAZORPAY_KEY_ID: "test_key",
        RAZORPAY_KEY_SECRET: secret,
      },
    );
    assert.equal(response.status, expectedStatus);
    if (email === "customer@example.com") {
      assert.equal((await response.json()).orderId, orderId);
      assert.equal(database.savedOrders.size, 1);
    } else {
      assert.equal(database.savedOrders.size, 0);
    }
  }
});

test("text length limits and future-only dates are enforced", async () => {
  const rows = [
    fieldRow({ field_id: "field_len", type: "textarea", config_json: '{"min":3,"max":120}' }),
    fieldRow({ field_id: "field_day", scope: "checkout", label: "Event date", type: "date", required: 0,
      config_json: '{"futureOnly":true}', applies_to_json: '{"mode":"all","values":[]}' }),
  ];
  const saved = [];
  const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  assert.equal((await postCustomOrder(rows, saved, { custom: { field_len: "ab" } })).status, 400);
  assert.equal((await postCustomOrder(rows, saved, { custom: { field_len: "x".repeat(121) } })).status, 400);
  assert.equal((await postCustomOrder(rows, saved, { custom: { field_len: "Happy birthday" }, checkout: { field_day: "2020-01-01" } })).status, 400);
  const ok = await postCustomOrder(rows, saved, { custom: { field_len: "Happy birthday" }, checkout: { field_day: future } });
  assert.equal(ok.status, 201);
});

function customFieldsDb(rows, saved) {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            first: async () => /SELECT email FROM customer_sessions/i.test(sql) ? { email: "customer@example.com" } : null,
            all: async () => ({ results: /FROM custom_fields/i.test(sql) ? rows : [] }),
            run: async () => {
              if (/INTO pending_order_custom/i.test(sql)) saved.push({ orderId: args[0], payload: JSON.parse(args[1]) });
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

const fieldRow = (overrides) => ({
  field_id: "field_a", scope: "product", label: "Message on card", type: "text", config_json: "{}",
  required: 1, placeholder: "", help_text: "", applies_to_json: '{"mode":"products","values":["product-1002"]}',
  sort_order: 0, active: 1, created_at: "2025-01-01T00:00:00.000Z", ...overrides,
});

async function postCustomOrder(rows, saved, { custom, checkout } = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const payload = JSON.parse(String(init?.body));
    return Response.json({ id: "order_custom", amount: payload.amount, currency: "INR" });
  };
  try {
    return await worker.fetch(
      new Request("https://checkout.example.com/orders", {
        method: "POST",
        headers: { Origin: "https://shop.example.com", "Content-Type": "application/json", ...sessionHeaders },
        body: JSON.stringify({
          items: [{ id: "product-1002", quantity: 1, flavour: "", wrapper: "A red wrapper with a message", custom }],
          customFields: checkout,
          customer: {
            name: "Customer Example", phone: "+911234567890", email: "customer@example.com",
            address: "123 Sample Street", city: "Chennai", state: "Tamil Nadu", pincode: "600001", policyConsent: true,
          },
          deliveryLocation: { latitude: 0, longitude: 0 },
        }),
      }),
      {
        ALLOWED_ORIGIN: "https://shop.example.com", STORE_LATITUDE: "0", STORE_LONGITUDE: "0",
        ORDERS_DB: customFieldsDb(rows, saved), RAZORPAY_KEY_ID: "k", RAZORPAY_KEY_SECRET: "s",
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("required product custom fields must be answered", async () => {
  const response = await postCustomOrder([fieldRow({})], []);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Message on card/);
});

test("custom field answers are validated and stored for payment verification", async () => {
  const saved = [];
  const rows = [
    fieldRow({}),
    fieldRow({ field_id: "field_b", scope: "checkout", label: "Gift wrap", type: "dropdown", required: 0,
      config_json: '{"options":["Yes","No"]}', applies_to_json: '{"mode":"all","values":[]}' }),
    fieldRow({ field_id: "field_c", label: "Other product only", applies_to_json: '{"mode":"products","values":["product-1001"]}' }),
  ];
  const bad = await postCustomOrder(rows, saved, { custom: { field_a: "Happy birthday" }, checkout: { field_b: "Maybe" } });
  assert.equal(bad.status, 400);
  const ok = await postCustomOrder(rows, saved, { custom: { field_a: "Happy birthday" }, checkout: { field_b: "Yes" } });
  assert.equal(ok.status, 201);
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].payload, {
    checkout: [{ id: "field_b", label: "Gift wrap", value: "Yes" }],
    items: [[{ id: "field_a", label: "Message on card", value: "Happy birthday" }]],
  });
});
