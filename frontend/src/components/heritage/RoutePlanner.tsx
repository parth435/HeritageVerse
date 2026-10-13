import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Clock3, LocateFixed, MapPin, Navigation, Route, Trash2 } from "lucide-react";
import { ApiRequestError, calculateRoutePreview } from "@/lib/api";
import type { HeritageView } from "@/lib/heritageAdapter";
import type { JourneyRoute } from "@/lib/api";
import { buildGoogleMapsDirectionsUrl, formatRouteDistance, formatRouteDuration, geolocationErrorMessage, parseCoordinateText } from "@/lib/directions.js";
import { HeritageMap } from "@/components/heritage/HeritageMap";

type Coordinates = { latitude: number; longitude: number };
type OriginMode = "current" | "manual";

function validCoordinates(value: Coordinates | null | undefined): value is Coordinates {
  return Boolean(value && Number.isFinite(value.latitude) && value.latitude >= -90 && value.latitude <= 90 && Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180);
}

function getCurrentLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser does not support location access. Enter starting coordinates below instead."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const coordinates = { latitude: coords.latitude, longitude: coords.longitude };
        if (!validCoordinates(coordinates)) {
          reject(new Error("The browser did not return valid coordinates. Enter a starting location manually."));
          return;
        }
        resolve(coordinates);
      },
      (error) => {
        reject(new Error(geolocationErrorMessage(error.code)));
      },
      { enableHighAccuracy: false, maximumAge: 0, timeout: 15_000 },
    );
  });
}

