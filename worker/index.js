import products from "../src/data/products.json" with { type: "json" };
import {
  createAdminPromo,
  createAdminCustomer,
  createAdminCustomField,
  createManualOrder,
  deleteAdminCustomField,
  getAdminData,
  updateAdminCustomField,
  updateAdminCustomer,
  updateAdminOrderStatus,
  updateAdminPromo,
} from "./admin.js";
import {
  getDistanceKm,
  getFulfillmentMethod,
  getStoreLocation,
  isValidDeliveryLocation,
} from "./delivery.js";
import { parsePaidOrderNotes, savePaidOrder } from "./orders.js";
import {
  collectAnswers,
  deletePendingCustom,
  fieldAppliesToProduct,
  listCustomFields,
  loadPendingCustom,
  savePendingCustom,
} from "./custom-fields.js";
import { createAdminPaymentLink, handleRazorpayWebhook, markAdminOrderPaid } from "./payment-links.js";
import { generateOrderId, ORDER_ID_PATTERN } from "./order-id.js";
import { isValidPincode, lookupPincode, PincodeLookupError } from "./pincode.js";
import {
  getFeaturedPromo,
  getPromoReservationForOrder,
  quotePromo,
  releasePromoReservation,
  reservePromo,
} from "./promos.js";
import {
  authenticatedEmail,
  getCustomerOrders,
  logoutCustomer,
  normalizeCustomerEmail,
  requestLoginCode,
  updateCustomerProfile,
  verifyLoginCode,
} from "./customer-auth.js";

const encoder = new TextEncoder();
const MAX_REQUEST_BYTES = 20_000;
const MAX_QUANTITY = 20;
function jsonResponse(body, status, origin) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    headers.set("Access-Control-Max-Age", "86400");
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(message, status, origin) {
  return jsonResponse({ error: message }, status, origin);
}

function isValidText(value, maximum) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximum;
}

async function readBody(request) {
  const text = await request.text();
  if (encoder.encode(text).byteLength > MAX_REQUEST_BYTES) {
    throw new Error("Request is too large.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Request must contain valid JSON.");
  }
}

function validateOrder(body, storeLocation, customFields = []) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Order details are missing.");
  }

  const customer = body.customer;
  if (!customer || typeof customer !== "object" || Array.isArray(customer)) {
    throw new Error("Please provide your contact and delivery details.");
  }
  if (customer.policyConsent !== true) {
    throw new Error("Please review and agree to the shop policies before continuing.");
  }
  if (!isValidText(customer.name, 80)) throw new Error("Please enter your name.");
  if (!isValidText(customer.phone, 20) || !/^\+?[0-9\s()-]{7,20}$/.test(customer.phone.trim())) {
    throw new Error("Please enter a valid phone number.");
  }
  if (!isValidText(customer.address, 250)) throw new Error("Please enter a delivery address.");
  if (!isValidText(customer.city, 40) || !isValidText(customer.state, 40) ||
      typeof customer.pincode !== "string" || !/^[1-9][0-9]{5}$/.test(customer.pincode.trim())) {
    throw new Error("Please enter a valid city, state, and six-digit Indian PIN code.");
  }
  customer.address = customer.address.trim();
  customer.city = customer.city.trim();
  customer.state = customer.state.trim();
  customer.pincode = customer.pincode.trim();
  if (customer.eventDate !== undefined && customer.eventDate !== "") {
    const eventDate = customer.eventDate;
    const parsedDate = typeof eventDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(eventDate)
      ? new Date(`${eventDate}T00:00:00.000Z`)
      : null;
    if (
      !parsedDate ||
      Number.isNaN(parsedDate.valueOf()) ||
      parsedDate.toISOString().slice(0, 10) !== eventDate ||
      eventDate < new Date().toISOString().slice(0, 10)
    ) {
      throw new Error("Please choose a valid event date that is today or later.");
    }
    customer.eventDate = eventDate;
  } else {
    customer.eventDate = "";
  }
  if (!isValidDeliveryLocation(body.deliveryLocation)) {
    throw new Error("Delivery distance could not be determined from the PIN code.");
  }
  if (typeof customer.email !== "string" || customer.email.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) {
    throw new Error("Please enter a valid email address.");
  }
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 8) {
    throw new Error("Your bag does not contain a valid selection.");
  }

  const productById = new Map(products.map((product) => [product.id, product]));
  const seen = new Set();
  const items = body.items.map((item) => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY ||
        typeof item.flavour !== "string" ||
        typeof item.wrapper !== "string") {
      throw new Error("Each product needs a valid quantity, any required flavour choice, and a wrapper description (3 to 120 characters).");
    }
    const product = productById.get(item.id);
    if (!product) throw new Error("A product in your bag is no longer available.");
    const wrapperLength = item.wrapper.trim().length;
    if (product.customizable === false ? item.wrapper !== "" : wrapperLength > 120) {
      throw new Error("Each product needs a valid quantity, any required flavour choice, and a wrapper description (3 to 120 characters).");
    }
    if (
      (product.flavours.length > 0 && !product.flavours.includes(item.flavour)) ||
      (product.flavours.length === 0 && item.flavour !== "")
    ) {
      throw new Error("Choose a valid flavour for each product that offers one.");
    }
    const custom = collectAnswers(customFields.filter((field) => fieldAppliesToProduct(field, product)), item.custom);
    const variantKey = JSON.stringify([item.id, item.flavour, item.wrapper, custom.map(({ id, value }) => [id, value])]);
    if (seen.has(variantKey)) throw new Error("Your bag contains the same product options more than once.");
    seen.add(variantKey);
    return {
      product,
      quantity: item.quantity,
      flavour: item.flavour,
      wrapper: item.wrapper.trim(),
      custom,
    };
  });
  const checkoutCustom = collectAnswers(customFields.filter((field) => field.scope === "checkout"), body.customFields);

  const amount = items.reduce((sum, item) => sum + item.product.price * item.quantity * 100, 0);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Your order total is invalid.");
  const distanceKm = getDistanceKm(storeLocation, body.deliveryLocation);
  return {
    customer,
    items,
    checkoutCustom,
    amount,
    subtotalPaise: amount,
    distanceKm,
    fulfillmentMethod: getFulfillmentMethod(distanceKm),
  };
}

