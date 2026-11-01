import bundledProducts from "../src/data/products.json" with { type: "json" };
import bundledCategories from "../src/data/categories.json" with { type: "json" };

const CACHE_MS = 30_000;

function buildState(products, extraCategories, source) {
  const active = products.filter((product) => product.active !== false);
  return {
    source,
    loadedAt: Date.now(),
    products: active,
    byId: new Map(active.map((product) => [product.id, product])),
    byIdAny: new Map(products.map((product) => [product.id, product])),
    categories: [...new Set([...active.flatMap((product) => [product.tag, ...(product.extraTags ?? [])]), ...extraCategories])],
  };
}

let state = { ...buildState(bundledProducts, bundledCategories, "bundled"), loadedAt: 0 };

export function getProducts() {
  return state.products;
}

export function getProductById(id) {
  return state.byId.get(id);
}

export function getProductByIdAny(id) {
  return state.byIdAny.get(id);
}

export function getCategories() {
  return state.categories;
}

export function rowToProduct(row) {
  const parse = (text) => {
    try {
      const value = JSON.parse(text);
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };
  const product = {
    id: row.product_id,
    name: row.name,
    description: row.description,
    price: row.price,
    image: row.image,
    tag: row.tag,
    packSize: row.pack_size,
    flavours: parse(row.flavours),
    featured: row.featured === 1,
    active: row.active === 1,
    sortOrder: row.sort_order,
  };
  const extraTags = parse(row.extra_tags);
  if (extraTags.length) product.extraTags = extraTags;
  if (row.customizable === 0) product.customizable = false;
  return product;
}

export async function loadAllProductRows(database) {
  const { results } = await database
    .prepare(
      `SELECT product_id, name, description, price, image, tag, extra_tags, pack_size, flavours,
              featured, customizable, active, sort_order
       FROM products ORDER BY sort_order, rowid`,
    )
    .all();
  return results ?? [];
}

export async function ensureCatalogue(env, { force = false } = {}) {
  if (!env?.ORDERS_DB) return;
  if (!force && Date.now() - state.loadedAt < CACHE_MS) return;
  try {
    const rows = await loadAllProductRows(env.ORDERS_DB);
    if (rows.length === 0) {
      state.loadedAt = Date.now();
      return;
    }
    let extra = [];
    try {
      const { results } = await env.ORDERS_DB
        .prepare("SELECT name FROM catalogue_categories ORDER BY sort_order, name")
        .all();
      extra = (results ?? []).map((row) => row.name);
    } catch {
      extra = bundledCategories;
    }
    state = buildState(rows.map(rowToProduct), extra, "d1");
  } catch (error) {
    // Table missing (migration not applied) or a transient error: keep serving the last known catalogue.
    state.loadedAt = Date.now();
    if (!(error instanceof Error) || !/no such table|not a function|undefined/i.test(error.message)) {
      console.error("Could not refresh the product catalogue.", error);
    }
  }
}

export function publicCatalogue() {
  return {
    products: state.products.map(({ sortOrder, active, ...product }) => product),
    categories: state.categories,
  };
}
