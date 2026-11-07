export const PORTER_RADIUS_KM = 30;

const EARTH_RADIUS_KM = 6371.0088;

function parseCoordinate(value, minimum, maximum) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : null;
}

export function getStoreLocation(env) {
  const latitude = parseCoordinate(env.STORE_LATITUDE, -90, 90);
  const longitude = parseCoordinate(env.STORE_LONGITUDE, -180, 180);
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}

export function isValidDeliveryLocation(location) {
  return Boolean(
    location &&
      typeof location === "object" &&
      Number.isFinite(location.latitude) &&
      location.latitude >= -90 &&
      location.latitude <= 90 &&
      Number.isFinite(location.longitude) &&
      location.longitude >= -180 &&
      location.longitude <= 180,
  );
}

export function getDistanceKm(first, second) {
  const radians = (degrees) => degrees * (Math.PI / 180);
  const latitudeDifference = radians(second.latitude - first.latitude);
  const longitudeDifference = radians(second.longitude - first.longitude);
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitudeDifference / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

// Driving distance from Google Distance Matrix, or null when no key is set or the call fails.
export async function getRoadDistanceKm(env, from, to) {
  const apiKey = typeof env?.GOOGLE_MAPS_API_KEY === "string" ? env.GOOGLE_MAPS_API_KEY.trim() : "";
  if (!apiKey) return null;
  try {
    const params = new URLSearchParams({
      origins: `${from.latitude},${from.longitude}`,
      destinations: `${to.latitude},${to.longitude}`,
      mode: "driving",
      units: "metric",
      key: apiKey,
    });
    const response = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const element = payload?.status === "OK" ? payload.rows?.[0]?.elements?.[0] : null;
    const meters = Number(element?.status === "OK" ? element.distance?.value : NaN);
    return Number.isFinite(meters) && meters >= 0 ? meters / 1000 : null;
  } catch (error) {
    console.error("Google road distance failed.", error);
    return null;
  }
}

export function getFulfillmentMethod(distanceKm) {
  return distanceKm <= PORTER_RADIUS_KM
    ? "Porter (manual booking)"
    : "Courier (manual booking)";
}
