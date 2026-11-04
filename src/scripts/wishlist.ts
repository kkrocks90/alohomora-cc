const KEY = "cc-wishlist";

const read = (): string[] => {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
};

const write = (ids: string[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Storage can be unavailable in private mode; the heart just won't persist.
  }
};

const render = () => {
  const saved = new Set(read());
  document.querySelectorAll<HTMLButtonElement>("[data-wish]").forEach((button) => {
    const on = saved.has(button.dataset.wish ?? "");
    button.setAttribute("aria-pressed", String(on));
    button.classList.toggle("is-on", on);
    const name = button.dataset.wishName ?? "this product";
    button.setAttribute("aria-label", on ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`);
  });
  document.querySelectorAll<HTMLElement>("[data-wish-count]").forEach((badge) => {
    badge.textContent = String(saved.size);
    badge.hidden = saved.size === 0;
  });
  document.querySelectorAll(".wish-link").forEach((link) => link.classList.toggle("has-items", saved.size > 0));
  document.dispatchEvent(new CustomEvent("cc:wishlist", { detail: [...saved] }));
};

const flash = (button: HTMLElement, message: string) => {
  const label = button.querySelector<HTMLElement>("[data-share-label]");
  if (!label) return;
  const original = label.dataset.original ?? label.textContent ?? "";
  label.dataset.original = original;
  label.textContent = message;
  window.setTimeout(() => (label.textContent = original), 1800);
};

document.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;

  const wish = event.target.closest<HTMLButtonElement>("[data-wish]");
  if (wish) {
    event.preventDefault();
    const id = wish.dataset.wish ?? "";
    const saved = read();
    const next = saved.includes(id) ? saved.filter((item) => item !== id) : [...saved, id];
    write(next);
    render();
    if (next.includes(id)) {
      wish.classList.remove("is-pop");
      void wish.offsetWidth;
      wish.classList.add("is-pop");
    }
    return;
  }

  const share = event.target.closest<HTMLButtonElement>("[data-share]");
  if (share) {
    event.preventDefault();
    const url = `${location.origin}${location.pathname}`;
    const data = { title: share.dataset.shareTitle ?? document.title, text: share.dataset.shareText ?? "", url };
    if (navigator.share) {
      try {
        await navigator.share(data);
      } catch {
        // The share sheet was dismissed.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      flash(share, "Link copied");
    } catch {
      window.prompt("Copy this link", url);
    }
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === KEY) render();
});

render();
