export type CustomFieldType = "text" | "textarea" | "number" | "date" | "dropdown" | "radio" | "checkboxes" | "checkbox";

export interface CustomField {
  id: string;
  scope: "product" | "checkout";
  label: string;
  type: CustomFieldType;
  options: string[];
  min: number | null;
  max: number | null;
  futureOnly?: boolean;
  required: boolean;
  placeholder: string;
  helpText: string;
  appliesTo: { mode: "all" | "products" | "categories"; values: string[] };
  sortOrder: number;
  active: boolean;
}

export type CustomAnswerValue = string | string[] | boolean;

// An answer kept in the bag: `text` is shown to people, `value` is what the Worker validates.
export interface CustomAnswer {
  id: string;
  label: string;
  text: string;
  value: CustomAnswerValue;
}

export interface SavedAnswer {
  id: string;
  label: string;
  value: string;
}

export const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  number: "Number",
  date: "Date",
  dropdown: "Dropdown",
  radio: "Single choice (radio buttons)",
  checkboxes: "Multiple choice (checkboxes)",
  checkbox: "Single checkbox (yes/no)",
};

let cached: Promise<CustomField[]> | null = null;

export function fetchCustomFields(apiUrl: string): Promise<CustomField[]> {
  if (!apiUrl) return Promise.resolve([]);
  cached ??= fetch(`${apiUrl.replace(/\/+$/, "")}/custom-fields`)
    .then(async (response) => {
      if (!response.ok) throw new Error("Custom fields could not be loaded.");
      const data: unknown = await response.json();
      const fields = (data as { fields?: unknown })?.fields;
      return Array.isArray(fields) ? (fields as CustomField[]) : [];
    })
    .catch((error: unknown) => {
      cached = null;
      throw error;
    });
  return cached;
}

export function fieldAppliesToProduct(
  field: CustomField,
  product: { id: string; tag: string; extraTags?: string[] },
): boolean {
  if (field.scope !== "product") return false;
  const { mode, values } = field.appliesTo;
  if (mode === "all") return true;
  if (mode === "products") return values.includes(product.id);
  return values.includes(product.tag) || (product.extraTags ?? []).some((tag) => values.includes(tag));
}

