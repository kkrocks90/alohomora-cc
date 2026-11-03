import bundledProducts from "../src/data/products.json" with { type: "json" };
import bundledCategories from "../src/data/categories.json" with { type: "json" };
import bundledFlavours from "../src/data/flavours.json" with { type: "json" };

const CACHE_MS = 30_000;

function withImages(product) {
  const images = Array.isArray(product.images) && product.images.length > 0 ? product.images : [product.image];
  return { ...product, image: images[0], images: images.slice(0, 3) };
}

function buildState(rawProducts, categoryRows, source, flavourRows = bundledFlavours) {
  const products = rawProducts.map(withImages);
  const active = products.filter((product) => product.active !== false);
  const extraCategories = categoryRows.map((category) => category.name);
  return {
    source,
    flavours: flavourRows.map(({ name, extra }) => ({ name, extra: Number.isInteger(extra) && extra > 0 ? extra : 0 })),
    flavourExtras: new Map(flavourRows.map(({ name, extra }) => [name, Number.isInteger(extra) && extra > 0 ? extra : 0])),
    loadedAt: Date.now(),
    products: active,
    byId: new Map(active.map((product) => [product.id, product])),
    byIdAny: new Map(products.map((product) => [product.id, product])),
    categories: [...new Set([...active.flatMap((product) => [product.tag, ...(product.extraTags ?? [])]), ...extraCategories])],
    hiddenCategories: categoryRows.filter((category) => category.hidden).map((category) => category.name),
  };
}

let state = { ...buildState(bundledProducts, bundledCategories.map((name) => ({ name })), "bundled"), loadedAt: 0 };

export function getProducts() {
  return state.products;
}

export function getProductById(id) {
  return state.byId.get(id);
}

export function getProductByIdAny(id) {
  return state.byIdAny.get(id);
}

export function getFlavours() {
  return state.flavours;
}

export function flavourExtra(name) {
  return state.flavourExtras.get(name) ?? 0;
}

// Whole-rupee price of one unit of a product in the chosen flavour.
export function unitPriceRupees(product, flavour) {
  return Math.round((product.price * (100 + flavourExtra(flavour))) / 100);
}

export function getCategories() {
  return state.categories;
}

export function getHiddenCategories() {
  return state.hiddenCategories;
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
    images: parse(row.images),
    tag: row.tag,
    packSize: row.pack_size,
    flavours: parse(row.flavours),
    featured: row.featured === 1,
    active: row.active === 1,
    sortOrder: row.sort_order,
  };
  const extraTags = parse(row.extra_tags);
  if (extraTags.length) product.extraTags = extraTags;
  if (row.dimensions) product.dimensions = row.dimensions;
  if (row.weight) product.weight = row.weight;
  if (row.customizable === 0) product.customizable = false;
  return withImages(product);
}

export async function loadAllProductRows(database) {
  const { results } = await database
    .prepare(
      `SELECT product_id, name, description, price, image, images, tag, extra_tags, pack_size, dimensions, weight, flavours,
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
    let extra;
    try {
      const { results } = await env.ORDERS_DB
        .prepare("SELECT name, hidden FROM catalogue_categories ORDER BY sort_order, name")
        .all();
      extra = (results ?? []).map((row) => ({ name: row.name, hidden: row.hidden === 1 }));
    } catch {
      // Older database without the hidden column: fall back to names only.
      try {
        const { results } = await env.ORDERS_DB
          .prepare("SELECT name FROM catalogue_categories ORDER BY sort_order, name")
          .all();
        extra = (results ?? []).map((row) => ({ name: row.name }));
      } catch {
        extra = bundledCategories.map((name) => ({ name }));
      }
    }
    let flavourRows = bundledFlavours;
    try {
      const { results } = await env.ORDERS_DB.prepare("SELECT name, extra_percent FROM flavours ORDER BY sort_order, name").all();
      if (Array.isArray(results) && results.length > 0) {
        flavourRows = results.map((row) => ({ name: row.name, extra: row.extra_percent }));
      }
    } catch {
      // Older database without the flavours table: every flavour costs no extra.
    }
    state = buildState(rows.map(rowToProduct), extra, "d1", flavourRows);
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
    categories: state.categories.filter((name) => !state.hiddenCategories.includes(name)),
    hiddenCategories: state.hiddenCategories,
    flavours: state.flavours,
  };
}
