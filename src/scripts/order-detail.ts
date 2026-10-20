import { ADMIN_SESSION_KEY, clearCustomerSessionToken, getCustomerSessionToken } from "./cart";
import { buildOrderProgress } from "./order-progress";
import {
  answerLines,
  ORDER_STATUS_LABELS,
  type OrderView,
  formatAddress,
  formatDate,
  formatEventDate,
  formatMoney,
  paymentLabels,
  printInvoice,
  toOrderView,
} from "./order-view";

const root = document.querySelector<HTMLElement>("#order-detail-page");

if (root) {
  const apiUrl = (root.dataset.checkoutApi ?? "").replace(/\/+$/, "");
  const baseUrl = root.dataset.baseUrl ?? "/";
  const title = root.querySelector<HTMLElement>("#order-title");
  const message = root.querySelector<HTMLElement>("#order-status-message");
  const container = root.querySelector<HTMLElement>("#order-detail");
  const invoice = root.querySelector<HTMLElement>("#order-invoice-print");
  const backLink = root.querySelector<HTMLAnchorElement>("#order-back-link");
  if (!title || !message || !container || !invoice || !backLink) throw new Error("The order page is incomplete.");

  class ApiError extends Error {
    constructor(text: string, readonly status: number) {
      super(text);
    }
  }

  async function post(path: string, token: string, body?: unknown) {
    if (!apiUrl) throw new ApiError("Order details are unavailable right now. Please try again later.", 0);
    let response: Response;
    try {
      response = await fetch(`${apiUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new ApiError("Could not reach the order service. Check your connection and try again.", 0);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError("The order service returned an unreadable response.", response.status);
    }
    const result = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
    if (!response.ok) {
      throw new ApiError(typeof result.error === "string" ? result.error : "The request could not be completed.", response.status);
    }
    return result;
  }

  function el(tag: string, text = "", className = "") {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function row(label: string, value: string) {
    const wrapper = el("div", "", "order-detail-row");
    wrapper.append(el("dt", label), el("dd", value));
    return wrapper;
  }

  function section(heading: string) {
    const block = el("section", "", "order-detail-block");
    block.append(el("h2", heading));
    return block;
  }

  interface RenderOptions {
    admin?: { statuses: string[]; token: string; onChange: (order: OrderView) => void };
  }

  function render(order: OrderView, options: RenderOptions = {}) {
    container!.replaceChildren();
    container!.hidden = false;
    title!.textContent = `Order ${order.orderId}`;
    const payment = paymentLabels(order);

    const summary = el("div", "", "order-detail-summary");
    summary.append(
      el("span", ORDER_STATUS_LABELS[order.orderStatus] ?? order.orderStatus, `order-status-pill is-${order.orderStatus}`),
      el("span", [formatDate(order.createdAt, "long"), `${payment.state} · ${payment.method}`].filter(Boolean).join(" · "), "order-detail-meta"),
    );
    container!.append(summary);

    const progress = buildOrderProgress(order.orderStatus);
    if (progress) container!.append(progress);

    if (options.admin) {
      const { statuses, token, onChange } = options.admin;
      const form = el("form", "", "order-admin-status");
      const label = el("label", "Update order status");
      const select = document.createElement("select");
      statuses.forEach((value) => select.append(new Option(ORDER_STATUS_LABELS[value] ?? value, value)));
      select.value = order.orderStatus;
      label.append(select);
      const button = el("button", "Update status", "button button-primary");
      button.setAttribute("type", "submit");
      const feedback = el("p", "", "order-admin-feedback");
      feedback.setAttribute("role", "status");
      form.append(label, button, feedback);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        (button as HTMLButtonElement).disabled = true;
        feedback.textContent = "";
        try {
          await post("/admin/orders/update-status", token, { orderId: order.orderId, orderStatus: select.value });
          onChange({ ...order, orderStatus: select.value });
        } catch (error) {
          feedback.textContent = error instanceof Error ? error.message : "Could not update this order.";
          feedback.setAttribute("data-state", "error");
          (button as HTMLButtonElement).disabled = false;
        }
      });
      container!.append(form);
    }

    const items = section("Items");
    const list = el("ul", "", "thank-you-items");
    for (const item of order.items) {
      const line = document.createElement("li");
      const details = document.createElement("div");
      details.append(el("strong", `${item.name} × ${item.quantity}`));
      if (item.flavour) details.append(el("span", `Flavour: ${item.flavour}`));
      if (item.wrapper) details.append(el("span", `Wrapper: ${item.wrapper}`));
      for (const line of answerLines(item.custom)) details.append(el("span", line));
      line.append(details, el("span", formatMoney(item.unitPriceRupees * item.quantity * 100)));
      list.append(line);
    }
    items.append(list);
    const totals = (label: string, value: string, strong = false) => {
      const total = el("div", "", "subtotal-row thank-you-total");
      total.append(el("span", label), el("strong", value));
      if (strong) total.classList.add("is-grand-total");
      items.append(total);
    };
    if (order.discountPaise > 0) {
      totals("Product subtotal", formatMoney(order.productSubtotalPaise));
      totals(`Promo ${order.promoCode}`, `−${formatMoney(order.discountPaise)}`);
    }
    totals(order.paymentMethod === "promo" ? "Total due" : order.paymentStatus === "paid" ? "Paid" : "Total", formatMoney(order.amountPaise), true);
    container!.append(items);

    const delivery = section("Delivery details");
    const rows = el("dl", "", "order-detail-rows");
    rows.append(row("Name", order.customerName), row("Phone", order.customerPhone));
    if (order.customerEmail) rows.append(row("Email", order.customerEmail));
    rows.append(row("Address", formatAddress(order)));
    if (order.eventDate) rows.append(row("Event date", formatEventDate(order.eventDate, "long")));
    if (order.deliveryMethod) rows.append(row("Fulfilment", order.deliveryMethod));
for (const answer of order.customFields) rows.append(row(answer.label, answer.value));
    delivery.append(rows);
    container!.append(delivery);

    if (options.admin) {
      const paymentBlock = section("Payment");
      const paymentRows = el("dl", "", "order-detail-rows");
      paymentRows.append(row("Status", `${payment.state} · ${payment.method}`));
      if (order.razorpayOrderId) paymentRows.append(row("Razorpay order", order.razorpayOrderId));
      if (order.paymentId) paymentRows.append(row("Razorpay payment", order.paymentId));
      paymentBlock.append(paymentRows);
      container!.append(paymentBlock);
    }

    const actions = el("div", "", "order-detail-actions");
    const download = el("button", "Download invoice", "button button-primary");
    download.setAttribute("type", "button");
    download.addEventListener("click", () => printInvoice(invoice!, order));
    actions.append(download);
    container!.append(actions);
    container!.append(el("p", "Choose “Save as PDF” in the print window to download the invoice.", "order-detail-hint"));
  }

  async function loadAsAdmin(orderId: string) {
    const token = sessionStorage.getItem(ADMIN_SESSION_KEY) ?? "";
    if (!token) return false;
    let result: Record<string, unknown>;
    try {
      result = await post("/admin/data", token);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        if (error.status === 401) sessionStorage.removeItem(ADMIN_SESSION_KEY);
        return false;
      }
      throw error;
    }
    const statuses = Array.isArray(result.orderStatuses) ? result.orderStatuses.filter((s): s is string => typeof s === "string") : [];
    const orders = Array.isArray(result.orders) ? result.orders : [];
    const match = orders.map(toOrderView).find((entry) => entry?.orderId === orderId);
    backLink!.href = `${baseUrl}admin/`;
    backLink!.textContent = "← Back to admin";
    if (!match) {
      message!.textContent = "This order was not found.";
      return true;
    }
    const show = (order: OrderView, note = "") => {
      render(order, { admin: { statuses, token, onChange: (updated) => show(updated, `Status updated to ${ORDER_STATUS_LABELS[updated.orderStatus] ?? updated.orderStatus}.`) } });
      message!.textContent = note;
    };
    show(match);
    message!.textContent = "";
    return true;
  }

  async function loadAsCustomer(orderId: string) {
    const token = getCustomerSessionToken();
    if (!/^[0-9a-f]{64}$/.test(token)) {
      message!.textContent = "Sign in from your profile to view this order.";
      const link = el("a", "Go to sign in", "text-link");
      (link as HTMLAnchorElement).href = `${baseUrl}account/`;
      message!.append(" ", link);
      return;
    }
    try {
      const result = await post("/auth/orders", token);
      const accountEmail = typeof result.email === "string" ? result.email : "";
      const orders = Array.isArray(result.orders) ? result.orders : [];
      const match = orders.map(toOrderView).find((entry) => entry?.orderId === orderId);
      if (!match) {
        message!.textContent = "We couldn’t find this order in your account.";
        return;
      }
      render({ ...match, customerEmail: match.customerEmail || accountEmail });
      message!.textContent = "";
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) clearCustomerSessionToken();
      throw error;
    }
  }

  async function load() {
    const orderId = new URLSearchParams(window.location.search).get("id")?.trim() ?? "";
    if (!orderId) {
      message!.textContent = "This order link is missing its reference. Open an order from your profile.";
      return;
    }
    if (await loadAsAdmin(orderId)) return;
    await loadAsCustomer(orderId);
  }

  void load().catch((error: unknown) => {
    message!.textContent = error instanceof Error ? error.message : "Could not load this order.";
  });
}
