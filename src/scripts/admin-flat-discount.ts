export interface FlatDiscount {
  name: string;
  percentage: number;
  active: boolean;
  endDate: string;
  category?: string;
}

interface Deps {
  root: HTMLElement;
  post: (path: string, body?: unknown) => Promise<Record<string, unknown>>;
  setStatus: (message: string, error?: boolean) => void;
  reload: () => Promise<void>;
}

export function isFlatDiscount(value: unknown): value is FlatDiscount {
  if (!value || typeof value !== "object") return false;
  const discount = value as Record<string, unknown>;
  return (
    typeof discount.name === "string" &&
    typeof discount.percentage === "number" &&
    typeof discount.active === "boolean" &&
    typeof discount.endDate === "string"
  );
}

function required<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`The admin page is missing ${selector}.`);
  return element;
}

export function initFlatDiscountAdmin({ root, post, setStatus, reload }: Deps) {
  const form = required<HTMLFormElement>(root, "#admin-flat-form");
  const name = required<HTMLInputElement>(form, "input[name='name']");
  const percentage = required<HTMLInputElement>(form, "input[name='percentage']");
  const endDate = required<HTMLInputElement>(form, "input[name='endDate']");
  const active = required<HTMLInputElement>(form, "input[name='active']");
  const category = required<HTMLSelectElement>(form, "select[name='category']");
  const summary = required<HTMLElement>(root, "#admin-flat-summary");

  function render(discount: FlatDiscount | null, categories: string[] = []) {
    const chosen = discount?.category ?? category.value;
    category.replaceChildren(new Option("All products", ""), ...categories.map((item) => new Option(item, item)));
    category.value = categories.includes(chosen) ? chosen : "";
    if (discount) {
      name.value = discount.name;
      percentage.value = String(discount.percentage);
      endDate.value = discount.endDate;
      active.checked = discount.active;
    }
    summary.dataset.state = discount?.active ? "on" : "off";
    summary.textContent = discount?.active
      ? `Live now: ${discount.percentage}% off ${discount.category ? `${discount.category} products` : "every order"}${discount.endDate ? ` until ${discount.endDate}` : ""}. Promo codes are paused.`
      : "No flat discount is live. Promo codes work as usual.";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (submit) submit.disabled = true;
    try {
      await post("/admin/flat-discount/save", {
        name: name.value,
        percentage: Number(percentage.value),
        endDate: endDate.value,
        category: category.value,
        active: active.checked,
      });
      setStatus(active.checked ? "Flat discount saved and live." : "Flat discount saved (turned off).");
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The flat discount could not be saved.", true);
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  return { render };
}
