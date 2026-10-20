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

export function getFulfillmentMethod(distanceKm) {
  return distanceKm <= PORTER_RADIUS_KM
    ? "Porter (manual booking)"
    : "Courier (manual booking)";
}
