import { ORDER_ID_PATTERN } from "./order-id.js";

function result(status, body) {
  return { status, body };
}

function lastTenDigits(value) {
  return String(value ?? "").replace(/\D/g, "").slice(-10);
}

export function contactMatches(order, contact) {
  const text = String(contact ?? "").trim();
  if (text.includes("@")) {
    return text.toLowerCase() === String(order.customer_email ?? "").trim().toLowerCase();
  }
  const digits = lastTenDigits(text);
  return digits.length >= 10 && digits === lastTenDigits(order.customer_phone);
}

function parseItems(json) {
  try {
    const items = JSON.parse(json);
    return Array.isArray(items)
      ? items.map((item) => ({ name: String(item?.name ?? "Product"), quantity: Number(item?.quantity) || 1 }))
      : [];
  } catch {
    return [];
  }
}

// Public tracking: the order ID plus the phone or email used on the order. Returns no address or contact details.
export async function trackOrder(request, env) {
  if (!env.ORDERS_DB) return result(503, { error: "Order tracking is not available right now." });
  let body;
  try {
    body = await request.json();
  } catch {
    return result(400, { error: "Enter your order number and phone number or email." });
  }
  const orderId = String(body?.orderId ?? "").trim().toUpperCase();
  const contact = String(body?.contact ?? "").trim();
  if (!ORDER_ID_PATTERN.test(orderId) || contact.length < 5 || contact.length > 120) {
    return result(400, { error: "Enter your order number (like CC-240101-AB12C) and the phone number or email on the order." });
  }
  try {
    const order = await env.ORDERS_DB
      .prepare(
        `SELECT order_id, order_status, payment_status, delivery_method, created_at, event_date,
                items_json, customer_phone, customer_email
         FROM orders WHERE order_id = ?`,
      )
      .bind(orderId)
      .first();
    if (!order || !contactMatches(order, contact)) {
      return result(404, { error: "We couldn't find an order with those details. Please check and try again." });
    }
    return result(200, {
      order: {
        orderId: order.order_id,
        orderStatus: order.order_status,
        paymentStatus: order.payment_status,
        deliveryMethod: order.delivery_method,
        createdAt: order.created_at,
        eventDate: order.event_date || "",
        items: parseItems(order.items_json),
      },
    });
  } catch (error) {
    console.error("Could not track an order.", error);
    return result(503, { error: "Order tracking is unavailable right now. Please try again shortly." });
  }
}
