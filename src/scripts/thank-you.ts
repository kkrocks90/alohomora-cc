import { CUSTOMER_SESSION_KEY } from "./cart";

interface OrderItem {
  name: string;
  quantity: number;
  flavour: string;
  wrapper: string;
  unitPriceRupees: number;
}

interface OrderDetails {
  orderId: string;
  status: string;
  items: OrderItem[];
  amountPaise: number;
  deliveryMethod: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  eventDate: string;
}

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`The thank-you page is missing ${selector}.`);
  return element;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOrder(value: unknown): value is OrderDetails {
  if (!isRecord(value) || !Array.isArray(value.items)) return false;
  return typeof value.orderId === "string" &&
    typeof value.status === "string" &&
    value.status === "paid" &&
    typeof value.amountPaise === "number" &&
    typeof value.deliveryMethod === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.customerName === "string" &&
    typeof value.customerPhone === "string" &&
    typeof value.deliveryAddress === "string" &&
    typeof value.eventDate === "string" &&
    value.items.every((item) =>
      isRecord(item) &&
      typeof item.name === "string" &&
      typeof item.quantity === "number" &&
      typeof item.flavour === "string" &&
      typeof item.wrapper === "string" &&
      typeof item.unitPriceRupees === "number",
    );
}

const root = requireElement<HTMLElement>("#thank-you-page");
const status = requireElement<HTMLElement>("#thank-you-status");
const orderContainer = requireElement<HTMLElement>("#thank-you-order");
const apiUrl = (root.dataset.checkoutApi ?? "").replace(/\/+$/, "");
const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function appendText(parent: HTMLElement, tagName: "h2" | "h3" | "p" | "strong" | "span", text: string, className = "") {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function renderOrder(order: OrderDetails) {
  orderContainer.replaceChildren();
  orderContainer.hidden = false;
  appendText(orderContainer, "h2", `Order ${order.orderId}`, "thank-you-order-id");
  const date = new Date(order.createdAt);
  appendText(
    orderContainer,
    "p",
    Number.isNaN(date.valueOf()) ? "Payment confirmed" : `Payment confirmed · ${date.toLocaleString("en-IN")}`,
    "thank-you-meta",
  );

  const itemList = document.createElement("ul");
  itemList.className = "thank-you-items";
  for (const item of order.items) {
    const line = document.createElement("li");
    const details = document.createElement("div");
    appendText(details, "strong", `${item.name} × ${item.quantity}`);
    if (item.flavour) appendText(details, "span", `Flavour: ${item.flavour}`);
    appendText(details, "span", `Wrapper: ${item.wrapper}`);
    appendText(line, "span", currency.format(item.unitPriceRupees * item.quantity));
    line.prepend(details);
    itemList.append(line);
  }
  orderContainer.append(itemList);

  const total = document.createElement("div");
  total.className = "subtotal-row thank-you-total";
  appendText(total, "span", "Paid");
  appendText(total, "strong", currency.format(order.amountPaise / 100));
  orderContainer.append(total);

  const delivery = document.createElement("div");
  delivery.className = "thank-you-delivery";
  appendText(delivery, "h3", "Delivery details");
  appendText(delivery, "p", order.customerName);
  appendText(delivery, "p", order.customerPhone);
  appendText(delivery, "p", order.deliveryAddress);
  if (order.eventDate) {
    const eventDate = new Date(`${order.eventDate}T00:00:00`);
    appendText(
      delivery,
      "p",
      `Event date: ${Number.isNaN(eventDate.valueOf()) ? order.eventDate : eventDate.toLocaleDateString("en-IN", { dateStyle: "long" })}`,
    );
  }
  appendText(delivery, "p", `Suggested fulfillment: ${order.deliveryMethod}. The shop will confirm arrangements with you.`);
  orderContainer.append(delivery);
}

async function loadOrder() {
  const orderId = new URLSearchParams(window.location.search).get("order");
  if (!orderId) {
    status.textContent = "Your order link is missing its reference. Sign in to view your order history.";
    return;
  }
  const token = sessionStorage.getItem(CUSTOMER_SESSION_KEY) ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) {
    status.textContent = "Sign in to view your verified order details.";
    return;
  }
  if (!apiUrl) {
    status.textContent = "Order details are unavailable right now. Please visit your profile.";
    return;
  }
  const response = await fetch(`${apiUrl}/auth/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Could not read your order details.");
  }
  if (!response.ok) {
    if (response.status === 401) sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
    throw new Error(isRecord(payload) && typeof payload.error === "string"
      ? payload.error
      : "Could not load your order details.");
  }
  if (!isRecord(payload) || !Array.isArray(payload.orders)) {
    throw new Error("The order service returned an invalid response.");
  }
  const order = payload.orders.find((entry) => isOrder(entry) && entry.orderId === orderId);
  if (!isOrder(order)) {
    status.textContent = "We couldn’t find this paid order in your account. Check your profile or contact the shop.";
    return;
  }
  renderOrder(order);
  status.textContent = "Your payment has been confirmed. The shop will follow up about delivery.";
}

void loadOrder().catch((error: unknown) => {
  status.textContent = error instanceof Error ? error.message : "Could not load your order details.";
});
