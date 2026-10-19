import {
  ADMIN_SESSION_KEY,
  clearCustomerSessionToken,
  getCustomerSessionToken,
  saveCustomerSessionToken,
} from "./cart";

function requireElement<T extends Element>(element: T | null, selector: string): T {
  if (!element) throw new Error(`The customer account page is missing ${selector}.`);
  return element;
}

const root = document.querySelector<HTMLElement>("#customer-account");

if (root) {
  class AccountApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }

  const apiUrl = root.dataset.checkoutApi?.replace(/\/+$/, "") ?? "";
  const baseUrl = root.dataset.baseUrl ?? "/";
  const emailForm = requireElement(root.querySelector<HTMLFormElement>("#account-email-form"), "#account-email-form");
  const codeForm = requireElement(root.querySelector<HTMLFormElement>("#account-code-form"), "#account-code-form");
  const emailInput = requireElement(root.querySelector<HTMLInputElement>("#account-email"), "#account-email");
  const codeInput = requireElement(root.querySelector<HTMLInputElement>("#account-code"), "#account-code");
  const status = requireElement(root.querySelector<HTMLElement>("#account-status"), "#account-status");
  const profileSection = requireElement(root.querySelector<HTMLElement>("#account-profile"), "#account-profile");
  const profileDetails = requireElement(root.querySelector<HTMLElement>("#profile-details"), "#profile-details");
  const profileForm = requireElement(root.querySelector<HTMLFormElement>("#profile-signup-form"), "#profile-signup-form");
  const profileAddressList = requireElement(root.querySelector<HTMLElement>("#profile-address-list"), "#profile-address-list");
  const ordersSection = requireElement(root.querySelector<HTMLElement>("#account-orders"), "#account-orders");
  const orderList = requireElement(root.querySelector<HTMLElement>("#order-list"), "#order-list");
  const changeEmailButton = requireElement(
    root.querySelector<HTMLButtonElement>("#account-change-email"),
    "#account-change-email",
  );
  const signOutButton = requireElement(
    root.querySelector<HTMLButtonElement>("#account-sign-out"),
    "#account-sign-out",
  );
  const submitButtons = root.querySelectorAll<HTMLButtonElement>("button[type=submit]");
  const rememberMeInput = requireElement(
    root.querySelector<HTMLInputElement>("#account-remember-me"),
    "#account-remember-me",
  );

  let email = "";

  function setStatus(message: string, error = false) {
    status.textContent = message;
    status.dataset.state = error ? "error" : "success";
  }

  function setBusy(busy: boolean) {
    for (const button of submitButtons) {
      button.disabled = busy;
    }
  }

  interface CustomerOrder {
    orderId?: string;
    status?: string;
    items?: { name?: string; quantity?: number; flavour?: string; wrapper?: string }[];
    amountPaise?: number;
    createdAt?: string;
    deliveryMethod?: string;
    eventDate?: string;
    orderStatus?: string;
    customerName?: string;
    customerPhone?: string;
    deliveryAddress?: string;
  }

  interface CustomerProfile {
    name: string;
    phone: string;
    address: string;
  }

  async function post(path: string, body?: unknown, token?: string) {
    if (!apiUrl) throw new Error("Customer sign-in is not configured yet. Please contact the shop.");
    const response = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json() as { error?: string; message?: string; [key: string]: unknown };
    if (!response.ok) {
      throw new AccountApiError(
        result.error || "Could not complete this request. Please try again.",
        response.status,
      );
    }
    return result;
  }

  function showProfile(orders: CustomerOrder[], accountEmail: string, customerProfile: CustomerProfile) {
    profileDetails.replaceChildren();
    const latestOrder = orders[0];
    const details = [
      ["Email address", accountEmail],
      ["Name", customerProfile.name || latestOrder?.customerName || ""],
      ["Phone number", customerProfile.phone || latestOrder?.customerPhone || ""],
    ];
    for (const [label, value] of details) {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value || "Not available from previous orders";
      profileDetails.append(term, description);
    }
    const nameInput = profileForm.elements.namedItem("name");
    const phoneInput = profileForm.elements.namedItem("phone");
    const addressInput = profileForm.elements.namedItem("address");
    if (!(nameInput instanceof HTMLInputElement) ||
        !(phoneInput instanceof HTMLInputElement) ||
        !(addressInput instanceof HTMLTextAreaElement)) {
      throw new Error("The customer profile form is incomplete.");
    }
    nameInput.value = customerProfile.name || latestOrder?.customerName || "";
    phoneInput.value = customerProfile.phone || latestOrder?.customerPhone || "";
    addressInput.value = customerProfile.address || "";
    profileForm.hidden = false;
    const profileTitle = profileForm.querySelector("h3");
    const saveButton = profileForm.querySelector<HTMLButtonElement>("button[type=submit]");
    const complete = Boolean(customerProfile.name && customerProfile.phone && customerProfile.address);
    if (profileTitle) profileTitle.textContent = complete ? "Your details and default address" : "Complete your customer profile";
    if (saveButton) saveButton.textContent = complete ? "Update my details" : "Save my details";

    profileAddressList.replaceChildren();
    const uniqueAddresses = new Map<string, CustomerOrder>();
    for (const order of orders) {
      const address = order.deliveryAddress?.trim();
      if (address && !uniqueAddresses.has(address.toLocaleLowerCase())) {
        uniqueAddresses.set(address.toLocaleLowerCase(), order);
      }
    }
    if (uniqueAddresses.size === 0) {
      const empty = document.createElement("p");
      empty.className = "account-empty";
      empty.textContent = "Addresses from your orders will appear here.";
      profileAddressList.append(empty);
    } else {
      for (const [address, order] of uniqueAddresses) {
        const card = document.createElement("article");
        card.className = "profile-address-card";
        const addressText = document.createElement("p");
        addressText.textContent = order.deliveryAddress ?? address;
        const usedOn = document.createElement("span");
        const date = order.createdAt ? new Date(order.createdAt) : null;
        usedOn.textContent = date && !Number.isNaN(date.valueOf())
          ? `Used for an order on ${date.toLocaleDateString("en-IN", { dateStyle: "medium" })}`
          : "Used for a previous order";
        card.append(addressText, usedOn);
        profileAddressList.append(card);
      }
    }
    profileSection.hidden = false;
  }

  function showOrderHistory(orders: CustomerOrder[]) {
    orderList.replaceChildren();
    if (orders.length === 0) {
      const empty = document.createElement("p");
      empty.className = "account-empty";
      empty.textContent = "No paid orders were found for this email yet.";
      orderList.append(empty);
      ordersSection.hidden = false;
      return;
    }

    const formatPrice = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    });
    for (const value of orders) {
      const order = value;
      const card = document.createElement("article");
      card.className = "order-card";
      const heading = document.createElement("div");
      heading.className = "order-card-heading";
      const reference = document.createElement("strong");
      reference.textContent = order.orderId ? `Order ${order.orderId}` : "Your order";
      const paid = document.createElement("span");
      paid.className = "order-paid";
      const orderStatusLabels: Record<string, string> = {
        received: "Received",
        confirmed: "Confirmed",
        preparing: "Preparing",
        ready: "Ready",
        out_for_delivery: "Out for delivery",
        delivered: "Delivered",
        cancelled: "Cancelled",
      };
      paid.textContent = `${order.status === "paid" ? "Paid" : "Unpaid"} · ${orderStatusLabels[order.orderStatus ?? ""] ?? "Processing"}`;
      heading.append(reference, paid);

      const details = document.createElement("p");
      details.className = "order-card-meta";
      const date = order.createdAt ? new Date(order.createdAt) : null;
      details.textContent = [
        date && !Number.isNaN(date.valueOf()) ? date.toLocaleDateString("en-IN", { dateStyle: "medium" }) : "",
        typeof order.amountPaise === "number" ? formatPrice.format(order.amountPaise / 100) : "",
        order.deliveryMethod ?? "",
        order.eventDate ? `Event date: ${new Date(`${order.eventDate}T00:00:00`).toLocaleDateString("en-IN", { dateStyle: "medium" })}` : "",
      ].filter(Boolean).join(" · ");

      const items = document.createElement("ul");
      for (const item of order.items ?? []) {
        const line = document.createElement("li");
        line.textContent = [
          `${item.name ?? "Product"} × ${item.quantity ?? 1}`,
          item.flavour || "",
          item.wrapper ?? "Wrapper not recorded",
        ].filter(Boolean).join(" · ");
        items.append(line);
      }
      card.append(heading, details, items);
      orderList.append(card);
    }
    ordersSection.hidden = false;
  }

  async function loadOrders(token: string, rememberMe?: boolean) {
    setBusy(true);
    try {
      const result = await post("/auth/orders", undefined, token);
      if (result.isAdmin === true) {
        clearCustomerSessionToken();
        sessionStorage.setItem(ADMIN_SESSION_KEY, token);
        window.dispatchEvent(new Event("customer-session-change"));
        window.location.assign(`${baseUrl}admin/`);
        return;
      }
      if (rememberMe !== undefined) saveCustomerSessionToken(token, rememberMe);
      window.dispatchEvent(new Event("customer-session-change"));
      const orders = Array.isArray(result.orders)
        ? result.orders.filter((value): value is CustomerOrder => Boolean(value && typeof value === "object"))
        : [];
      const accountEmail = typeof result.email === "string" ? result.email : email;
      const rawProfile = result.profile && typeof result.profile === "object"
        ? result.profile as Record<string, unknown>
        : {};
      const customerProfile = {
        name: typeof rawProfile.name === "string" ? rawProfile.name : "",
        phone: typeof rawProfile.phone === "string" ? rawProfile.phone : "",
        address: typeof rawProfile.address === "string" ? rawProfile.address : "",
      };
      showProfile(orders, accountEmail, customerProfile);
      showOrderHistory(orders);
      emailForm.hidden = true;
      codeForm.hidden = true;
      setStatus(`Signed in as ${accountEmail}.`);
    } catch (error) {
      if (error instanceof AccountApiError && error.status === 401) {
        clearCustomerSessionToken();
        window.dispatchEvent(new Event("customer-session-change"));
      }
      throw error;
    } finally {
      setBusy(false);
    }
  }

  emailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!emailForm.reportValidity()) return;
    email = emailInput.value.trim().toLowerCase();
    setBusy(true);
    setStatus("");
    try {
      const result = await post("/auth/request-code", { email });
      codeForm.hidden = false;
      emailForm.hidden = true;
      codeInput.focus();
      setStatus(String(result.message ?? "If we can send a sign-in code to that email, it will arrive shortly."));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send a sign-in code.", true);
    } finally {
      setBusy(false);
    }
  });

  codeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!codeForm.reportValidity()) return;
    setBusy(true);
    setStatus("");
    try {
      const result = await post("/auth/verify-code", { email, code: codeInput.value.trim() });
      const token = String(result.token ?? "");
      if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("Sign-in returned an invalid session. Please try again.");
      await loadOrders(token, rememberMeInput.checked);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not verify the code.", true);
    } finally {
      setBusy(false);
    }
  });

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!profileForm.reportValidity()) return;
    const formData = new FormData(profileForm);
    setBusy(true);
    setStatus("Saving your details…");
    try {
      await post("/auth/profile/update", {
        name: formData.get("name"),
        phone: formData.get("phone"),
        address: formData.get("address"),
      }, getCustomerSessionToken());
      await loadOrders(getCustomerSessionToken());
      setStatus("Your details and default delivery address are saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save your details.", true);
    } finally {
      setBusy(false);
    }
  });

  changeEmailButton.addEventListener("click", () => {
    codeForm.hidden = true;
    emailForm.hidden = false;
    codeInput.value = "";
    setStatus("");
    emailInput.focus();
  });

  signOutButton.addEventListener("click", async () => {
    const token = getCustomerSessionToken();
    setBusy(true);
    try {
      if (token) await post("/auth/logout", undefined, token);
      clearCustomerSessionToken();
      window.dispatchEvent(new Event("customer-session-change"));
      profileSection.hidden = true;
      ordersSection.hidden = true;
      emailForm.hidden = false;
      setStatus("You’re signed out.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not sign out.", true);
    } finally {
      setBusy(false);
    }
  });

  const existingToken = getCustomerSessionToken();
  if (existingToken) {
    void loadOrders(existingToken).catch((error: unknown) => {
      emailForm.hidden = false;
      setStatus(error instanceof Error ? error.message : "Could not load your orders.", true);
    });
  }
}
