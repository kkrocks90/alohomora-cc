import { getCustomerSessionToken } from "./cart";

function requireMenuElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`The mobile navigation menu is missing ${selector}.`);
  return element;
}

const accountLabels = document.querySelectorAll<HTMLElement>("[data-account-label]");

function updateAccountLabels() {
  const label = getCustomerSessionToken() ? "My profile" : "Login";
  accountLabels.forEach((element) => {
    element.textContent = label;
  });
}

updateAccountLabels();
window.addEventListener("customer-session-change", updateAccountLabels);
window.addEventListener("storage", updateAccountLabels);

const tabBag = document.querySelector<HTMLButtonElement>("#tab-bag");
const tabBagCount = document.querySelector<HTMLElement>("#tab-bag-count");
const headerBag = document.querySelector<HTMLButtonElement>("#open-cart");
const headerBagCount = document.querySelector<HTMLElement>("#bag-count");

if (tabBag && tabBagCount && headerBag && headerBagCount) {
  const syncBagCount = () => {
    const count = Number(headerBagCount.textContent) || 0;
    tabBagCount.textContent = String(count);
    tabBagCount.hidden = count === 0;
  };
  syncBagCount();
  new MutationObserver(syncBagCount).observe(headerBagCount, { childList: true, characterData: true, subtree: true });
  tabBag.addEventListener("click", () => headerBag.click());
}

const currentPath = window.location.pathname.replace(/\/+$/, "/");
document.querySelectorAll<HTMLAnchorElement>("#tab-bar a[data-tab-path]").forEach((link) => {
  const tabPath = link.dataset.tabPath ?? "";
  const linkPath = new URL(link.href).pathname;
  const isHome = tabPath === "/";
  if (isHome ? currentPath === linkPath : currentPath.startsWith(linkPath)) {
    link.setAttribute("aria-current", "page");
  }
});

const menuToggle = document.querySelector<HTMLButtonElement>("#open-mobile-menu");

if (menuToggle) {
  const menuButton = menuToggle;
  const menu = requireMenuElement<HTMLElement>("#mobile-menu");
  const backdrop = requireMenuElement<HTMLElement>("#mobile-menu-backdrop");
  const closeButton = requireMenuElement<HTMLButtonElement>("#close-mobile-menu");

  let previousFocus: HTMLElement | null = null;

  function closeMenu() {
    menu.setAttribute("aria-hidden", "true");
    backdrop.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
    previousFocus?.focus();
  }

  function openMenu() {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menu.setAttribute("aria-hidden", "false");
    backdrop.hidden = false;
    menuButton.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    closeButton.focus();
  }

  menuButton.addEventListener("click", openMenu);
  closeButton.addEventListener("click", closeMenu);
  backdrop.addEventListener("click", closeMenu);
  menu.querySelectorAll<HTMLAnchorElement>("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", (event) => {
    if (menu.getAttribute("aria-hidden") === "true") return;
    if (event.key === "Escape") {
      closeMenu();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(menu.querySelectorAll<HTMLElement>("a, button"));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
}
