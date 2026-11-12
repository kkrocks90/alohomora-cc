import { requireAdmin } from "./admin.js";
import { registerCategories } from "./admin-categories.js";
import { registerFlavours } from "./admin-flavours.js";
import { ensureCatalogue, loadAllProductRows, rowToProduct } from "./catalogue.js";

export const MAX_PRODUCT_IMAGES = 3;
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const BUNDLED_IMAGE = /^[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|svg)$/;
const INPUT_ERROR = /^(Enter|Add|A product|Each|Request)/;

function result(status, body) {
  return { status, body };
}

function text(value, maximum, label, { required = true } = {}) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (required && trimmed.length === 0) throw new Error(`Enter a valid ${label}.`);
  if (trimmed.length > maximum) throw new Error(`Enter a shorter ${label}.`);
  return trimmed;
}

function optionalText(value, maximum, label) {
  return text(value, maximum, label, { required: false });
}

function textList(value, maximumItems, maximumLength, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maximumItems) throw new Error(`Enter a valid list of ${label}.`);
  return [...new Set(value.map((item) => text(item, maximumLength, label)))];
}

export function imageBaseUrl(env) {
  return String(env.IMAGE_BASE_URL ?? "").replace(/\/+$/, "");
}

function validImage(value, env) {
  if (typeof value !== "string") throw new Error("Each product image must be an uploaded photo.");
  const base = imageBaseUrl(env);
  if (BUNDLED_IMAGE.test(value)) return value;
  if (base && value.startsWith(`${base}/products/`) && value.length < 300 && !/[\s"'<>]/.test(value)) return value;
  throw new Error("Each product image must be an uploaded photo.");
}

export function parseProductInput(body, env) {
  const price = Number(body?.price);
  if (!Number.isInteger(price) || price < 1 || price > 100000) throw new Error("Enter a price between 1 and 100000.");
  const images = Array.isArray(body?.images) ? body.images.map((image) => validImage(image, env)) : [];
  if (images.length === 0) throw new Error("Add at least one product photo.");
  if (images.length > MAX_PRODUCT_IMAGES) throw new Error(`A product can have up to ${MAX_PRODUCT_IMAGES} photos.`);
  const tag = text(body?.tag, 60, "category");
  return {
    name: text(body?.name, 120, "product name"),
    description: text(body?.description, 500, "description"),
    price,
    packSize: text(body?.packSize, 60, "pack size"),
    dimensions: optionalText(body?.dimensions, 60, "dimensions"),
    weight: optionalText(body?.weight, 40, "weight"),
    tag,
    extraTags: textList(body?.extraTags, 10, 60, "extra categories").filter((extra) => extra !== tag),
    flavours: textList(body?.flavours, 40, 60, "flavours"),
    images: [...new Set(images)],
    featured: body?.featured === true,
    customizable: body?.customizable !== false,
    active: body?.active !== false,
  };
}

async function readJson(request) {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 20_000) throw new Error("Request is too large.");
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Request must contain valid JSON.");
  }
}

// Reads the theme from the latest successful deploy's run name so Publish keeps the theme chosen at the last manual deploy.
async function lastDeployedTheme(repo, env) {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/deploy.yml/runs?status=success&per_page=1`,
      {
        headers: {
          Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "chocolate-circle-worker",
        },
      },
    );
    if (!response.ok) return "";
    const data = await response.json();
    const match = /\[theme=([a-z-]+)\]/.exec(data.workflow_runs?.[0]?.name ?? "");
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

// Asks GitHub to rebuild the static storefront (needs a token secret on the Worker). Only run from the manual Publish button.
export async function triggerSiteRebuild(env) {
  if (!env.GITHUB_DISPATCH_TOKEN) return false;
  const repo = env.GITHUB_REPO || "kkrocks90/alohomora-cc";
  try {
    const theme = await lastDeployedTheme(repo, env);
    const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/deploy.yml/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "chocolate-circle-worker",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", ...(theme ? { inputs: { theme } } : {}) }),
    });
    if (!response.ok) console.error("Site rebuild request failed.", response.status);
    return response.ok;
  } catch (error) {
    console.error("Site rebuild request failed.", error);
    return false;
  }
}

export async function listAdminProducts(env) {
  await ensureCatalogue(env, { force: true });
  const rows = await loadAllProductRows(env.ORDERS_DB);
  return rows.map(rowToProduct);
}

function productBindings(product) {
  return [
    product.name,
    product.description,
    product.price,
    product.images[0],
    JSON.stringify(product.images),
    product.tag,
    JSON.stringify(product.extraTags),
    product.packSize,
    product.dimensions,
    product.weight,
    JSON.stringify(product.flavours),
    product.featured ? 1 : 0,
    product.customizable ? 1 : 0,
    product.active ? 1 : 0,
  ];
}

export async function createAdminProduct(request, env) {
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    return result(400, { error: error.message });
  }
  try {
    const access = await requireAdmin(request, env);
    if (access.error) return access.error;
    const product = parseProductInput(body, env);
    const last = await env.ORDERS_DB
      .prepare(
        `SELECT COALESCE(MAX(CAST(SUBSTR(product_id, 9) AS INTEGER)), 1000) AS max_id,
                COALESCE(MAX(sort_order), 0) AS max_sort FROM products`,
      )
      .first();
    const productId = `product-${(last?.max_id ?? 1000) + 1}`;
    await env.ORDERS_DB
      .prepare(
        `INSERT INTO products (name, description, price, image, images, tag, extra_tags, pack_size,
                               dimensions, weight, flavours, featured, customizable, active,
                               product_id, sort_order, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(...productBindings(product), productId, (last?.max_sort ?? 0) + 1, new Date().toISOString())
      .run();
    await registerCategories(env.ORDERS_DB, [product.tag, ...product.extraTags]);
    await registerFlavours(env.ORDERS_DB, product.flavours).catch(() => {});
    const products = await listAdminProducts(env);
    return result(201, { productId, products });
  } catch (error) {
    if (error instanceof Error && INPUT_ERROR.test(error.message)) return result(400, { error: error.message });
    console.error("Could not create a product.", error);
    return result(503, { error: "The product could not be saved right now. Please try again." });
  }
}

