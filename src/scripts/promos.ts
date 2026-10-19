type FeaturedPromo = {
  name: string;
  code: string;
  targetLabel: string;
  endDate: string;
} & (
  | {
      type: "percentage";
      percentage: number;
      targetType: "all" | "product" | "category";
      amountPaise: null;
      minimumSubtotalPaise: null;
    }
  | {
      type: "fixed";
      percentage: null;
      targetType: null;
      amountPaise: number;
      minimumSubtotalPaise: number;
    }
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFeaturedPromo(value: unknown): value is FeaturedPromo {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    typeof value.code !== "string" ||
    typeof value.targetLabel !== "string" ||
    typeof value.endDate !== "string"
  ) return false;
  if (value.type === "percentage") {
    return typeof value.percentage === "number" &&
      Number.isInteger(value.percentage) &&
      value.percentage >= 1 &&
      value.percentage <= 100 &&
      (value.targetType === "all" || value.targetType === "product" || value.targetType === "category") &&
      value.amountPaise === null &&
      value.minimumSubtotalPaise === null;
  }
  return value.type === "fixed" &&
    value.percentage === null &&
    value.targetType === null &&
    typeof value.amountPaise === "number" &&
    Number.isSafeInteger(value.amountPaise) &&
    value.amountPaise > 0 &&
    typeof value.minimumSubtotalPaise === "number" &&
    Number.isSafeInteger(value.minimumSubtotalPaise) &&
    value.minimumSubtotalPaise >= 0;
}

const root = document.querySelector<HTMLElement>("#storefront");
const banners = document.querySelectorAll<HTMLAnchorElement>("[data-promo-banner]");
const apiUrl = root?.dataset.checkoutApi?.replace(/\/+$/, "") ?? "";
const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function describePromo(promo: FeaturedPromo) {
  if (promo.type === "fixed") {
    return `Get ${currency.format(promo.amountPaise / 100)} off when your product subtotal is over ${currency.format(promo.minimumSubtotalPaise / 100)}.`;
  }
  const target = promo.targetType === "all"
    ? "everything"
    : promo.targetType === "product"
      ? promo.targetLabel
      : `the ${promo.targetLabel} collection`;
  return `Save ${promo.percentage}% on ${target}.`;
}

async function showFeaturedPromo() {
  if (!apiUrl || banners.length === 0) return;
  try {
    const response = await fetch(`${apiUrl}/promos/featured`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
    });
    if (!response.ok) throw new Error(`The promo service returned status ${response.status}.`);
    const payload: unknown = await response.json();
    if (!isRecord(payload) || (payload.promo !== null && !isFeaturedPromo(payload.promo))) {
      throw new Error("The promo service returned invalid featured-promo details.");
    }
    if (!payload.promo) return;

    const promo = payload.promo;
    for (const banner of banners) {
      const name = banner.querySelector<HTMLElement>("[data-promo-name]");
      const offer = banner.querySelector<HTMLElement>("[data-promo-offer]");
      const code = banner.querySelector<HTMLElement>("[data-promo-code]");
      if (!name || !offer || !code) throw new Error("A promo banner is missing its display fields.");
      name.textContent = promo.name;
      offer.textContent = describePromo(promo);
      code.textContent = promo.code;
      banner.setAttribute("aria-label", `${promo.name}. ${offer.textContent} Use code ${promo.code}.`);
      banner.hidden = false;
    }
  } catch (error) {
    console.error("Could not display the featured promo.", error);
  }
}

void showFeaturedPromo();