function validatePromoCart(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !Array.isArray(body.items) || body.items.length === 0 || body.items.length > 8) {
    throw new Error("Your bag does not contain a valid selection.");
  }
  const items = body.items.map((item) => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) {
      throw new Error("Each product needs a valid quantity.");
    }
    const product = products.find((entry) => entry.id === item.id);
    if (!product) throw new Error("A product in your bag is no longer available.");
    return { product, quantity: item.quantity };
  });
  return items;
}

async function handlePromoQuote(request, env, origin) {
  if (!env.ORDERS_DB) return errorResponse("The order database is not configured yet. Please contact the shop.", 503, origin);
  let customerEmail;
  try {
    customerEmail = await authenticatedEmail(request, env);
  } catch (error) {
    console.error("Could not authenticate customer before quoting a promo.", error);
    return errorResponse("Customer sign-in is temporarily unavailable. Please try again shortly.", 503, origin);
  }
  if (!customerEmail) return errorResponse("Please sign in before applying a promo code.", 401, origin);

  let body;
  try {
    body = await readBody(request);
    const items = validatePromoCart(body);
    const quote = await quotePromo(env.ORDERS_DB, body.code, customerEmail, items);
    return jsonResponse({
      code: quote.code,
      name: quote.name,
      subtotalPaise: quote.subtotalPaise,
      eligibleSubtotalPaise: quote.eligibleSubtotalPaise,
      discountPaise: quote.discountPaise,
      payablePaise: quote.payablePaise,
    }, 200, origin);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "That promo code could not be applied.", 400, origin);
  }
}

async function handleReleasePromo(request, env, origin) {
  if (!env.ORDERS_DB) return errorResponse("The order database is not configured.", 503, origin);
  let customerEmail;
  try {
    customerEmail = await authenticatedEmail(request, env);
  } catch (error) {
    console.error("Could not authenticate customer before releasing a promo.", error);
    return errorResponse("Customer sign-in is temporarily unavailable.", 503, origin);
  }
  if (!customerEmail) return errorResponse("Please sign in before continuing.", 401, origin);
  try {
    const body = await readBody(request);
    await releasePromoReservation(env.ORDERS_DB, body?.reservationId, customerEmail);
    return jsonResponse({ released: true }, 200, origin);
  } catch (error) {
    console.error("Could not release a promo checkout reservation.", error);
    return errorResponse("The promo reservation could not be released.", 503, origin);
  }
}

