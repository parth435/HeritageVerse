import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LocateFixed, Map, MapPin, Search, List, LoaderCircle } from "lucide-react";
import { HeritageCard } from "@/components/heritage/HeritageCard";
import { HeritageMap } from "@/components/heritage/HeritageMap";
import { HeritagePageHeader } from "@/components/heritage/HeritagePageHeader";
import { getHeritage, searchLocation, type LocationSearchResult } from "@/lib/api";
import { geolocationErrorMessage, parseCoordinateText } from "@/lib/directions.js";
import { findNearbyPlaces, formatApproxDistance, isValidGeoPoint } from "@/lib/nearby.js";
import { heritageToView } from "@/lib/heritageAdapter";
import type { Heritage } from "@/types/heritage";

type LocationOrigin = { latitude: number; longitude: number; label: string; source: "gps" | "search" | "coordinates" };
type ViewMode = "list" | "map";
const RADIUS_OPTIONS = [5, 10, 25, 50, 100];

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "The selected heritage collection could not load. Please try again.";
}

async function loadSelectedCatalogue(signal: AbortSignal) {
  const records: Heritage[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (offset < total) {
    const response = await getHeritage({ limit: 100, offset }, { signal, authenticated: false });
    total = response.pagination.total;
    if (response.items.length === 0) break;
    records.push(...response.items);
    offset = response.pagination.offset + response.items.length;
  }
  return records;
}

export function NearbyPage() {
  const [places, setPlaces] = useState<Heritage[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [origin, setOrigin] = useState<LocationOrigin | null>(null);
  const [radiusKm, setRadiusKm] = useState(25);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [searchAttribution, setSearchAttribution] = useState<string | null>(null);
  const [coordinateText, setCoordinateText] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedRouteId, setSelectedRouteId] = useState<string | undefined>();

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setCatalogueError(null);
    void loadSelectedCatalogue(controller.signal)
      .then((records) => { if (active) setPlaces(records); })
      .catch((error: unknown) => { if (active) setCatalogueError(errorText(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [retryKey]);

  const results = useMemo(
    () => findNearbyPlaces(places, origin, radiusKm),
    [places, origin, radiusKm],
  );
  const mappedResults = useMemo(() => results.map(({ place, distanceKm }) => ({
    ...heritageToView(place),
    distanceKm,
  })), [results]);

  function findNearMe() {
    setLocationMessage(null);
    setSearchResults([]);
    setOrigin(null);
    setSelectedRouteId(undefined);
    if (!navigator.geolocation) {
      setLocationMessage("This browser does not provide location access. Search for a place or enter coordinates manually.");
      return;
    }
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setOrigin({ latitude: coords.latitude, longitude: coords.longitude, label: "Your current location", source: "gps" });
        setSelectedRouteId(undefined);
        setLocationBusy(false);
      },
      (error) => {
        setLocationMessage(geolocationErrorMessage(error.code));
        setLocationBusy(false);
      },
      { enableHighAccuracy: false, maximumAge: 120_000, timeout: 12_000 },
    );
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setLocationMessage("Enter at least two characters to search for a location.");
      return;
    }
    setLocationBusy(false);
    setSearchBusy(true);
    setLocationMessage(null);
    setSearchResults([]);
    try {
      const response = await searchLocation(trimmed);
      setSearchResults(response.results);
      setSearchAttribution(response.attribution);
      if (!response.results.length) setLocationMessage("No matching locations were found. Try a nearby town or coordinates.");
    } catch (error) {
      setLocationMessage(errorText(error));
    } finally {
      setSearchBusy(false);
    }
  }

  function chooseSearchResult(result: LocationSearchResult) {
    if (!isValidGeoPoint(result)) return;
    setOrigin({ latitude: result.latitude, longitude: result.longitude, label: result.label, source: "search" });
    setSelectedRouteId(undefined);
    setSearchResults([]);
    setLocationMessage(null);
  }

  function submitCoordinates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const point = parseCoordinateText(coordinateText);
    if (!point) {
      setLocationMessage("Enter valid latitude and longitude in this format: 18.5204, 73.8567.");
      return;
    }
    setOrigin({ ...point, label: "Entered coordinates", source: "coordinates" });
    setSelectedRouteId(undefined);
    setLocationMessage(null);
  }

  function selectPlace(routeId: string) {
    setSelectedRouteId(routeId);
    document.getElementById(`nearby-place-${routeId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="min-h-svh bg-ink text-parchment">
      <HeritagePageHeader />
      <main className="mx-auto max-w-7xl px-5 pb-20 pt-10 sm:px-7 md:px-10 md:pt-14">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-gold"><MapPin className="h-4 w-4" aria-hidden="true" /> Explore by distance</p>
          <h1 className="font-display mt-3 text-4xl leading-tight text-parchment sm:text-5xl md:text-6xl">Nearby heritage places</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-parchment/65 sm:text-base">
            Find places near you or another location. We compare your chosen starting point with the catalogue’s source verified coordinates; distances are approximate straight-line distances.
          </p>
        </div>

        <section className="mt-7 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-6" aria-labelledby="nearby-location-heading">
          <h2 id="nearby-location-heading" className="font-display text-2xl sm:text-3xl">Choose a starting location</h2>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-parchment/55">Location is optional. Precise GPS coordinates stay in this browser and are not sent to HeritageVerse. A manual place name is sent to the server’s location search provider only when you submit the form. Choosing Map sends map tile requests for the displayed area; opening directions sends the selected start and destination to Google Maps. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="text-gold-bright underline underline-offset-2">OpenStreetMap attribution</a> applies to search results.</p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={findNearMe} disabled={locationBusy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-gold px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink hover:bg-gold-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-wait disabled:opacity-60">
              {locationBusy ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <LocateFixed className="h-4 w-4" aria-hidden="true" />}
              {locationBusy ? "Finding location" : "Find near me"}
            </button>
            <label className="flex min-h-11 items-center gap-2 text-xs text-parchment/65">Search radius
              <select value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))} className="min-h-11 rounded-xl border border-white/15 bg-ink px-3 text-sm text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold" aria-label="Search radius">
                {RADIUS_OPTIONS.map((radius) => <option key={radius} value={radius}>{radius} km</option>)}
              </select>
            </label>
          </div>

          <form onSubmit={submitSearch} className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label htmlFor="nearby-location-query" className="sr-only">Search for a town, city, or address</label>
            <input id="nearby-location-query" value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} maxLength={120} autoComplete="street-address" placeholder="Search for a town, city, or address" className="min-h-11 min-w-0 rounded-xl border border-white/15 bg-ink px-4 py-3 text-sm text-parchment placeholder:text-parchment/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold" />
            <button type="submit" disabled={searchBusy || query.trim().length < 2} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gold/40 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gold-bright hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-50">
              {searchBusy ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
              {searchBusy ? "Searching" : "Search location"}
            </button>
          </form>

          {searchResults.length ? <ul className="mt-3 grid gap-2" aria-label="Location search results">{searchResults.map((result, index) => <li key={`${result.osm_type}-${result.osm_id}-${index}`}><button type="button" onClick={() => chooseSearchResult(result)} className="min-h-11 w-full rounded-xl border border-white/10 px-4 py-3 text-left text-sm text-parchment/80 hover:border-gold/40 hover:bg-gold/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">{result.label}</button></li>)}</ul> : null}
          {searchAttribution && (searchResults.length > 0 || origin?.source === "search") ? <p className="mt-2 text-[11px] text-parchment/50">{searchAttribution}</p> : null}

          <form onSubmit={submitCoordinates} className="mt-5 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label htmlFor="nearby-manual-coordinates" className="text-xs text-parchment/65">Or enter coordinates manually
              <input id="nearby-manual-coordinates" value={coordinateText} onChange={(event) => setCoordinateText(event.target.value)} inputMode="decimal" placeholder="Latitude, longitude (e.g. 18.5204, 73.8567)" className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-ink px-4 py-3 text-sm text-parchment placeholder:text-parchment/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold" />
            </label>
            <button type="submit" className="min-h-11 rounded-xl border border-white/15 px-4 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-parchment/80 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Use coordinates</button>
          </form>
          {origin ? <p className="mt-4 rounded-xl border border-gold/20 bg-gold/[0.06] px-4 py-3 text-sm text-parchment/80" role="status">Starting point: <span className="font-medium">{origin.label}</span> <button type="button" onClick={() => { setOrigin(null); setSelectedRouteId(undefined); }} className="ml-2 text-xs text-gold-bright underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Clear</button></p> : null}
          {locationMessage ? <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-950/20 px-4 py-3 text-sm leading-6 text-amber-100" role="status">{locationMessage}</p> : null}
        </section>

        <section className="mt-8" aria-labelledby="nearby-results-heading">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-gold">Source verified coordinates only</p>
              <h2 id="nearby-results-heading" className="font-display mt-1 text-3xl text-parchment sm:text-4xl">{origin ? `Within ${radiusKm} km` : "Nearby results"}</h2>
              {origin ? <p className="mt-1 text-sm text-parchment/55">{loading ? "Checking the published catalogue…" : `${results.length} ${results.length === 1 ? "place" : "places"} sorted by approximate straight-line distance.`}</p> : <p className="mt-1 text-sm text-parchment/55">Choose a location above to see distance sorted results.</p>}
            </div>
            {origin ? <div className="inline-flex rounded-xl border border-white/10 p-1" role="group" aria-label="Nearby results view">
              <button type="button" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${viewMode === "list" ? "bg-gold text-ink" : "text-parchment/70 hover:bg-white/5"}`}><List className="h-4 w-4" aria-hidden="true" />List</button>
              <button type="button" aria-pressed={viewMode === "map"} onClick={() => setViewMode("map")} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${viewMode === "map" ? "bg-gold text-ink" : "text-parchment/70 hover:bg-white/5"}`}><Map className="h-4 w-4" aria-hidden="true" />Map</button>
            </div> : null}
          </div>

          {loading ? <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-8 text-center text-sm text-parchment/60" role="status" aria-busy="true">Loading published heritage places…</div> : catalogueError ? <div className="mt-5 rounded-2xl border border-red-200/20 bg-red-950/20 p-6 text-sm text-parchment/75" role="alert"><p>{catalogueError}</p><button type="button" onClick={() => setRetryKey((value) => value + 1)} className="mt-4 rounded-full border border-gold/40 px-4 py-2 text-xs text-gold-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Try again</button></div> : !origin ? <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-8 text-center text-sm leading-6 text-parchment/60">Your location is not requested automatically. Use <span className="text-parchment/85">Find near me</span>, search for a place, or enter coordinates to get started.</div> : results.length === 0 ? <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-8 text-center" role="status"><h3 className="font-display text-2xl text-parchment">No places within {radiusKm} km</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-parchment/60">Try expanding the search radius or choosing another starting location. Places without source verified coordinates are excluded from distance results.</p><button type="button" onClick={() => setRadiusKm((current) => RADIUS_OPTIONS.find((radius) => radius > current) ?? current)} disabled={radiusKm === 100} className="mt-4 rounded-full border border-gold/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-gold-bright hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-50">{radiusKm === 100 ? "Maximum radius selected" : "Expand radius"}</button></div> : viewMode === "map" ? <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(260px,0.8fr)]">
            <HeritageMap sites={mappedResults} mapSites={mappedResults} label="Nearby heritage places map" selectedRouteId={selectedRouteId} onSiteSelect={selectPlace} routeOrigin={origin} />
            <ol className="max-h-[32rem] space-y-2 overflow-y-auto pr-1" aria-label="Nearby places sorted by distance">{results.map(({ place, distanceKm }) => {
              const view = heritageToView(place);
              return <li id={`nearby-place-${view.routeId}`} key={view.routeId}><button type="button" aria-current={selectedRouteId === view.routeId ? "true" : undefined} onClick={() => setSelectedRouteId(view.routeId)} className={`w-full rounded-xl border px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${selectedRouteId === view.routeId ? "border-gold/60 bg-gold/[0.08]" : "border-white/10 bg-white/[0.025] hover:border-gold/30"}`}><span className="block font-medium text-parchment">{place.name}</span>{place.category?.name ? <span className="mt-1 block text-[11px] uppercase tracking-wide text-parchment/55">{place.category.name}</span> : null}<span className="mt-1 block text-xs text-gold-bright">Approx. {formatApproxDistance(distanceKm)} straight-line</span><span className="mt-1 block text-xs text-parchment/50">{[place.locality, place.district, place.state].filter(Boolean).join(", ")}</span></button></li>;
            })}</ol>
          </div> : <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite">{results.map(({ place, distanceKm }, index) => <HeritageCard key={place.id} item={heritageToView(place)} index={index} distanceKm={distanceKm} directionsOrigin={origin} />)}</div>}
        </section>
      </main>
    </div>
  );
}
