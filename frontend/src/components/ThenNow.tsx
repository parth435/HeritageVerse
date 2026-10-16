import { useEffect, useState } from "react";
import { getHeritage, getHeritageById } from "@/lib/api";
import { heritageToView } from "@/lib/heritageAdapter";
import type { HeritageView } from "@/lib/heritageAdapter";
import { CitationLinks } from "@/components/heritage/Citations";
import { ReconstructionPanel } from "@/components/heritage/ReconstructionPanel";
import type { HeritageMedia } from "@/types/heritage";
import { getHeritageImageFallback, getHeritageImageSource, isHeritageImageFallback } from "@/lib/image-assets.js";
import {
  getDefaultHeritageOption,
  getVerifiedComparisonPair,
  isValidHeritageSiteId,
  presentTimelineMoment,
  sortTimelineEvents,
} from "@/lib/heritageFeatureData.js";

function secureHttpsUrl(value: string | null | undefined) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function hasVerifiedAttribution(media: HeritageMedia) {
  return media.media_type === "image" && media.verification_status === "verified" && !media.is_illustrative && Boolean(
    secureHttpsUrl(media.url) && secureHttpsUrl(media.source_url) && secureHttpsUrl(media.license_url) && (media.creator || media.credit) && media.license,
  );
}

function ComparisonImage({ media, label }: { media: HeritageMedia; label: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const imageSource = failedUrl
    ? getHeritageImageFallback({ url: media.url }, failedUrl)
    : getHeritageImageSource({ url: media.url, thumbnail_url: media.thumbnail_url });
  const failed = !imageSource || isHeritageImageFallback(imageSource);
  const sourceUrl = secureHttpsUrl(media.source_url);
  const licenseUrl = secureHttpsUrl(media.license_url);

  useEffect(() => {
    setFailedUrl(null);
    setLoading(true);
  }, [media.url, media.thumbnail_url]);

  return (
    <figure className="overflow-hidden rounded-2xl border border-white/10 bg-[#100d0b]">
      <div className="relative grid min-h-64 place-items-center bg-black/20">
        {loading && !failed ? <p className="absolute p-4 text-sm text-parchment/55" role="status">Loading sourced image…</p> : null}
        {failed ? (
          <div className="space-y-3 p-8 text-center text-sm text-parchment/55" role="status">
            <p>This sourced image is currently unavailable.</p>
            <button type="button" onClick={() => { setLoading(true); setFailedUrl(null); setRetryKey((value) => value + 1); }} className="rounded-full border border-gold/40 px-4 py-2 text-xs text-gold-bright hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Retry image</button>
            {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="block text-gold-bright underline underline-offset-2">Open source record</a> : null}
          </div>
        ) : <img key={retryKey} src={imageSource ?? undefined} alt={media.alt_text || media.caption || label} loading="lazy" onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailedUrl(imageSource ?? media.url); }} className="max-h-[28rem] w-full object-contain" />}
      </div>
      <figcaption className="space-y-2 p-4 text-xs leading-5 text-parchment/70">
        <p className="font-semibold uppercase tracking-[0.18em] text-gold">{label} · {media.documented_date}</p>
        {media.caption ? <p>{media.caption}</p> : null}
        {media.media_context ? <p className="text-parchment/55">{media.media_context}</p> : null}
        <p>{media.credit || media.creator}</p>
        <p className="flex flex-wrap gap-x-3 gap-y-1">
          {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-gold-bright underline underline-offset-2">Source and attribution details</a> : null}
          {licenseUrl ? <a href={licenseUrl} target="_blank" rel="noopener noreferrer" className="text-gold-bright underline underline-offset-2">{media.license}</a> : media.license}
        </p>
        {media.source_accessed_on ? <p className="text-[10px] text-parchment/45">Source checked {media.source_accessed_on}</p> : null}
      </figcaption>
    </figure>
  );
}

