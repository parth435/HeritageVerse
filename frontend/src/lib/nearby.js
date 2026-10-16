const EARTH_MEAN_RADIUS_KM = 6371.0088;

/** @param {{ latitude: unknown; longitude: unknown } | null | undefined} point */
export function isValidGeoPoint(point) {
  if (!point || point.latitude === null || point.latitude === undefined || point.longitude === null || point.longitude === undefined) return false;
  if ((typeof point.latitude === "string" && !point.latitude.trim()) || (typeof point.longitude === "string" && !point.longitude.trim())) return false;
  return Number.isFinite(Number(point.latitude)) && Number(point.latitude) >= -90 && Number(point.latitude) <= 90 && Number.isFinite(Number(point.longitude)) && Number(point.longitude) >= -180 && Number(point.longitude) <= 180;
}

/** @param {{ latitude: unknown; longitude: unknown }} origin @param {{ latitude: unknown; longitude: unknown }} destination */
export function haversineDistanceKm(origin, destination) {
  if (!isValidGeoPoint(origin) || !isValidGeoPoint(destination)) return null;
  const radians = (degrees) => degrees * (Math.PI / 180);
  const latitude1 = radians(Number(origin.latitude));
  const latitude2 = radians(Number(destination.latitude));
  const latitudeDelta = latitude2 - latitude1;
  const longitudeDelta = radians(Number(destination.longitude) - Number(origin.longitude));
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_MEAN_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

/** @param {Array<{ id: number; name: string; latitude: number | string | null; longitude: number | string | null; coordinates_verified?: boolean }>} places @param {{ latitude: number; longitude: number } | null} origin @param {number} radiusKm */
export function findNearbyPlaces(places, origin, radiusKm) {
  if (!isValidGeoPoint(origin) || !Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 100) return [];
  return places.flatMap((place) => {
    if (place.coordinates_verified !== true || !isValidGeoPoint({ latitude: place.latitude, longitude: place.longitude })) return [];
    const distanceKm = haversineDistanceKm(origin, { latitude: place.latitude, longitude: place.longitude });
    return distanceKm !== null && distanceKm <= radiusKm ? [{ place, distanceKm }] : [];
  }).sort((left, right) => left.distanceKm - right.distanceKm || left.place.name.localeCompare(right.place.name));
}

/** @param {number} distanceKm */
export function formatApproxDistance(distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return "Distance unavailable";
  if (distanceKm < 1) return `${Math.round((distanceKm * 1000) / 10) * 10} m`;
  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`;
}
