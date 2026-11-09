interface CatalogueCategory {
  name: string;
  hidden: boolean;
  productCount: number;
}

interface Deps {
  root: HTMLElement;
  post: (path: string, body?: unknown) => Promise<Record<string, unknown>>;
  setStatus: (message: string, error?: boolean) => void;
  reload: () => Promise<void>;
}

function required<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`The admin page is missing ${selector}.`);
  return element;
}

export function isCatalogueCategory(value: unknown): value is CatalogueCategory {
  if (!value || typeof value !== "object") return false;
  const category = value as Record<string, unknown>;
  return typeof category.name === "string" && typeof category.hidden === "boolean" && typeof category.productCount === "number";
}

export function initCategoriesAdmin({ root, post, setStatus, reload }: Deps) {
  const form = required<HTMLFormElement>(root, "#admin-category-form");
  const list = required<HTMLElement>(root, "#admin-category-list");
  const nameInput = required<HTMLInputElement>(form, "input[name='name']");
  let categories: CatalogueCategory[] = [];
  let renaming: string | null = null;

  async function save(path: string, body: unknown, success: string) {
    try {
      await post(path, body);
      setStatus(`${success} The storefront updates after the next publish.`);
      renaming = null;
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The category could not be saved.", true);
    }
  }

  function button(label: string, onClick: () => void, className = "") {
    const element = document.createElement("button");
    element.type = "button";
    element.className = `cat-btn ${className}`;
    element.textContent = label;
    element.addEventListener("click", onClick);
    return element;
  }

  function renderRow(category: CatalogueCategory) {
    const row = document.createElement("article");
    row.className = "cat-card";
    if (category.hidden) row.classList.add("is-hidden");
    const actions = document.createElement("div");
    actions.className = "cat-actions";

    if (renaming === category.name) {
      const input = document.createElement("input");
      input.className = "cat-input";
      input.value = category.name;
      input.maxLength = 60;
      input.setAttribute("aria-label", `New name for ${category.name}`);
      const commit = () => void save("/admin/categories/update", { name: category.name, newName: input.value }, "Category renamed.");
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          renaming = null;
          render(categories);
        }
      });
      actions.append(
        button("Save", commit, "cat-btn-primary"),
        button("Cancel", () => {
          renaming = null;
          render(categories);
        }),
      );
      row.append(input, actions);
      queueMicrotask(() => input.focus());
      return row;
    }

    const info = document.createElement("div");
    info.className = "cat-info";
    const title = document.createElement("strong");
    title.textContent = category.name;
    const badges = document.createElement("div");
    badges.className = "cat-badges";
    const count = document.createElement("span");
    count.className = "cat-badge";
    count.textContent = `${category.productCount} product${category.productCount === 1 ? "" : "s"}`;
    badges.append(count);
    if (category.hidden) {
      const hidden = document.createElement("span");
      hidden.className = "cat-badge cat-badge-muted";
      hidden.textContent = "Hidden";
      badges.append(hidden);
    }
    info.append(title, badges);
    actions.append(
      button("Rename", () => {
        renaming = category.name;
        render(categories);
      }),
      button(category.hidden ? "Show in shop" : "Hide from shop", () =>
        void save("/admin/categories/update", { name: category.name, hidden: !category.hidden }, category.hidden ? "Category shown." : "Category hidden."),
      ),
      button(
        "Delete",
        () => {
          if (window.confirm(`Delete the category "${category.name}"?`)) {
            void save("/admin/categories/delete", { name: category.name }, "Category deleted.");
          }
        },
        "cat-btn-danger",
      ),
    );
    row.append(info, actions);
    return row;
  }

  function render(next: CatalogueCategory[]) {
    categories = next;
    list.replaceChildren(...next.map(renderRow));
    if (next.length === 0) {
      const empty = document.createElement("p");
      empty.className = "cat-empty";
      empty.textContent = "No categories yet.";
      list.append(empty);
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    try {
      await post("/admin/categories/create", { name });
      setStatus("Category added. Assign products to it from the product form.");
      form.reset();
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The category could not be added.", true);
    }
  });

  return { render };
}
