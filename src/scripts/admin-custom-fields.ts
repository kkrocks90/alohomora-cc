import { FIELD_TYPE_LABELS, type CustomField, type CustomFieldType } from "./custom-fields";

interface Deps {
  root: HTMLElement;
  post: (path: string, body?: unknown) => Promise<Record<string, unknown>>;
  setStatus: (message: string, error?: boolean) => void;
  reload: () => Promise<void>;
  getCatalogue: () => { products: { id: string; name: string }[]; categories: string[] };
}

const OPTION_TYPES: CustomFieldType[] = ["dropdown", "radio", "checkboxes"];
const PLACEHOLDER_TYPES: CustomFieldType[] = ["text", "textarea", "number", "dropdown"];

export function isCustomField(value: unknown): value is CustomField {
  if (!value || typeof value !== "object") return false;
  const field = value as Record<string, unknown>;
  const appliesTo = field.appliesTo as Record<string, unknown> | undefined;
  return typeof field.id === "string" &&
    (field.scope === "product" || field.scope === "checkout") &&
    typeof field.label === "string" &&
    typeof field.type === "string" && field.type in FIELD_TYPE_LABELS &&
    Array.isArray(field.options) &&
    typeof field.required === "boolean" &&
    typeof field.active === "boolean" &&
    Boolean(appliesTo) && typeof appliesTo!.mode === "string" && Array.isArray(appliesTo!.values);
}

function required<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`The admin page is missing ${selector}.`);
  return element;
}

