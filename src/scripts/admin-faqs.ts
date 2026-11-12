interface Faq {
  question: string;
  answer: string;
}

interface Deps {
  root: HTMLElement;
  post: (path: string, body?: unknown) => Promise<Record<string, unknown>>;
  setStatus: (message: string, error?: boolean) => void;
}

function required<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`The admin page is missing ${selector}.`);
  return element;
}

function isFaq(value: unknown): value is Faq {
  if (!value || typeof value !== "object") return false;
  const faq = value as Record<string, unknown>;
  return typeof faq.question === "string" && typeof faq.answer === "string";
}

export function initFaqsAdmin({ root, post, setStatus }: Deps) {
  const list = required<HTMLElement>(root, "#admin-faq-list");
  const addButton = required<HTMLButtonElement>(root, "#admin-faq-add");
  const saveButton = required<HTMLButtonElement>(root, "#admin-faq-save");

  function renderRow(faq: Faq) {
    const row = document.createElement("article");
    row.className = "cat-card faq-card";

    const question = document.createElement("input");
    question.className = "cat-input";
    question.maxLength = 200;
    question.placeholder = "Question";
    question.value = faq.question;
    question.setAttribute("aria-label", "Question");

    const answer = document.createElement("textarea");
    answer.className = "cat-input faq-answer";
    answer.maxLength = 1500;
    answer.rows = 3;
    answer.placeholder = "Answer";
    answer.value = faq.answer;
    answer.setAttribute("aria-label", "Answer");

    const actions = document.createElement("div");
    actions.className = "cat-actions";
    for (const [label, offset] of [["Up", -1], ["Down", 1]] as const) {
      const move = document.createElement("button");
      move.type = "button";
      move.className = "cat-btn";
      move.textContent = label;
      move.addEventListener("click", () => {
        const sibling = offset < 0 ? row.previousElementSibling : row.nextElementSibling;
        if (!sibling) return;
        if (offset < 0) list.insertBefore(row, sibling);
        else list.insertBefore(sibling, row);
      });
      actions.append(move);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "cat-btn cat-btn-danger";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      if (window.confirm("Remove this question? It is removed from the website when you save.")) row.remove();
    });
    actions.append(remove);

    row.append(question, answer, actions);
    return row;
  }

  function render(faqs: Faq[]) {
    list.replaceChildren(...faqs.map(renderRow));
  }

  function collect(): Faq[] {
    return Array.from(list.querySelectorAll<HTMLElement>(".faq-card")).map((row) => ({
      question: row.querySelector<HTMLInputElement>("input")?.value ?? "",
      answer: row.querySelector<HTMLTextAreaElement>("textarea")?.value ?? "",
    }));
  }

  addButton.addEventListener("click", () => {
    const row = renderRow({ question: "", answer: "" });
    list.append(row);
    row.querySelector<HTMLInputElement>("input")?.focus();
  });

  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true;
    try {
      const result = await post("/admin/faqs/save", { items: collect() });
      render(Array.isArray(result.faqs) ? result.faqs.filter(isFaq) : []);
      setStatus("FAQs saved. Press Publish to storefront to show it on the website.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The FAQs could not be saved.", true);
    } finally {
      saveButton.disabled = false;
    }
  });

  async function load() {
    try {
      const result = await post("/admin/faqs/list");
      render(Array.isArray(result.faqs) ? result.faqs.filter(isFaq) : []);
    } catch {
      render([]);
    }
  }

  return { load };
}
