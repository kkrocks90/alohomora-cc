import assert from "node:assert/strict";
import test from "node:test";
import { parseProductInput } from "./admin-products.js";

const env = { IMAGE_BASE_URL: "https://img.example.com/" };
const base = {
  name: " Rose Truffles ",
  description: "Soft rose centre.",
  price: 450,
  packSize: "Box of 9",
  tag: "Truffles",
  images: ["https://img.example.com/products/abc123.webp", "product-1001.jpg"],
};

test("parseProductInput accepts up to 3 photos and trims text", () => {
  const product = parseProductInput({ ...base, flavours: ["Rose", "Rose"], extraTags: ["Truffles", "Gifts"] }, env);
  assert.equal(product.name, "Rose Truffles");
  assert.deepEqual(product.images, base.images);
  assert.deepEqual(product.flavours, ["Rose"]);
  assert.deepEqual(product.extraTags, ["Gifts"]);
  assert.equal(product.customizable, true);
  assert.equal(product.active, true);
});

test("parseProductInput rejects 0 or more than 3 photos", () => {
  assert.throws(() => parseProductInput({ ...base, images: [] }, env), /at least one/);
  const four = ["a.jpg", "b.jpg", "c.jpg", "d.jpg"];
  assert.throws(() => parseProductInput({ ...base, images: four }, env), /up to 3/);
});

test("parseProductInput rejects images from other hosts and bad prices", () => {
  assert.throws(() => parseProductInput({ ...base, images: ["https://evil.example/x.jpg"] }, env), /uploaded photo/);
  assert.throws(() => parseProductInput({ ...base, price: 0 }, env), /price/);
  assert.throws(() => parseProductInput({ ...base, price: 10.5 }, env), /price/);
});