function text(parent: HTMLElement, tag: string, value: string, className = "") {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

export function initCustomFieldsAdmin({ root, post, setStatus, reload, getCatalogue }: Deps) {
  const form = required<HTMLFormElement>(root, "#admin-field-form");
  const scope = required<HTMLSelectElement>(root, "#admin-field-scope");
  const typeSelect = required<HTMLSelectElement>(root, "#admin-field-type");
  const optionsLabel = required<HTMLElement>(root, "#admin-field-options-label");
  const optionsInput = required<HTMLTextAreaElement>(root, "#admin-field-options");
  const range = required<HTMLElement>(root, "#admin-field-range");
  const placeholderLabel = required<HTMLElement>(root, "#admin-field-placeholder-label");
  const targets = required<HTMLElement>(root, "#admin-field-targets");
  const appliesMode = required<HTMLSelectElement>(root, "#admin-field-applies-mode");
  const appliesValues = required<HTMLElement>(root, "#admin-field-applies-values");
  const appliesLegend = required<HTMLElement>(root, "#admin-field-applies-legend");
  const appliesList = required<HTMLElement>(root, "#admin-field-applies-list");
  const submit = required<HTMLButtonElement>(root, "#admin-field-submit");
  const cancel = required<HTMLButtonElement>(root, "#admin-field-cancel");
  const list = required<HTMLElement>(root, "#admin-field-list");
  let fields: CustomField[] = [];
  let editingId: string | null = null;

  for (const [value, label] of Object.entries(FIELD_TYPE_LABELS)) typeSelect.append(new Option(label, value));

  function renderAppliesChoices(selected: string[] = []) {
    const mode = appliesMode.value;
    appliesList.replaceChildren();
    appliesValues.hidden = mode === "all";
    if (mode === "all") return;
    const catalogue = getCatalogue();
    appliesLegend.textContent = mode === "products" ? "Choose products" : "Choose categories";
    const choices = mode === "products"
      ? catalogue.products.map((product) => ({ value: product.id, label: product.name }))
      : catalogue.categories.map((category) => ({ value: category, label: category }));
    for (const choice of choices) {
      const row = document.createElement("label");
      row.className = "admin-field-choice";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = choice.value;
      input.checked = selected.includes(choice.value);
      row.append(input, document.createTextNode(` ${choice.label}`));
      appliesList.append(row);
    }
  }

  function syncForm() {
    const type = typeSelect.value as CustomFieldType;
    optionsLabel.hidden = !OPTION_TYPES.includes(type);
    optionsInput.required = OPTION_TYPES.includes(type);
    range.hidden = type !== "number";
    placeholderLabel.hidden = !PLACEHOLDER_TYPES.includes(type);
    targets.hidden = scope.value !== "product";
  }

  function resetForm() {
    editingId = null;
    form.reset();
    submit.textContent = "Create field";
    cancel.hidden = true;
    syncForm();
    renderAppliesChoices();
  }

  function field(name: string) {
    return form.elements.namedItem(name) as HTMLInputElement;
  }

  function startEdit(entry: CustomField) {
    editingId = entry.id;
    field("label").value = entry.label;
    scope.value = entry.scope;
    typeSelect.value = entry.type;
    optionsInput.value = entry.options.join("\n");
    field("min").value = entry.min === null ? "" : String(entry.min);
    field("max").value = entry.max === null ? "" : String(entry.max);
    field("placeholder").value = entry.placeholder;
    field("helpText").value = entry.helpText;
    field("required").checked = entry.required;
    field("sortOrder").value = String(entry.sortOrder);
    appliesMode.value = entry.appliesTo.mode;
    syncForm();
    renderAppliesChoices(entry.appliesTo.values);
    submit.textContent = "Save changes";
    cancel.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    field("label").focus();
  }

  function describe(entry: CustomField) {
    const where = entry.scope === "checkout"
      ? "Checkout (once per order)"
      : entry.appliesTo.mode === "all"
        ? "Product page · all products"
        : `Product page · ${entry.appliesTo.mode === "products" ? "products" : "categories"}: ${entry.appliesTo.values
          .map((value) => getCatalogue().products.find((product) => product.id === value)?.name ?? value)
          .join(", ")}`;
    return [FIELD_TYPE_LABELS[entry.type], entry.required ? "Required" : "Optional", where].join(" · ");
  }

  function render(next: CustomField[]) {
    fields = next;
    list.replaceChildren();
    if (fields.length === 0) {
      text(list, "p", "No custom fields yet.", "admin-empty");
    }
    for (const entry of fields) {
      const card = document.createElement("article");
      card.className = "admin-promo-card";
      const heading = document.createElement("div");
      heading.className = "admin-promo-card-heading";
      text(heading, "strong", entry.label);
      text(heading, "span", entry.active ? "Active" : "Inactive", entry.active ? "admin-promo-active" : "admin-promo-inactive");
      card.append(heading);
      text(card, "p", describe(entry), "admin-promo-description");
      if (entry.options.length > 0) text(card, "p", `Options: ${entry.options.join(", ")}`, "admin-promo-restrictions");
      const actions = document.createElement("div");
      actions.className = "admin-field-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "button button-secondary";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => startEdit(entry));
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "button button-secondary";
      toggle.textContent = entry.active ? "Deactivate" : "Activate";
      toggle.addEventListener("click", async () => {
        toggle.disabled = true;
        try {
          await post("/admin/custom-fields/update", { fieldId: entry.id, active: !entry.active });
          await reload();
          setStatus(`${entry.label} ${entry.active ? "deactivated" : "activated"}.`);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Could not update this field.", true);
          toggle.disabled = false;
        }
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button button-secondary";
      remove.textContent = "Delete";
      remove.addEventListener("click", async () => {
        if (!window.confirm(`Delete "${entry.label}"? Existing orders keep their saved answers.`)) return;
        remove.disabled = true;
        try {
          await post("/admin/custom-fields/delete", { fieldId: entry.id });
          if (editingId === entry.id) resetForm();
          await reload();
          setStatus(`Deleted ${entry.label}.`);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Could not delete this field.", true);
          remove.disabled = false;
        }
      });
      actions.append(edit, toggle, remove);
      card.append(actions);
      list.append(card);
    }
    if (editingId === null) renderAppliesChoices();
  }

  typeSelect.addEventListener("change", syncForm);
  scope.addEventListener("change", syncForm);
  appliesMode.addEventListener("change", () => renderAppliesChoices());
  cancel.addEventListener("click", resetForm);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const type = typeSelect.value as CustomFieldType;
    const selectedValues = Array.from(appliesList.querySelectorAll<HTMLInputElement>("input:checked")).map((input) => input.value);
    const definition = {
      label: field("label").value.trim(),
      scope: scope.value,
      type,
      options: OPTION_TYPES.includes(type) ? optionsInput.value.split(/\r?\n/) : [],
      min: type === "number" ? field("min").value : "",
      max: type === "number" ? field("max").value : "",
      placeholder: PLACEHOLDER_TYPES.includes(type) ? field("placeholder").value.trim() : "",
      helpText: field("helpText").value.trim(),
      required: field("required").checked,
      sortOrder: Number(field("sortOrder").value) || 0,
      appliesTo: scope.value === "product"
        ? { mode: appliesMode.value, values: appliesMode.value === "all" ? [] : selectedValues }
        : { mode: "all", values: [] },
    };
    submit.disabled = true;
    try {
      if (editingId) {
        const existing = fields.find((entry) => entry.id === editingId);
        await post("/admin/custom-fields/update", { fieldId: editingId, active: existing?.active ?? true, definition });
      } else {
        await post("/admin/custom-fields/create", definition);
      }
      const label = definition.label;
      const wasEditing = editingId !== null;
      resetForm();
      await reload();
      setStatus(`${label} ${wasEditing ? "updated" : "created"}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save this field.", true);
    } finally {
      submit.disabled = false;
    }
  });

  syncForm();
  renderAppliesChoices();
  return { render };
}