function hexToBytes(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g), (byte) => parseInt(byte, 16));
}

async function handleCreateOrder(request, env, origin) {
  if (!env.ORDERS_DB) {
    return errorResponse("The order database is not configured yet. Please contact the shop.", 503, origin);
  }

  const storeLocation = getStoreLocation(env);
  if (!storeLocation) {
    return errorResponse("Delivery-distance checkout is not configured yet. Please contact the shop.", 503, origin);
  }

  let customerEmail;
  try {
    customerEmail = await authenticatedEmail(request, env);
  } catch (error) {
    console.error("Could not authenticate customer before creating an order.", error);
    return errorResponse("Customer sign-in is temporarily unavailable. Please try again shortly.", 503, origin);
  }
  if (!customerEmail) return errorResponse("Please sign in before checking out.", 401, origin);

  let order;
  let body;
  let promoQuote = null;
  try {
    body = await readBody(request);
    const submittedEmail = normalizeCustomerEmail(body?.customer?.email);
    if (submittedEmail !== customerEmail) {
      return errorResponse("The checkout email must match the signed-in account.", 403, origin);
    }
    body.customer.email = customerEmail;
    if (isValidPincode(body?.customer?.pincode)) {
      const deliveryPlace = await lookupPincode(body.customer.pincode);
      body.deliveryLocation = { latitude: deliveryPlace.latitude, longitude: deliveryPlace.longitude };
    } else if (body && typeof body === "object") {
      delete body.deliveryLocation;
    }
    order = validateOrder(body, storeLocation, await listCustomFields(env.ORDERS_DB, { activeOnly: true }));
    if (body.promoCode !== undefined && body.promoCode !== null && body.promoCode !== "") {
      promoQuote = await quotePromo(env.ORDERS_DB, body.promoCode, customerEmail, order.items);
      order.amount = promoQuote.payablePaise;
    }
  } catch (error) {
    const status = error instanceof PincodeLookupError ? error.status : 400;
    return errorResponse(error.message, status, origin);
  }

  if (order.amount === 0) {
    if (!promoQuote || promoQuote.discountPaise !== promoQuote.subtotalPaise) {
      return errorResponse("A free order requires a valid promo code covering the full product subtotal.", 400, origin);
    }
    const orderId = generateOrderId();
    try {
      await reservePromo(env.ORDERS_DB, promoQuote, customerEmail, orderId);
      const redemption = await getPromoReservationForOrder(env.ORDERS_DB, orderId);
      if (
        !redemption ||
        redemption.promo_code !== promoQuote.code ||
        redemption.customer_email !== customerEmail ||
        redemption.subtotal_paise !== promoQuote.subtotalPaise ||
        redemption.discount_paise !== promoQuote.discountPaise
      ) throw new Error("The promo reservation could not be confirmed.");
      await savePaidOrder(env.ORDERS_DB, {
        orderId,
        paymentId: null,
        paymentMethod: "promo",
        customerName: order.customer.name.trim(),
        customerPhone: order.customer.phone.trim(),
        customerEmail,
        deliveryAddress: order.customer.address.trim(),
        city: order.customer.city,
        state: order.customer.state,
        pincode: order.customer.pincode,
        eventDate: order.customer.eventDate,
        items: order.items.map(({ product, quantity, flavour, wrapper, custom }) => ({
          id: product.id,
          name: product.name,
          quantity,
          unitPriceRupees: product.price,
          flavour,
          wrapper,
          ...(custom.length > 0 ? { custom } : {}),
        })),
        customFields: order.checkoutCustom,
        amountPaise: 0,
        productSubtotalPaise: promoQuote.subtotalPaise,
        discountPaise: promoQuote.discountPaise,
        promoCode: promoQuote.code,
        deliveryMethod: order.fulfillmentMethod,
        distanceKm: order.distanceKm,
        policiesAccepted: "terms_conditions, privacy_policy, shipping_policy",
        promoReservation: redemption,
      });
    } catch (error) {
      console.error("Could not save a promo-covered free order.", error);
      return errorResponse(
        "Your promo-covered order could not be saved. Please contact the shop before trying again.",
        503,
        origin,
      );
    }
    return jsonResponse({
      freeOrder: true,
      verified: true,
      orderId,
      fulfillmentMethod: order.fulfillmentMethod,
      distanceKm: Number(order.distanceKm.toFixed(2)),
      discountPaise: promoQuote.discountPaise,
    }, 201, origin);
  }

  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return errorResponse("Secure payments are not configured yet. Please contact the shop.", 503, origin);
  }

  const serializedItems = JSON.stringify(order.items.map(({ product, quantity, flavour, wrapper }) => [
    product.id,
    quantity,
    product.price,
    flavour,
    wrapper,
  ]));
  const itemNoteChunks = serializedItems.match(/[\s\S]{1,240}/g) ?? [];
  if (itemNoteChunks.length > 8) {
    return errorResponse("Your order has too many customizations to process. Please contact the shop.", 400, origin);
  }

  const itemNotes = Object.fromEntries(
    itemNoteChunks.map((chunk, index) => [index === 0 ? "items" : `items_${index}`, chunk]),
  );
  const notes = {
    customer_name: order.customer.name.trim(),
    phone: order.customer.phone.trim(),
    email: order.customer.email.trim().toLowerCase(),
    address: order.customer.address.trim(),
    city: order.customer.city,
    state: order.customer.state,
    pincode: order.customer.pincode,
    event_date: order.customer.eventDate,
    ...itemNotes,
    delivery: JSON.stringify({
      m: order.fulfillmentMethod === "Porter (manual booking)" ? "P" : "C",
      d: order.distanceKm.toFixed(2),
      c: order.customer.city,
      s: order.customer.state,
      p: order.customer.pincode,
      ok: "1",
    }),
  };
  if (promoQuote) {
    notes.promo = JSON.stringify({
      code: promoQuote.code,
      subtotal_paise: promoQuote.subtotalPaise,
      discount_paise: promoQuote.discountPaise,
    });
  }
  const appOrderId = generateOrderId();
  const payload = {
    amount: order.amount,
    currency: "INR",
    receipt: appOrderId,
    notes,
  };

  let providerResponse;
  try {
    providerResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("Could not reach Razorpay to create an order.", error);
    return errorResponse("Secure checkout is temporarily unavailable. Please try again shortly.", 502, origin);
  }

  if (!providerResponse.ok) {
    console.error("Razorpay order creation failed with status", providerResponse.status);
    return errorResponse("Secure checkout could not create your order. Please check your details or try again.", 502, origin);
  }

  let providerOrder;
  try {
    providerOrder = await providerResponse.json();
  } catch {
    return errorResponse("Secure checkout returned an invalid order. Please try again.", 502, origin);
  }
  if (providerOrder.amount !== order.amount || providerOrder.currency !== "INR" || !providerOrder.id) {
    console.error("Razorpay returned an order with unexpected details.");
    return errorResponse("Secure checkout returned an invalid order. Please try again.", 502, origin);
  }

  if (order.checkoutCustom.length > 0 || order.items.some((item) => item.custom.length > 0)) {
    try {
      await savePendingCustom(env.ORDERS_DB, appOrderId, {
        checkout: order.checkoutCustom,
        items: order.items.map((item) => item.custom),
      });
    } catch (error) {
      console.error("Could not save custom field answers for a new payment order.", error);
      return errorResponse("Your extra order details could not be saved. Please try again shortly.", 503, origin);
    }
  }

  let reservation = null;
  if (promoQuote) {
    try {
      reservation = await reservePromo(env.ORDERS_DB, promoQuote, customerEmail, appOrderId);
    } catch (error) {
      console.error("Could not reserve the promo code for a new payment order.", error);
      return errorResponse(
        error instanceof Error ? error.message : "That promo code could not be reserved.",
        409,
        origin,
      );
    }
  }

  return jsonResponse({
    id: providerOrder.id,
    amount: providerOrder.amount,
    currency: providerOrder.currency,
    keyId: env.RAZORPAY_KEY_ID,
    fulfillmentMethod: order.fulfillmentMethod,
    distanceKm: Number(order.distanceKm.toFixed(2)),
    productSubtotalPaise: promoQuote?.subtotalPaise ?? order.subtotalPaise,
    discountPaise: promoQuote?.discountPaise ?? 0,
    promoCode: promoQuote?.code ?? "",
    promoReservationId: reservation?.reservationId ?? "",
  }, 201, origin);
}

