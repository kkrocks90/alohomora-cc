export interface OrderViewItem {
  name: string;
  quantity: number;
  unitPriceRupees: number;
  flavour: string;
  wrapper: string;
}

export interface OrderView {
  orderId: string;
  orderStatus: string;
  paymentStatus: "paid" | "unpaid";
  paymentMethod: string;
  items: OrderViewItem[];
  amountPaise: number;
  productSubtotalPaise: number;
  discountPaise: number;
  promoCode: string;
  deliveryMethod: string;
  eventDate: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deliveryAddress: string;
  city: string;
  state: string;
  pincode: string;
  razorpayOrderId?: string | null;
  paymentId?: string | null;
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  received: "Received",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export function formatMoney(paise: number) {
  return currency.format(paise / 100);
}

export function formatDate(value: string, dateStyle: "medium" | "long" = "medium") {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : date.toLocaleDateString("en-IN", { dateStyle });
}

export function formatEventDate(value: string, dateStyle: "medium" | "long" = "medium") {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString("en-IN", { dateStyle });
}

export function formatAddress(order: Pick<OrderView, "deliveryAddress" | "city" | "state" | "pincode">) {
  return [order.deliveryAddress, order.city, order.state, order.pincode].filter(Boolean).join(", ");
}

export function paymentLabels(order: Pick<OrderView, "paymentMethod" | "paymentStatus">) {
  const method = order.paymentMethod === "manual"
    ? "Manual order"
    : order.paymentMethod === "promo" ? "Promo code" : "Razorpay";
  const state = order.paymentMethod === "promo"
    ? "No payment due"
    : order.paymentStatus === "paid" ? "Paid" : "Unpaid";
  return { method, state };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

// Accepts both the customer (/auth/orders) and admin (/admin/data) order shapes.
export function toOrderView(value: unknown): OrderView | null {
  if (!isRecord(value) || typeof value.orderId !== "string" || !Array.isArray(value.items)) return null;
  const paymentStatus = (value.paymentStatus ?? value.status) === "paid" ? "paid" : "unpaid";
  const amountPaise = number(value.amountPaise);
  return {
    orderId: value.orderId,
    orderStatus: text(value.orderStatus) || "received",
    paymentStatus,
    paymentMethod: text(value.paymentMethod) || "razorpay",
    items: value.items.filter(isRecord).map((item) => ({
      name: text(item.name) || "Product",
      quantity: number(item.quantity) || 1,
      unitPriceRupees: number(item.unitPriceRupees),
      flavour: text(item.flavour),
      wrapper: text(item.wrapper),
    })),
    amountPaise,
    productSubtotalPaise: typeof value.productSubtotalPaise === "number" ? value.productSubtotalPaise : amountPaise,
    discountPaise: number(value.discountPaise),
    promoCode: text(value.promoCode),
    deliveryMethod: text(value.deliveryMethod),
    eventDate: text(value.eventDate),
    createdAt: text(value.createdAt),
    customerName: text(value.customerName),
    customerPhone: text(value.customerPhone),
    customerEmail: text(value.customerEmail),
    deliveryAddress: text(value.deliveryAddress),
    city: text(value.city),
    state: text(value.state),
    pincode: text(value.pincode),
    razorpayOrderId: typeof value.razorpayOrderId === "string" ? value.razorpayOrderId : null,
    paymentId: typeof value.paymentId === "string" ? value.paymentId : null,
  };
}

function appendText(parent: HTMLElement, tagName: string, value: string, className = "") {
  const element = document.createElement(tagName);
  element.textContent = value;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

export function renderInvoice(container: HTMLElement, order: OrderView, customerEmail = order.customerEmail) {
  container.replaceChildren();
  const heading = document.createElement("div");
  heading.className = "invoice-heading";
  appendText(heading, "p", "CHOCOLATE CIRCLE", "invoice-brand");
  appendText(heading, "h1", "Order invoice");
  appendText(heading, "p", `Order ${order.orderId}`);
  container.append(heading);

  const meta = document.createElement("div");
  meta.className = "invoice-meta";
  const customerBlock = document.createElement("section");
  appendText(customerBlock, "h2", "Customer");
  appendText(customerBlock, "p", order.customerName);
  appendText(customerBlock, "p", order.customerPhone);
  if (customerEmail) appendText(customerBlock, "p", customerEmail);
  appendText(customerBlock, "p", formatAddress(order));
  const orderBlock = document.createElement("section");
  appendText(orderBlock, "h2", "Order details");
  const date = formatDate(order.createdAt);
  if (date) appendText(orderBlock, "p", `Date: ${date}`);
  appendText(orderBlock, "p", `Status: ${ORDER_STATUS_LABELS[order.orderStatus] ?? order.orderStatus}`);
  const payment = paymentLabels(order);
  appendText(orderBlock, "p", `Payment: ${payment.state} (${payment.method})`);
  if (order.eventDate) appendText(orderBlock, "p", `Event date: ${formatEventDate(order.eventDate)}`);
  if (order.deliveryMethod) appendText(orderBlock, "p", order.deliveryMethod);
  meta.append(customerBlock, orderBlock);
  container.append(meta);

  const table = document.createElement("table");
  table.className = "invoice-items";
  const head = document.createElement("thead");
  const header = document.createElement("tr");
  ["Item", "Qty", "Unit price", "Amount"].forEach((label) => appendText(header, "th", label));
  head.append(header);
  const body = document.createElement("tbody");
  for (const item of order.items) {
    const row = document.createElement("tr");
    const description = document.createElement("td");
    appendText(description, "strong", item.name);
    appendText(description, "span", [item.flavour ? `Flavour: ${item.flavour}` : "", item.wrapper].filter(Boolean).join(" · "));
    row.append(description);
    appendText(row, "td", String(item.quantity));
    appendText(row, "td", formatMoney(item.unitPriceRupees * 100));
    appendText(row, "td", formatMoney(item.unitPriceRupees * item.quantity * 100));
    body.append(row);
  }
  table.append(head, body);
  container.append(table);

  appendText(container, "p", `Product subtotal: ${formatMoney(order.productSubtotalPaise)}`, "invoice-total");
  if (order.discountPaise > 0) {
    appendText(container, "p", `Promo ${order.promoCode}: −${formatMoney(order.discountPaise)}`, "invoice-note");
    appendText(container, "p", `${order.paymentMethod === "promo" ? "Total due" : "Paid total"}: ${formatMoney(order.amountPaise)}`, "invoice-total");
  }
  appendText(
    container,
    "p",
    "This is an order invoice/receipt, not a GST tax invoice. Delivery charges, if any, are not included in this product total.",
    "invoice-note",
  );
}

// Opens the browser's print dialog, where "Save as PDF" downloads the invoice.
export function printInvoice(container: HTMLElement, order: OrderView, customerEmail?: string) {
  renderInvoice(container, order, customerEmail);
  container.hidden = false;
  const previousTitle = document.title;
  document.title = `Invoice-${order.orderId}`;
  const restore = () => {
    document.title = previousTitle;
    container.replaceChildren();
    container.hidden = true;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
}

export function buildShareMessage(order: OrderView, storeUrl: string) {
  const lines = [
    "🍫 My Chocolate Circle order",
    `Order ID: ${order.orderId}`,
    "",
    ...order.items.map((item) => {
      const extras = [item.flavour, item.wrapper].filter(Boolean).join(", ");
      return `• ${item.name} × ${item.quantity}${extras ? ` (${extras})` : ""}`;
    }),
    "",
    order.discountPaise > 0
      ? `Total: ${formatMoney(order.amountPaise)} (promo ${order.promoCode} applied)`
      : `Total: ${formatMoney(order.amountPaise)}`,
  ];
  if (order.eventDate) lines.push(`Event date: ${formatEventDate(order.eventDate, "long")}`);
  if (order.deliveryMethod) lines.push(`Delivery: ${order.deliveryMethod}`);
  lines.push("", `Handmade chocolates from Chocolate Circle: ${storeUrl}`);
  return lines.join("\n");
}
