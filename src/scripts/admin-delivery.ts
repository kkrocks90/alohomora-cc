export interface DeliverySettings {
  enabled: boolean;
  storeState: string;
  defaultItemWeightGrams: number;
  porter: { radiusKm: number; baseFee: number; includedKm: number; perExtraKm: number };
  courier: {
    slabGrams: number;
    sameState: { firstSlabFee: number; extraSlabFee: number };
    otherState: { firstSlabFee: number; extraSlabFee: number };
  };
}

interface Deps {
  root: HTMLElement;
  post: (path: string, body?: unknown) => Promise<Record<string, unknown>>;
  setStatus: (message: string, error?: boolean) => void;
  reload: () => Promise<void>;
}

export function isDeliverySettings(value: unknown): value is DeliverySettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Record<string, unknown>;
  return (
    typeof settings.enabled === "boolean" &&
    typeof settings.defaultItemWeightGrams === "number" &&
    typeof settings.porter === "object" &&
    settings.porter !== null &&
    typeof settings.courier === "object" &&
    settings.courier !== null
  );
}

function required<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`The admin page is missing ${selector}.`);
  return element;
}

export function initDeliveryAdmin({ root, post, setStatus, reload }: Deps) {
  const form = required<HTMLFormElement>(root, "#admin-delivery-form");
  const testForm = required<HTMLFormElement>(root, "#admin-delivery-test-form");
  const summary = required<HTMLElement>(root, "#admin-delivery-summary");
  const result = required<HTMLElement>(root, "#admin-delivery-result");
  const field = (name: string) => required<HTMLInputElement>(form, `input[name='${name}']`);

  function readForm(): DeliverySettings {
    const num = (name: string) => Number(field(name).value);
    return {
      enabled: field("enabled").checked,
      storeState: field("storeState").value,
      defaultItemWeightGrams: num("defaultItemWeightGrams"),
      porter: {
        radiusKm: num("porterRadiusKm"),
        baseFee: num("porterBaseFee"),
        includedKm: num("porterIncludedKm"),
        perExtraKm: num("porterPerExtraKm"),
      },
      courier: {
        slabGrams: num("slabGrams"),
        sameState: { firstSlabFee: num("sameFirst"), extraSlabFee: num("sameExtra") },
        otherState: { firstSlabFee: num("otherFirst"), extraSlabFee: num("otherExtra") },
      },
    };
  }

  function render(settings: DeliverySettings | null) {
    if (!settings) return;
    field("enabled").checked = settings.enabled;
    field("storeState").value = settings.storeState;
    field("defaultItemWeightGrams").value = String(settings.defaultItemWeightGrams);
    field("porterRadiusKm").value = String(settings.porter.radiusKm);
    field("porterBaseFee").value = String(settings.porter.baseFee);
    field("porterIncludedKm").value = String(settings.porter.includedKm);
    field("porterPerExtraKm").value = String(settings.porter.perExtraKm);
    field("slabGrams").value = String(settings.courier.slabGrams);
    field("sameFirst").value = String(settings.courier.sameState.firstSlabFee);
    field("sameExtra").value = String(settings.courier.sameState.extraSlabFee);
    field("otherFirst").value = String(settings.courier.otherState.firstSlabFee);
    field("otherExtra").value = String(settings.courier.otherState.extraSlabFee);
    summary.dataset.state = settings.enabled ? "on" : "off";
    summary.textContent = settings.enabled
      ? "Delivery charges are ON."
      : "Delivery charges are OFF. Customers are not charged for delivery.";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (submit) submit.disabled = true;
    try {
      await post("/admin/delivery-settings/save", readForm());
      setStatus("Delivery settings saved.");
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The delivery settings could not be saved.", true);
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  testForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(testForm);
    const submit = testForm.querySelector<HTMLButtonElement>("button[type=submit]");
    if (submit) submit.disabled = true;
    result.dataset.state = "off";
    result.textContent = "Calculating…";
    try {
      const response = await post("/admin/delivery-settings/preview", {
        settings: readForm(),
        method: data.get("method"),
        pincode: String(data.get("pincode") ?? "").trim(),
        weightGrams: Number(data.get("weightGrams")),
      });
      const charge = response.charge as { rupees: number; detail: string };
      const place = response.place as { pincode: string; city: string; state: string } | null;
      const where = place
        ? `${place.city}, ${place.state} (${place.pincode}) is about ${response.distanceKm} km away by ${response.distanceSource === "road" ? "road (Google Maps)" : "straight line"}. `
        : "";
      result.dataset.state = "on";
      result.textContent = `${where}Charge: ₹${charge.rupees}. ${charge.detail}`;
    } catch (error) {
      result.dataset.state = "off";
      result.textContent = error instanceof Error ? error.message : "The charge could not be calculated.";
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  const method = required<HTMLSelectElement>(testForm, "select[name='method']");
  const testPincode = required<HTMLInputElement>(testForm, "input[name='pincode']");
  const syncMethod = () => {
    const pickup = method.value === "pickup";
    required<HTMLElement>(testForm, "[data-test-delivery]").hidden = pickup;
    testPincode.required = !pickup;
  };
  method.addEventListener("change", syncMethod);
  syncMethod();

  return { render };
}