async function handleVerifyPayment(request, env, origin) {
  if (!env.ORDERS_DB) {
    return errorResponse(
      "The order database is not configured. Your payment was not confirmed by the shop; please do not pay again and contact the shop with your Razorpay payment receipt.",
      503,
      origin,
    );
  }
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return errorResponse("Secure payments are not configured yet. Please contact the shop.", 503, origin);
  }

  let customerEmail;
  try {
    customerEmail = await authenticatedEmail(request, env);
  } catch (error) {
    console.error("Could not authenticate customer before verifying payment.", error);
    return errorResponse("Customer sign-in is temporarily unavailable. Please contact the shop.", 503, origin);
  }
  if (!customerEmail) return errorResponse("Please sign in to verify this payment.", 401, origin);

  let body;
  try {
    body = await readBody(request);
  } catch (error) {
    return errorResponse(error.message, 400, origin);
  }
  const signature = hexToBytes(body?.razorpay_signature);
  if (
    typeof body?.razorpay_order_id !== "string" ||
    !/^order_[A-Za-z0-9]+$/.test(body.razorpay_order_id) ||
    typeof body?.razorpay_payment_id !== "string" ||
    !/^pay_[A-Za-z0-9]+$/.test(body.razorpay_payment_id) ||
    !signature
  ) {
    return errorResponse("Payment details could not be verified.", 400, origin);
  }

  let signatureIsValid;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(env.RAZORPAY_KEY_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signedMessage = encoder.encode(`${body.razorpay_order_id}|${body.razorpay_payment_id}`);
    signatureIsValid = await crypto.subtle.verify("HMAC", key, signature, signedMessage);
  } catch (error) {
    console.error("Could not verify the Razorpay payment signature.", error);
    return errorResponse("Payment verification is temporarily unavailable. Please contact the shop.", 502, origin);
  }
  if (!signatureIsValid) return errorResponse("Payment details could not be verified.", 400, origin);

  let paymentResponse;
  try {
    paymentResponse = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(body.razorpay_payment_id)}`,
      {
        headers: {
          Authorization: `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`,
        },
      },
    );
  } catch (error) {
    console.error("Could not reach Razorpay to verify a payment.", error);
    return errorResponse("Payment verification is temporarily unavailable. Please contact the shop before trying again.", 502, origin);
  }

  if (!paymentResponse.ok) {
    console.error("Razorpay payment verification failed with status", paymentResponse.status);
    return errorResponse("Payment verification is temporarily unavailable. Please contact the shop before trying again.", 502, origin);
  }

  let payment;
  try {
    payment = await paymentResponse.json();
  } catch {
    return errorResponse("Payment verification returned an invalid response. Please contact the shop.", 502, origin);
  }
  if (
    payment.id !== body.razorpay_payment_id ||
    payment.order_id !== body.razorpay_order_id ||
    payment.status !== "captured" ||
    payment.currency !== "INR"
  ) {
    return errorResponse("Payment has not been captured yet. Please contact the shop if money was debited.", 409, origin);
  }

  let orderResponse;
  try {
    orderResponse = await fetch(
      `https://api.razorpay.com/v1/orders/${encodeURIComponent(body.razorpay_order_id)}`,
      {
        headers: {
          Authorization: `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`,
        },
      },
    );
  } catch (error) {
    console.error("Could not reach Razorpay to verify the order amount.", error);
    return errorResponse("Payment verification is temporarily unavailable. Please contact the shop before trying again.", 502, origin);
  }
  if (!orderResponse.ok) {
    console.error("Razorpay order verification failed with status", orderResponse.status);
    return errorResponse("Payment verification is temporarily unavailable. Please contact the shop before trying again.", 502, origin);
  }

  let verifiedOrder;
  try {
    verifiedOrder = await orderResponse.json();
  } catch {
    return errorResponse("Payment verification returned an invalid order. Please contact the shop.", 502, origin);
  }
  if (
    verifiedOrder.id !== body.razorpay_order_id ||
    verifiedOrder.currency !== "INR" ||
    verifiedOrder.status !== "paid" ||
    !Number.isSafeInteger(verifiedOrder.amount) ||
    verifiedOrder.amount_due !== 0 ||
    verifiedOrder.amount_paid !== verifiedOrder.amount ||
    payment.amount !== verifiedOrder.amount
  ) {
    return errorResponse("Payment has not been fully captured yet. Please contact the shop if money was debited.", 409, origin);
  }

  const hasAppOrderId = typeof verifiedOrder.receipt === "string" && ORDER_ID_PATTERN.test(verifiedOrder.receipt);
  let pendingCustom = null;
  try {
    pendingCustom = hasAppOrderId ? await loadPendingCustom(env.ORDERS_DB, verifiedOrder.receipt) : null;
  } catch (error) {
    console.error("Could not read custom field answers for a captured payment.", error);
    return errorResponse(
      "Your payment was received, but the order could not be saved. Please do not pay again; contact the shop with your Razorpay order ID.",
      503,
      origin,
    );
  }
  let paidOrder;
  try {
    paidOrder = parsePaidOrderNotes(
      verifiedOrder.id,
      payment.id,
      verifiedOrder.notes,
      verifiedOrder.amount,
      pendingCustom,
    );
  } catch (error) {
    console.error("The captured Razorpay order could not be reconciled with its order details.", error);
    return errorResponse(
      "Your payment was received, but the order could not be saved. Please do not pay again; contact the shop with your Razorpay order ID.",
      502,
      origin,
    );
  }
  if (paidOrder.customerEmail !== customerEmail) {
    return errorResponse("This payment belongs to a different signed-in account.", 403, origin);
  }
  // Orders created before app order numbers existed have a non-matching receipt and keep the Razorpay id.
  paidOrder.razorpayOrderId = verifiedOrder.id;
  if (typeof verifiedOrder.receipt === "string" && ORDER_ID_PATTERN.test(verifiedOrder.receipt)) {
    paidOrder.orderId = verifiedOrder.receipt;
  }
  if (paidOrder.promoCode) {
    let reservation;
    try {
      reservation = await getPromoReservationForOrder(env.ORDERS_DB, paidOrder.orderId);
      if (
        !reservation ||
        reservation.promo_code !== paidOrder.promoCode ||
        reservation.customer_email !== customerEmail ||
        reservation.subtotal_paise !== paidOrder.productSubtotalPaise ||
        reservation.discount_paise !== paidOrder.discountPaise
      ) {
        throw new Error("The promo checkout reservation does not match this captured payment.");
      }
      paidOrder.promoReservation = reservation;
    } catch (error) {
      console.error("The captured payment promo could not be reconciled.", error);
      return errorResponse(
        "Your payment was received, but the promo order could not be confirmed. Please do not pay again; contact the shop with your Razorpay order ID.",
        502,
        origin,
      );
    }
  }

  try {
    await savePaidOrder(env.ORDERS_DB, paidOrder);
  } catch (error) {
    console.error("Could not save the captured Razorpay order in D1.", error);
    return errorResponse(
      "Your payment was received, but saving the order failed. Please do not pay again; contact the shop with your Razorpay order ID.",
      503,
      origin,
    );
  }

  if (pendingCustom) await deletePendingCustom(env.ORDERS_DB, verifiedOrder.receipt);

  return jsonResponse({
    verified: true,
    orderId: paidOrder.orderId,
    fulfillmentMethod: paidOrder.deliveryMethod,
    distanceKm: Number(paidOrder.distanceKm.toFixed(2)),
  }, 200, origin);
}

