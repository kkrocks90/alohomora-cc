const root = document.querySelector<HTMLElement>("#storefront");
const apiUrl = root?.dataset.checkoutApi?.replace(/\/+$/, "") ?? "";

function formatRupees(paise: number) {
  const rupees = paise / 100;
  return `₹${Number.isInteger(rupees) ? rupees : rupees.toFixed(2)}`;
}

let activePercentage = 0;

// The product page changes dataset.priceNow when a flavour is picked, then announces it with "cc:price".
document.addEventListener("cc:price", (event) => {
  const target = event.target as HTMLElement | null;
  if (!activePercentage || !target?.classList.contains("price-now")) return;
  const originalPaise = Math.round(Number(target.dataset.priceNow) * 100);
  if (!Number.isFinite(originalPaise) || originalPaise <= 0) return;
  target.textContent = formatRupees(originalPaise - Math.floor((originalPaise * activePercentage) / 100));
  const was = target.parentElement?.querySelector(".price-was");
  if (was) was.textContent = formatRupees(originalPaise);
});

async function showDiscountedPrices() {
  const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-price-now]"));
  if (!apiUrl || targets.length === 0) return;
  try {
    const response = await fetch(`${apiUrl}/flat-discount`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { discount?: { percentage?: unknown } | null };
    const percentage = payload?.discount?.percentage;
    if (typeof percentage !== "number" || !Number.isInteger(percentage) || percentage < 1 || percentage > 90) return;

    activePercentage = percentage;
    targets.forEach((target) => {
      const price = Number(target.dataset.priceNow);
      if (!Number.isFinite(price) || price <= 0) return;
      const originalPaise = Math.round(price * 100);
      const discountedPaise = originalPaise - Math.floor((originalPaise * percentage) / 100);
      const was = document.createElement("s");
      was.className = "price-was";
      was.textContent = formatRupees(originalPaise);
      target.textContent = formatRupees(discountedPaise);
      target.classList.add("price-now");
      const stack = document.createElement("span");
      stack.className = "price-stack";
      target.before(stack);
      stack.append(target, was);
      const badge = document.createElement("span");
      const card = target.closest(".product-card");
      const imageWrap = card?.querySelector(".product-image-wrap");
      badge.textContent = `${percentage}% off`;
      if (imageWrap) {
        badge.className = "price-off-flag";
        imageWrap.append(badge);
      } else {
        badge.className = "price-off-badge";
        stack.after(badge);
      }
    });
  } catch (error) {
    console.error("Could not display discounted prices.", error);
  }
}

void showDiscountedPrices();