function AdditionalSiteImage({ media }: { media: HeritageMedia }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const source = failedUrl
    ? getHeritageImageFallback({ url: media.url }, failedUrl)
    : getHeritageImageSource({ url: media.url, thumbnail_url: media.thumbnail_url });
  const unavailable = !source || isHeritageImageFallback(source);
  const sourceUrl = secureHttpsUrl(media.source_url);
  const licenseUrl = secureHttpsUrl(media.license_url);
  return (
    <figure className="overflow-hidden rounded-xl border border-white/10 bg-[#100d0b]">
      {source && !unavailable ? <img src={source} alt={media.alt_text || media.caption || "Sourced site photograph"} loading="lazy" onError={() => setFailedUrl(source)} className="max-h-72 w-full bg-black/20 object-contain" /> : <div role="status" className="grid min-h-40 place-items-center text-center text-sm text-parchment/55">Verified photograph unavailable</div>}
      <figcaption className="space-y-2 p-4 text-xs leading-5 text-parchment/70">
        <p className="font-medium text-parchment">{media.caption || "Sourced site photograph"}</p>
        <p>{media.credit || media.creator}</p>
        <p className="flex flex-wrap gap-x-3 gap-y-1">
          {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-gold-bright underline underline-offset-2">Image source</a> : null}
          {licenseUrl ? <a href={licenseUrl} target="_blank" rel="noopener noreferrer" className="text-gold-bright underline underline-offset-2">{media.license}</a> : media.license}
        </p>
      </figcaption>
    </figure>
  );
}

function UnavailableComparisonSide({ side }: { side: "historical" | "current" }) {
  const label = side === "historical" ? "historical photograph" : "contemporary photograph";
  return (
    <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-white/15 bg-[#100d0b] p-8 text-center text-sm text-parchment/55" role="status">
      <p>No verified, dated {label} is available for this site.</p>
    </div>
  );
}

type ThenNowViewProps = {
  sites: HeritageView[];
  siteId: string;
  site: HeritageView | null;
  loadingSites: boolean;
  loadingDetail: boolean;
  listError: string | null;
  detailError: string | null;
  selectSite: (siteId: string) => void;
  retrySites: () => void;
  retrySite: () => void;
};

export function ThenNowView({
  sites,
  siteId,
  site,
  loadingSites,
  loadingDetail,
  listError,
  detailError,
  selectSite,
  retrySites,
  retrySite,
}: ThenNowViewProps) {
  const selectedSite = site?.routeId === siteId ? site : null;
  const comparison = getVerifiedComparisonPair(selectedSite?.media ?? []);

  return (
    <section id="then-now" className="bg-ink px-5 py-24 md:px-12">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs uppercase tracking-[0.4em] text-gold">05 · Then / Now</p>
        <h2 className="font-display mt-3 text-4xl md:text-6xl">A place, read across time.</h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-parchment/60">
          Compare sourced history with the current catalogue record and any verified, attributed image pair available for that site. Image viewpoints are identified clearly; unrelated or unverified photos are never paired.
        </p>

        {sites.length > 0 ? (
          <label className="mt-7 block max-w-xl">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-gold">Choose a heritage site</span>
            <select value={siteId} onChange={(event) => selectSite(event.target.value)} className="h-12 w-full rounded-xl border border-white/15 bg-[#17120e] px-4 text-sm text-parchment focus:border-gold/70 focus:outline-none focus:ring-2 focus:ring-gold/25">
              {sites.map((item) => <option key={item.routeId} value={item.routeId}>{item.name}</option>)}
            </select>
          </label>
        ) : null}

        {listError ? (
          <div role="alert" className="mt-6 rounded-xl border border-red-400/30 bg-red-950/20 p-4 text-sm text-red-100">
            <p>{listError}</p>
            <button type="button" onClick={retrySites} className="mt-3 underline underline-offset-4">Retry loading sites</button>
          </div>
        ) : null}
        {detailError ? (
          <div role="alert" className="mt-6 rounded-xl border border-red-400/30 bg-red-950/20 p-4 text-sm text-red-100">
            <p>{detailError}</p>
            <button type="button" onClick={retrySite} className="mt-3 underline underline-offset-4">Retry this site</button>
          </div>
        ) : null}
        {loadingSites ? <p className="mt-6 text-sm text-parchment/60" role="status">Loading sourced heritage records…</p> : null}
        {loadingDetail ? <p className="mt-6 text-sm text-parchment/60" role="status">Loading this site’s history and images…</p> : null}
        {!loadingSites && !listError && sites.length === 0 ? <p className="mt-6 rounded-xl border border-white/10 p-5 text-sm text-parchment/60">No published places with verified photographs and timeline data are available for comparison yet.</p> : null}

        {selectedSite && !loadingDetail ? (
          <>
            <div className="mt-8 grid gap-4 lg:grid-cols-2" aria-live="polite">
              <article className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.035] p-6 md:p-8">
                <p className="text-[10px] uppercase tracking-[0.28em] text-gold">Then · documented history</p>
                <h3 className="font-display mt-3 text-3xl text-parchment">{selectedSite.historicalPeriod || "Period not recorded"}<CitationLinks sources={selectedSite.sources} claim="historical_period" /></h3>
                <p className="mt-4 text-sm leading-7 text-parchment/75">{selectedSite.history || "Historical notes have not been added to this record."}<CitationLinks sources={selectedSite.sources} claim="history" /></p>
                {selectedSite.timelineEvents.length ? (
                  <ol className="mt-6 space-y-4 border-l border-gold/30 pl-5">
                    {sortTimelineEvents(selectedSite.timelineEvents).map((event) => {
                      const moment = presentTimelineMoment(event, selectedSite.sources);
                      return (
                        <li key={event.id} className="relative">
                          <span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-gold" aria-hidden="true" />
                          <p className="text-xs uppercase tracking-[0.15em] text-gold">{moment.label}: {moment.value}</p>
                          <p className="mt-1 text-sm text-parchment/80">{event.title}: {event.description}<CitationLinks sources={selectedSite.sources} sourceIds={[event.source_id]} recordId={selectedSite.databaseId ?? selectedSite.routeId} /></p>
                        </li>
                      );
                    })}
                  </ol>
                ) : <p className="mt-6 text-sm text-parchment/55">No timeline events are recorded for this site.</p>}
              </article>

              <article className="min-w-0 rounded-3xl border border-gold/20 bg-[#19130d] p-6 md:p-8">
                <p className="text-[10px] uppercase tracking-[0.28em] text-gold">Now · catalogue record</p>
                <h3 className="font-display mt-3 text-3xl text-parchment">{selectedSite.name}<CitationLinks sources={selectedSite.sources} claim="name" /></h3>
                <p className="mt-2 text-sm text-parchment/60">{selectedSite.location}<CitationLinks sources={selectedSite.sources} claim="location" /></p>
                <p className="mt-5 text-sm leading-7 text-parchment/75">{selectedSite.description || "An overview has not been recorded yet."}<CitationLinks sources={selectedSite.sources} claim="description" /></p>
                {selectedSite.category ? <p className="mt-5 inline-flex rounded-full border border-gold/25 px-3 py-1 text-xs text-gold">{selectedSite.category.name}</p> : null}
                <a href={"/heritage/" + encodeURIComponent(selectedSite.routeId) + "#sources"} className="mt-7 inline-flex rounded-full border border-gold/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-gold-bright hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Open record and references</a>
              </article>
            </div>
            <section className="mt-10" aria-labelledby="then-now-images-heading">
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold">Verified image sources</p>
              <h3 id="then-now-images-heading" className="font-display mt-2 text-3xl text-parchment">Then and now, through documented views</h3>
              {comparison.historical || comparison.current ? (
                <>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-parchment/60">
                    {comparison.historical && comparison.current
                      ? "These verified photographs depict " + selectedSite.name + " at their documented dates. Their viewpoints are not camera-matched or geometrically aligned."
                      : "Only one suitable dated photograph is recorded for " + selectedSite.name + ". The missing side is left unavailable rather than filled with another image."}
                  </p>
                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    {comparison.historical ? <ComparisonImage media={comparison.historical} label="Historical photograph" /> : <UnavailableComparisonSide side="historical" />}
                    {comparison.current ? <ComparisonImage media={comparison.current} label="Contemporary photograph" /> : <UnavailableComparisonSide side="current" />}
                  </div>
                </>
              ) : (
                <p className="mt-3 rounded-xl border border-white/10 p-4 text-sm text-parchment/60">A verified, dated, attributed historical and contemporary image pair is not available for this site. No unrelated or generated images are shown as authentic photographs.</p>
              )}
              {selectedSite.media.some((media) => media.media_role === "gallery" && hasVerifiedAttribution(media)) ? (
                <div className="mt-8 border-t border-white/10 pt-6">
                  <h4 className="font-display text-2xl text-parchment">Additional verified site photographs</h4>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-parchment/60">These sourced photographs are associated with the site, but the catalogue does not document dates that would classify them as historical or contemporary views.</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {selectedSite.media.filter((media) => media.media_role === "gallery" && hasVerifiedAttribution(media)).map((media) => <AdditionalSiteImage key={media.id} media={media} />)}
                  </div>
                </div>
              ) : null}
            </section>
            <ReconstructionPanel site={selectedSite} />
          </>
        ) : null}
      </div>
    </section>
  );
}

export function ThenNow() {
  const [sites, setSites] = useState<HeritageView[]>([]);
  const [siteId, setSiteId] = useState("");
  const [site, setSite] = useState<HeritageView | null>(null);
  const [loadingSites, setLoadingSites] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [listRetryKey, setListRetryKey] = useState(0);
  const [detailRetryKey, setDetailRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoadingSites(true);
    setListError(null);
    void getHeritage({ limit: 100, hasTimeline: true, withVerifiedPhoto: true }, { signal: controller.signal })
      .then((response) => {
        if (!active) return;
        const options = response.items.map(heritageToView);
        const preferred = getDefaultHeritageOption(options, { hasTimeline: true });
        setSites(options);
        setSiteId((currentId) => options.some((option) => option.routeId === currentId)
          ? currentId
          : preferred?.routeId ?? "");
      })
      .catch((reason: unknown) => {
        if (!active || controller.signal.aborted) return;
        setListError(reason instanceof Error ? reason.message : "Heritage records could not load.");
      })
      .finally(() => {
        if (active) setLoadingSites(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [listRetryKey]);

  useEffect(() => {
    if (!siteId) {
      setSite(null);
      setLoadingDetail(false);
      setDetailError(null);
      return;
    }
    if (!isValidHeritageSiteId(siteId)) {
      setSite(null);
      setLoadingDetail(false);
      setDetailError("Choose a valid heritage site.");
      return;
    }
    const controller = new AbortController();
    let active = true;
    setSite(null);
    setLoadingDetail(true);
    setDetailError(null);
    void getHeritageById(Number(siteId), { signal: controller.signal })
      .then((heritage) => {
        if (active) setSite(heritageToView(heritage));
      })
      .catch((reason: unknown) => {
        if (!active || controller.signal.aborted) return;
        setDetailError(reason instanceof Error ? reason.message : "This heritage record could not load.");
      })
      .finally(() => {
        if (active) setLoadingDetail(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [siteId, detailRetryKey]);

  return (
    <ThenNowView
      sites={sites}
      siteId={siteId}
      site={site}
      loadingSites={loadingSites}
      loadingDetail={loadingDetail}
      listError={listError}
      detailError={detailError}
      selectSite={(nextId) => {
        setSite(null);
        setLoadingDetail(Boolean(nextId));
        setDetailError(null);
        setSiteId(nextId);
      }}
      retrySites={() => setListRetryKey((current) => current + 1)}
      retrySite={() => setDetailRetryKey((current) => current + 1)}
    />
  );
}
