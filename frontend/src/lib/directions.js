function validCoordinates(value) {
  return Boolean(value && Number.isFinite(value.latitude) && value.latitude >= -90 && value.latitude <= 90 && Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180);
}

/** @param {string} value */
export function parseCoordinateText(value) {
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length !== 2 || parts.some((part) => !part)) return null;
  const [latitude, longitude] = parts.map(Number);
  const coordinates = { latitude, longitude };
  return validCoordinates(coordinates) ? coordinates : null;
}

/** @param {number} code */
export function geolocationErrorMessage(code) {
  if (code === 1) return "Location permission was denied. Allow location access or enter a starting location manually.";
  if (code === 2) return "Your location is unavailable right now. Try again or enter a starting location manually.";
  if (code === 3) return "The location request timed out. Try again or enter a starting location manually.";
  return "Your location could not be determined. Enter a starting location manually.";
}

/** @param {number} meters */
export function formatRouteDistance(meters) {
  if (meters < 1_000) return `${Math.round(meters / 10) * 10} m`;
  const kilometers = meters / 1_000;
  return `${kilometers.toFixed(kilometers < 10 ? 2 : 1)} km`;
}

/** @param {number} seconds */
export function formatRouteDuration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}

/** @param {{ latitude: number; longitude: number }} destination @param {{ latitude: number; longitude: number } | null} [origin] */
export function buildGoogleMapsDirectionsUrl(destination, origin = null) {
  if (!validCoordinates(destination)) throw new TypeError("A valid destination coordinate pair is required.");
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  if (validCoordinates(origin)) url.searchParams.set("origin", `${origin.latitude},${origin.longitude}`);
  url.searchParams.set("destination", `${destination.latitude},${destination.longitude}`);
  url.searchParams.set("travelmode", "driving");
  url.searchParams.set("dir_action", "navigate");
  return url.href;
}
