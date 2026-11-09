import { buildOrderProgress } from "./order-progress";
import { ORDER_STATUS_LABELS } from "./order-view";

const root = document.querySelector<HTMLElement>("#track-page");

if (root) {
  const apiUrl = (root.dataset.checkoutApi ?? "").replace(/\/+$/, "");
  const form = root.querySelector<HTMLFormElement>("#track-form");
  const status = root.querySelector<HTMLElement>("#track-status");
  const result = root.querySelector<HTMLElement>("#track-result");
  if (!form || !status || !result) throw new Error("The tracking page is incomplete.");

  const orderField = form.elements.namedItem("orderId") as HTMLInputElement;
  const contactField = form.elements.namedItem("contact") as HTMLInputElement;
  const preset = new URLSearchParams(window.location.search).get("order");
  if (preset) orderField.value = preset.toUpperCase();

  const DELIVERY_LABELS: Record<string, string> = {
    "Porter (manual booking)": "Local delivery",
    "Courier (manual booking)": "Courier",
  };

  const STATUS_NOTES: Record<string, string> = {
    received: "We have your order and will confirm it shortly.",
    confirmed: "Your order is confirmed.",
    preparing: "We are making your chocolates.",
    ready: "Your order is packed and ready.",
    out_for_delivery: "Your order is on its way.",
    delivered: "Your order has been delivered. Enjoy!",
    cancelled: "This order was cancelled. Please contact us if this is unexpected.",
  };

  function el(tag: string, text = "", className = "") {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  interface Tracked {
    orderId: string;
    orderStatus: string;
    deliveryMethod: string;
    createdAt: string;
    eventDate: string;
    items: Array<{ name: string; quantity: number }>;
  }

  function show(order: Tracked) {
    const placed = new Date(order.createdAt);
    const heading = el("h2", `Order ${order.orderId}`);
    const pill = el("span", ORDER_STATUS_LABELS[order.orderStatus] ?? order.orderStatus, `order-status-pill is-${order.orderStatus}`);
    const meta = [
      Number.isNaN(placed.getTime()) ? "" : `Placed ${placed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`,
      DELIVERY_LABELS[order.deliveryMethod] ?? "",
      order.eventDate ? `For ${order.eventDate}` : "",
    ].filter(Boolean);
    const list = el("ul");
    for (const item of order.items) list.append(el("li", `${item.name} × ${item.quantity}`));
    const progress = buildOrderProgress(order.orderStatus);
    result!.replaceChildren(heading, pill, ...(progress ? [progress] : []), el("p", STATUS_NOTES[order.orderStatus] ?? ""), list, el("p", meta.join(" · "), "track-meta"));
    result!.hidden = false;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (submit) submit.disabled = true;
    result.hidden = true;
    status.textContent = "Looking for your order…";
    try {
      if (!apiUrl) throw new Error("Order tracking is unavailable right now.");
      const response = await fetch(`${apiUrl}/orders/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderField.value.trim(), contact: contactField.value.trim() }),
      }).catch(() => {
        throw new Error("Could not reach the order service. Check your connection and try again.");
      });
      const payload = (await response.json().catch(() => ({}))) as { order?: Tracked; error?: string };
      if (!response.ok || !payload.order) throw new Error(payload.error || "We couldn't find that order.");
      status.textContent = "";
      show(payload.order);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "We couldn't find that order.";
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}
