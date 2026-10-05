import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, Clock3, Heart, Landmark, MapPin, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeritagePageHeader } from "@/components/heritage/HeritagePageHeader";
import { getFallbackHeritage } from "@/lib/heritageDataProvider";
import { RouterLink } from "@/lib/router";
import type { HeritageGalleryImage, HeritageView } from "@/lib/heritageAdapter";

function GalleryImage({ image }: { image: HeritageGalleryImage }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="relative min-h-52 overflow-hidden rounded-2xl border border-white/10 bg-[#17120e]">
      {failed ? (
        <div className="grid min-h-52 place-items-center text-gold/70">
          <div className="text-center"><Landmark className="mx-auto h-8 w-8" aria-hidden="true" /><p className="mt-2 text-[10px] uppercase tracking-[0.18em]">Image unavailable</p></div>
        </div>
      ) : (
        <img src={image.src} alt={image.alt} onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      )}
      {image.label ? <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-ink/90 to-transparent px-4 pb-3 pt-8 text-xs text-parchment">{image.label}</figcaption> : null}
    </figure>
  );
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
  const local = item.localMonument;
  const period = item.historicalPeriod || local?.era;
  const year = local?.year;
  const primaryImage = item.gallery[0];
  const architectureText = item.architecture || (local?.material
    ? `Materials noted in the current local record: ${local.material}.`
    : "Architectural documentation is not available yet.");

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-white/10">
        {primaryImage ? (
          <div className="absolute inset-0 -z-20 bg-cover bg-center opacity-35" style={{ backgroundImage: `url(${JSON.stringify(primaryImage.src).slice(1, -1)})` }} aria-hidden="true" />
        ) : null}
        <div className="absolute inset-0 -z-10 bg-linear-to-b from-ink/60 via-ink/80 to-ink" />
        <div className="mx-auto max-w-7xl px-5 py-14 md:px-10 md:py-20">
          <RouterLink to="/explore" className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-gold-bright hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to explore
          </RouterLink>
          <div className="mt-10 max-w-4xl">
            {item.category ? <p className="text-[10px] uppercase tracking-[0.3em] text-gold">{item.category.name}</p> : null}
            <h1 className="font-display mt-3 text-5xl leading-[0.95] text-parchment md:text-7xl">{item.name}</h1>
            <p className="mt-5 flex items-center gap-2 text-sm text-parchment/70"><MapPin className="h-4 w-4 text-gold" aria-hidden="true" />{item.location}</p>
            <p className="mt-5 max-w-2xl text-base leading-7 text-parchment/75">{item.description || "A place in the heritage collection. More verified documentation will be added as it becomes available."}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button type="button" variant="outline" disabled aria-describedby="heritage-actions-note"><Heart className="h-4 w-4" aria-hidden="true" /> Save favorite</Button>
              <Button type="button" variant="outline" disabled aria-describedby="heritage-actions-note"><Route className="h-4 w-4" aria-hidden="true" /> Mark visited</Button>
            </div>
            <p id="heritage-actions-note" className="mt-3 text-xs text-parchment/45">Favorites and visit tracking will be enabled when their backend APIs are available.</p>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 md:px-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-14">
        <div className="min-w-0">
          <section aria-labelledby="gallery-heading" className="pb-8">
            <h2 id="gallery-heading" className="font-display text-3xl text-parchment">Gallery</h2>
            {item.gallery.length > 0 ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {item.gallery.map((image, index) => <GalleryImage key={`${image.src}-${index}`} image={image} />)}
              </div>
            ) : (
              <div className="mt-5 grid min-h-56 place-items-center rounded-2xl border border-white/10 bg-white/[0.025] text-parchment/50">
                <div className="text-center"><Landmark className="mx-auto h-8 w-8 text-gold/70" aria-hidden="true" /><p className="mt-3 text-sm">No verified media is available yet.</p></div>
              </div>
            )}
          </section>

          <DetailSection id="overview" title="Overview">
            <p>{item.description || "Overview information is not available yet."}</p>
          </DetailSection>
          <DetailSection id="history" title="History">
            <p>{item.history || "Historical notes have not been added to this local record yet."}</p>
          </DetailSection>
          <DetailSection id="significance" title="Cultural significance">
            <p>{item.culturalSignificance || "Cultural significance notes are not available yet."}</p>
          </DetailSection>
          <DetailSection id="architecture" title="Architecture">
            <p>{architectureText}</p>
          </DetailSection>
          <DetailSection id="timeline" title="Timeline">
            {item.timelineEvents.length ? (
              <ol className="space-y-5 border-l border-gold/30 pl-5">
                {item.timelineEvents.map((event) => (
                  <li key={event.id} className="relative">
                    <span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-gold" aria-hidden="true" />
                    <p className="text-xs uppercase tracking-[0.18em] text-gold">{event.event_date || event.event_period}</p>
                    <h3 className="font-display mt-1 text-2xl text-parchment">{event.title}</h3>
                    <p className="mt-1">{event.description}</p>
                  </li>
                ))}
              </ol>
            ) : <EmptyDetail>No timeline events are available for this local record.</EmptyDetail>}
          </DetailSection>
          <DetailSection id="artifacts" title="Artifacts">
            {item.artifacts.length ? (
              <div className="grid gap-3 sm:grid-cols-2">{item.artifacts.map((artifact) => <article key={artifact.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><h3 className="font-display text-xl text-parchment">{artifact.name}</h3><p className="mt-2">{artifact.description}</p>{artifact.material ? <p className="mt-2 text-xs text-gold">{artifact.material}</p> : null}</article>)}</div>
            ) : <EmptyDetail>No artifact records are available yet.</EmptyDetail>}
          </DetailSection>
          <DetailSection id="layers" title="Architectural layers">
            {item.architecturalLayers.length ? (
              <ol className="space-y-3">{item.architecturalLayers.map((layer) => <li key={layer.id ?? `${layer.display_order}-${layer.name}`} className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><h3 className="font-display text-xl text-parchment">{layer.name}</h3><p className="mt-1">{layer.description}</p></li>)}</ol>
            ) : <EmptyDetail>No architectural layers are documented yet.</EmptyDetail>}
          </DetailSection>
          <DetailSection id="sources" title="Sources">
            {item.sources.length ? (
              <ul className="space-y-3">{item.sources.map((source) => <li key={source.id}><a href={source.source_url} target="_blank" rel="noreferrer" className="font-medium text-gold-bright underline decoration-gold/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">{source.source_name}</a>{source.source_note ? <p className="mt-1 text-xs text-parchment/55">{source.source_note}</p> : null}</li>)}</ul>
            ) : <EmptyDetail>Source records will appear here when they are available.</EmptyDetail>}
          </DetailSection>
          <DetailSection id="reviews" title="Visitor reviews">
            <EmptyDetail>Reviews are not connected yet. No review has been submitted or saved.</EmptyDetail>
          </DetailSection>
        </div>

        <aside className="space-y-5 lg:pt-2">
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5" aria-labelledby="facts-heading">
            <h2 id="facts-heading" className="font-display text-2xl text-parchment">Quick facts</h2>
            <dl className="mt-4 divide-y divide-white/10 text-sm">
              <div className="py-3"><dt className="text-xs uppercase tracking-[0.15em] text-parchment/45">Category</dt><dd className="mt-1 text-parchment/85">{item.category?.name || "Not recorded"}</dd></div>
              <div className="py-3"><dt className="text-xs uppercase tracking-[0.15em] text-parchment/45">Historical period</dt><dd className="mt-1 text-parchment/85">{period || "Not recorded"}</dd></div>
              {year ? <div className="py-3"><dt className="text-xs uppercase tracking-[0.15em] text-parchment/45">Local date label</dt><dd className="mt-1 text-parchment/85">{year}</dd></div> : null}
              <div className="py-3"><dt className="text-xs uppercase tracking-[0.15em] text-parchment/45">State / territory</dt><dd className="mt-1 text-parchment/85">{item.state || "Not recorded"}</dd></div>
              {item.district ? <div className="py-3"><dt className="text-xs uppercase tracking-[0.15em] text-parchment/45">District</dt><dd className="mt-1 text-parchment/85">{item.district}</dd></div> : null}
            </dl>
          </section>
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5" aria-labelledby="location-heading">
            <h2 id="location-heading" className="font-display text-2xl text-parchment">Location</h2>
            <p className="mt-3 flex items-start gap-2 text-sm text-parchment/70"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />{item.location}</p>
            {item.hasCoordinates ? (
              <p className="mt-3 text-xs text-parchment/50">{item.latitude?.toFixed(5)}, {item.longitude?.toFixed(5)}</p>
            ) : (
              <p className="mt-3 text-xs text-parchment/45">Verified coordinates are not available.</p>
            )}
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

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void getFallbackHeritage(identifier)
      .then((record) => { if (active) setItem(record); })
      .catch(() => { if (active) setError("The local heritage record could not be read."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [identifier]);

  return (
    <div className="min-h-svh bg-ink text-parchment">
      <HeritagePageHeader />
      <main>
        {loading ? (
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-10" role="status" aria-live="polite">Loading the heritage record…</div>
        ) : error ? (
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-10" role="alert"><p>{error}</p><RouterLink to="/explore" className="mt-4 inline-block text-gold-bright underline">Back to explore</RouterLink></div>
        ) : item ? (
          <HeritageDetailContent item={item} />
        ) : (
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-10" role="status">
            <p className="text-[10px] uppercase tracking-[0.25em] text-gold">Record not found</p>
            <h1 className="font-display mt-3 text-4xl">This place is not in the local collection.</h1>
            <RouterLink to="/explore" className="mt-5 inline-flex items-center gap-2 text-sm text-gold-bright underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to explore</RouterLink>
          </div>
        )}
      </main>
    </div>
  );
}
