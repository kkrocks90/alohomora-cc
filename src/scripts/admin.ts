import { ADMIN_SESSION_KEY } from "./cart";
import { initializePincodeLookup } from "./pincode-lookup";
import { normalizeState } from "../data/indian-states";

interface AdminCustomer {
  customerId: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
}

interface AdminProduct {
  id: string;
  name: string;
  price: number;
  flavours: string[];
}

interface AdminOrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPriceRupees: number;
  flavour: string;
  wrapper: string;
}

interface AdminOrder {
  orderId: string;
  razorpayOrderId?: string | null;
  paymentId: string | null;
  paymentStatus: "paid" | "unpaid";
  paymentMethod: "razorpay" | "manual" | "promo";
  orderStatus: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deliveryAddress: string;
  city: string;
  state: string;
  pincode: string;
  items: AdminOrderItem[];
  amountPaise: number;
  productSubtotalPaise: number;
  discountPaise: number;
  promoCode: string;
  currency: string;
  deliveryMethod: string;
  eventDate: string;
  createdAt: string;
}

interface AdminPromo {
  promoId: string;
  name: string;
  code: string;
  type: "percentage" | "fixed";
  percentage: number | null;
  targetType: string | null;
  targetValue: string | null;
  amountPaise: number | null;
  minimumSubtotalPaise: number | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  endDate: string;
  active: boolean;
  createdAt: string;
}

interface AdminData {
  email: string;
  orders: AdminOrder[];
  customers: AdminCustomer[];
  orderStatuses: string[];
  products: AdminProduct[];
  categories: string[];
  promos: AdminPromo[];
}

function formatDeliveryAddress(order: Pick<AdminOrder, "deliveryAddress" | "city" | "state" | "pincode">) {
  return [order.deliveryAddress, order.city, order.state, order.pincode].filter(Boolean).join(", ");
}

function isAdminProduct(value: unknown): value is AdminProduct {
  if (!value || typeof value !== "object") return false;
  const product = value as Record<string, unknown>;
  return typeof product.id === "string" &&
    typeof product.name === "string" &&
    typeof product.price === "number" &&
    Array.isArray(product.flavours) &&
    product.flavours.every((flavour) => typeof flavour === "string");
}

function isAdminCustomer(value: unknown): value is AdminCustomer {
  if (!value || typeof value !== "object") return false;
  const customer = value as Record<string, unknown>;
  return typeof customer.customerId === "string" &&
    typeof customer.name === "string" &&
    typeof customer.phone === "string" &&
    typeof customer.email === "string" &&
    typeof customer.address === "string" &&
    typeof customer.city === "string" &&
    typeof customer.state === "string" &&
    typeof customer.pincode === "string";
}

function isAdminOrderItem(value: unknown): value is AdminOrderItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.quantity === "number" &&
    typeof item.unitPriceRupees === "number" &&
    typeof item.flavour === "string" &&
    typeof item.wrapper === "string";
}

function isAdminOrder(value: unknown): value is AdminOrder {
  if (!value || typeof value !== "object") return false;
  const order = value as Record<string, unknown>;
  return typeof order.orderId === "string" &&
    (typeof order.paymentId === "string" || order.paymentId === null) &&
    (order.paymentStatus === "paid" || order.paymentStatus === "unpaid") &&
    (order.paymentMethod === "razorpay" || order.paymentMethod === "manual" || order.paymentMethod === "promo") &&
    typeof order.orderStatus === "string" &&
    (typeof order.customerId === "string" || order.customerId === null) &&
    typeof order.customerName === "string" &&
    typeof order.customerPhone === "string" &&
    typeof order.customerEmail === "string" &&
    typeof order.deliveryAddress === "string" &&
    typeof order.city === "string" &&
    typeof order.state === "string" &&
    typeof order.pincode === "string" &&
    Array.isArray(order.items) &&
    order.items.every(isAdminOrderItem) &&
    typeof order.amountPaise === "number" &&
    typeof order.productSubtotalPaise === "number" &&
    typeof order.discountPaise === "number" &&
    typeof order.promoCode === "string" &&
    typeof order.currency === "string" &&
    typeof order.deliveryMethod === "string" &&
    typeof order.eventDate === "string" &&
    typeof order.createdAt === "string";
}

function isAdminPromo(value: unknown): value is AdminPromo {
  if (!value || typeof value !== "object") return false;
  const promo = value as Record<string, unknown>;
  return typeof promo.promoId === "string" &&
    typeof promo.name === "string" &&
    typeof promo.code === "string" &&
    (promo.type === "percentage" || promo.type === "fixed") &&
    (typeof promo.percentage === "number" || promo.percentage === null) &&
    (typeof promo.targetType === "string" || promo.targetType === null) &&
    (typeof promo.targetValue === "string" || promo.targetValue === null) &&
    (typeof promo.amountPaise === "number" || promo.amountPaise === null) &&
    (typeof promo.minimumSubtotalPaise === "number" || promo.minimumSubtotalPaise === null) &&
    (typeof promo.maxRedemptions === "number" || promo.maxRedemptions === null) &&
    typeof promo.redeemedCount === "number" &&
    typeof promo.endDate === "string" &&
    typeof promo.active === "boolean" &&
    typeof promo.createdAt === "string";
}

