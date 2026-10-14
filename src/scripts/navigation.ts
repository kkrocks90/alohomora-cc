function requireMenuElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`The mobile navigation menu is missing ${selector}.`);
  return element;
}

const accountSessionKey = "cocoa-kind-customer-session";
const accountLabels = document.querySelectorAll<HTMLElement>("[data-account-label]");

function updateAccountLabels() {
  const label = sessionStorage.getItem(accountSessionKey) ? "My profile" : "Login";
  accountLabels.forEach((element) => {
    element.textContent = label;
  });
}

updateAccountLabels();
window.addEventListener("customer-session-change", updateAccountLabels);

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
