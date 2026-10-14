import products from "../src/data/products.json" with { type: "json" };
import {
  getDistanceKm,
  getFulfillmentMethod,
  getStoreLocation,
  isValidDeliveryLocation,
} from "./delivery.js";
import { parsePaidOrderNotes, savePaidOrder } from "./orders.js";
import {
  getCustomerOrders,
  logoutCustomer,
  requestLoginCode,
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
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
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

function validateOrder(body, storeLocation) {
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
  if (!isValidDeliveryLocation(body.deliveryLocation)) {
    throw new Error("Please enter valid coordinates for your delivery address pin.");
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
        typeof item.wrapper !== "string" || item.wrapper.trim().length < 3 ||
        item.wrapper.trim().length > 120) {
      throw new Error("Each product needs a valid quantity, any required flavour choice, and a wrapper description (3 to 120 characters).");
    }
    const product = productById.get(item.id);
    if (!product) throw new Error("A product in your bag is no longer available.");
    if (
      (product.flavours.length > 0 && !product.flavours.includes(item.flavour)) ||
      (product.flavours.length === 0 && item.flavour !== "")
    ) {
      throw new Error("Choose a valid flavour for each product that offers one.");
    }
    const variantKey = JSON.stringify([item.id, item.flavour, item.wrapper]);
    if (seen.has(variantKey)) throw new Error("Your bag contains the same product options more than once.");
    seen.add(variantKey);
    return {
      product,
      quantity: item.quantity,
      flavour: item.flavour,
      wrapper: item.wrapper.trim(),
    };
  });

  const amount = items.reduce((sum, item) => sum + item.product.price * item.quantity * 100, 0);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Your order total is invalid.");
  const distanceKm = getDistanceKm(storeLocation, body.deliveryLocation);
  return {
    customer,
    items,
    amount,
    distanceKm,
    fulfillmentMethod: getFulfillmentMethod(distanceKm),
  };
}

function hexToBytes(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g), (byte) => parseInt(byte, 16));
}

async function handleCreateOrder(request, env, origin) {
  if (!env.ORDERS_DB) {
    return errorResponse("The order database is not configured yet. Please contact the shop.", 503, origin);
  }
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return errorResponse("Secure payments are not configured yet. Please contact the shop.", 503, origin);
  }

  const storeLocation = getStoreLocation(env);
  if (!storeLocation) {
    return errorResponse("Delivery-distance checkout is not configured yet. Please contact the shop.", 503, origin);
  }

  let order;
  try {
    order = validateOrder(await readBody(request), storeLocation);
  } catch (error) {
    return errorResponse(error.message, 400, origin);
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
    ...itemNotes,
    delivery_method: order.fulfillmentMethod,
    distance_km: order.distanceKm.toFixed(2),
    policies_ok: "terms_conditions, privacy_policy, shipping_policy",
  };
  const payload = {
    amount: order.amount,
    currency: "INR",
    receipt: `ck_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
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

  return jsonResponse({
    id: providerOrder.id,
    amount: providerOrder.amount,
    currency: providerOrder.currency,
    keyId: env.RAZORPAY_KEY_ID,
    fulfillmentMethod: order.fulfillmentMethod,
    distanceKm: Number(order.distanceKm.toFixed(2)),
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

  let paidOrder;
  try {
    paidOrder = parsePaidOrderNotes(
      verifiedOrder.id,
      payment.id,
      verifiedOrder.notes,
      verifiedOrder.amount,
    );
  } catch (error) {
    console.error("The captured Razorpay order could not be reconciled with its order details.", error);
    return errorResponse(
      "Your payment was received, but the order could not be saved. Please do not pay again; contact the shop with your Razorpay order ID.",
      502,
      origin,
    );
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

  return jsonResponse({
    verified: true,
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

    if (!configuredOrigin || requestOrigin !== configuredOrigin) {
      return errorResponse("This checkout request is not allowed.", 403, null);
    }
    if (request.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": configuredOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
      },
    });
    if (request.method !== "POST") return errorResponse("Method not allowed.", 405, configuredOrigin);

    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    if (path === "/orders") return handleCreateOrder(request, env, configuredOrigin);
    if (path === "/verify") return handleVerifyPayment(request, env, configuredOrigin);
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
    if (path === "/auth/logout") {
      const result = await logoutCustomer(request, env);
      return jsonResponse(result.body, result.status, configuredOrigin);
    }
    return errorResponse("Not found.", 404, configuredOrigin);
  },
};
