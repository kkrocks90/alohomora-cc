export {};

interface Review {
  name: string;
  location: string;
  rating: number;
  text: string;
  productName: string;
}

const section = document.querySelector<HTMLElement>("#reviews");
const grid = document.querySelector<HTMLElement>("#reviews-grid");
const apiUrl = (document.querySelector<HTMLElement>("#storefront")?.dataset.checkoutApi ?? "").replace(/\/+$/, "");

function isReview(value: unknown): value is Review {
  const review = value as Review;
  return Boolean(review) && typeof review.name === "string" && typeof review.text === "string" && Number.isInteger(review.rating);
}

if (section && grid && apiUrl) {
  fetch(`${apiUrl}/reviews`)
    .then((response) => (response.ok ? response.json() : { reviews: [] }))
    .then((payload: { reviews?: unknown[] }) => {
      const reviews = (payload.reviews ?? []).filter(isReview).slice(0, 6);
      if (reviews.length === 0) return;
      for (const review of reviews) {
        const card = document.createElement("figure");
        card.className = "review-card";
        const stars = document.createElement("div");
        stars.className = "review-stars";
        stars.setAttribute("role", "img");
        stars.setAttribute("aria-label", `${review.rating} out of 5 stars`);
        stars.textContent = "★".repeat(review.rating) + "☆".repeat(5 - review.rating);
        const quote = document.createElement("blockquote");
        quote.textContent = review.text;
        const caption = document.createElement("figcaption");
        const by = [review.name, review.location].filter(Boolean).join(", ");
        caption.textContent = review.productName ? `${by} · ${review.productName}` : by;
        card.append(stars, quote, caption);
        grid.append(card);
      }
      section.hidden = false;
    })
    .catch(() => undefined);
}
