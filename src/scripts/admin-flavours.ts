interface CatalogueFlavour {
  name: string;
  extraPercent: number;
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

export function isCatalogueFlavour(value: unknown): value is CatalogueFlavour {
  if (!value || typeof value !== "object") return false;
  const flavour = value as Record<string, unknown>;
  return typeof flavour.name === "string" && typeof flavour.extraPercent === "number" && typeof flavour.productCount === "number";
}

export function initFlavoursAdmin({ root, post, setStatus, reload }: Deps) {
  const form = required<HTMLFormElement>(root, "#admin-flavour-form");
  const list = required<HTMLElement>(root, "#admin-flavour-list");
  const nameInput = required<HTMLInputElement>(form, "input[name='name']");
  const saveAll = required<HTMLButtonElement>(root, "#admin-flavour-save-all");
  const extraInput = required<HTMLInputElement>(form, "input[name='extraPercent']");

  async function save(path: string, body: unknown, success: string) {
    try {
      await post(path, body);
      setStatus(`${success} The storefront updates after the next publish.`);
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The flavour could not be saved.", true);
    }
  }

  function renderRow(flavour: CatalogueFlavour) {
    const row = document.createElement("article");
    row.className = "admin-category-row admin-flavour-row";

    const nameField = document.createElement("input");
    nameField.value = flavour.name;
    nameField.maxLength = 60;
    nameField.setAttribute("aria-label", `Name of ${flavour.name}`);

    const extraWrap = document.createElement("label");
    extraWrap.className = "admin-flavour-extra";
    const extraText = document.createElement("span");
    extraText.textContent = "Extra %";
    const extraField = document.createElement("input");
    extraField.type = "number";
    extraField.min = "0";
    extraField.max = "500";
    extraField.step = "1";
    extraField.inputMode = "numeric";
    extraField.value = String(flavour.extraPercent);
    extraField.setAttribute("aria-label", `Extra percentage for ${flavour.name}`);
    extraWrap.append(extraText, extraField);

    const meta = document.createElement("span");
    meta.className = "admin-flavour-meta";
    meta.textContent = `${flavour.productCount} product${flavour.productCount === 1 ? "" : "s"}`;

    const actions = document.createElement("div");
    actions.className = "admin-category-actions";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "button button-secondary admin-category-action";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      if (window.confirm(`Delete the flavour "${flavour.name}"?`)) {
        void save("/admin/flavours/delete", { name: flavour.name }, "Flavour deleted.");
      }
    });
    actions.append(deleteButton);
    row.dataset.original = flavour.name;
    row.dataset.savedName = flavour.name;
    row.dataset.savedExtra = String(flavour.extraPercent);
    row.append(nameField, extraWrap, meta, actions);
    return row;
  }

  function changedItems() {
    return Array.from(list.querySelectorAll<HTMLElement>(".admin-flavour-row"))
      .map((row) => {
        const [nameField, extraField] = Array.from(row.querySelectorAll<HTMLInputElement>("input"));
        return {
          name: row.dataset.original ?? "",
          newName: nameField.value,
          extraPercent: Number(extraField.value || 0),
          changed: nameField.value !== row.dataset.savedName || String(Number(extraField.value || 0)) !== row.dataset.savedExtra,
        };
      })
      .filter((item) => item.changed)
      .map(({ name, newName, extraPercent }) => ({ name, newName, extraPercent }));
  }

  saveAll.addEventListener("click", async () => {
    const items = changedItems();
    if (items.length === 0) {
      setStatus("No flavour changes to save.");
      return;
    }
    saveAll.disabled = true;
    try {
      await post("/admin/flavours/save-all", { items });
      setStatus(`Saved ${items.length} flavour${items.length === 1 ? "" : "s"}. The storefront updates after the next publish.`);
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The flavours could not be saved.", true);
    } finally {
      saveAll.disabled = false;
    }
  });

  function render(flavours: CatalogueFlavour[]) {
    list.replaceChildren(...flavours.map(renderRow));
    if (flavours.length === 0) {
      const empty = document.createElement("p");
      empty.className = "admin-form-hint";
      empty.textContent = "No flavours yet.";
      list.append(empty);
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    try {
      await post("/admin/flavours/create", { name, extraPercent: Number(extraInput.value || 0) });
      setStatus("Flavour added. Tick it on a product to offer it.");
      form.reset();
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The flavour could not be added.", true);
    }
  });

  return { render };
}
