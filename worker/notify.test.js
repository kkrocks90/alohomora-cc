import assert from "node:assert/strict";
import { test } from "node:test";
import { sendOrderEmails } from "./notify.js";

const order = {
  orderId: "CC-1",
  customerName: "Asha <b>",
  customerPhone: "9999999999",
  customerEmail: "asha@example.com",
  deliveryAddress: "1 Main St",
  city: "Chennai",
  state: "TN",
  pincode: "600001",
  deliveryMethod: "delivery",
  items: [{ name: "Truffles", quantity: 2, flavour: "Dark" }],
  amountPaise: 50000,
  amountReceivedPaise: 20000,
};

test("sends owner and customer emails with escaped content", async () => {
  const sent = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => { sent.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); };
  try {
    await sendOrderEmails({ RESEND_API_KEY: "k", LOGIN_FROM_EMAIL: "a@b.com", ADMIN_EMAIL: "owner@b.com" }, order);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0].to, ["owner@b.com"]);
  assert.deepEqual(sent[1].to, ["asha@example.com"]);
  assert.match(sent[0].text, /Partially paid/);
  assert.ok(!sent[0].html.includes("<b>"));
});

test("does nothing when email is not configured", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("should not be called"); };
  try {
    await sendOrderEmails({}, order);
  } finally {
    globalThis.fetch = original;
  }
});
