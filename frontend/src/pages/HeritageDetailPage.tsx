import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, Clock3, Heart, Landmark, MapPin, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeritagePageHeader } from "@/components/heritage/HeritagePageHeader";
import { useAuth } from "@/context/AuthContext";
import { addFavorite, addVisited, ApiRequestError, getFavorites, getHeritageById, getVisited, removeFavorite, removeVisited } from "@/lib/api";
import { ReviewSection } from "@/components/ReviewSection";
import { RoutePlanner } from "@/components/heritage/RoutePlanner";
import { heritageToView } from "@/lib/heritageAdapter";
import { RouterLink } from "@/lib/router";
import type { HeritageGalleryImage, HeritageView } from "@/lib/heritageAdapter";
import { CitationLinks, SourcesAndReferences } from "@/components/heritage/Citations";
import { getCurrentHeritageHeroImage, getHeritageImageFallback, getHeritageImageSource, getVerifiedHeritageImages } from "@/lib/image-assets.js";

function GalleryImage({ image }: { image: HeritageGalleryImage }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const sourceUrl = safeExternalUrl(image.sourceUrl);
  const licenseUrl = safeExternalUrl(image.licenseUrl);
  const source = failedUrl
    ? getHeritageImageFallback({ url: image.src }, failedUrl)
    : getHeritageImageSource({ url: image.src, thumbnail_url: image.thumbnailSrc });
  const failed = !source || Boolean(failedUrl && !source);

  useEffect(() => setFailedUrl(null), [image.src, image.thumbnailSrc]);

  return (
    <figure className="overflow-hidden rounded-2xl border border-white/10 bg-[#17120e]">
      {failed ? (
        <div className="grid min-h-52 place-items-center text-gold/70">
          <div className="text-center"><Landmark className="mx-auto h-8 w-8" aria-hidden="true" /><p className="mt-2 text-[10px] uppercase tracking-[0.18em]">Image unavailable</p></div>
        </div>
      ) : (
        <img src={source} alt={image.alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(source)} className="max-h-[32rem] min-h-52 w-full bg-black/20 object-contain" />
      )}
      <figcaption className="space-y-1 p-3 text-xs leading-5 text-parchment/65">
        {image.label ? <p className="font-medium text-parchment">{image.label}{image.documentedDate ? ` · ${image.documentedDate}` : ""}</p> : null}
        {image.creator ? <p>Creator: {image.creator}</p> : null}
        {image.credit && image.credit !== image.creator ? <p>{image.credit}</p> : null}
        <p className="flex flex-wrap gap-x-3 gap-y-1">{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-gold-bright underline underline-offset-2">Image source</a> : null}{image.license ? (licenseUrl ? <a href={licenseUrl} target="_blank" rel="noopener noreferrer" className="text-gold-bright underline underline-offset-2">{image.license}</a> : <span>{image.license}</span>) : null}</p>
      </figcaption>
    </figure>
  );
}

function safeExternalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function DetailSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="border-t border-white/10 py-8 md:py-10">
      <h2 className="font-display text-3xl text-parchment md:text-4xl">{title}</h2>
      <div className="mt-4 text-sm leading-7 text-parchment/70">{children}</div>
    </section>
  );
}

