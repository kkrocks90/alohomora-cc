import { writeFile } from "node:fs/promises";

// Pulls the live catalogue from the Worker (D1) so the static storefront is built from admin-managed data.
// Falls back to the committed JSON files when the API is not configured or unreachable.
const apiUrl = (process.env.PUBLIC_CHECKOUT_API_URL ?? "").trim().replace(/\/+$/, "");

if (!apiUrl) {
  console.log("[catalogue] PUBLIC_CHECKOUT_API_URL not set; using bundled products.json");
  process.exit(0);
}

try {
  const response = await fetch(`${apiUrl}/products`, {
    headers: { Origin: "https://chocolatecircle.in" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const { products, categories, hiddenCategories, flavours } = await response.json();
  if (!Array.isArray(products) || products.length === 0) throw new Error("empty catalogue");
  if (!products.every((product) => product.id && product.name && Number.isInteger(product.price) && product.image)) {
    throw new Error("invalid product data");
  }
  await writeFile(new URL("../src/data/products.json", import.meta.url), `${JSON.stringify(products, null, 4)}\n`);
  await writeFile(
    new URL("../src/data/categories.json", import.meta.url),
    `${JSON.stringify(Array.isArray(categories) ? categories : [], null, 4)}\n`,
  );
  await writeFile(
    new URL("../src/data/hidden-categories.json", import.meta.url),
    `${JSON.stringify(Array.isArray(hiddenCategories) ? hiddenCategories : [], null, 4)}\n`,
  );
  if (Array.isArray(flavours) && flavours.length > 0) {
    await writeFile(new URL("../src/data/flavours.json", import.meta.url), `${JSON.stringify(flavours, null, 4)}\n`);
  }
  console.log(`[catalogue] loaded ${products.length} products from ${apiUrl}`);
} catch (error) {
  console.warn(`[catalogue] could not load products (${error.message}); using bundled products.json`);
}

try {
  const response = await fetch(`${apiUrl}/faqs`, {
    headers: { Origin: "https://chocolatecircle.in" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const { faqs } = await response.json();
  if (!Array.isArray(faqs) || !faqs.every((item) => typeof item?.question === "string" && typeof item?.answer === "string")) {
    throw new Error("invalid FAQ data");
  }
  await writeFile(new URL("../src/data/faqs.json", import.meta.url), `${JSON.stringify(faqs, null, 4)}\n`);
  console.log(`[catalogue] loaded ${faqs.length} FAQs`);
} catch (error) {
  console.warn(`[catalogue] could not load FAQs (${error.message}); using bundled faqs.json`);
}
