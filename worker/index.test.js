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