function inputName(field: CustomField) {
  return `custom:${field.id}`;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderChoice(field: CustomField, kind: "radio" | "checkbox", value: string, label: string) {
  const row = element("label", "custom-field-choice");
  const input = element("input");
  input.type = kind;
  input.name = inputName(field);
  input.value = value;
  if (kind === "radio" && field.required) input.required = true;
  row.append(input, element("span", undefined, label));
  return row;
}

export function renderCustomFields(container: HTMLElement, fields: CustomField[]) {
  container.replaceChildren();
  container.hidden = fields.length === 0;
  for (const field of fields) {
    const wrapper = element("div", "custom-field");
    wrapper.dataset.customFieldId = field.id;
    const asGroup = field.type === "radio" || field.type === "checkboxes";
    const heading = element(asGroup ? "span" : "label", "custom-field-label");
    heading.append(document.createTextNode(field.label));
    if (field.required && field.type !== "checkbox") heading.append(" ", element("span", "custom-field-required", "Required"));
    const name = inputName(field);
    const id = `cf-${field.id}`;

    if (field.type === "checkbox") {
      const row = renderChoice(field, "checkbox", "yes", field.label);
      const input = row.querySelector("input")!;
      input.required = field.required;
      wrapper.append(row);
    } else if (field.type === "textarea") {
      const input = element("textarea");
      input.name = name;
      input.id = id;
      input.rows = 3;
      input.maxLength = field.max ?? 500;
      if (field.min !== null) input.minLength = field.min;
      input.required = field.required;
      input.placeholder = field.placeholder;
      (heading as HTMLLabelElement).htmlFor = id;
      wrapper.append(heading, input);
    } else if (field.type === "dropdown") {
      const select = element("select");
      select.name = name;
      select.id = id;
      select.required = field.required;
      const blank = element("option", undefined, field.placeholder || "Choose an option");
      blank.value = "";
      select.append(blank);
      for (const option of field.options) {
        const entry = element("option", undefined, option);
        entry.value = option;
        select.append(entry);
      }
      (heading as HTMLLabelElement).htmlFor = id;
      wrapper.append(heading, select);
    } else if (asGroup) {
      const group = element("div", "custom-field-choices");
      group.setAttribute("role", field.type === "radio" ? "radiogroup" : "group");
      group.setAttribute("aria-label", field.label);
      for (const option of field.options) {
        group.append(renderChoice(field, field.type === "radio" ? "radio" : "checkbox", option, option));
      }
      wrapper.append(heading, group);
    } else {
      const input = element("input");
      input.name = name;
      input.id = id;
      input.required = field.required;
      input.placeholder = field.placeholder;
      if (field.type === "number") {
        input.type = "number";
        input.step = "any";
        if (field.min !== null) input.min = String(field.min);
        if (field.max !== null) input.max = String(field.max);
        input.inputMode = "decimal";
      } else if (field.type === "date") {
        input.type = "date";
        if (field.futureOnly) input.min = new Date().toISOString().slice(0, 10);
      } else {
        input.type = "text";
        input.maxLength = field.max ?? 200;
        if (field.min !== null) input.minLength = field.min;
      }
      (heading as HTMLLabelElement).htmlFor = id;
      wrapper.append(heading, input);
    }
    if (field.helpText) wrapper.append(element("small", "custom-field-help", field.helpText));
    container.append(wrapper);
  }
}

// Reads the answers typed into `container`. Throws a friendly message when a required checkbox group is empty.
export function readCustomAnswers(container: HTMLElement, fields: CustomField[]): CustomAnswer[] {
  const answers: CustomAnswer[] = [];
  for (const field of fields) {
    const name = inputName(field);
    const controls = Array.from(container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      `[name="${CSS.escape(name)}"]`,
    ));
    if (field.type === "checkbox") {
      const checked = (controls[0] as HTMLInputElement | undefined)?.checked === true;
      if (!checked && !field.required) continue;
      answers.push({ id: field.id, label: field.label, text: checked ? "Yes" : "No", value: checked });
    } else if (field.type === "checkboxes") {
      const selected = controls.filter((control) => (control as HTMLInputElement).checked).map((control) => control.value);
      if (selected.length === 0) {
        if (field.required) throw new Error(`Please choose at least one option for "${field.label}".`);
        continue;
      }
      answers.push({ id: field.id, label: field.label, text: selected.join(", "), value: selected });
    } else if (field.type === "radio") {
      const selected = controls.find((control) => (control as HTMLInputElement).checked)?.value;
      if (!selected) {
        if (field.required) throw new Error(`Please choose an option for "${field.label}".`);
        continue;
      }
      answers.push({ id: field.id, label: field.label, text: selected, value: selected });
    } else {
      const value = (controls[0]?.value ?? "").trim();
      if (!value) {
        if (field.required) throw new Error(`Please fill in "${field.label}".`);
        continue;
      }
      answers.push({ id: field.id, label: field.label, text: value, value });
    }
  }
  return answers;
}

export function answersToPayload(answers: CustomAnswer[] | undefined): Record<string, CustomAnswerValue> {
  return Object.fromEntries((answers ?? []).map((answer) => [answer.id, answer.value]));
}

export function answersKey(answers: CustomAnswer[] | undefined): string {
  return JSON.stringify((answers ?? []).map((answer) => [answer.id, answer.text]));
}

export function isCustomAnswer(value: unknown): value is CustomAnswer {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string" && typeof entry.label === "string" && typeof entry.text === "string" &&
    (typeof entry.value === "string" || typeof entry.value === "boolean" ||
      (Array.isArray(entry.value) && entry.value.every((item) => typeof item === "string")));
}
