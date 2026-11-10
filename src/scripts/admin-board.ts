export interface BoardOrder {
  orderId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  city: string;
  state: string;
  pincode: string;
  items: { name: string; quantity: number; flavour: string; wrapper: string; custom: { label: string; value: string }[] }[];
  customFields: { label: string; value: string }[];
  amountPaise: number;
  amountReceivedPaise?: number;
  paymentStatus: "paid" | "unpaid";
  paymentMethod: "razorpay" | "manual" | "promo";
  orderStatus: string;
  deliveryMethod: string;
  eventDate: string;
  createdAt: string;
}

interface BoardOptions {
  panel: HTMLElement;
  getOrders: () => BoardOrder[];
  moveOrder: (orderId: string, status: string) => Promise<void>;
  money: (paise: number) => string;
  invoice: (order: BoardOrder) => void;
  shareText: (order: BoardOrder) => string;
  notify: (message: string, error?: boolean) => void;
}

const COLUMNS: { status: string; label: string; hint: string }[] = [
  { status: "confirmed", label: "Confirmed", hint: "Accepted" },
  { status: "preparing", label: "Preparing", hint: "Being made" },
  { status: "ready", label: "Ready", hint: "Packed" },
  { status: "out_for_delivery", label: "Out for delivery", hint: "On the way" },
];
const CLOSED = new Set(["delivered", "cancelled"]);
const DELIVERED_LIMIT = 12;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function startOfToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dueInfo(order: BoardOrder) {
  if (!order.eventDate) return null;
  const due = new Date(`${order.eventDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const days = Math.round((due.getTime() - startOfToday().getTime()) / 86_400_000);
  const date = due.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (CLOSED.has(order.orderStatus)) return { text: date, tone: "done", days };
  if (days < 0) return { text: `Overdue · ${date}`, tone: "late", days };
  if (days === 0) return { text: "Due today", tone: "soon", days };
  if (days === 1) return { text: "Due tomorrow", tone: "soon", days };
  return { text: date, tone: "later", days };
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1]![0]! : "")).toUpperCase();
}

function receivedPaise(order: BoardOrder) {
  return order.paymentStatus === "paid" ? order.amountPaise : order.amountReceivedPaise ?? 0;
}

function paymentChip(order: BoardOrder) {
  if (order.paymentMethod === "promo") return { text: "No payment", tone: "none" };
  if (order.paymentStatus === "paid") return { text: "Paid", tone: "paid" };
  return receivedPaise(order) > 0 ? { text: "Part paid", tone: "part" } : { text: "Unpaid", tone: "unpaid" };
}

function itemSummary(order: BoardOrder) {
  const [first, ...rest] = order.items;
  if (!first) return "No items";
  return `${first.name} × ${first.quantity}${rest.length ? ` +${rest.length} more` : ""}`;
}

export function initBoard(options: BoardOptions) {
  const { panel } = options;
  const board = panel.querySelector<HTMLElement>("#kb-board");
  const search = panel.querySelector<HTMLInputElement>("#kb-search");
  const filters = panel.querySelector<HTMLElement>("#kb-filters");
  const drawer = panel.querySelector<HTMLElement>("#kb-drawer");
  const backdrop = panel.querySelector<HTMLElement>("#kb-backdrop");
  if (!board || !search || !filters || !drawer || !backdrop) throw new Error("The order board markup is missing.");

  let filter = "all";
  let showAllDelivered = false;
  let openOrderId: string | null = null;
  let dragId: string | null = null;

  function matches(order: BoardOrder) {
    const query = search!.value.trim().toLowerCase();
    if (query) {
      const haystack = `${order.orderId} ${order.customerName} ${order.customerPhone} ${order.items.map((item) => item.name).join(" ")}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (filter === "all") return true;
    const open = !CLOSED.has(order.orderStatus);
    const due = dueInfo(order);
    if (!open || !due) return false;
    if (filter === "overdue") return due.days < 0;
    if (filter === "today") return due.days === 0;
    if (filter === "week") return due.days >= 0 && due.days <= 7;
    return true;
  }

  function sorted(list: BoardOrder[], status: string) {
    return [...list].sort((a, b) => {
      if (status !== "delivered" && status !== "cancelled") {
        const da = a.eventDate || "9999-12-31";
        const db = b.eventDate || "9999-12-31";
        if (da !== db) return da < db ? -1 : 1;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  async function move(orderId: string, status: string) {
    const order = options.getOrders().find((entry) => entry.orderId === orderId);
    if (!order || order.orderStatus === status) return;
    const previous = order.orderStatus;
    order.orderStatus = status;
    render();
    try {
      await options.moveOrder(orderId, status);
      options.notify(`${orderId} moved to ${COLUMNS.find((column) => column.status === status)?.label ?? status}.`);
    } catch (error) {
      order.orderStatus = previous;
      options.notify(error instanceof Error ? error.message : "Could not move the order.", true);
    }
    render();
  }

  function renderCard(order: BoardOrder) {
    const card = el("article", "kb-card");
    card.draggable = true;
    card.tabIndex = 0;
    card.dataset.orderId = order.orderId;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Open order ${order.orderId} for ${order.customerName}`);

    const top = el("div", "kb-card-top");
    top.append(el("span", "kb-card-id", order.orderId), el("span", "kb-avatar", initials(order.customerName)));
    const name = el("strong", "kb-card-name", order.customerName);
    const items = el("p", "kb-card-items", itemSummary(order));

    const chips = el("div", "kb-chips");
    const due = dueInfo(order);
    if (due) chips.append(el("span", `kb-chip kb-due-${due.tone}`, `📅 ${due.text}`));
    const pay = paymentChip(order);
    if (!CLOSED.has(order.orderStatus) || order.orderStatus === "delivered") chips.append(el("span", `kb-chip kb-pay-${pay.tone}`, pay.text));
    if (order.city) chips.append(el("span", "kb-chip", order.city));

    const foot = el("div", "kb-card-foot");
    foot.append(el("b", "", options.money(order.amountPaise / 100)));
    card.append(top, name, items, chips, foot);

    card.addEventListener("click", () => openDrawer(order.orderId));
    card.addEventListener("keydown", (event) => {
      if (event.target === card && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        openDrawer(order.orderId);
      }
    });
    card.addEventListener("dragstart", (event) => {
      dragId = order.orderId;
      event.dataTransfer?.setData("text/plain", order.orderId);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      requestAnimationFrame(() => card.classList.add("is-dragging"));
    });
    card.addEventListener("dragend", () => {
      dragId = null;
      card.classList.remove("is-dragging");
      board!.querySelectorAll(".is-over").forEach((node) => node.classList.remove("is-over"));
    });
    return card;
  }

  function render() {
    const all = options.getOrders();
    const visible = all.filter(matches);
    board!.replaceChildren();

    for (const column of COLUMNS) {
      let list = sorted(visible.filter((order) => order.orderStatus === column.status), column.status);
      const total = list.length;
      const sum = list.reduce((acc, order) => acc + order.amountPaise, 0);
      if (column.status === "delivered" && !showAllDelivered) list = list.slice(0, DELIVERED_LIMIT);

      const section = el("section", `kb-column kb-col-${column.status}`);
      section.dataset.status = column.status;
      const head = el("header", "kb-column-head");
      const title = el("div", "kb-column-title");
      title.append(el("i", "kb-dot"), el("h3", "", column.label), el("span", "kb-count", String(total)));
      head.append(title, el("small", "", total ? `${options.money(sum / 100)} · ${column.hint}` : column.hint));
      const body = el("div", "kb-column-body");
      if (!list.length) body.append(el("p", "kb-empty", "Drop orders here"));
      for (const order of list) body.append(renderCard(order));
      if (column.status === "delivered" && total > DELIVERED_LIMIT) {
        const more = el("button", "kb-more", showAllDelivered ? "Show fewer" : `Show all ${total}`);
        more.type = "button";
        more.addEventListener("click", () => {
          showAllDelivered = !showAllDelivered;
          render();
        });
        body.append(more);
      }
      section.append(head, body);

      section.addEventListener("dragover", (event) => {
        if (!dragId) return;
        event.preventDefault();
        section.classList.add("is-over");
      });
      section.addEventListener("dragleave", (event) => {
        if (!section.contains(event.relatedTarget as Node | null)) section.classList.remove("is-over");
      });
      section.addEventListener("drop", (event) => {
        event.preventDefault();
        section.classList.remove("is-over");
        const id = dragId ?? event.dataTransfer?.getData("text/plain");
        if (id) void move(id, column.status);
      });
      board!.append(section);
    }

    const summary = panel.querySelector<HTMLElement>("#kb-summary");
    if (summary) {
      const open = all.filter((order) => !CLOSED.has(order.orderStatus));
      const late = open.filter((order) => (dueInfo(order)?.days ?? 0) < 0 && order.eventDate).length;
      summary.textContent = `${open.length} open${late ? ` · ${late} overdue` : ""}`;
    }
    if (openOrderId) renderDrawer();
  }

  function row(label: string, value: string | HTMLElement) {
    const wrap = el("div", "kb-field");
    wrap.append(el("span", "", label));
    if (typeof value === "string") wrap.append(el("p", "", value || "—"));
    else wrap.append(value);
    return wrap;
  }

  function renderDrawer() {
    const order = options.getOrders().find((entry) => entry.orderId === openOrderId);
    if (!order) return closeDrawer();
    drawer!.replaceChildren();

    const head = el("header", "kb-drawer-head");
    const heading = el("div");
    heading.append(el("p", "eyebrow", order.orderId), el("h3", "", order.customerName));
    const close = el("button", "icon-button", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close order details");
    close.addEventListener("click", closeDrawer);
    head.append(heading, close);

    const stages = el("div", "kb-stages");
    stages.setAttribute("role", "group");
    stages.setAttribute("aria-label", "Order stage");
    for (const column of COLUMNS) {
      const button = el("button", "kb-stage", column.label);
      button.type = "button";
      if (column.status === order.orderStatus) button.classList.add("is-current");
      if (column.status === "cancelled") button.classList.add("is-cancel");
      button.setAttribute("aria-pressed", String(column.status === order.orderStatus));
      button.addEventListener("click", () => {
        if (column.status === "cancelled" && !window.confirm(`Cancel order ${order.orderId}?`)) return;
        void move(order.orderId, column.status);
      });
      stages.append(button);
    }

    const body = el("div", "kb-drawer-body");
    const phone = order.customerPhone.replace(/\D/g, "");
    const contact = el("div", "kb-contact");
    if (order.customerPhone) {
      const call = el("a", "button button-secondary", "Call");
      call.href = `tel:${order.customerPhone}`;
      const chat = el("a", "button button-secondary", "WhatsApp");
      chat.href = `https://wa.me/${phone.length === 10 ? `91${phone}` : phone}`;
      chat.target = "_blank";
      chat.rel = "noopener";
      contact.append(call, chat);
    }
    const due = dueInfo(order);
    const pay = paymentChip(order);
    const dueAmount = Math.max(order.amountPaise - receivedPaise(order), 0);
    body.append(
      row("Customer", `${order.customerName}${order.customerPhone ? ` · ${order.customerPhone}` : ""}`),
      contact,
      row("Delivery address", [order.deliveryAddress, order.city, order.state, order.pincode].filter(Boolean).join(", ")),
      row("Delivery method", order.deliveryMethod),
      row("Event / due date", order.eventDate ? `${new Date(`${order.eventDate}T00:00:00`).toLocaleDateString("en-IN", { dateStyle: "medium" })}${due && due.tone === "late" ? " (overdue)" : ""}` : "Not set"),
      row("Placed", new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })),
    );

    const items = el("div", "kb-items");
    for (const item of order.items) {
      const line = el("div", "kb-item");
      line.append(el("strong", "", `${item.name} × ${item.quantity}`));
      const details = [item.flavour && `Flavour: ${item.flavour}`, item.wrapper && `Wrapper: ${item.wrapper}`, ...(item.custom ?? []).map((answer) => `${answer.label}: ${answer.value}`)].filter(Boolean);
      for (const detail of details) line.append(el("small", "", String(detail)));
      items.append(line);
    }
    body.append(row("Items", items));
    if (order.customFields.length) {
      const extras = el("div", "kb-items");
      for (const answer of order.customFields) {
        const line = el("div", "kb-item");
        line.append(el("strong", "", answer.label), el("small", "", answer.value));
        extras.append(line);
      }
      body.append(row("Customisation", extras));
    }
    const payment = el("div", "kb-pay");
    payment.append(el("span", `kb-chip kb-pay-${pay.tone}`, pay.text), el("b", "", options.money(order.amountPaise / 100)));
    if (dueAmount > 0 && order.paymentMethod !== "promo") payment.append(el("small", "", `${options.money(dueAmount / 100)} to collect`));
    body.append(row("Payment", payment));

    const actions = el("div", "kb-drawer-actions");
    const share = el("a", "button button-secondary", "Share on WhatsApp");
    share.href = `https://wa.me/?text=${encodeURIComponent(options.shareText(order))}`;
    share.target = "_blank";
    share.rel = "noopener";
    const invoice = el("button", "button button-secondary", "Download invoice");
    invoice.type = "button";
    invoice.addEventListener("click", () => options.invoice(order));
    actions.append(share, invoice);
    drawer!.append(head, stages, body, actions);
  }

  function openDrawer(orderId: string) {
    openOrderId = orderId;
    renderDrawer();
    drawer!.hidden = false;
    backdrop!.hidden = false;
    document.documentElement.classList.add("kb-open");
    drawer!.querySelector<HTMLElement>(".icon-button")?.focus();
  }

  function closeDrawer() {
    openOrderId = null;
    drawer!.hidden = true;
    backdrop!.hidden = true;
    document.documentElement.classList.remove("kb-open");
  }

  backdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && openOrderId) closeDrawer();
  });
  search.addEventListener("input", render);
  filters.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-kb-filter]");
    if (!button) return;
    filter = button.dataset.kbFilter ?? "all";
    filters.querySelectorAll<HTMLButtonElement>("[data-kb-filter]").forEach((chip) => chip.setAttribute("aria-pressed", String(chip === button)));
    render();
  });
  return { render, close: closeDrawer };
}
