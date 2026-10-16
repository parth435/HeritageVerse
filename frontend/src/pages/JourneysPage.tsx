import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { HeritagePageHeader } from "@/components/heritage/HeritagePageHeader";
import { getHeritage, getJourneyRoute } from "@/lib/api";
import type { Heritage } from "@/types/heritage";
import {
  addJourneyStop,
  createJourney,
  deleteJourney,
  getJourney,
  getJourneys,
  removeJourneyStop,
  updateJourney,
  type Journey,
  type JourneyRoute,
} from "@/lib/api";
import { HeritageMap } from "@/components/heritage/HeritageMap";

type RouteStop = NonNullable<Journey["stops"]>[number];

function stopCoordinates(stop: RouteStop) {
  const latitude = stop.latitude === null ? null : Number(stop.latitude);
  const longitude = stop.longitude === null ? null : Number(stop.longitude);
  const valid = latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  return valid ? { latitude, longitude } : { latitude: null, longitude: null };
}

function stopPlace(stop: RouteStop) {
  const coordinates = stopCoordinates(stop);
  return coordinates.latitude !== null && coordinates.longitude !== null
    ? `${coordinates.latitude},${coordinates.longitude}`
    : [stop.name, stop.locality, stop.district, stop.state].filter(Boolean).join(", ");
}

