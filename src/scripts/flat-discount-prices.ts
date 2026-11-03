const root = document.querySelector<HTMLElement>("#storefront");
const apiUrl = root?.dataset.checkoutApi?.replace(/\/+$/, "") ?? "";

function formatRupees(paise: number) {
  const rupees = paise / 100;
  return `₹${Number.isInteger(rupees) ? rupees : rupees.toFixed(2)}`;
}

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
      target.before(was);
      const badge = document.createElement("span");
      badge.className = "price-off-badge";
      badge.textContent = `${percentage}% off`;
      target.after(badge);
    });
  } catch (error) {
    console.error("Could not display discounted prices.", error);
  }
}

void showDiscountedPrices();