export async function updateAdminProduct(request, env) {
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    return result(400, { error: error.message });
  }
  try {
    const access = await requireAdmin(request, env);
    if (access.error) return access.error;
    const productId = text(body?.productId, 80, "product");
    const product = parseProductInput(body, env);
    const updated = await env.ORDERS_DB
      .prepare(
        `UPDATE products SET name = ?, description = ?, price = ?, image = ?, images = ?, tag = ?, extra_tags = ?,
                pack_size = ?, dimensions = ?, weight = ?, flavours = ?, featured = ?, customizable = ?, active = ?, updated_at = ?
         WHERE product_id = ?`,
      )
      .bind(...productBindings(product), new Date().toISOString(), productId)
      .run();
    if (updated.meta?.changes === 0) return result(404, { error: "That product could not be found." });
    await registerCategories(env.ORDERS_DB, [product.tag, ...product.extraTags]);
    await registerFlavours(env.ORDERS_DB, product.flavours).catch(() => {});
    const products = await listAdminProducts(env);
    return result(200, { productId, products });
  } catch (error) {
    if (error instanceof Error && INPUT_ERROR.test(error.message)) return result(400, { error: error.message });
    console.error("Could not update a product.", error);
    return result(503, { error: "The product could not be saved right now. Please try again." });
  }
}

export async function rebuildSite(request, env) {
  const access = await requireAdmin(request, env);
  if (access.error) return access.error;
  if (!env.GITHUB_DISPATCH_TOKEN) return result(503, { error: "Automatic publishing is not set up yet." });
  const rebuildTriggered = await triggerSiteRebuild(env);
  return rebuildTriggered
    ? result(200, { rebuildTriggered })
    : result(502, { error: "Could not start the site update. Please try again." });
}

function imageExtension(bytes, contentType) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && contentType === "image/jpeg") return "jpg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && contentType === "image/png") return "png";
  const riff = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (riff && contentType === "image/webp") return "webp";
  return null;
}

export async function uploadProductImage(request, env) {
  try {
    const access = await requireAdmin(request, env);
    if (access.error) return access.error;
    if (!env.IMAGES || !imageBaseUrl(env)) return result(503, { error: "Image storage is not configured." });
    const contentType = (request.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
    const tooLarge = result(413, { error: "That photo is too large. Please choose one under 3 MB." });
    if (Number(request.headers.get("Content-Length") ?? 0) > MAX_UPLOAD_BYTES) return tooLarge;
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_UPLOAD_BYTES) return tooLarge;
    const extension = imageExtension(new Uint8Array(buffer, 0, Math.min(16, buffer.byteLength)), contentType);
    if (!extension) return result(400, { error: "Upload a JPEG, PNG or WebP photo." });
    const key = `products/${crypto.randomUUID().replaceAll("-", "")}.${extension}`;
    await env.IMAGES.put(key, buffer, {
      httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
    });
    return result(201, { url: `${imageBaseUrl(env)}/${key}` });
  } catch (error) {
    console.error("Could not upload a product image.", error);
    return result(503, { error: "The photo could not be uploaded right now. Please try again." });
  }
}
