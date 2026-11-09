import { requireAdmin } from "./admin.js";

function result(status, body) {
  return { status, body };
}

function clean(value, maximum, label, { required = false } = {}) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (required && text.length === 0) throw new Error(`Enter ${label}.`);
  if (text.length > maximum) throw new Error(`Enter ${label} in ${maximum} characters or fewer.`);
  return text;
}

export function parseReview(body) {
  const rating = Number(body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("Enter a rating from 1 to 5.");
  return {
    name: clean(body?.name, 60, "the customer's name", { required: true }),
    location: clean(body?.location, 60, "the location"),
    rating,
    reviewText: clean(body?.reviewText, 600, "the review", { required: true }),
    productName: clean(body?.productName, 80, "the product name"),
    published: body?.published === false ? 0 : 1,
  };
}

function toReview(row, admin) {
  const review = {
    id: row.review_id,
    name: row.name,
    location: row.location,
    rating: row.rating,
    text: row.review_text,
    productName: row.product_name,
  };
  return admin ? { ...review, published: row.published === 1, createdAt: row.created_at } : review;
}

export async function listReviews(database, { admin = false } = {}) {
  const { results } = await database
    .prepare(
      `SELECT review_id, name, location, rating, review_text, product_name, published, created_at
       FROM reviews ${admin ? "" : "WHERE published = 1"} ORDER BY created_at DESC, review_id DESC LIMIT 100`,
    )
    .all();
  return (results ?? []).map((row) => toReview(row, admin));
}

// action is "list", "create", "update" or "delete"
export async function handleAdminReviews(request, env, action) {
  let body;
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return result(400, { error: "Request must contain valid JSON." });
  }
  try {
    const access = await requireAdmin(request, env);
    if (access.error) return access.error;
    const database = env.ORDERS_DB;
    if (action === "create" || action === "update") {
      const review = parseReview(body);
      if (action === "create") {
        await database
          .prepare(
            `INSERT INTO reviews (name, location, rating, review_text, product_name, published, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(review.name, review.location, review.rating, review.reviewText, review.productName, review.published, new Date().toISOString())
          .run();
      } else {
        const id = Number(body?.id);
        if (!Number.isInteger(id)) return result(400, { error: "That review could not be found." });
        await database
          .prepare(
            `UPDATE reviews SET name = ?, location = ?, rating = ?, review_text = ?, product_name = ?, published = ?
             WHERE review_id = ?`,
          )
          .bind(review.name, review.location, review.rating, review.reviewText, review.productName, review.published, id)
          .run();
      }
    } else if (action === "delete") {
      const id = Number(body?.id);
      if (!Number.isInteger(id)) return result(400, { error: "That review could not be found." });
      await database.prepare("DELETE FROM reviews WHERE review_id = ?").bind(id).run();
    }
    return result(200, { reviews: await listReviews(database, { admin: true }) });
  } catch (error) {
    if (error instanceof Error && /^Enter /.test(error.message)) return result(400, { error: error.message });
    console.error("Could not save the review.", error);
    return result(503, { error: "The review could not be saved right now. Please try again." });
  }
}
