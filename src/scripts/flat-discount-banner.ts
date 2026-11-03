const root = document.querySelector<HTMLElement>("#storefront");
const banner = document.querySelector<HTMLElement>("[data-promo-banner]");
const apiUrl = root?.dataset.checkoutApi?.replace(/\/+$/, "") ?? "";

function formatEndDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long" });
}

async function showFlatDiscount() {
  if (!apiUrl || !banner) return;
  try {
    const response = await fetch(`${apiUrl}/flat-discount`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
    });
    if (!response.ok) throw new Error(`The discount service returned status ${response.status}.`);
    const payload = (await response.json()) as {
      discount?: { name?: unknown; percentage?: unknown; endDate?: unknown } | null;
    };
    const discount = payload?.discount;
    if (!discount) return;
    if (typeof discount.name !== "string" || !Number.isInteger(discount.percentage)) {
      throw new Error("The discount service returned invalid details.");
    }
    const name = banner.querySelector<HTMLElement>("[data-promo-name]");
    const offer = banner.querySelector<HTMLElement>("[data-promo-offer]");
    if (!name || !offer) throw new Error("The discount banner is missing its display fields.");
    const until = typeof discount.endDate === "string" && discount.endDate ? formatEndDate(discount.endDate) : "";
    name.textContent = `${discount.name}: flat ${discount.percentage}% off`;
    offer.textContent = `Applied automatically at checkout${until ? `, until ${until}` : ""}.`;
    banner.hidden = false;
  } catch (error) {
    console.error("Could not display the flat discount.", error);
  }
}

void showFlatDiscount();