function EmptyDetail({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-parchment/55">{children}</p>;
}

function HeritageDetailContent({ item }: { item: HeritageView }) {
  const { user } = useAuth();
  const period = item.historicalPeriod;
  const galleryImages = getVerifiedHeritageImages(item.gallery);
  const heroImage = getCurrentHeritageHeroImage(item.gallery);
  const heroImageCandidate = heroImage
    ? getHeritageImageSource({ url: heroImage.src, thumbnail_url: heroImage.thumbnailSrc })
    : null;
  const architectureText = item.architecture || "Architectural documentation is not available in this record yet.";
  const [failedHeroImage, setFailedHeroImage] = useState<{ candidate: string; failed: string } | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(Boolean(user));
  const [favoritePending, setFavoritePending] = useState(false);
  const [favoriteMessage, setFavoriteMessage] = useState<string | null>(null);
  const [isVisited, setIsVisited] = useState(false);
  const [visitedLoading, setVisitedLoading] = useState(Boolean(user));
  const [visitedError, setVisitedError] = useState<string | null>(null);
  const [visitedPending, setVisitedPending] = useState(false);
  const heroImageUrl = heroImageCandidate && failedHeroImage?.candidate === heroImageCandidate
    ? getHeritageImageFallback({ url: heroImage?.src }, failedHeroImage.failed)
    : heroImageCandidate;

  useEffect(() => {
    if (!user || !item.databaseId) {
      setIsFavorite(false);
      setFavoriteLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setFavoriteLoading(true);
    setFavoriteMessage(null);

    void getFavorites({ signal: controller.signal })
      .then((favorites) => {
        if (active) setIsFavorite(favorites.some((favorite) => favorite.heritage.id === item.databaseId));
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setFavoriteMessage(reason instanceof Error ? reason.message : "Could not load favorite status.");
      })
      .finally(() => {
        if (active) setFavoriteLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [item.databaseId, user]);

  useEffect(() => {
    if (!user || !item.databaseId) {
      setIsVisited(false);
      setVisitedLoading(false);
      setVisitedError(null);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setVisitedLoading(true);
    setVisitedError(null);

    void getVisited({ signal: controller.signal })
      .then((visited) => {
        if (active) setIsVisited(visited.some((place) => place.heritage.id === item.databaseId));
      })
      .catch((reason: unknown) => {
        if (active) setVisitedError(reason instanceof Error ? reason.message : "Could not load visited status.");
      })
      .finally(() => {
        if (active) setVisitedLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [item.databaseId, user]);

  async function toggleFavorite() {
    if (!user) {
      setFavoriteMessage("Sign in to save this place to your favorites.");
      return;
    }

    if (!item.databaseId || favoritePending || favoriteLoading) return;

    setFavoritePending(true);
    setFavoriteMessage(null);
    try {
      if (isFavorite) {
        await removeFavorite(item.databaseId);
        setIsFavorite(false);
        setFavoriteMessage("Removed from your favorites.");
      } else {
        await addFavorite(item.databaseId);
        setIsFavorite(true);
        setFavoriteMessage("Saved to your favorites.");
      }
    } catch (reason) {
      if (reason instanceof ApiRequestError && reason.status === 401) {
        setFavoriteMessage("Your session has expired. Please sign in again to save favorites.");
      } else {
        setFavoriteMessage(reason instanceof Error ? reason.message : "Could not update your favorites.");
      }
    } finally {
      setFavoritePending(false);
    }
  }

  async function toggleVisited() {
    if (!user) {
      setFavoriteMessage("Sign in to mark this place as visited.");
      return;
    }
    if (!item.databaseId || visitedPending || visitedLoading) return;
    setVisitedPending(true);
    setFavoriteMessage(null);
    try {
      if (isVisited) {
        await removeVisited(item.databaseId);
        setIsVisited(false);
        setFavoriteMessage("Removed from visited places.");
      } else {
        await addVisited(item.databaseId);
        setIsVisited(true);
        setFavoriteMessage("Marked as visited.");
      }
      setVisitedError(null);
    } catch (error) {
      setFavoriteMessage(error instanceof Error ? error.message : "Could not update visited places.");
    } finally {
      setVisitedPending(false);
    }
  }

  return (
    <>
      <section className="relative isolate flex min-h-[27rem] flex-col overflow-hidden border-b border-white/10 bg-ink sm:min-h-[29rem] md:min-h-[31rem] lg:min-h-[35rem]">
        {heroImageUrl ? (
          <img
            src={heroImageUrl}
            alt=""
            aria-hidden="true"
            loading="eager"
            fetchPriority="high"
            referrerPolicy="no-referrer"
            onError={() => {
              if (heroImageCandidate) setFailedHeroImage({ candidate: heroImageCandidate, failed: heroImageUrl });
            }}
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        ) : null}
        <div className="absolute inset-0 bg-linear-to-t from-ink via-ink/75 to-ink/35" aria-hidden="true" />
        <div className="absolute inset-0 bg-linear-to-r from-ink/55 via-ink/10 to-transparent" aria-hidden="true" />
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-end px-5 pb-9 pt-24 sm:pb-10 md:px-10 md:pb-12 lg:pb-14">
          <RouterLink to="/explore" className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-gold-bright hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to explore
          </RouterLink>
          <div className="mt-7 max-w-4xl sm:mt-9">
            {item.category ? <p className="text-[10px] uppercase tracking-[0.3em] text-gold">{item.category.name}</p> : null}
            <h1 className="font-display mt-3 text-4xl leading-[0.98] text-parchment sm:text-5xl md:text-6xl lg:text-7xl">{item.name}</h1>
            <p className="mt-5 flex items-center gap-2 text-sm text-parchment/70"><MapPin className="h-4 w-4 text-gold" aria-hidden="true" />{item.location}</p>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-parchment/80 sm:mt-5 sm:text-base">{item.description || "A place in the heritage collection. More verified documentation will be added as it becomes available."}<CitationLinks sources={item.sources} claim="description" /></p>
            <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap">
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={toggleFavorite} disabled={favoritePending || favoriteLoading} aria-describedby="heritage-actions-note">
                <Heart className="h-4 w-4" fill={isFavorite ? "currentColor" : "none"} aria-hidden="true" />
                {favoritePending ? "Saving…" : favoriteLoading ? "Checking…" : isFavorite ? "Saved favorite" : "Save favorite"}
              </Button>
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={toggleVisited} disabled={visitedPending || visitedLoading} aria-describedby="heritage-actions-note"><Route className="h-4 w-4" aria-hidden="true" /> {visitedPending ? "Saving…" : visitedLoading ? "Checking…" : isVisited ? "Marked visited" : "Mark visited"}</Button>
            </div>
            <p id="heritage-actions-note" className="mt-3 break-words text-xs text-parchment/55">{favoriteMessage || visitedError || "Save this place or mark it as visited to find it again later."}</p>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 md:px-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-14">
        <div className="min-w-0">
          <section aria-labelledby="gallery-heading" className="pb-8">
            <h2 id="gallery-heading" className="font-display text-3xl text-parchment">Gallery</h2>
            {galleryImages.length > 0 ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {galleryImages.map((image, index) => <GalleryImage key={`${image.src}-${index}`} image={image} />)}
              </div>
            ) : (
              <div className="mt-5 grid min-h-56 place-items-center rounded-2xl border border-white/10 bg-white/[0.025] text-parchment/50">
                <div className="text-center"><Landmark className="mx-auto h-8 w-8 text-gold/70" aria-hidden="true" /><p className="mt-3 text-sm">No verified media is available yet.</p></div>
              </div>
            )}
          </section>

          <DetailSection id="overview" title="Overview">
            <p>{item.description || "Overview information is not available yet."}<CitationLinks sources={item.sources} claim="description" /></p>
          </DetailSection>
          <DetailSection id="history" title="History">
            <p>{item.history || "Historical notes have not been added to this record yet."}<CitationLinks sources={item.sources} claim="history" /></p>
          </DetailSection>
          <DetailSection id="significance" title="Cultural significance">
            <p>{item.culturalSignificance || "Cultural significance notes are not available yet."}<CitationLinks sources={item.sources} claim="cultural_significance" /></p>
          </DetailSection>
          <DetailSection id="architecture" title="Architecture">
            <p>{architectureText}<CitationLinks sources={item.sources} claim="architecture" /></p>
          </DetailSection>
          <DetailSection id="timeline" title="Timeline">
            {item.timelineEvents.length ? (
              <ol className="space-y-5 border-l border-gold/30 pl-5">
                {item.timelineEvents.map((event) => (
                  <li key={event.id} className="relative">
                    <span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-gold" aria-hidden="true" />
                    <p className="text-xs uppercase tracking-[0.18em] text-gold">{event.event_date || event.event_period}</p>
                    <h3 className="font-display mt-1 text-2xl text-parchment">{event.title}</h3>
                    <p className="mt-1">{event.description}<CitationLinks sources={item.sources} sourceIds={[event.source_id]} /></p>
                  </li>
                ))}
              </ol>
            ) : <EmptyDetail>No timeline events are available for this record.</EmptyDetail>}
          </DetailSection>
          <DetailSection id="artifacts" title="Artifacts">
            {item.artifacts.length ? (
              <div className="grid gap-3 sm:grid-cols-2">{item.artifacts.map((artifact) => <article key={artifact.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><h3 className="font-display text-xl text-parchment">{artifact.name}</h3><p className="mt-2">{artifact.description}<CitationLinks sources={item.sources} sourceIds={[artifact.source_id]} /></p>{artifact.material ? <p className="mt-2 text-xs text-gold">{artifact.material}</p> : null}</article>)}</div>
            ) : <EmptyDetail>No artifact records are available yet.</EmptyDetail>}
          </DetailSection>
          <DetailSection id="layers" title="Architectural layers">
            {item.architecturalLayers.length ? (
              <ol className="space-y-3">{item.architecturalLayers.map((layer) => <li key={layer.id ?? `${layer.display_order}-${layer.name}`} className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><h3 className="font-display text-xl text-parchment">{layer.name}</h3><p className="mt-1">{layer.description}<CitationLinks sources={item.sources} sourceIds={[layer.source_id]} /></p></li>)}</ol>
            ) : <EmptyDetail>No architectural layers are documented yet.</EmptyDetail>}
          </DetailSection>
          <DetailSection id="sources" title="Sources & References">
            <SourcesAndReferences sources={item.sources} />
          </DetailSection>
          <DetailSection id="reviews" title="Visitor reviews">
            <ReviewSection heritageId={item.databaseId} />
          </DetailSection>
        </div>

        <aside className="space-y-5 lg:pt-2">
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5" aria-labelledby="facts-heading">
            <h2 id="facts-heading" className="font-display text-2xl text-parchment">Quick facts</h2>
            <dl className="mt-4 divide-y divide-white/10 text-sm">
              <div className="py-3"><dt className="text-xs uppercase tracking-[0.15em] text-parchment/45">Category</dt><dd className="mt-1 text-parchment/85">{item.category?.name || "Not recorded"}</dd></div>
              <div className="py-3"><dt className="text-xs uppercase tracking-[0.15em] text-parchment/45">Historical period</dt><dd className="mt-1 text-parchment/85">{period || "Not recorded"}</dd></div>
              <div className="py-3"><dt className="text-xs uppercase tracking-[0.15em] text-parchment/45">State / territory</dt><dd className="mt-1 text-parchment/85">{item.state || "Not recorded"}</dd></div>
              {item.district ? <div className="py-3"><dt className="text-xs uppercase tracking-[0.15em] text-parchment/45">District</dt><dd className="mt-1 text-parchment/85">{item.district}</dd></div> : null}
              {item.locality ? <div className="py-3"><dt className="text-xs uppercase tracking-[0.15em] text-parchment/45">Locality</dt><dd className="mt-1 text-parchment/85">{item.locality}</dd></div> : null}
              {item.address ? <div className="py-3"><dt className="text-xs uppercase tracking-[0.15em] text-parchment/45">Address</dt><dd className="mt-1 text-parchment/85">{item.address}</dd></div> : null}
            </dl>
          </section>
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5" aria-labelledby="location-heading">
            <h2 id="location-heading" className="font-display text-2xl text-parchment">Location</h2>
            <p className="mt-3 flex items-start gap-2 text-sm text-parchment/70"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />{item.location}</p>
            {item.hasCoordinates ? (
              <>
                <p className="mt-3 text-xs text-parchment/50">{item.latitude?.toFixed(5)}, {item.longitude?.toFixed(5)}<CitationLinks sources={item.sources} claim="coordinates" /></p>
              </>
            ) : (
              <>
                <p className="mt-3 text-xs text-parchment/45">Verified coordinates are not available, so the atlas has no pin for this site.</p>
                {[item.address, item.locality, item.district, item.state].some(Boolean) ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([item.address, item.locality, item.district, item.state].filter(Boolean).join(", "))}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex text-xs font-medium text-gold-bright underline decoration-gold/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Search this location in Google Maps</a> : null}
              </>
            )}
            <RoutePlanner destination={item} />
          </section>
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <h2 className="font-display text-2xl text-parchment">Keep exploring</h2>
            <p className="mt-2 text-sm text-parchment/60">Return to the collection to compare more places.</p>
            <RouterLink to="/explore" className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-gold-bright hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"><Clock3 className="h-4 w-4" aria-hidden="true" /> Explore collection</RouterLink>
          </section>
        </aside>
      </div>
    </>
  );
}

export function HeritageDetailPage({ identifier }: { identifier: string }) {
  const [item, setItem] = useState<HeritageView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setItem(null);
    setLoading(true);
    setError(null);
    setNotFound(false);
    void getHeritageById(identifier, { signal: controller.signal })
      .then((record) => {
        if (active) setItem(heritageToView(record));
      })
      .catch((reason: unknown) => {
        if (!active) return;
        if (reason instanceof ApiRequestError && [400, 404].includes(reason.status)) {
          setNotFound(true);
          return;
        }
        setError(reason instanceof Error ? reason.message : "The heritage record could not load. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [identifier, retryKey]);

  return (
    <div className="min-h-svh bg-ink text-parchment">
      <HeritagePageHeader />
      <main>
        {loading ? (
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-10" role="status" aria-live="polite">Loading the heritage record…</div>
        ) : error ? (
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-10" role="alert">
            <p className="text-[10px] uppercase tracking-[0.25em] text-gold">The record could not load</p>
            <p className="mt-3 text-parchment/70">{error}</p>
            <button type="button" onClick={() => setRetryKey((current) => current + 1)} className="mt-5 rounded-full border border-gold/40 px-5 py-2.5 text-xs uppercase tracking-[0.15em] text-gold-bright hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Try again</button>
            <RouterLink to="/explore" className="ml-4 inline-block text-gold-bright underline">Back to explore</RouterLink>
          </div>
        ) : item ? (
          <HeritageDetailContent item={item} />
        ) : notFound ? (
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-10" role="status">
            <p className="text-[10px] uppercase tracking-[0.25em] text-gold">Record not found</p>
            <h1 className="font-display mt-3 text-4xl">This place is not in the published collection.</h1>
            <RouterLink to="/explore" className="mt-5 inline-flex items-center gap-2 text-sm text-gold-bright underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to explore</RouterLink>
          </div>
        ) : null}
      </main>
    </div>
  );
}