function isRouteResult(value: unknown): value is JourneyRoute {
  if (!value || typeof value !== "object") return false;
  const result = value as JourneyRoute;
  const validSteps = (steps: unknown) => Array.isArray(steps) && steps.every((step) =>
    Boolean(step && typeof step === "object" && typeof step.instruction === "string" && Number.isFinite(step.distance_meters) && step.distance_meters >= 0 && Number.isFinite(step.duration_seconds) && step.duration_seconds >= 0),
  );
  return result.geometry?.type === "LineString" &&
    Array.isArray(result.geometry.coordinates) &&
    result.geometry.coordinates.length > 1 &&
    result.geometry.coordinates.every((point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && point[0] >= -180 && point[0] <= 180 && Number.isFinite(point[1]) && point[1] >= -90 && point[1] <= 90) &&
    Number.isFinite(result.distance_meters) && result.distance_meters >= 0 &&
    Number.isFinite(result.duration_seconds) && result.duration_seconds >= 0 &&
    Array.isArray(result.legs) && result.legs.every((leg) => Boolean(leg && typeof leg === "object" && validSteps(leg.steps)));
}

function routeErrorMessage(error: unknown) {
  if (error instanceof ApiRequestError) {
    if (error.code === "ROUTE_NOT_FOUND") return "The routing provider could not find a drivable route between these points.";
    if (error.code === "ROUTING_PROVIDER_NOT_CONFIGURED") return "Route preview is not configured on this HeritageVerse server yet. You can still open the destination in Google Maps.";
    if (error.code === "ROUTE_RATE_LIMITED") return "Please wait a moment before calculating another route.";
    if (error.code === "ROUTE_PROVIDER_RATE_LIMITED") return "The routing provider is being paced. Please wait a moment and try again.";
    if (error.code === "ROUTE_PROVIDER_UNAVAILABLE" || error.code === "ROUTE_PROVIDER_TIMEOUT") return "The routing service could not be reached. Try again or use Google Maps.";
    return error.message;
  }
  return error instanceof Error ? error.message : "The route could not be calculated. Try again or use Google Maps.";
}

export function RoutePlanner({ destination }: { destination: HeritageView }) {
  const destinationCoordinates = destination.hasCoordinates && destination.coordinateStatus === "verified" && validCoordinates({ latitude: destination.latitude ?? Number.NaN, longitude: destination.longitude ?? Number.NaN })
    ? { latitude: destination.latitude!, longitude: destination.longitude! }
    : null;
  const [originMode, setOriginMode] = useState<OriginMode>("current");
  const [manualOrigin, setManualOrigin] = useState("");
  const [currentOrigin, setCurrentOrigin] = useState<Coordinates | null>(null);
  const [routeOrigin, setRouteOrigin] = useState<Coordinates | null>(null);
  const [routeDestination, setRouteDestination] = useState<Coordinates | null>(null);
  const [route, setRoute] = useState<JourneyRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manualOriginInput = useRef<HTMLInputElement>(null);

  const manualCoordinates = useMemo(() => parseCoordinateText(manualOrigin), [manualOrigin]);
  const mapDestination = useMemo(() => routeDestination
    ? { ...destination, latitude: routeDestination.latitude, longitude: routeDestination.longitude, hasCoordinates: true, coordinateStatus: "verified" as const }
    : destination, [destination, routeDestination]);
  const mapSites = useMemo(() => [mapDestination], [mapDestination]);
  const mapOrigin = useMemo(() => routeOrigin ? { ...routeOrigin, label: "Starting location" } : undefined, [routeOrigin]);
  const handoffOrigin = originMode === "manual" ? manualCoordinates : currentOrigin;
  const mapsDestination = routeDestination ?? destinationCoordinates;
  const mapsUrl = mapsDestination ? buildGoogleMapsDirectionsUrl(mapsDestination, handoffOrigin) : null;

  useEffect(() => {
    if (originMode === "manual" && error) manualOriginInput.current?.focus();
  }, [originMode, error]);

  function clearRoute() {
    setRoute(null);
    setRouteOrigin(null);
    setRouteDestination(null);
    setError(null);
  }

  async function calculateRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRoute(null);
    setRouteOrigin(null);
    setRouteDestination(null);
    setError(null);
    if (!destinationCoordinates || destination.databaseId === undefined) {
      setError("Verified destination coordinates are unavailable, so a route preview cannot be calculated for this site.");
      return;
    }

    setLoading(true);
    try {
      let origin: Coordinates | null;
      if (originMode === "current") {
        try {
          origin = await getCurrentLocation();
        } catch (locationError) {
          // Geolocation permission cannot be changed by the page. Show the
          // existing manual coordinate entry immediately so this failure is
          // recoverable without hunting for another control.
          setCurrentOrigin(null);
          setOriginMode("manual");
          setError(routeErrorMessage(locationError));
          return;
        }
      } else {
        origin = manualCoordinates;
      }
      if (!origin) {
        throw new Error("Enter valid starting coordinates as latitude, longitude. For example: 28.6139, 77.2090.");
      }
      setCurrentOrigin(originMode === "current" ? origin : null);
      const result = await calculateRoutePreview({ origin, heritage_id: destination.databaseId! });
      if (!validCoordinates(result.destination) || !isRouteResult(result.route)) throw new Error("The routing service returned an empty or invalid route. No route was drawn.");
      setRouteOrigin(result.origin);
      setRouteDestination(result.destination);
      setRoute(result.route);
    } catch (reason) {
      setError(routeErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="directions" className="mt-5 rounded-xl border border-white/10 bg-ink/35 p-4" aria-labelledby="directions-heading">
      <div className="flex items-start gap-3">
        <Route className="mt-1 h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
        <div>
          <h3 id="directions-heading" className="font-display text-xl text-parchment">Route preview</h3>
          <p className="mt-1 text-xs leading-5 text-parchment/55">Plan a driving route to {destination.name}. HeritageVerse shows a route preview; live navigation is provided externally by Google Maps.</p>
        </div>
      </div>

      {destinationCoordinates && destination.databaseId !== undefined ? (
        <>
          <form className="mt-4 space-y-3" onSubmit={(event) => void calculateRoute(event)}>
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-[0.12em] text-parchment/70">Starting location</legend>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-parchment/80">
                <input type="radio" name="origin-mode" value="current" checked={originMode === "current"} onChange={() => { setOriginMode("current"); setCurrentOrigin(null); clearRoute(); }} className="accent-[#d6a04e]" />
                Use my current location
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-parchment/80">
                <input type="radio" name="origin-mode" value="manual" checked={originMode === "manual"} onChange={() => { setOriginMode("manual"); clearRoute(); }} className="accent-[#d6a04e]" />
                Enter a starting location
              </label>
            </fieldset>

            {originMode === "manual" ? (
              <label className="block text-xs text-parchment/65">
                Coordinates (latitude, longitude)
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  ref={manualOriginInput}
                  value={manualOrigin}
                  onChange={(event) => { setManualOrigin(event.target.value); clearRoute(); }}
                  placeholder="28.6139, 77.2090"
                  aria-label="Starting coordinates, latitude then longitude"
                  className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-black/25 px-3 text-sm text-parchment placeholder:text-parchment/35 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30"
                />
                <span className="mt-1 block text-[11px] text-parchment/45">Enter coordinates for a starting point. This location is sent to the configured routing provider when you calculate a preview.</span>
              </label>
            ) : (
              <p className="text-[11px] leading-5 text-parchment/45">Your browser asks for location access only after you request a route. The coordinates are sent to the routing provider for that request and are not saved by HeritageVerse.</p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" disabled={loading || !destinationCoordinates || destination.databaseId === undefined} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-gold px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-ink hover:bg-gold-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-wait disabled:opacity-60">
                {originMode === "current" ? <LocateFixed className="h-4 w-4" aria-hidden="true" /> : <Navigation className="h-4 w-4" aria-hidden="true" />}
                {loading ? "Calculating route…" : "Get directions"}
              </button>
              {route ? <button type="button" onClick={clearRoute} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs text-parchment/75 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"><Trash2 className="h-4 w-4" aria-hidden="true" />Clear route</button> : null}
            </div>
          </form>

          {mapsUrl ? <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-gold-bright underline decoration-gold/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"><Navigation className="h-4 w-4" aria-hidden="true" />Open in Google Maps for external navigation</a> : null}
          <p className="mt-2 text-[11px] leading-5 text-parchment/45">Google Maps handles navigation outside HeritageVerse. Live GPS tracking, rerouting, and voice guidance are not provided in this route preview.</p>
        </>
      ) : (
        <p role="status" className="mt-4 rounded-lg border border-gold/20 bg-gold/5 p-3 text-xs leading-5 text-parchment/70">{destinationCoordinates ? "This destination is not linked to a published heritage record, so route preview cannot be calculated." : "Verified destination coordinates are unavailable, so route preview cannot be calculated. No approximate pin or route will be used."}</p>
      )}

      {loading ? <p className="mt-3 text-sm text-parchment/65" role="status">{originMode === "current" ? "Requesting your location and calculating a driving route…" : "Calculating a driving route…"}</p> : null}
      {error ? <p className="mt-3 rounded-lg border border-red-300/20 bg-red-950/25 p-3 text-sm text-parchment/80" role="alert">{error}</p> : null}

      <HeritageMap
        sites={mapSites}
        label={route ? `Driving route to ${destination.name}` : `Map showing ${destination.name}`}
        className="mt-4"
        routeGeometry={route?.geometry.coordinates}
        routeOrigin={mapOrigin}
      />

      {route && routeOrigin ? (
        <div className="mt-4 space-y-4" aria-live="polite">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
              <p className="text-[10px] uppercase tracking-[0.13em] text-parchment/45">From</p>
              <p className="mt-1 break-all text-sm text-parchment">{routeOrigin.latitude.toFixed(5)}, {routeOrigin.longitude.toFixed(5)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
              <p className="text-[10px] uppercase tracking-[0.13em] text-parchment/45">To</p>
              <p className="mt-1 text-sm text-parchment">{destination.name}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-parchment/80">
            <span className="inline-flex items-center gap-2"><Route className="h-4 w-4 text-gold" aria-hidden="true" />{formatRouteDistance(route.distance_meters)}</span>
            <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-gold" aria-hidden="true" />Estimated {formatRouteDuration(route.duration_seconds)} · no live traffic</span>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.13em] text-parchment/70">Turn-by-turn preview</h4>
            {route.legs.flatMap((leg) => leg.steps).length ? (
              <ol className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1 text-sm text-parchment/75">
                {route.legs.flatMap((leg, legIndex) => leg.steps.map((step, stepIndex) => ({ ...step, key: `${legIndex}-${stepIndex}` }))).map((step) => (
                  <li key={step.key} className="flex gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                    <span>{step.instruction}<small className="ml-2 text-xs text-parchment/45">{formatRouteDistance(step.distance_meters)}</small></span>
                  </li>
                ))}
              </ol>
            ) : <p className="mt-2 text-sm text-parchment/55">The routing provider returned no turn-by-turn instructions for this route.</p>}
          </div>
        </div>
      ) : null}
    </section>
  );
}
