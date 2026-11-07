const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;
const LOOKUP_TIMEOUT_MS = 6000;
const CACHE_SECONDS = 60 * 60 * 24 * 30;
const USER_AGENT = "ChocolateCircle/1.0 (alohomora.chocolatecircle@gmail.com)";

export class PincodeLookupError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function isValidPincode(value) {
  return typeof value === "string" && PINCODE_PATTERN.test(value.trim());
}

async function fetchJson(url, headers) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`PIN lookup provider returned status ${response.status}`);
  return response.json();
}

async function fetchPlace(pincode) {
  const payload = await fetchJson(`https://api.postalpincode.in/pincode/${pincode}`);
  const entry = Array.isArray(payload) ? payload[0] : null;
  const office = entry?.Status === "Success" && Array.isArray(entry.PostOffice) ? entry.PostOffice[0] : null;
  if (!office) return null;
  const city = String(office.District ?? office.Block ?? "").trim().slice(0, 40);
  const state = String(office.State ?? "").trim().slice(0, 40);
  return city && state ? { city, state } : null;
}

async function fetchCoordinates(pincode) {
  const params = new URLSearchParams({ postalcode: pincode, countrycodes: "in", format: "json", limit: "1" });
  const payload = await fetchJson(`https://nominatim.openstreetmap.org/search?${params}`, {
    "User-Agent": USER_AGENT,
  });
  const match = Array.isArray(payload) ? payload[0] : null;
  const latitude = Number(match?.lat);
  const longitude = Number(match?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

async function fetchGoogleLocation(pincode, apiKey) {
  const params = new URLSearchParams({ components: `postal_code:${pincode}|country:IN`, key: apiKey });
  const payload = await fetchJson(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
  const match = payload?.status === "OK" && Array.isArray(payload.results) ? payload.results[0] : null;
  const latitude = Number(match?.geometry?.location?.lat);
  const longitude = Number(match?.geometry?.location?.lng);
  if (!match || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const part = (type) => match.address_components?.find((component) => component.types?.includes(type))?.long_name ?? "";
  const city = (part("locality") || part("administrative_area_level_2") || part("sublocality")).slice(0, 40);
  const state = part("administrative_area_level_1").slice(0, 40);
  return city && state ? { city, state, latitude, longitude } : null;
}

export async function lookupPincode(pincodeInput, env = {}) {
  if (!isValidPincode(pincodeInput)) throw new PincodeLookupError("Enter a valid 6-digit PIN code.");
  const pincode = pincodeInput.trim();
  const googleKey = typeof env?.GOOGLE_MAPS_API_KEY === "string" ? env.GOOGLE_MAPS_API_KEY.trim() : "";

  const cache = globalThis.caches?.default;
  const cacheKey = new Request(`https://pincode-cache.invalid/${googleKey ? "g/" : ""}${pincode}`);
  const cached = cache ? await cache.match(cacheKey) : null;
  if (cached) return cached.json();

  let place = null;
  let location = null;
  if (googleKey) {
    try {
      const google = await fetchGoogleLocation(pincode, googleKey);
      if (google) {
        place = { city: google.city, state: google.state };
        location = { latitude: google.latitude, longitude: google.longitude };
      }
    } catch (error) {
      console.error("Google PIN code lookup failed; using the free lookup.", error);
    }
  }
  if (!place || !location) {
    try {
      [place, location] = await Promise.all([fetchPlace(pincode), fetchCoordinates(pincode)]);
    } catch (error) {
      console.error("PIN code lookup failed.", error);
      throw new PincodeLookupError("We couldn’t check that PIN code right now. Please try again shortly.", 503);
    }
  }
  if (!place || !location) throw new PincodeLookupError("We couldn’t find that PIN code. Check it and try again.");

  const result = { pincode, city: place.city, state: place.state, ...location };
  if (cache) {
    await cache.put(
      cacheKey,
      new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
      }),
    );
  }
  return result;
}
