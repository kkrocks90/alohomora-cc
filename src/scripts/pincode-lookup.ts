interface PincodeLookupOptions {
  apiUrl: string;
  city: HTMLInputElement;
  state: HTMLInputElement;
  pincode: HTMLInputElement;
  status: HTMLElement;
}

const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;

export function initializePincodeLookup(options: PincodeLookupOptions) {
  let latestRequest = 0;

  function show(message: string, error = false) {
    options.status.textContent = message;
    options.status.dataset.state = error ? "error" : "success";
  }

  async function lookup() {
    const pincode = options.pincode.value.trim();
    const request = ++latestRequest;
    if (!PINCODE_PATTERN.test(pincode)) {
      show("");
      return;
    }
    if (!options.apiUrl) return;
    show("Checking your PIN code…");
    try {
      const response = await fetch(`${options.apiUrl}/pincode/${pincode}`);
      const payload = (await response.json()) as { city?: unknown; state?: unknown; error?: unknown };
      if (request !== latestRequest) return;
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "PIN code lookup failed.");
      if (typeof payload.city !== "string" || typeof payload.state !== "string") {
        throw new Error("PIN code lookup returned unexpected details.");
      }
      options.city.value = payload.city;
      options.state.value = payload.state;
      show(`Delivering to ${payload.city}, ${payload.state}.`);
    } catch (error) {
      if (request !== latestRequest) return;
      show(error instanceof Error ? error.message : "We couldn’t check that PIN code.", true);
    }
  }

  options.pincode.addEventListener("input", () => void lookup());
  if (PINCODE_PATTERN.test(options.pincode.value.trim()) && !options.city.value.trim()) void lookup();
}
