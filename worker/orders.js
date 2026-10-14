import products from "../src/data/products.json" with { type: "json" };
import { getFulfillmentMethod } from "./delivery.js";

const productById = new Map(products.map((product) => [product.id, product]));
const MAX_QUANTITY = 20;

function requireNoteText(notes, field, maximum) {
  const value = notes?.[field];
  if (typeof value !== "string" || value.trim() === "" || value.trim().length > maximum) {
    throw new Error(`The paid order is missing valid ${field} details.`);
  }
  return value.trim();
}

export function parsePaidOrderNotes(orderId, paymentId, notes, amountPaise) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new Error("The verified payment amount is invalid.");
  }

  const customerName = requireNoteText(notes, "customer_name", 80);
  const customerPhone = requireNoteText(notes, "phone", 20);
  if (!/^\+?[0-9\s()-]{7,20}$/.test(customerPhone)) {
    throw new Error("The paid order is missing a valid phone number.");
  }
  const customerEmail = notes?.email ?? "";
  if (
    typeof customerEmail !== "string" ||
    customerEmail.length > 120 ||
    (customerEmail !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))
  ) {
    throw new Error("The paid order is missing valid email details.");
  }

  const deliveryAddress = requireNoteText(notes, "address", 250);
  const itemNoteParts = [];
  for (let index = 0; index < 8; index += 1) {
    const key = index === 0 ? "items" : `items_${index}`;
    const value = notes?.[key];
    if (value === undefined) break;
    if (typeof value !== "string" || value.length > 256) {
      throw new Error("The paid order items could not be read.");
    }
    itemNoteParts.push(value);
  }
  const expectedItemNoteKeys = Object.keys(notes ?? {}).filter((key) => /^items(?:_[1-7])?$/.test(key));
  if (expectedItemNoteKeys.length !== itemNoteParts.length) {
    throw new Error("The paid order items could not be read.");
  }
  let requestedItems;
  try {
    requestedItems = JSON.parse(itemNoteParts.join(""));
  } catch {
    throw new Error("The paid order items could not be read.");
  }
  if (!Array.isArray(requestedItems) || requestedItems.length === 0 || requestedItems.length > products.length) {
    throw new Error("The paid order does not contain a valid product list.");
  }

  const seen = new Set();
  const items = requestedItems.map((item) => {
    if (
      !Array.isArray(item) ||
      (item.length !== 3 && item.length !== 5) ||
      typeof item[0] !== "string" ||
      !Number.isInteger(item[1]) ||
      item[1] < 1 ||
      item[1] > MAX_QUANTITY ||
      !Number.isSafeInteger(item[2]) ||
      item[2] < 1
    ) {
      throw new Error("The paid order contains an invalid product, quantity, flavour, or wrapper.");
    }
    const product = productById.get(item[0]);
    if (!product) throw new Error("The paid order contains an unknown product.");
    const legacyOptions = item.length === 3;
    const flavour = legacyOptions ? "" : item[3];
    const wrapper = legacyOptions ? "" : item[4];
    if (
      !legacyOptions &&
      (typeof flavour !== "string" ||
        (product.flavours.length > 0 && !product.flavours.includes(flavour)) ||
        (product.flavours.length === 0 && flavour !== "") ||
        typeof wrapper !== "string" ||
        wrapper.trim().length < 3 ||
        wrapper.trim().length > 120)
    ) {
      throw new Error("The paid order contains an invalid product, quantity, flavour, or wrapper.");
    }
    const storedFlavour = legacyOptions ? "Not selected (legacy order)" : flavour;
    const storedWrapper = legacyOptions ? "Not selected (legacy order)" : wrapper.trim();
    const variantKey = JSON.stringify([item[0], storedFlavour, storedWrapper]);
    if (seen.has(variantKey)) throw new Error("The paid order contains duplicate product options.");
    seen.add(variantKey);
    return {
      id: product.id,
      name: product.name,
      quantity: item[1],
      unitPriceRupees: item[2],
      flavour: storedFlavour,
      wrapper: storedWrapper,
    };
  });

  const expectedAmountPaise = items.reduce((sum, item) => sum + item.unitPriceRupees * item.quantity * 100, 0);
  if (expectedAmountPaise !== amountPaise) {
    throw new Error("The paid order amount does not match the current product prices.");
  }

  const distanceText = requireNoteText(notes, "distance_km", 32);
  const distanceKm = Number(distanceText);
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new Error("The paid order has an invalid delivery distance.");
  }
  const deliveryMethod = requireNoteText(notes, "delivery_method", 64);
  if (
    (deliveryMethod !== "Porter (manual booking)" && deliveryMethod !== "Courier (manual booking)") ||
    deliveryMethod !== getFulfillmentMethod(distanceKm)
  ) {
    throw new Error("The paid order has an invalid delivery method.");
  }

  const policiesAccepted = requireNoteText(notes, "policies_ok", 128);
  if (policiesAccepted !== "terms_conditions, privacy_policy, shipping_policy") {
    throw new Error("The paid order policy confirmation could not be validated.");
  }

  return {
    orderId,
    paymentId,
    customerName,
    customerPhone,
    customerEmail,
    deliveryAddress,
    items,
    amountPaise,
    deliveryMethod,
    distanceKm,
    policiesAccepted,
  };
}

export async function savePaidOrder(database, order) {
  const createdAt = new Date().toISOString();

  await database
    .prepare(
      `INSERT INTO orders (
        order_id,
        payment_id,
        payment_status,
        customer_name,
        customer_phone,
        customer_email,
        delivery_address,
        items_json,
        amount_paise,
        currency,
        delivery_method,
        distance_km,
        policies_accepted,
        created_at
      ) VALUES (?, ?, 'paid', ?, ?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?)
      ON CONFLICT(order_id) DO NOTHING`,
    )
    .bind(
      order.orderId,
      order.paymentId,
      order.customerName,
      order.customerPhone,
      order.customerEmail,
      order.deliveryAddress,
      JSON.stringify(order.items),
      order.amountPaise,
      order.deliveryMethod,
      order.distanceKm,
      "terms_conditions, privacy_policy, shipping_policy",
      createdAt,
    )
    .run();

  const saved = await database
    .prepare("SELECT payment_id FROM orders WHERE order_id = ?")
    .bind(order.orderId)
    .first();

  if (!saved || saved.payment_id !== order.paymentId) {
    throw new Error("The payment order is already associated with a different recorded payment.");
  }
}
