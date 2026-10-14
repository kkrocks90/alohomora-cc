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
  const emailForm = requireElement(root.querySelector<HTMLFormElement>("#account-email-form"), "#account-email-form");
  const codeForm = requireElement(root.querySelector<HTMLFormElement>("#account-code-form"), "#account-code-form");
  const emailInput = requireElement(root.querySelector<HTMLInputElement>("#account-email"), "#account-email");
  const codeInput = requireElement(root.querySelector<HTMLInputElement>("#account-code"), "#account-code");
  const status = requireElement(root.querySelector<HTMLElement>("#account-status"), "#account-status");
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
  const sessionKey = "cocoa-kind-customer-session";

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

  function showOrderHistory(orders: unknown[]) {
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
      if (!value || typeof value !== "object") continue;
      const order = value as {
        orderId?: string;
        status?: string;
        items?: { name?: string; quantity?: number; flavour?: string; wrapper?: string }[];
        amountPaise?: number;
        createdAt?: string;
        deliveryMethod?: string;
      };
      const card = document.createElement("article");
      card.className = "order-card";
      const heading = document.createElement("div");
      heading.className = "order-card-heading";
      const reference = document.createElement("strong");
      reference.textContent = order.orderId ? `Order ${order.orderId}` : "Your order";
      const paid = document.createElement("span");
      paid.className = "order-paid";
      paid.textContent = order.status === "paid" ? "Paid" : "Processing";
      heading.append(reference, paid);

      const details = document.createElement("p");
      details.className = "order-card-meta";
      const date = order.createdAt ? new Date(order.createdAt) : null;
      details.textContent = [
        date && !Number.isNaN(date.valueOf()) ? date.toLocaleDateString("en-IN", { dateStyle: "medium" }) : "",
        typeof order.amountPaise === "number" ? formatPrice.format(order.amountPaise / 100) : "",
        order.deliveryMethod ?? "",
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

  async function loadOrders(token: string) {
    setBusy(true);
    try {
      const result = await post("/auth/orders", undefined, token);
      showOrderHistory(Array.isArray(result.orders) ? result.orders : []);
      emailForm.hidden = true;
      codeForm.hidden = true;
      setStatus(`Signed in as ${String(result.email ?? email)}.`);
    } catch (error) {
      if (error instanceof AccountApiError && error.status === 401) {
        sessionStorage.removeItem(sessionKey);
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
      setStatus(String(result.message ?? "If a paid order is associated with that email, a sign-in code will arrive shortly."));
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
      sessionStorage.setItem(sessionKey, token);
      await loadOrders(token);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not verify the code.", true);
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
    const token = sessionStorage.getItem(sessionKey);
    setBusy(true);
    try {
      if (token) await post("/auth/logout", undefined, token);
      sessionStorage.removeItem(sessionKey);
      ordersSection.hidden = true;
      emailForm.hidden = false;
      setStatus("You’re signed out.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not sign out.", true);
    } finally {
      setBusy(false);
    }
  });

  const existingToken = sessionStorage.getItem(sessionKey);
  if (existingToken) {
    void loadOrders(existingToken).catch((error: unknown) => {
      emailForm.hidden = false;
      setStatus(error instanceof Error ? error.message : "Could not load your orders.", true);
    });
  }
}
