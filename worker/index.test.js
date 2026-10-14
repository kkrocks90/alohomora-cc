import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.js";

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

test("requires flavour and wrapper selections before creating a payment order", async () => {
  const response = await worker.fetch(
    new Request("https://checkout.example.com/orders", {
      method: "POST",
      headers: {
        Origin: "https://shop.example.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [{ id: "midnight-dark", quantity: 1 }],
        customer: {
          name: "Customer Example",
          phone: "+911234567890",
          email: "customer@example.com",
          address: "123 Sample Street",
          policyConsent: true,
        },
        deliveryLocation: { latitude: 0, longitude: 0 },
      }),
    }),
    {
      ALLOWED_ORIGIN: "https://shop.example.com",
      STORE_LATITUDE: "0",
      STORE_LONGITUDE: "0",
      ORDERS_DB: {},
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
      },
      body: JSON.stringify({
        items,
        customer: {
          name: "Customer Example",
          phone: "+911234567890",
          email: "customer@example.com",
          address: "123 Sample Street",
          policyConsent: true,
        },
        deliveryLocation: { latitude: 0, longitude: 0 },
      }),
    }),
    {
      ALLOWED_ORIGIN: "https://shop.example.com",
      STORE_LATITUDE: "0",
      STORE_LONGITUDE: "0",
      ORDERS_DB: {},
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
          policyConsent: true,
        },
        deliveryLocation: { latitude: 0, longitude: 0 },
      }),
    }),
    {
      ALLOWED_ORIGIN: "https://shop.example.com",
      STORE_LATITUDE: "0",
      STORE_LONGITUDE: "0",
      ORDERS_DB: {},
      RAZORPAY_KEY_ID: "test_key",
      RAZORPAY_KEY_SECRET: "test_secret",
    },
  );

  assert.equal(response.status, 201);
});
