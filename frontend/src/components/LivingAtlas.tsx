import { useCallback, useEffect, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { getCategories, getHeritage, getHeritageFacets, getHeritageMapSites } from "@/lib/api";
import type { HeritageCategory } from "@/types/heritage";
import { heritageMapToView, heritageToView } from "@/lib/heritageAdapter";
import type { HeritageMapView, HeritageView } from "@/lib/heritageAdapter";
import { HeritageMap } from "@/components/heritage/HeritageMap";
import { RouterLink } from "@/lib/router";
import { getHeritageImageFallback, getHeritageImageSource, isHeritageImageFallback } from "@/lib/image-assets.js";

const PAGE_SIZE = 100;

export function LivingAtlas() {
  const [sites, setSites] = useState<HeritageView[]>([]);
  const [mapSites, setMapSites] = useState<HeritageMapView[]>([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapRetryKey, setMapRetryKey] = useState(0);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<HeritageCategory[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [state, setState] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setOffset(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void Promise.all([
      getCategories({ signal: controller.signal }),
      getHeritageFacets(undefined, { signal: controller.signal }),
    ])
      .then(([categoryOptions, facets]) => {
        if (!active) return;
        setCategories(categoryOptions);
        setStates(facets.states);
        setFiltersError(null);
      })
      .catch((reason: unknown) => {
        if (active) setFiltersError(reason instanceof Error ? reason.message : "Atlas filters could not load.");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const append = offset > 0;
    setLoading(!append);
    setLoadingMore(append);
    setError(null);
    if (!append) {
      setSites([]);
      setTotal(0);
      setSelectedRouteId("");
    }

    void getHeritage({ q: query, category, state, limit: PAGE_SIZE, offset }, { signal: controller.signal })
      .then((response) => {
        if (!active) return;
        const page = response.items.map(heritageToView);
        setSites((current) => append ? [...current, ...page] : page);
        setTotal(response.pagination.total);
        if (!append) setSelectedRouteId(page[0]?.routeId ?? "");
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "The heritage atlas could not load.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setLoadingMore(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [category, offset, query, state]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setMapSites([]);
    setMapLoading(true);
    setMapError(null);

    void getHeritageMapSites({ q: query, category, state }, { signal: controller.signal })
      .then((records) => {
        if (active) setMapSites(records.map(heritageMapToView));
      })
      .catch((reason: unknown) => {
        if (active) setMapError(reason instanceof Error ? reason.message : "Map locations could not load.");
      })
      .finally(() => {
        if (active) setMapLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [category, query, state, mapRetryKey]);

  const selected = sites.find((site) => site.routeId === selectedRouteId)
    ?? mapSites.find((site) => site.routeId === selectedRouteId)
    ?? sites[0]
    ?? null;
  const selectedImage = selected?.gallery[0] ?? null;
  const selectedImageSource = selectedImage
    ? failedImageUrl
      ? getHeritageImageFallback({ url: selectedImage.src }, failedImageUrl)
      : getHeritageImageSource({ url: selectedImage.src, thumbnail_url: selectedImage.thumbnailSrc })
    : null;
  const selectedImageUnavailable = Boolean(selectedImage && (!selectedImageSource || isHeritageImageFallback(selectedImageSource)));
  useEffect(() => setFailedImageUrl(null), [selectedImage?.src, selectedImage?.thumbnailSrc]);
  const selectSite = useCallback((routeId: string) => setSelectedRouteId(routeId), []);
  const changeCategory = (value: string) => { setCategory(value); setOffset(0); };
  const changeState = (value: string) => { setState(value); setOffset(0); };

  return (
    <section id="atlas" className="relative bg-ink px-5 py-24 md:px-12">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs uppercase tracking-[0.4em] text-gold">01 · Living Atlas</p>
        <h2 className="font-display mt-3 text-4xl text-parchment md:text-6xl">A subcontinent, pinned in light.</h2>
        <p className="mt-4 max-w-2xl text-parchment/70">Search published heritage places. Verified, attributed photographs appear when available; locations without source-verified coordinates stay in the list and are not placed approximately.</p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_repeat(2,minmax(12rem,0.45fr))]">
          <label className="relative block">
            <span className="sr-only">Search the atlas</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gold/70" aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search places or history" className="h-12 w-full rounded-xl border border-white/10 bg-[#17120e] pl-10 pr-3 text-sm text-parchment placeholder:text-parchment/40 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25" />
          </label>
          <label>
            <span className="sr-only">Filter the atlas by category</span>
            <select value={category} onChange={(event) => changeCategory(event.target.value)} className="h-12 w-full rounded-xl border border-white/10 bg-[#17120e] px-3 text-sm text-parchment focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25">
              <option value="">All categories</option>
              {categories.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter the atlas by state</span>
            <select value={state} onChange={(event) => changeState(event.target.value)} className="h-12 w-full rounded-xl border border-white/10 bg-[#17120e] px-3 text-sm text-parchment focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25">
              <option value="">All states and territories</option>
              {states.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>

        {filtersError ? (
          <p role="status" className="mt-4 rounded-xl border border-gold/20 bg-gold/5 px-4 py-3 text-sm text-parchment/70">
            Some filter options could not load. You can still view the collection. {filtersError}
          </p>
        ) : null}
        {error ? <p role="alert" className="mt-5 rounded-xl border border-red-400/30 bg-red-950/20 p-4 text-sm text-red-100">{error}</p> : null}
        {loading ? <p role="status" className="mt-5 text-sm text-parchment/60">Loading the published heritage collection…</p> : null}
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            {mapLoading ? <p role="status" className="mb-3 text-xs text-parchment/55">Loading source-verified map locations…</p> : null}
            {mapError ? (
              <p role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/30 bg-red-950/20 px-4 py-3 text-sm text-red-100">
                <span>Map locations could not load. {mapError}</span>
                <button type="button" onClick={() => setMapRetryKey((current) => current + 1)} className="text-gold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Retry map locations</button>
              </p>
            ) : null}
            <HeritageMap sites={sites} mapSites={mapSites} label="Living Atlas map" selectedRouteId={selected?.routeId} onSiteSelect={selectSite} verifiedPhotoOnly />
          </div>
          <div className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.025] p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-2xl text-parchment">Places in view</h3>
              <span className="text-xs text-gold">{sites.length} of {total}</span>
            </div>
            {selected ? (
              <article className="mt-4 rounded-2xl border border-gold/20 bg-gold/[0.04] p-4">
                {selectedImage && selectedImageSource && !selectedImageUnavailable ? (
                  <img src={selectedImageSource} alt={selectedImage.alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedImageUrl(selectedImageSource)} className="mb-4 aspect-[16/9] w-full rounded-xl object-cover" />
                ) : selectedImage ? (
                  <p role="status" className="mb-4 rounded-xl border border-white/10 px-3 py-4 text-xs text-parchment/55">The verified photograph could not be loaded. Its source details remain available below.</p>
                ) : (
                  <img src="/heritage-image-fallback.svg" alt={`Illustrative placeholder; no photograph available for ${selected.name}`} className="mb-4 aspect-[16/9] w-full rounded-xl object-cover" />
                )}
                {selectedImage ? (
                  <p className="mb-3 flex flex-wrap gap-x-2 gap-y-1 text-[10px] leading-4 text-parchment/50">
                    {selectedImage.credit || selectedImage.creator ? <span>{selectedImage.credit || selectedImage.creator}</span> : null}
                    {safeExternalUrl(selectedImage.sourceUrl) ? <a href={safeExternalUrl(selectedImage.sourceUrl)!} target="_blank" rel="noopener noreferrer" className="text-gold-bright underline underline-offset-2">Source</a> : null}
                    {selectedImage.license ? (safeExternalUrl(selectedImage.licenseUrl) ? <a href={safeExternalUrl(selectedImage.licenseUrl)!} target="_blank" rel="noopener noreferrer" className="text-gold-bright underline underline-offset-2">{selectedImage.license}</a> : <span>{selectedImage.license}</span>) : null}
                  </p>
                ) : null}
                <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-gold"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{selected.location}</p>
                <h4 className="font-display mt-2 text-2xl text-parchment">{selected.name}</h4>
                <p className="mt-2 line-clamp-3 text-sm text-parchment/65">{selected.description}</p>
                <RouterLink to={`/heritage/${encodeURIComponent(selected.routeId)}`} className="mt-4 inline-flex text-xs font-semibold uppercase tracking-[0.15em] text-gold-bright underline decoration-gold/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Open heritage record</RouterLink>
              </article>
            ) : null}
            <ul className="mt-4 max-h-80 space-y-1 overflow-y-auto pr-1">
              {sites.map((site) => (
                <li key={site.routeId}>
                  <button type="button" onClick={() => setSelectedRouteId(site.routeId)} aria-pressed={site.routeId === selected?.routeId} className={`w-full rounded-xl px-3 py-2.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${site.routeId === selected?.routeId ? "bg-gold/10 text-gold-bright" : "text-parchment/70 hover:bg-white/5"}`}>
                    <span className="block truncate">{site.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-parchment/45">{site.location}{site.coordinateStatus === "verified" ? " · mapped" : site.coordinateStatus === "unverified" ? " · coordinates not source-verified" : " · coordinates not recorded"}</span>
                  </button>
                </li>
              ))}
            </ul>
            {!loading && sites.length === 0 ? <p className="mt-4 text-sm text-parchment/55">No records match these filters.</p> : null}
            {sites.length < total ? <button type="button" disabled={loadingMore} onClick={() => setOffset((current) => current + PAGE_SIZE)} className="mt-4 w-full rounded-xl border border-gold/30 px-4 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-gold-bright disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">{loadingMore ? "Loading…" : "Load more places"}</button> : null}
          </div>
        </div>
        <p className="mt-5 text-xs text-parchment/45">Map markers require a complete coordinate pair with a supporting citation. Map tiles © OpenStreetMap contributors.</p>
      </div>
    </section>
  );
}

function safeExternalUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