function externalRouteUrl(stops: RouteStop[]) {
  if (stops.length < 2) return null;
  const params = new URLSearchParams({ api: "1", origin: stopPlace(stops[0]), destination: stopPlace(stops[stops.length - 1]), travelmode: "driving" });
  const waypoints = stops.slice(1, -1).map(stopPlace);
  if (waypoints.length) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function formatRouteDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

export function JourneysPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [selected, setSelected] = useState<Journey | null>(null);
  const [route, setRoute] = useState<JourneyRoute | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [heritageId, setHeritageId] = useState("");
  const [catalog, setCatalog] = useState<Heritage[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogOffset, setCatalogOffset] = useState(0);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [editingJourneyId, setEditingJourneyId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(isAuthenticated);

  const load = useCallback(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    void getJourneys()
      .then(setJourneys)
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "Could not load journeys.");
      })
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCatalogQuery(catalogSearch.trim());
      setCatalogOffset(0);
      setHeritageId("");
    }, 250);
    return () => window.clearTimeout(timer);
  }, [catalogSearch]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const controller = new AbortController();
    const append = catalogOffset > 0;
    setLoadingCatalog(true);
    void getHeritage({ q: catalogQuery, limit: 100, offset: catalogOffset }, { signal: controller.signal })
      .then((response) => {
        setCatalog((current) => append ? [...current, ...response.items] : response.items);
        setCatalogTotal(response.pagination.total);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Could not load heritage places.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCatalog(false);
      });
    return () => controller.abort();
  }, [catalogOffset, catalogQuery, isAuthenticated]);

  function resetJourneyForm() {
    setName("");
    setDescription("");
    setEditingJourneyId(null);
  }

  async function submitJourney(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    if (!trimmedName) {
      setMessage("Journey name is required.");
      return;
    }

    try {
      if (editingJourneyId !== null) {
        await updateJourney(editingJourneyId, trimmedName, trimmedDescription);
        setMessage("Journey updated.");
      } else {
        await createJourney(trimmedName, trimmedDescription);
        setMessage("Journey created.");
      }
      resetJourneyForm();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save journey.");
    }
  }

  async function open(id: number) {
    try {
      setSelected(await getJourney(id));
      setRoute(null);
      setRouteError(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load journey.");
    }
  }

  async function calculateRoute() {
    if (!selected) return;
    setRouteLoading(true);
    setRouteError(null);
    setRoute(null);
    try {
      const response = await getJourneyRoute(selected.id);
      setRoute(response.route);
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : "A calculated route is unavailable.");
    } finally {
      setRouteLoading(false);
    }
  }

  function editJourney(journey: Journey) {
    setEditingJourneyId(journey.id);
    setName(journey.name);
    setDescription(journey.description ?? "");
    setMessage(`Editing “${journey.name}”.`);
  }

  async function remove(id: number) {
    if (!window.confirm("Delete this journey and all its stops?")) return;
    try {
      await deleteJourney(id);
      if (selected?.id === id) setSelected(null);
      resetJourneyForm();
      await load();
      setMessage("Journey deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete journey.");
    }
  }

  async function addStop(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;

    const parsedHeritageId = Number(heritageId);
    if (!Number.isInteger(parsedHeritageId) || parsedHeritageId <= 0) {
      setMessage("Enter a valid heritage ID.");
      return;
    }

    try {
      const nextStopOrder = Math.max(0, ...(selected.stops ?? []).map((stop) => stop.stop_order)) + 1;
      await addJourneyStop(selected.id, parsedHeritageId, nextStopOrder, "");
      setHeritageId("");
      await open(selected.id);
      setMessage("Stop added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add stop.");
    }
  }

  async function removeStop(stopId: number) {
    if (!selected) return;
    if (!window.confirm("Remove this stop from the journey?")) return;

    try {
      await removeJourneyStop(selected.id, stopId);
      await open(selected.id);
      setMessage("Stop removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove stop.");
    }
  }

  const selectedStops = selected?.stops ?? [];
  const routeMapSites = useMemo(() => selectedStops.map((stop) => {
    const coordinates = stopCoordinates(stop);
    return {
      routeId: String(stop.heritage_id),
      name: stop.name,
      description: "",
      location: [stop.locality, stop.district, stop.state].filter(Boolean).join(", ") || "Location not recorded",
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      hasCoordinates: coordinates.latitude !== null && coordinates.longitude !== null,
      gallery: [],
    };
  }), [selectedStops]);
  const externalDirections = externalRouteUrl(selectedStops);

  return (
    <div className="min-h-svh bg-ink text-parchment">
      <HeritagePageHeader />
      <main className="mx-auto max-w-5xl px-5 py-12 md:px-10">
        <p className="text-xs uppercase tracking-[.3em] text-gold">Your travels</p>
        <h1 className="font-display mt-3 text-5xl">Journeys</h1>

        {!isAuthenticated ? (
          <p className="mt-8 text-parchment/65">Sign in to create and manage journeys.</p>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <section>
              <form onSubmit={submitJourney} className="space-y-3 rounded-2xl border border-white/10 bg-white/[.035] p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-2xl text-gold">
                    {editingJourneyId !== null ? "Edit journey" : "Create journey"}
                  </h2>
                  {editingJourneyId !== null ? (
                    <button type="button" onClick={resetJourneyForm} className="text-xs uppercase tracking-[0.18em] text-parchment/60">
                      Cancel
                    </button>
                  ) : null}
                </div>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={120}
                  placeholder="Journey name"
                  className="w-full rounded bg-ink p-3 text-parchment outline-none ring-0 placeholder:text-parchment/40"
                />
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Description"
                  className="min-h-28 w-full rounded bg-ink p-3 text-parchment outline-none ring-0 placeholder:text-parchment/40"
                />
                <button className="rounded-full border border-gold/40 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gold">
                  {editingJourneyId !== null ? "Save changes" : "Create journey"}
                </button>
              </form>

              <div className="mt-5 space-y-3">
                {loading ? (
                  <p className="text-parchment/60">Loading…</p>
                ) : journeys.length === 0 ? (
                  <p className="rounded-xl border border-white/10 bg-white/[.02] p-4 text-sm text-parchment/60">
                    Your story map is empty. Create the first journey to start planning a route.
                  </p>
                ) : (
                  journeys.map((journey) => (
                    <article key={journey.id} className="rounded-xl border border-white/10 bg-white/[.02] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <button onClick={() => open(journey.id)} className="text-left">
                          <span className="font-display text-xl text-gold">{journey.name}</span>
                        </button>
                        <div className="flex gap-2 text-xs uppercase tracking-[0.14em] text-parchment/60">
                          <button type="button" onClick={() => editJourney(journey)} className="hover:text-gold">
                            Edit
                          </button>
                          <button type="button" onClick={() => remove(journey.id)} className="text-red-300 hover:text-red-200">
                            Delete
                          </button>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-parchment/60">{journey.description || "No description yet."}</p>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[.025] p-5">
              {selected ? (
                <>
                  <h2 className="font-display text-3xl">{selected.name}</h2>
                  <p className="mt-2 text-parchment/60">{selected.description || "No description yet."}</p>

                  <ol className="mt-5 space-y-2">
                    {selected.stops?.length ? (
                      selected.stops.map((stop) => (
                        <li key={stop.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-ink/50 p-3">
                          <span>
                            {stop.stop_order}. {stop.name}
                            {stop.notes ? <span className="mt-1 block text-xs text-parchment/45">{stop.notes}</span> : null}
                            <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.latitude != null && stop.longitude != null ? `${stop.latitude},${stop.longitude}` : [stop.name, stop.district, stop.state].filter(Boolean).join(", "))}`} target="_blank" rel="noopener noreferrer" className="mt-1 block text-xs text-gold-bright underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Open directions</a>
                          </span>
                          <button type="button" onClick={() => removeStop(stop.id)} className="text-xs text-red-300 hover:text-red-200">
                            Remove
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="rounded-lg border border-dashed border-white/15 p-3 text-sm text-parchment/60">
                        No heritage stops added yet.
                      </li>
                    )}
                  </ol>

                  <form onSubmit={addStop} className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <div className="min-w-0 flex-1 space-y-2">
                      <label className="block">
                        <span className="sr-only">Search all published heritage places</span>
                        <input type="search" value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Search the full heritage catalogue" className="h-11 w-full rounded bg-white/5 px-3 text-sm text-parchment placeholder:text-parchment/40 focus:outline-none focus:ring-2 focus:ring-gold" />
                      </label>
                      <label className="block">
                      <span className="sr-only">Choose a published heritage stop</span>
                      <select value={heritageId} onChange={(event) => setHeritageId(event.target.value)} required disabled={loadingCatalog || catalog.length === 0} className="h-11 w-full rounded bg-white/5 px-3 text-sm text-parchment focus:outline-none focus:ring-2 focus:ring-gold">
                        <option value="">{loadingCatalog ? "Loading sites…" : "Choose a heritage site"}</option>
                        {catalog.map((site) => <option key={site.id} value={site.id}>{site.name} · {[site.locality, site.district, site.state].filter(Boolean).join(", ")}</option>)}
                      </select>
                      </label>
                      {catalog.length < catalogTotal ? <button type="button" disabled={loadingCatalog} onClick={() => setCatalogOffset((current) => current + 100)} className="text-xs text-gold-bright underline disabled:opacity-50">Load more matches ({catalog.length} of {catalogTotal})</button> : null}
                    </div>
                    <button type="submit" disabled={!heritageId || loadingCatalog} className="rounded border border-gold/40 px-3 py-2 text-xs uppercase tracking-[0.14em] text-gold disabled:opacity-50">
                      Add stop
                    </button>
                  </form>
                  {selectedStops.length >= 2 ? (
                    <section className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-white/[.02] p-4" aria-label="Journey route">
                      <div className="flex flex-wrap items-center gap-3">
                        <button type="button" onClick={calculateRoute} disabled={routeLoading} className="rounded-full border border-gold/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-gold disabled:opacity-50">{routeLoading ? "Calculating…" : "Calculate driving route"}</button>
                        {externalDirections ? <a href={externalDirections} target="_blank" rel="noopener noreferrer" className="text-xs text-gold-bright underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Open multi-stop directions in Google Maps</a> : null}
                      </div>
                      {routeError ? <p role="alert" className="text-sm text-parchment/70">{routeError} You can use the external directions link while verified coordinates or the backend route provider are unavailable.</p> : null}
                      {route ? (
                        <div aria-live="polite">
                          <p className="text-sm text-parchment">{(route.distance_meters / 1000).toFixed(1)} km · about {formatRouteDuration(route.duration_seconds)} by {route.mode}</p>
                          <p className="mt-1 text-xs text-parchment/50">Estimated by {route.provider} in your saved stop order. Live traffic is not included.</p>
                          <HeritageMap sites={routeMapSites} routeGeometry={route.geometry.coordinates} label="Calculated journey route map" />
                          <ol className="mt-3 max-h-48 space-y-2 overflow-y-auto text-xs text-parchment/70">
                            {route.legs.flatMap((leg, legIndex) => leg.steps.map((step, stepIndex) => <li key={`${legIndex}-${stepIndex}`} className="flex justify-between gap-3"><span>{step.instruction}</span><span className="shrink-0 text-parchment/45">{step.distance_meters >= 1000 ? `${(step.distance_meters / 1000).toFixed(1)} km` : `${Math.round(step.distance_meters)} m`}</span></li>))}
                          </ol>
                        </div>
                      ) : <HeritageMap sites={routeMapSites} label="Journey stop map" />}
                    </section>
                  ) : null}
                </>
              ) : (
                <p className="text-parchment/60">Select a journey to view its stops.</p>
              )}
            </section>
          </div>
        )}

        {message ? (
          <p role="status" className="mt-5 text-sm text-gold">
            {message}
          </p>
        ) : null}
      </main>
    </div>
  );
}
