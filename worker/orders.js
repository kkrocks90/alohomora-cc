import products from "../src/data/products.json" with { type: "json" };
import { getFulfillmentMethod } from "./delivery.js";
import { preparePromoRedemption } from "./promos.js";

const productById = new Map(products.map((product) => [product.id, product]));
const MAX_QUANTITY = 20;

function requireNoteText(notes, field, maximum) {
  const value = notes?.[field];
  if (typeof value !== "string" || value.trim() === "" || value.trim().length > maximum) {
    throw new Error(`The paid order is missing valid ${field} details.`);
  }
  return value.trim();
}

export function parsePaidOrderNotes(orderId, paymentId, notes, amountPaise, pendingCustom = null) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) {
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
  let city = "";
  let state = "";
  let pincode = "";
  const eventDate = notes?.event_date ?? "";
  if (
    typeof eventDate !== "string" ||
    (eventDate !== "" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) ||
        Number.isNaN(Date.parse(`${eventDate}T00:00:00.000Z`)) ||
        new Date(`${eventDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== eventDate))
  ) {
    throw new Error("The paid order has an invalid event date.");
  }
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
  if (pendingCustom && pendingCustom.items.length !== requestedItems.length) {
    throw new Error("The paid order extra details do not match its products.");
  }
  const items = requestedItems.map((item, index) => {
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
        (product.customizable === false
          ? wrapper !== ""
          : wrapper.trim().length < 3 || wrapper.trim().length > 120))
    ) {
      throw new Error("The paid order contains an invalid product, quantity, flavour, or wrapper.");
    }
    const storedFlavour = legacyOptions ? "Not selected (legacy order)" : flavour;
    const storedWrapper = legacyOptions ? "Not selected (legacy order)" : wrapper.trim();
    const custom = pendingCustom?.items[index] ?? [];
    const variantKey = JSON.stringify([item[0], storedFlavour, storedWrapper, custom.map(({ id, value }) => [id, value])]);
    if (seen.has(variantKey)) throw new Error("The paid order contains duplicate product options.");
    seen.add(variantKey);
    return {
      id: product.id,
      name: product.name,
      quantity: item[1],
      unitPriceRupees: item[2],
      flavour: storedFlavour,
      wrapper: storedWrapper,
      ...(custom.length > 0 ? { custom } : {}),
    };
  });

  const productSubtotalPaise = items.reduce((sum, item) => sum + item.unitPriceRupees * item.quantity * 100, 0);
  let distanceText = notes?.distance_km;
  let deliveryMethodValue = notes?.delivery_method;
  let policyValue = notes?.policies_ok;
  if (notes?.delivery !== undefined) {
    let delivery;
    try {
      delivery = JSON.parse(notes.delivery);
    } catch {
      throw new Error("The paid order delivery details could not be read.");
    }
    distanceText = delivery?.distance_km ?? delivery?.d;
    deliveryMethodValue = delivery?.delivery_method ??
      (delivery?.m === "P" ? "Porter (manual booking)" : delivery?.m === "C" ? "Courier (manual booking)" : undefined);
    policyValue = delivery?.policies_ok ?? (delivery?.ok === "1"
      ? "terms_conditions, privacy_policy, shipping_policy"
      : delivery?.ok);
    const cityValue = delivery?.city ?? delivery?.c;
    const stateValue = delivery?.state ?? delivery?.s;
    const pincodeValue = delivery?.pincode ?? delivery?.p;
    city = typeof cityValue === "string" ? cityValue.trim() : "";
    state = typeof stateValue === "string" ? stateValue.trim() : "";
    pincode = typeof pincodeValue === "string" ? pincodeValue.trim() : "";
  }
  if (typeof distanceText !== "string" || distanceText.trim() === "" || distanceText.length > 32) {
    throw new Error("The paid order is missing valid distance_km details.");
  }
  const distanceKm = Number(distanceText);
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new Error("The paid order has an invalid delivery distance.");
  }
  if (typeof deliveryMethodValue !== "string" || deliveryMethodValue.trim() === "" || deliveryMethodValue.length > 64) {
    throw new Error("The paid order is missing valid delivery_method details.");
  }
  const deliveryMethod = deliveryMethodValue.trim();
  if (
    (deliveryMethod !== "Porter (manual booking)" && deliveryMethod !== "Courier (manual booking)") ||
    deliveryMethod !== getFulfillmentMethod(distanceKm)
  ) {
    throw new Error("The paid order has an invalid delivery method.");
  }

  if (typeof policyValue !== "string" || policyValue.trim() === "" || policyValue.length > 128) {
    throw new Error("The paid order is missing valid policies_ok details.");
  }
  const policiesAccepted = policyValue.trim();
  if (policiesAccepted !== "terms_conditions, privacy_policy, shipping_policy") {
    throw new Error("The paid order policy confirmation could not be validated.");
  }

  let discountPaise = 0;
  let promoCode = "";
  if (notes?.promo !== undefined) {
    let promo;
    try {
      promo = JSON.parse(notes.promo);
    } catch {
      throw new Error("The paid order promo details could not be read.");
    }
    if (
      typeof promo.code !== "string" ||
      !/^[A-Z0-9-]{3,32}$/.test(promo.code) ||
      promo.subtotal_paise !== productSubtotalPaise ||
      !Number.isSafeInteger(promo.discount_paise) ||
      promo.discount_paise < 0 ||
      promo.discount_paise > productSubtotalPaise
    ) {
      throw new Error("The paid order promo details are invalid.");
    }
    promoCode = promo.code;
    discountPaise = promo.discount_paise;
  }
  if (productSubtotalPaise - discountPaise !== amountPaise || (amountPaise === 0 && !promoCode)) {
    throw new Error("The paid order amount does not match its product subtotal and discount.");
  }

  return {
    orderId,
    paymentId,
    customerName,
    customerPhone,
    customerEmail,
    deliveryAddress,
    city,
    state,
    pincode,
    eventDate,
    items,
    amountPaise,
    productSubtotalPaise,
    discountPaise,
    promoCode,
    deliveryMethod,
    distanceKm,
    policiesAccepted,
    customFields: pendingCustom?.checkout ?? [],
  };
}

export async function savePaidOrder(database, order) {
  const createdAt = new Date().toISOString();

  const insertSql = `INSERT INTO orders (
        order_id,
        payment_id,
        payment_status,
        payment_method,
        order_status,
        customer_name,
        customer_phone,
        customer_email,
        delivery_address,
        city,
        state,
        pincode,
        event_date,
        items_json,
        amount_paise,
        product_subtotal_paise,
        discount_paise,
        promo_code,
        currency,
        delivery_method,
        distance_km,
        policies_accepted,
        created_at,
        razorpay_order_id
      ) VALUES (?, ?, 'paid', ?, 'received', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, ?)
      ON CONFLICT(order_id) DO NOTHING`;
  const insertValues = [
    order.orderId,
    order.paymentId,
    order.paymentMethod ?? "razorpay",
    order.customerName,
    order.customerPhone,
    order.customerEmail,
    order.deliveryAddress,
    order.city ?? "",
    order.state ?? "",
    order.pincode ?? "",
    order.eventDate ?? "",
    JSON.stringify(order.items),
    order.amountPaise,
    order.productSubtotalPaise ?? order.amountPaise,
    order.discountPaise ?? 0,
    order.promoCode ?? "",
    order.deliveryMethod,
    order.distanceKm,
    "terms_conditions, privacy_policy, shipping_policy",
    createdAt,
    order.razorpayOrderId ?? null,
  ];

  if (order.promoReservation) {
    const email = order.customerEmail.trim().toLowerCase();
    const reservation = order.promoReservation;
    const promoInsertSql = `INSERT INTO orders (
        order_id, payment_id, payment_status, payment_method, order_status,
        customer_name, customer_phone, customer_email, delivery_address,
        city, state, pincode,
        event_date, items_json, amount_paise, product_subtotal_paise,
        discount_paise, promo_code, currency, delivery_method, distance_km,
        policies_accepted, created_at, razorpay_order_id
      )
      SELECT ?, ?, 'paid', ?, 'received', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, ?
      FROM promo_redemptions r
      WHERE r.reservation_id = ? AND r.order_id = ?
        AND r.customer_email = ? AND r.status = 'redeemed'
      ON CONFLICT(order_id) DO NOTHING`;
    await database.batch([
      preparePromoRedemption(database, reservation, order.orderId, email),
      database.prepare(promoInsertSql).bind(...insertValues, reservation.reservation_id, order.orderId, email),
    ]);
    const redeemedReservation = await database
      .prepare(
        `SELECT status FROM promo_redemptions
         WHERE reservation_id = ? AND order_id = ? AND customer_email = ?`,
      )
      .bind(reservation.reservation_id, order.orderId, email)
      .first();
    if (redeemedReservation?.status !== "redeemed") {
      throw new Error("The promo reservation expired or could not be redeemed.");
    }
  } else {
    await database.prepare(insertSql).bind(...insertValues).run();
  }

  if (order.customFields?.length > 0) {
    await database
      .prepare("UPDATE orders SET custom_json = ? WHERE order_id = ? AND custom_json = ''")
      .bind(JSON.stringify(order.customFields), order.orderId)
      .run();
  }

  const saved = await database
    .prepare("SELECT payment_id FROM orders WHERE order_id = ?")
    .bind(order.orderId)
    .first();

  if (!saved || saved.payment_id !== order.paymentId) {
    throw new Error("The payment order is already associated with a different recorded payment.");
  }

  const email = order.customerEmail.trim().toLowerCase();
  if (email) {
    const customerId = `cus_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const customer = await database
      .prepare(
        `INSERT INTO customers (
          customer_id, customer_name, customer_phone, customer_email,
          default_address, city, state, pincode, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(customer_email COLLATE NOCASE) WHERE customer_email <> ''
        DO UPDATE SET
          customer_name = excluded.customer_name,
          customer_phone = excluded.customer_phone,
          customer_email = lower(trim(excluded.customer_email)),
          default_address = excluded.default_address,
          city = excluded.city,
          state = excluded.state,
          pincode = excluded.pincode,
          updated_at = excluded.updated_at
        RETURNING customer_id`,
      )
      .bind(
        customerId,
        order.customerName,
        order.customerPhone,
        email,
        order.deliveryAddress,
        order.city ?? "",
        order.state ?? "",
        order.pincode ?? "",
        now,
        now,
      )
      .first();
    if (!customer?.customer_id) throw new Error("Could not save the order customer.");
    await database
      .prepare("UPDATE orders SET customer_id = ? WHERE order_id = ?")
      .bind(customer.customer_id, order.orderId)
      .run();
  }
}
