"use strict";

class RoutingError extends Error {
  constructor(code, status, message) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function routeInstructions(step) {
  const maneuver = step?.maneuver ?? {};
  const action = [maneuver.type, maneuver.modifier].filter(Boolean).join(" ");
  const road = step?.name || step?.ref;
  if (!action && !road) return null;
  if (!road) return action;
  return action ? `${action} onto ${road}` : road;
}

async function calculateDrivingRoute(coordinates, options = {}) {
  const baseUrl = options.baseUrl ?? process.env.ROUTING_BASE_URL?.trim();
  if (!baseUrl) return { configured: false };

  let parsedBase;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    throw new RoutingError("ROUTING_CONFIGURATION_INVALID", 503, "The routing provider URL is invalid.");
  }
  if (!(["https:", "http:"].includes(parsedBase.protocol))) {
    throw new RoutingError("ROUTING_CONFIGURATION_INVALID", 503, "The routing provider must use HTTP or HTTPS.");
  }
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(parsedBase.hostname);
  if (parsedBase.protocol === "http:" && !localHost) {
    throw new RoutingError("ROUTING_CONFIGURATION_INVALID", 503, "Use HTTPS for remote routing providers; HTTP is allowed only for a local development service.");
  }
  if (parsedBase.username || parsedBase.password || parsedBase.pathname !== "/" || parsedBase.search || parsedBase.hash) {
    throw new RoutingError("ROUTING_CONFIGURATION_INVALID", 503, "Set ROUTING_BASE_URL to a provider origin without a path, credentials, query, or fragment.");
  }

  const points = coordinates.map((point) => `${point.longitude},${point.latitude}`).join(";");
  const endpoint = `${parsedBase.toString().replace(/\/+$/, "")}/route/v1/driving/${points}`;
  const url = new URL(endpoint);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "true");

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(12_000) });
  } catch (error) {
    const code = error?.name === "TimeoutError" || error?.name === "AbortError" ? "ROUTE_PROVIDER_TIMEOUT" : "ROUTE_PROVIDER_UNAVAILABLE";
    throw new RoutingError(code, 502, "The route provider could not be reached. Try again or use the external directions link.");
  }
  if (!response.ok) throw new RoutingError("ROUTE_PROVIDER_UNAVAILABLE", 502, "The route provider returned an error.");

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new RoutingError("ROUTE_PROVIDER_INVALID_RESPONSE", 502, "The route provider returned unreadable route data.");
  }
  const route = payload?.routes?.[0];
  const geometry = route?.geometry;
  const legs = route?.legs;
  const validGeometry = geometry?.type === "LineString" && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 1 && geometry.coordinates.every((point) =>
    Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && point[0] >= -180 && point[0] <= 180 && Number.isFinite(point[1]) && point[1] >= -90 && point[1] <= 90,
  );
  const validLegs = Array.isArray(legs) && legs.length === coordinates.length - 1 && legs.every((leg) =>
    Number.isFinite(leg?.distance) && leg.distance >= 0 && Number.isFinite(leg?.duration) && leg.duration >= 0 && Array.isArray(leg.steps) &&
    leg.steps.every((step) => Number.isFinite(step?.distance) && step.distance >= 0 && Number.isFinite(step?.duration) && step.duration >= 0),
  );
  if (payload?.code !== "Ok" || !route) {
    throw new RoutingError("ROUTE_NOT_FOUND", 422, "The provider could not calculate a route for these stops.");
  }
  if (!validGeometry || !Number.isFinite(route.distance) || route.distance < 0 || !Number.isFinite(route.duration) || route.duration < 0 || !validLegs) {
    throw new RoutingError("ROUTE_PROVIDER_INVALID_RESPONSE", 502, "The route provider returned incomplete or invalid route data.");
  }

  return {
    configured: true,
    route: {
      provider: "OSRM",
      mode: "driving",
      distance_meters: route.distance,
      duration_seconds: route.duration,
      duration_kind: "estimated",
      live_traffic: false,
      geometry,
      legs: legs.map((leg) => ({
        distance_meters: leg.distance,
        duration_seconds: leg.duration,
        steps: (Array.isArray(leg.steps) ? leg.steps : []).map((step) => ({
          instruction: routeInstructions(step),
          distance_meters: step.distance,
          duration_seconds: step.duration,
        })).filter((step) => step.instruction),
      })),
    },
  };
}

module.exports = { RoutingError, calculateDrivingRoute };