function isAdminData(value: unknown): value is AdminData {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return typeof data.email === "string" &&
    Array.isArray(data.orders) &&
    data.orders.every(isAdminOrder) &&
    Array.isArray(data.customers) &&
    data.customers.every(isAdminCustomer) &&
    Array.isArray(data.orderStatuses) &&
    data.orderStatuses.every((item) => typeof item === "string") &&
    Array.isArray(data.products) &&
    data.products.every(isAdminProduct) &&
    Array.isArray(data.categories) &&
    data.categories.every((category) => typeof category === "string") &&
    Array.isArray(data.promos) &&
    data.promos.every(isAdminPromo);
}

function requireElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`The admin page is missing ${selector}.`);
  return element;
}

class AdminApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const root = document.querySelector<HTMLElement>("#admin-app");
if (root) {
  const apiUrl = root.dataset.checkoutApi?.replace(/\/+$/, "") ?? "";
  const emailForm = requireElement<HTMLFormElement>(root, "#admin-email-form");
  const codeForm = requireElement<HTMLFormElement>(root, "#admin-code-form");
  const emailInput = requireElement<HTMLInputElement>(root, "#admin-email");
  const codeInput = requireElement<HTMLInputElement>(root, "#admin-code");
  const loginPanel = requireElement<HTMLElement>(root, "#admin-login-panel");
  const loginStatus = requireElement<HTMLElement>(root, "#admin-login-status");
  const dashboard = requireElement<HTMLElement>(root, "#admin-dashboard");
  const adminTabs = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-admin-tab]"));
  const adminTabPanels = Array.from(root.querySelectorAll<HTMLElement>("[data-admin-panel]"));
  const signedIn = requireElement<HTMLElement>(root, "#admin-signed-in");
  const status = requireElement<HTMLElement>(root, "#admin-status");
  const customerForm = requireElement<HTMLFormElement>(root, "#admin-customer-form");
  const customerList = requireElement<HTMLElement>(root, "#admin-customer-list");
  const customerSearch = requireElement<HTMLInputElement>(root, "#admin-customer-search");
  const customerCount = requireElement<HTMLElement>(root, "#admin-customer-count");
  const customerPagination = requireElement<HTMLElement>(root, "#admin-customer-pagination");
  const customerFormTitle = requireElement<HTMLElement>(root, "#admin-customers-title");
  const customerFormHint = requireElement<HTMLElement>(root, "#admin-customer-form-hint");
  const customerSubmit = requireElement<HTMLButtonElement>(root, "#admin-customer-submit");
  const cancelCustomerEdit = requireElement<HTMLButtonElement>(root, "#admin-customer-cancel-edit");
  const orderForm = requireElement<HTMLFormElement>(root, "#admin-order-form");
  const promoForm = requireElement<HTMLFormElement>(root, "#admin-promo-form");
  const promoType = requireElement<HTMLSelectElement>(root, "#admin-promo-type");
  const promoPercentFields = requireElement<HTMLElement>(root, "#admin-promo-percentage-fields");
  const promoFixedFields = requireElement<HTMLElement>(root, "#admin-promo-fixed-fields");
  const promoTargetType = requireElement<HTMLSelectElement>(root, "#admin-promo-target-type");
  const promoTargetValueLabel = requireElement<HTMLElement>(root, "#admin-promo-target-value-label");
  const promoTargetValue = requireElement<HTMLSelectElement>(root, "#admin-promo-target-value");
  const promoList = requireElement<HTMLElement>(root, "#admin-promo-list");
  const customerSelect = requireElement<HTMLSelectElement>(root, "#admin-order-customer");
  const customerSelectSearch = requireElement<HTMLInputElement>(root, "#admin-order-customer-search");
  const customerSelectHint = requireElement<HTMLElement>(root, "#admin-order-customer-hint");
  const addressInput = requireElement<HTMLTextAreaElement>(root, "#admin-order-address");
  const orderCityInput = requireElement<HTMLInputElement>(root, "#admin-order-city");
  const orderStateInput = requireElement<HTMLSelectElement>(root, "#admin-order-state");
  const orderPincodeInput = requireElement<HTMLInputElement>(root, "#admin-order-pincode");
  const orderLines = requireElement<HTMLElement>(root, "#admin-order-lines");
  const orderTotal = requireElement<HTMLElement>(root, "#admin-order-total");
  const orderList = requireElement<HTMLElement>(root, "#admin-order-list");
  const orderSearch = requireElement<HTMLInputElement>(root, "#admin-order-search");
  const orderStatusFilter = requireElement<HTMLSelectElement>(root, "#admin-order-status-filter");
  const orderCount = requireElement<HTMLElement>(root, "#admin-order-count");
  const orderPagination = requireElement<HTMLElement>(root, "#admin-order-pagination");
  const invoice = requireElement<HTMLElement>(root, "#admin-invoice-print");
  const sessionKey = ADMIN_SESSION_KEY;
  const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  const statusLabels: Record<string, string> = {
    received: "Received",
    confirmed: "Confirmed",
    preparing: "Preparing",
    ready: "Ready",
    out_for_delivery: "Out for delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };
  let adminData: AdminData | null = null;
  function setupAddressMap(form: HTMLFormElement) {
    const city = form.elements.namedItem("city");
    const state = form.elements.namedItem("state");
    const pincode = form.elements.namedItem("pincode");
    const status = requireElement<HTMLElement>(form, "[data-pincode-status]");
    if (!(city instanceof HTMLInputElement) || !(state instanceof HTMLSelectElement) ||
        !(pincode instanceof HTMLInputElement)) {
      throw new Error("The admin address form is incomplete.");
    }
    initializePincodeLookup({ apiUrl, city, state, pincode, status });
  }
  setupAddressMap(customerForm);
  setupAddressMap(orderForm);
  const pageSize = 20;
  const customerPageSize = 50;
  let customerPage = 0;
  let orderPage = 0;
  let editingCustomerId: string | null = null;

  function activateAdminTab(tab: HTMLButtonElement, moveFocus = false) {
    const selectedTab = tab.dataset.adminTab;
    if (!selectedTab) return;
    for (const candidate of adminTabs) {
      const selected = candidate === tab;
      candidate.setAttribute("aria-selected", String(selected));
      candidate.tabIndex = selected ? 0 : -1;
    }
    for (const panel of adminTabPanels) {
      panel.hidden = panel.dataset.adminPanel !== selectedTab;
    }
    if (moveFocus) tab.focus();
  }

  for (const tab of adminTabs) {
    tab.addEventListener("click", () => activateAdminTab(tab));
    tab.addEventListener("keydown", (event: KeyboardEvent) => {
      const currentIndex = adminTabs.indexOf(tab);
      let nextIndex: number;
      if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % adminTabs.length;
      else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + adminTabs.length) % adminTabs.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = adminTabs.length - 1;
      else return;
      event.preventDefault();
      const nextTab = adminTabs[nextIndex];
      if (nextTab) activateAdminTab(nextTab, true);
    });
  }

  function setLoginStatus(message: string, error = false) {
    loginStatus.textContent = message;
    loginStatus.dataset.state = error ? "error" : "success";
  }

  function setStatus(message: string, error = false) {
    status.textContent = message;
    status.dataset.state = error ? "error" : "success";
  }

  function setBusy(form: HTMLFormElement, busy: boolean) {
    form.querySelectorAll<HTMLButtonElement>("button[type=submit]").forEach((button) => {
      button.disabled = busy;
    });
  }

  async function post(path: string, body?: unknown, token = sessionStorage.getItem(sessionKey) ?? "") {
    if (!apiUrl) throw new Error("Admin sign-in is not configured yet.");
    let response: Response;
    try {
      response = await fetch(`${apiUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new Error("Could not reach the order service. Check your connection and try again.");
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("The order service returned an unreadable response.");
    }
    if (!payload || typeof payload !== "object") throw new Error("The order service returned an invalid response.");
    const result = payload as { error?: string; [key: string]: unknown };
    if (!response.ok) throw new AdminApiError(result.error || "The request could not be completed.", response.status);
    return result;
  }

  function showSignedOut(message = "") {
    adminData = null;
    dashboard.hidden = true;
    loginPanel.hidden = false;
    codeForm.hidden = true;
    emailForm.hidden = false;
    setLoginStatus(message);
  }

  function renderPagination(
    container: HTMLElement,
    page: number,
    itemCount: number,
    changePage: (page: number) => void,
  ) {
    container.replaceChildren();
    const pageCount = Math.max(1, Math.ceil(itemCount / pageSize));
    if (pageCount <= 1) return;
    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "Previous";
    previous.disabled = page === 0;
    previous.addEventListener("click", () => changePage(page - 1));
    const label = document.createElement("span");
    label.textContent = `Page ${page + 1} of ${pageCount}`;
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    next.disabled = page + 1 >= pageCount;
    next.addEventListener("click", () => changePage(page + 1));
    container.append(previous, label, next);
  }

  function updateListCount(element: HTMLElement, page: number, itemCount: number, label: string) {
    const first = itemCount === 0 ? 0 : page * pageSize + 1;
    const last = Math.min((page + 1) * pageSize, itemCount);
    element.textContent = `Showing ${first}–${last} of ${itemCount} ${label}`;
  }

  function renderCustomerSelect() {
    if (!adminData) return;
    const previousSelection = customerSelect.value;
    const previousAddress = addressInput.value;
    const previousCity = orderCityInput.value;
    const previousState = orderStateInput.value;
    const previousPincode = orderPincodeInput.value;
    const query = customerSelectSearch.value.trim().toLocaleLowerCase();
    const matchingCustomers = adminData.customers.filter((customer) =>
      [customer.name, customer.phone, customer.email].some((value) => value.toLocaleLowerCase().includes(query)));
    const visibleCustomers = matchingCustomers.slice(0, customerPageSize);
    customerSelect.replaceChildren(new Option("Choose a saved customer", ""));
    visibleCustomers.forEach((customer) => {
      customerSelect.append(new Option(
        [customer.name || customer.email, customer.phone].filter(Boolean).join(" · "),
        customer.customerId,
      ));
    });
    const selectionVisible = visibleCustomers.some((customer) => customer.customerId === previousSelection);
    if (selectionVisible) {
      customerSelect.value = previousSelection;
      addressInput.value = previousAddress;
      orderCityInput.value = previousCity;
      orderStateInput.value = previousState;
      orderPincodeInput.value = previousPincode;
    } else {
      addressInput.value = "";
      orderCityInput.value = "";
      orderStateInput.value = "";
      orderPincodeInput.value = "";
    }
    customerSelectHint.textContent = matchingCustomers.length > visibleCustomers.length
      ? `Showing the first ${visibleCustomers.length} of ${matchingCustomers.length} matches. Refine your search.`
      : matchingCustomers.length === 0
        ? "No customers match that search."
        : `${matchingCustomers.length} matching customer${matchingCustomers.length === 1 ? "" : "s"}.`;
  }

  function startCustomerEdit(customer: AdminCustomer) {
    editingCustomerId = customer.customerId;
    const nameInput = customerForm.elements.namedItem("name");
    const phoneInput = customerForm.elements.namedItem("phone");
    const emailInput = customerForm.elements.namedItem("email");
    const addressField = customerForm.elements.namedItem("address");
    const cityField = customerForm.elements.namedItem("city");
    const stateField = customerForm.elements.namedItem("state");
    const pincodeField = customerForm.elements.namedItem("pincode");
    if (
      !(nameInput instanceof HTMLInputElement) ||
      !(phoneInput instanceof HTMLInputElement) ||
      !(emailInput instanceof HTMLInputElement) ||
      !(addressField instanceof HTMLTextAreaElement) ||
      !(cityField instanceof HTMLInputElement) ||
      !(stateField instanceof HTMLSelectElement) ||
      !(pincodeField instanceof HTMLInputElement)
    ) throw new Error("The customer form is missing a required field.");
    nameInput.value = customer.name;
    phoneInput.value = customer.phone;
    emailInput.value = customer.email;
    emailInput.readOnly = true;
    addressField.value = customer.address;
    cityField.value = customer.city;
    stateField.value = normalizeState(customer.state);
    pincodeField.value = customer.pincode;
    customerFormTitle.textContent = "Edit customer details";
    customerFormHint.textContent = "Update the customer name, mobile number, or default address. Email stays unchanged because it identifies the customer’s sign-in and order history.";
    customerSubmit.textContent = "Update customer";
    cancelCustomerEdit.hidden = false;
    nameInput.focus();
    customerForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function cancelCustomerEditing() {
    editingCustomerId = null;
    customerForm.reset();
    const emailInput = customerForm.elements.namedItem("email");
    if (emailInput instanceof HTMLInputElement) emailInput.readOnly = false;
    customerFormTitle.textContent = "Customer details";
    customerFormHint.textContent = "Add a customer profile or edit saved details. Customer email is the sign-in identity and cannot be changed here.";
    customerSubmit.textContent = "Save customer";
    cancelCustomerEdit.hidden = true;
  }

  function renderCustomers() {
    if (!adminData) return;
    renderCustomerSelect();
    customerList.replaceChildren();
    const query = customerSearch.value.trim().toLocaleLowerCase();
    const matchingCustomers = adminData.customers.filter((customer) =>
      [customer.name, customer.phone, customer.email, customer.address, customer.city, customer.state, customer.pincode]
        .some((value) => value.toLocaleLowerCase().includes(query)));
    const pageCount = Math.max(1, Math.ceil(matchingCustomers.length / pageSize));
    customerPage = Math.min(customerPage, pageCount - 1);
    const start = customerPage * pageSize;
    const visibleCustomers = matchingCustomers.slice(start, start + pageSize);
    updateListCount(customerCount, customerPage, matchingCustomers.length, "customers");
    renderPagination(customerPagination, customerPage, matchingCustomers.length, (page) => {
      customerPage = page;
      renderCustomers();
    });
    if (matchingCustomers.length === 0) {
      const empty = document.createElement("p");
      empty.className = "admin-empty";
      empty.textContent = query
        ? "No customers match that search."
        : "No saved customers yet. Add a customer above to create a manual order.";
      customerList.append(empty);
      return;
    }
    for (const customer of visibleCustomers) {
      const label = customer.name || customer.email;
      const card = document.createElement("article");
      card.className = "admin-customer-card";
      const name = document.createElement("strong");
      name.textContent = customer.name || customer.email;
      const details = document.createElement("span");
      details.textContent = [customer.phone, customer.email, customer.address, customer.city, customer.state, customer.pincode].filter(Boolean).join(" · ");
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "button button-secondary";
      editButton.textContent = "Edit details";
      editButton.setAttribute("aria-label", `Edit details for ${label}`);
      editButton.addEventListener("click", () => startCustomerEdit(customer));
      card.append(name, details, editButton);
      customerList.append(card);
    }
  }

  function renderOrderLine() {
    if (!adminData) return;
    const row = document.createElement("div");
    row.className = "admin-order-line";
    row.dataset.orderLine = "true";

    const productLabel = document.createElement("label");
    productLabel.textContent = "Product";
    const productSelect = document.createElement("select");
    productSelect.dataset.lineProduct = "true";
    productSelect.required = true;
    productSelect.append(new Option("Choose a product", ""));
    adminData.products.forEach((product) => productSelect.append(new Option(`${product.name} — ${currency.format(product.price)}`, product.id)));
    productLabel.append(productSelect);

    const quantityLabel = document.createElement("label");
    quantityLabel.textContent = "Qty";
    const quantitySelect = document.createElement("select");
    quantitySelect.dataset.lineQuantity = "true";
    for (let quantity = 1; quantity <= 20; quantity += 1) {
      quantitySelect.append(new Option(String(quantity), String(quantity)));
    }
    quantityLabel.append(quantitySelect);

    const options = document.createElement("div");
    options.className = "admin-line-options";
    const wrapperLabel = document.createElement("label");
    wrapperLabel.textContent = "Wrapper details (optional)";
    const wrapperInput = document.createElement("input");
    wrapperInput.type = "text";
    wrapperInput.maxLength = 120;
    wrapperInput.dataset.lineWrapper = "true";
    wrapperInput.placeholder = "Gift message, colours, or design";
    wrapperLabel.append(wrapperInput);
    options.append(wrapperLabel);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "account-text-button admin-remove-line";
    removeButton.textContent = "Remove item";
    removeButton.setAttribute("aria-label", "Remove order item");
    removeButton.addEventListener("click", () => {
      row.remove();
      updateOrderTotal();
    });

    productSelect.addEventListener("change", () => {
      options.querySelector("[data-line-flavour]")?.remove();
      const selected = adminData?.products.find((product) => product.id === productSelect.value);
      if (selected?.flavours.length) {
        const flavourLabel = document.createElement("label");
        flavourLabel.textContent = "Flavour";
        const flavourSelect = document.createElement("select");
        flavourSelect.dataset.lineFlavour = "true";
        flavourSelect.required = true;
        flavourSelect.append(new Option("Choose a flavour", ""));
        selected.flavours.forEach((flavour) => flavourSelect.append(new Option(flavour, flavour)));
        flavourLabel.append(flavourSelect);
        options.insertBefore(flavourLabel, wrapperLabel);
      }
      updateOrderTotal();
    });
    quantitySelect.addEventListener("change", updateOrderTotal);

    row.append(productLabel, quantityLabel, options, removeButton);
    orderLines.append(row);
  }

  function updateOrderTotal() {
    if (!adminData) return;
    let total = 0;
    orderLines.querySelectorAll<HTMLElement>("[data-order-line]").forEach((row) => {
      const productId = requireElement<HTMLSelectElement>(row, "[data-line-product]").value;
      const quantity = Number(requireElement<HTMLSelectElement>(row, "[data-line-quantity]").value);
      const product = adminData?.products.find((entry) => entry.id === productId);
      if (product) total += product.price * quantity;
    });
    orderTotal.textContent = `Product total: ${currency.format(total)}`;
  }

  function appendText(parent: HTMLElement, tagName: string, value: string, className = "") {
    const element = document.createElement(tagName);
    element.textContent = value;
    if (className) element.className = className;
    parent.append(element);
    return element;
  }

  function renderInvoice(order: AdminOrder) {
    invoice.replaceChildren();
    const heading = document.createElement("div");
    heading.className = "invoice-heading";
    appendText(heading, "p", "CHOCOLATE CIRCLE", "invoice-brand");
    appendText(heading, "h1", "Order invoice");
    appendText(heading, "p", `Order ${order.orderId}`);
    invoice.append(heading);

    const meta = document.createElement("div");
    meta.className = "invoice-meta";
    const customerBlock = document.createElement("section");
    appendText(customerBlock, "h2", "Customer");
    appendText(customerBlock, "p", order.customerName);
    appendText(customerBlock, "p", order.customerPhone);
    if (order.customerEmail) appendText(customerBlock, "p", order.customerEmail);
    appendText(customerBlock, "p", formatDeliveryAddress(order));
    const orderBlock = document.createElement("section");
    appendText(orderBlock, "h2", "Order details");
    appendText(orderBlock, "p", `Date: ${new Date(order.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}`);
    appendText(orderBlock, "p", `Status: ${statusLabels[order.orderStatus] ?? order.orderStatus}`);
    const paymentLabel = order.paymentMethod === "manual"
      ? "Manual order"
      : order.paymentMethod === "promo" ? "Promo code (no payment due)" : "Razorpay";
    const paymentStatusLabel = order.paymentMethod === "promo"
      ? "No payment due"
      : order.paymentStatus === "paid" ? "Paid" : "Unpaid";
    appendText(orderBlock, "p", `Payment: ${paymentStatusLabel} (${paymentLabel})`);
    if (order.eventDate) appendText(orderBlock, "p", `Event date: ${new Date(`${order.eventDate}T00:00:00`).toLocaleDateString("en-IN", { dateStyle: "medium" })}`);
    appendText(orderBlock, "p", order.deliveryMethod);
    meta.append(customerBlock, orderBlock);
    invoice.append(meta);

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
      appendText(row, "td", currency.format(item.unitPriceRupees));
      appendText(row, "td", currency.format(item.unitPriceRupees * item.quantity));
      body.append(row);
    }
    table.append(head, body);
    invoice.append(table);
    const total = document.createElement("p");
    total.className = "invoice-total";
    total.textContent = `Product subtotal: ${currency.format(order.productSubtotalPaise / 100)}`;
    invoice.append(total);
    if (order.discountPaise > 0) {
      appendText(invoice, "p", `Promo ${order.promoCode}: −${currency.format(order.discountPaise / 100)}`, "invoice-note");
      appendText(invoice, "p", `Paid total: ${currency.format(order.amountPaise / 100)}`, "invoice-total");
    }
    appendText(
      invoice,
      "p",
      "This is an order invoice/receipt, not a GST tax invoice. Delivery charges, if any, are not included in this product total.",
      "invoice-note",
    );
    invoice.hidden = false;
    window.print();
  }

  function renderOrders() {
    if (!adminData) return;
    orderList.replaceChildren();
    if (orderStatusFilter.options.length === 1) {
      adminData.orderStatuses.forEach((value) => {
        orderStatusFilter.append(new Option(statusLabels[value] ?? value, value));
      });
    }
    const query = orderSearch.value.trim().toLocaleLowerCase();
    const selectedStatus = orderStatusFilter.value;
    const matchingOrders = adminData.orders.filter((order) => {
      if (selectedStatus && order.orderStatus !== selectedStatus) return false;
      const searchable = [
        order.orderId,
        order.razorpayOrderId ?? "",
        order.customerName,
        order.customerPhone,
        order.customerEmail,
        order.deliveryAddress,
        order.city,
        order.state,
        order.pincode,
        ...order.items.flatMap((item) => [item.name, item.flavour, item.wrapper]),
      ];
      return searchable.some((value) => value.toLocaleLowerCase().includes(query));
    });
    const pageCount = Math.max(1, Math.ceil(matchingOrders.length / pageSize));
    orderPage = Math.min(orderPage, pageCount - 1);
    const start = orderPage * pageSize;
    updateListCount(orderCount, orderPage, matchingOrders.length, "orders");
    renderPagination(orderPagination, orderPage, matchingOrders.length, (page) => {
      orderPage = page;
      renderOrders();
    });
    if (matchingOrders.length === 0) {
      const empty = document.createElement("p");
      empty.className = "admin-empty";
      empty.textContent = adminData.orders.length === 0
        ? "No orders have been recorded yet."
        : "No orders match those filters.";
      orderList.append(empty);
      return;
    }
    for (const order of matchingOrders.slice(start, start + pageSize)) {
      const card = document.createElement("article");
      card.className = "admin-order-card";
      const heading = document.createElement("div");
      heading.className = "admin-order-card-heading";
      const identity = document.createElement("div");
      appendText(identity, "strong", order.orderId);
      appendText(identity, "span", `${order.customerName} · ${new Date(order.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}`);
      appendText(heading, "strong", currency.format(order.amountPaise / 100), "admin-order-amount");
      heading.prepend(identity);

      const details = document.createElement("div");
      details.className = "admin-order-card-details";
      const paymentLabel = order.paymentMethod === "manual"
        ? "Manual"
        : order.paymentMethod === "promo" ? "Promo-covered" : "Razorpay";
      const paymentStatusLabel = order.paymentMethod === "promo"
        ? "No payment due"
        : order.paymentStatus === "paid" ? "Paid" : "Unpaid";
      appendText(details, "span", `${paymentStatusLabel} · ${paymentLabel}`, "admin-payment-badge");
      if (order.discountPaise > 0) {
        appendText(details, "span", `Promo ${order.promoCode} · saved ${currency.format(order.discountPaise / 100)}`);
      }
      if (order.razorpayOrderId) appendText(details, "span", `Razorpay order: ${order.razorpayOrderId}`);
      if (order.paymentId) appendText(details, "span", `Razorpay payment: ${order.paymentId}`);
      appendText(details, "span", order.customerPhone);
      if (order.customerEmail) appendText(details, "span", order.customerEmail);
      appendText(details, "span", formatDeliveryAddress(order));
      appendText(details, "span", order.deliveryMethod);
      if (order.eventDate) appendText(details, "span", `Event date: ${new Date(`${order.eventDate}T00:00:00`).toLocaleDateString("en-IN", { dateStyle: "medium" })}`);
      const items = document.createElement("ul");
      items.className = "admin-order-items-list";
      order.items.forEach((item) => {
        const line = document.createElement("li");
        line.textContent = [
          `${item.name} × ${item.quantity}`,
          item.flavour,
          item.wrapper,
        ].filter(Boolean).join(" · ");
        items.append(line);
      });

      const actions = document.createElement("div");
      actions.className = "admin-order-actions";
      const statusLabel = document.createElement("label");
      statusLabel.textContent = "Order status";
      const statusSelect = document.createElement("select");
      statusSelect.dataset.orderStatus = order.orderId;
      adminData.orderStatuses.forEach((value) => statusSelect.append(new Option(statusLabels[value] ?? value, value)));
      statusSelect.value = order.orderStatus;
      statusLabel.append(statusSelect);
      const updateButton = document.createElement("button");
      updateButton.type = "button";
      updateButton.className = "button button-secondary";
      updateButton.textContent = "Update status";
      updateButton.addEventListener("click", async () => {
        updateButton.disabled = true;
        try {
          await post("/admin/orders/update-status", { orderId: order.orderId, orderStatus: statusSelect.value });
          await loadDashboard();
          setStatus(`Updated ${order.orderId}.`);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Could not update this order.", true);
        } finally {
          updateButton.disabled = false;
        }
      });
      const invoiceButton = document.createElement("button");
      invoiceButton.type = "button";
      invoiceButton.className = "button button-secondary";
      invoiceButton.textContent = "Print invoice";
      invoiceButton.addEventListener("click", () => renderInvoice(order));
      actions.append(statusLabel, updateButton, invoiceButton);
      card.append(heading, details, items, actions);
      orderList.append(card);
    }
  }

  function syncPromoTargetOptions() {
    if (!adminData) return;
    const targetType = promoTargetType.value;
    promoTargetValue.replaceChildren();
    if (targetType === "all") {
      promoTargetValueLabel.hidden = true;
      promoTargetValue.disabled = true;
      promoTargetValue.required = false;
      return;
    }
    promoTargetValueLabel.hidden = false;
    promoTargetValue.disabled = false;
    promoTargetValue.required = true;
    promoTargetValue.append(new Option(
      targetType === "product" ? "Choose a product" : "Choose a category",
      "",
    ));
    if (targetType === "product") {
      adminData.products.forEach((product) => {
        promoTargetValue.append(new Option(product.name, product.id));
      });
    } else {
      adminData.categories.forEach((category) => {
        promoTargetValue.append(new Option(category, category));
      });
    }
  }

  function syncPromoFormFields() {
    const percentageType = promoType.value === "percentage";
    promoPercentFields.hidden = !percentageType;
    promoFixedFields.hidden = percentageType;
    promoPercentFields.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select").forEach((field) => {
      field.disabled = !percentageType;
    });
    promoFixedFields.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select").forEach((field) => {
      field.disabled = percentageType;
    });
    syncPromoTargetOptions();
  }

  function renderPromos() {
    if (!adminData) return;
    promoList.replaceChildren();
    if (adminData.promos.length === 0) {
      appendText(promoList, "p", "No promo codes have been created yet.", "admin-empty");
      return;
    }
    for (const promo of adminData.promos) {
      const card = document.createElement("article");
      card.className = "admin-promo-card";
      const heading = document.createElement("div");
      heading.className = "admin-promo-card-heading";
      const title = document.createElement("div");
      appendText(title, "strong", promo.name);
      appendText(title, "code", promo.code, "admin-promo-code");
      appendText(heading, "span", promo.active ? "Active" : "Inactive", promo.active ? "admin-promo-active" : "admin-promo-inactive");
      heading.prepend(title);
      card.append(heading);

      const targetDescription = promo.type === "fixed"
        ? `${currency.format((promo.amountPaise ?? 0) / 100)} off when subtotal is greater than ${currency.format((promo.minimumSubtotalPaise ?? 0) / 100)}`
        : `${promo.percentage}% off ${promo.targetType === "all"
          ? "all products"
          : promo.targetType === "product"
            ? adminData.products.find((product) => product.id === promo.targetValue)?.name ?? "selected product"
            : promo.targetValue ?? "selected category"}`;
      appendText(card, "p", targetDescription, "admin-promo-description");
      const restrictions = [
        promo.maxRedemptions === null
          ? "No redemption cap"
          : `${promo.redeemedCount} of ${promo.maxRedemptions} customers redeemed`,
        promo.endDate ? `Ends ${new Date(`${promo.endDate}T00:00:00`).toLocaleDateString("en-IN", { dateStyle: "medium" })}` : "No end date",
      ];
      appendText(card, "p", restrictions.join(" · "), "admin-promo-restrictions");
      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "button button-secondary";
      toggleButton.textContent = promo.active ? "Deactivate code" : "Activate code";
      toggleButton.addEventListener("click", async () => {
        toggleButton.disabled = true;
        try {
          await post("/admin/promos/update", { promoId: promo.promoId, active: !promo.active });
          await loadDashboard();
          setStatus(`${promo.code} ${promo.active ? "deactivated" : "activated"}.`);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Could not update this promo code.", true);
        } finally {
          toggleButton.disabled = false;
        }
      });
      card.append(toggleButton);
      promoList.append(card);
    }
  }

  async function loadDashboard(token = sessionStorage.getItem(sessionKey) ?? "") {
    const result = await post("/admin/data", undefined, token);
    if (!isAdminData(result)) throw new Error("The order service returned invalid admin data.");
    adminData = result;
    loginPanel.hidden = true;
    dashboard.hidden = false;
    signedIn.textContent = `Signed in as ${adminData.email}`;
    renderCustomers();
    renderPromos();
    syncPromoFormFields();
    orderLines.replaceChildren();
    renderOrderLine();
    renderOrders();
    updateOrderTotal();
  }

  emailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!emailForm.reportValidity()) return;
    setBusy(emailForm, true);
    try {
      const email = emailInput.value.trim().toLowerCase();
      const result = await post("/auth/request-code", { email }, "");
      codeForm.hidden = false;
      emailForm.hidden = true;
      codeInput.focus();
      setLoginStatus(String(result.message ?? "If this is the admin email, a sign-in code will arrive shortly."));
    } catch (error) {
      setLoginStatus(error instanceof Error ? error.message : "Could not send a sign-in code.", true);
    } finally {
      setBusy(emailForm, false);
    }
  });

  codeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!codeForm.reportValidity()) return;
    setBusy(codeForm, true);
    try {
      const result = await post("/auth/verify-code", {
        email: emailInput.value.trim().toLowerCase(),
        code: codeInput.value.trim(),
      }, "");
      if (typeof result.token !== "string" || !/^[0-9a-f]{64}$/.test(result.token)) {
        throw new Error("Sign-in returned an invalid session.");
      }
      sessionStorage.setItem(sessionKey, result.token);
      try {
        await loadDashboard(result.token);
        window.dispatchEvent(new Event("customer-session-change"));
      } catch (error) {
        sessionStorage.removeItem(sessionKey);
        if (error instanceof AdminApiError && error.status === 403) {
          throw new Error("That account is not authorized to access order management.");
        }
        throw error;
      }
    } catch (error) {
      setLoginStatus(error instanceof Error ? error.message : "Could not verify the sign-in code.", true);
    } finally {
      setBusy(codeForm, false);
    }
  });

  requireElement<HTMLButtonElement>(root, "#admin-change-email").addEventListener("click", () => {
    codeForm.hidden = true;
    emailForm.hidden = false;
    codeInput.value = "";
    setLoginStatus("");
    emailInput.focus();
  });

  promoType.addEventListener("change", syncPromoFormFields);
  promoTargetType.addEventListener("change", syncPromoTargetOptions);
  promoForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!promoForm.reportValidity()) return;
    const formData = new FormData(promoForm);
    const type = String(formData.get("type"));
    setBusy(promoForm, true);
    try {
      const result = await post("/admin/promos/create", {
        name: formData.get("name"),
        type,
        percentage: formData.get("percentage"),
        targetType: formData.get("targetType"),
        targetValue: formData.get("targetValue"),
        amountRupees: formData.get("amountRupees"),
        minimumRupees: formData.get("minimumRupees"),
        maxRedemptions: formData.get("maxRedemptions"),
        endDate: formData.get("endDate"),
      });
      const created = isAdminPromo(result.promo) ? result.promo : null;
      if (!created) throw new Error("The order service returned invalid promo details.");
      promoForm.reset();
      syncPromoFormFields();
      await loadDashboard();
      setStatus(`Promo code ${created.code} created.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create this promo code.", true);
    } finally {
      setBusy(promoForm, false);
    }
  });

  customerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!customerForm.reportValidity()) return;
    setBusy(customerForm, true);
    const formData = new FormData(customerForm);
    try {
      if (editingCustomerId) {
        await post("/admin/customers/update", {
          customerId: editingCustomerId,
          name: formData.get("name"),
          phone: formData.get("phone"),
          address: formData.get("address"),
          city: formData.get("city"),
          state: formData.get("state"),
          pincode: formData.get("pincode"),
        });
        cancelCustomerEditing();
        await loadDashboard();
        setStatus("Customer details updated. Existing orders remain unchanged.");
      } else {
        await post("/admin/customers/create", {
          name: formData.get("name"),
          phone: formData.get("phone"),
          email: formData.get("email"),
          address: formData.get("address"),
          city: formData.get("city"),
          state: formData.get("state"),
          pincode: formData.get("pincode"),
        });
        customerForm.reset();
        await loadDashboard();
        setStatus("Customer saved. You can now select them for a manual order.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save this customer.", true);
    } finally {
      setBusy(customerForm, false);
    }
  });

  cancelCustomerEdit.addEventListener("click", cancelCustomerEditing);
  customerSearch.addEventListener("input", () => {
    customerPage = 0;
    renderCustomers();
  });
  customerSelectSearch.addEventListener("input", renderCustomerSelect);
  orderSearch.addEventListener("input", () => {
    orderPage = 0;
    renderOrders();
  });
  orderStatusFilter.addEventListener("change", () => {
    orderPage = 0;
    renderOrders();
  });

  customerSelect.addEventListener("change", () => {
    const customer = adminData?.customers.find((entry) => entry.customerId === customerSelect.value);
    if (customer) {
      addressInput.value = customer.address;
      orderCityInput.value = customer.city;
      orderStateInput.value = normalizeState(customer.state);
      orderPincodeInput.value = customer.pincode;
    }
  });

  requireElement<HTMLButtonElement>(root, "#admin-add-line").addEventListener("click", renderOrderLine);
  orderForm.addEventListener("input", updateOrderTotal);
  orderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!orderForm.reportValidity() || !adminData) return;
    const formData = new FormData(orderForm);
    const items = Array.from(orderLines.querySelectorAll<HTMLElement>("[data-order-line]")).map((row) => ({
      id: requireElement<HTMLSelectElement>(row, "[data-line-product]").value,
      quantity: Number(requireElement<HTMLSelectElement>(row, "[data-line-quantity]").value),
      flavour: row.querySelector<HTMLSelectElement>("[data-line-flavour]")?.value ?? "",
      wrapper: row.querySelector<HTMLInputElement>("[data-line-wrapper]")?.value ?? "",
    }));
    if (items.length === 0 || items.length > 8 || items.some((item) => !item.id)) {
      setStatus("Add between 1 and 8 valid order items.", true);
      return;
    }
    setBusy(orderForm, true);
    try {
      const result = await post("/admin/orders/create", {
        customerId: formData.get("customerId"),
        address: formData.get("address"),
        city: formData.get("city"),
        state: formData.get("state"),
        pincode: formData.get("pincode"),
        deliveryMethod: formData.get("deliveryMethod"),
        eventDate: formData.get("eventDate"),
        items,
      });
      orderForm.reset();
      addressInput.value = "";
      orderLines.replaceChildren();
      renderOrderLine();
      await loadDashboard();
      setStatus(`Manual order ${String(result.orderId)} created as unpaid.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create this order.", true);
    } finally {
      setBusy(orderForm, false);
    }
  });

  requireElement<HTMLButtonElement>(root, "#admin-refresh").addEventListener("click", async () => {
    try {
      await loadDashboard();
      setStatus("Dashboard refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not refresh the dashboard.", true);
    }
  });

  requireElement<HTMLButtonElement>(root, "#admin-sign-out").addEventListener("click", async () => {
    const token = sessionStorage.getItem(sessionKey) ?? "";
    let signOutMessage = "You’re signed out.";
    let signOutError = false;
    try {
      await post("/auth/logout", undefined, token);
    } catch {
      signOutMessage = "Signed out on this device, but the session could not be revoked.";
      signOutError = true;
    } finally {
      sessionStorage.removeItem(sessionKey);
      window.dispatchEvent(new Event("customer-session-change"));
      showSignedOut(signOutMessage);
      if (signOutError) loginStatus.dataset.state = "error";
    }
  });

  window.addEventListener("afterprint", () => {
    invoice.hidden = true;
    invoice.replaceChildren();
  });

  const existingToken = sessionStorage.getItem(sessionKey);
  if (existingToken) {
    void loadDashboard(existingToken).catch((error: unknown) => {
      if (error instanceof AdminApiError && error.status === 401) {
        sessionStorage.removeItem(sessionKey);
        window.dispatchEvent(new Event("customer-session-change"));
      }
      showSignedOut(error instanceof AdminApiError && error.status === 403
        ? "This signed-in account does not have admin access."
        : error instanceof Error ? error.message : "Could not load the admin dashboard.");
    }).finally(() => {
      root.classList.remove("is-session-loading");
    });
  } else {
    root.classList.remove("is-session-loading");
  }
}