export default {
  async fetch(request, env) {
    const configuredOrigin = typeof env.ALLOWED_ORIGIN === "string"
      ? env.ALLOWED_ORIGIN.replace(/\/+$/, "")
      : "";
    const requestOrigin = request.headers.get("Origin");

    if (request.method === "POST" && new URL(request.url).pathname.replace(/\/+$/, "") === "/razorpay/webhook") {
      const result = await handleRazorpayWebhook(request, env);
      return jsonResponse(result.body, result.status, null);
    }

    if (!configuredOrigin || requestOrigin !== configuredOrigin) {
      return errorResponse("This checkout request is not allowed.", 403, null);
    }
    if (request.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": configuredOrigin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
      },
    });
    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    if (request.method === "GET" && path === "/promos/featured") {
      if (!env.ORDERS_DB) return errorResponse("The promo service is not configured.", 503, configuredOrigin);
      try {
        const promo = await getFeaturedPromo(env.ORDERS_DB);
        const response = jsonResponse({ promo }, 200, configuredOrigin);
        response.headers.set("Cache-Control", "public, max-age=60, s-maxage=60");
        return response;
      } catch (error) {
        console.error("Could not load a featured promo.", error);
        return errorResponse("The featured promo is temporarily unavailable.", 503, configuredOrigin);
      }
    }
    if (request.method === "GET" && path === "/custom-fields") {
      if (!env.ORDERS_DB) return jsonResponse({ fields: [] }, 200, configuredOrigin);
      try {
        const fields = await listCustomFields(env.ORDERS_DB, { activeOnly: true });
        const response = jsonResponse({ fields }, 200, configuredOrigin);
        response.headers.set("Cache-Control", "public, max-age=60, s-maxage=60");
        return response;
      } catch (error) {
        console.error("Could not load custom fields.", error);
        return errorResponse("The extra order fields are temporarily unavailable.", 503, configuredOrigin);
      }
    }
    const pincodeMatch = path.match(/^\/pincode\/(\d{6})$/);
    if (request.method === "GET" && pincodeMatch) {
      try {
        const { pincode, city, state } = await lookupPincode(pincodeMatch[1]);
        const response = jsonResponse({ pincode, city, state }, 200, configuredOrigin);
        response.headers.set("Cache-Control", "public, max-age=86400");
        return response;
      } catch (error) {
        const status = error instanceof PincodeLookupError ? error.status : 503;
        return errorResponse(error.message, status, configuredOrigin);
      }
    }
    if (request.method !== "POST") return errorResponse("Method not allowed.", 405, configuredOrigin);

    if (path === "/orders") return handleCreateOrder(request, env, configuredOrigin);
    if (path === "/verify") return handleVerifyPayment(request, env, configuredOrigin);
    if (path === "/promos/quote") return handlePromoQuote(request, env, configuredOrigin);
    if (path === "/promos/release") return handleReleasePromo(request, env, configuredOrigin);
    if (path === "/auth/request-code") {
      const result = await requestLoginCode(request, env);
      return jsonResponse(result.body, result.status, configuredOrigin);
    }
    if (path === "/auth/verify-code") {
      const result = await verifyLoginCode(request, env);
      return jsonResponse(result.body, result.status, configuredOrigin);
    }
    if (path === "/auth/orders") {
      const result = await getCustomerOrders(request, env);
      return jsonResponse(result.body, result.status, configuredOrigin);
    }
    if (path === "/auth/profile/update") {
      const result = await updateCustomerProfile(request, env);
      return jsonResponse(result.body, result.status, configuredOrigin);
    }
    if (path === "/auth/logout") {
      const result = await logoutCustomer(request, env);
      return jsonResponse(result.body, result.status, configuredOrigin);
    }
    if (path === "/admin/data") {
      const result = await getAdminData(request, env);
      return jsonResponse(result.body, result.status, configuredOrigin);
    }
    if (path === "/admin/promos/create") {
      const result = await createAdminPromo(request, env);
      return jsonResponse(result.body, result.status, configuredOrigin);
    }
    if (path === "/admin/promos/update") {
      const result = await updateAdminPromo(request, env);
      return jsonResponse(result.body, result.status, configuredOrigin);
    }
    if (path === "/admin/custom-fields/create") {
      const result = await createAdminCustomField(request, env);
      return jsonResponse(result.body, result.status, configuredOrigin);
    }
    if (path === "/admin/custom-fields/update") {
      const result = await updateAdminCustomField(request, env);
      return jsonResponse(result.body, result.status, configuredOrigin);
    }
    if (path === "/admin/custom-fields/delete") {
      const result = await deleteAdminCustomField(request, env);
      return jsonResponse(result.body, result.status, configuredOrigin);
    }
    if (path === "/admin/customers/create") {
      const result = await createAdminCustomer(request, env);
      return jsonResponse(result.body, result.status, configuredOrigin);
    }
    if (path === "/admin/customers/update") {
      const result = await updateAdminCustomer(request, env);
      return jsonResponse(result.body, result.status, configuredOrigin);
    }
    if (path === "/admin/orders/create") {
      const result = await createManualOrder(request, env);
      return jsonResponse(result.body, result.status, configuredOrigin);
    }
    if (path === "/admin/orders/payment-link") {
      const result = await createAdminPaymentLink(request, env);
      return jsonResponse(result.body, result.status, configuredOrigin);
    }
    if (path === "/admin/orders/mark-paid") {
      const result = await markAdminOrderPaid(request, env);
      return jsonResponse(result.body, result.status, configuredOrigin);
    }
    if (path === "/admin/orders/update-status") {
      const result = await updateAdminOrderStatus(request, env);
      return jsonResponse(result.body, result.status, configuredOrigin);
    }
    return errorResponse("Not found.", 404, configuredOrigin);
  },
};
