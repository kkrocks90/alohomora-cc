interface AdminReview {
  id: number;
  name: string;
  location: string;
  rating: number;
  text: string;
  productName: string;
  published: boolean;
}

interface Deps {
  root: HTMLElement;
  post: (path: string, body?: unknown) => Promise<Record<string, unknown>>;
  setStatus: (message: string, error?: boolean) => void;
}

function isReview(value: unknown): value is AdminReview {
  const review = value as AdminReview;
  return Boolean(review) && Number.isInteger(review.id) && typeof review.name === "string" && typeof review.text === "string";
}

export function initReviewsAdmin({ root, post, setStatus }: Deps) {
  const form = root.querySelector<HTMLFormElement>("#admin-review-form");
  const list = root.querySelector<HTMLElement>("#admin-review-list");
  const submit = root.querySelector<HTMLButtonElement>("#admin-review-submit");
  const cancel = root.querySelector<HTMLButtonElement>("#admin-review-cancel");
  if (!form || !list || !submit || !cancel) throw new Error("The admin page is missing the reviews section.");

  let reviews: AdminReview[] = [];
  let editingId: number | null = null;

  const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
  const setValue = (name: string, next: string) => {
    (form.elements.namedItem(name) as HTMLInputElement).value = next;
  };

  function resetForm() {
    editingId = null;
    form!.reset();
    setValue("rating", "5");
    (form!.elements.namedItem("published") as HTMLInputElement).checked = true;
    submit!.textContent = "Add review";
    cancel!.hidden = true;
  }

  function payload() {
    return {
      name: value("name"),
      location: value("location"),
      rating: Number(value("rating")),
      reviewText: value("reviewText"),
      productName: value("productName"),
      published: (form!.elements.namedItem("published") as HTMLInputElement).checked,
    };
  }

  function render() {
    list!.replaceChildren();
    if (reviews.length === 0) {
      const empty = document.createElement("p");
      empty.className = "admin-form-hint";
      empty.textContent = "No reviews yet. Add one above and it appears on the home page.";
      list!.append(empty);
      return;
    }
    for (const review of reviews) {
      const row = document.createElement("article");
      row.className = "admin-category-row";
      if (!review.published) row.classList.add("is-hidden");
      const info = document.createElement("div");
      info.className = "admin-category-info";
      const title = document.createElement("strong");
      title.textContent = `${"★".repeat(review.rating)} ${review.name}${review.location ? `, ${review.location}` : ""}`;
      const text = document.createElement("span");
      text.textContent = `${review.text}${review.published ? "" : " · Hidden"}`;
      info.append(title, text);
      const actions = document.createElement("div");
      actions.className = "admin-category-actions";
      const make = (label: string, onClick: () => void) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button button-secondary admin-category-action";
        button.textContent = label;
        button.addEventListener("click", onClick);
        return button;
      };
      actions.append(
        make("Edit", () => {
          editingId = review.id;
          setValue("name", review.name);
          setValue("location", review.location);
          setValue("rating", String(review.rating));
          setValue("reviewText", review.text);
          setValue("productName", review.productName);
          (form!.elements.namedItem("published") as HTMLInputElement).checked = review.published;
          submit!.textContent = "Save review";
          cancel!.hidden = false;
          form!.scrollIntoView({ behavior: "smooth", block: "start" });
        }),
        make(review.published ? "Hide" : "Show", () => void run("update", { ...review, reviewText: review.text, published: !review.published })),
        make("Delete", () => {
          if (window.confirm(`Delete the review from ${review.name}?`)) void run("delete", { id: review.id });
        }),
      );
      row.append(info, actions);
      list!.append(row);
    }
  }

  async function run(action: string, body?: unknown) {
    try {
      const response = await post(`/admin/reviews/${action}`, body ?? {});
      reviews = Array.isArray(response.reviews) ? response.reviews.filter(isReview) : [];
      render();
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The reviews could not be updated.", true);
      return false;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    const ok = await run(editingId === null ? "create" : "update", editingId === null ? payload() : { ...payload(), id: editingId });
    submit.disabled = false;
    if (ok) {
      setStatus(editingId === null ? "Review added." : "Review saved.");
      resetForm();
    }
  });
  cancel.addEventListener("click", resetForm);
  resetForm();

  return { load: () => run("list") };
}
