import { motion } from "motion/react";
import { Clock3 } from "lucide-react";
import { useMemo, useState } from "react";
import { CitationLinks } from "@/components/heritage/Citations";
import { useHeritageSelection } from "@/hooks/useHeritageSelection";
import {
  presentTimelineMoment,
  sortTimelineEvents,
} from "@/lib/heritageFeatureData.js";
import type { HeritageView } from "@/lib/heritageAdapter";

type TimeMachineViewProps = {
  sites: HeritageView[];
  siteId: string;
  site: HeritageView | null;
  query: string;
  searchResultCount: number;
  listLoading: boolean;
  detailLoading: boolean;
  listError: string | null;
  detailError: string | null;
  setQuery: (query: string) => void;
  selectSite: (siteId: string) => void;
  retry: () => void;
};

export function TimeMachineView({
  sites,
  siteId,
  site,
  query,
  searchResultCount,
  listLoading,
  detailLoading,
  listError,
  detailError,
  setQuery,
  selectSite,
  retry,
}: TimeMachineViewProps) {
  const [eventIndex, setEventIndex] = useState(0);
  const events = useMemo(() => sortTimelineEvents(site?.timelineEvents ?? []), [site]);
  const event = events[eventIndex];
  const moment = event ? presentTimelineMoment(event, site?.sources ?? []) : null;

  function chooseSite(nextSiteId: string) {
    setEventIndex(0);
    selectSite(nextSiteId);
  }

  return (
    <section id="time" className="bg-ink px-5 py-24 md:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-gold">03 · Time Machine</p>
            <h2 className="font-display mt-3 text-4xl md:text-6xl">Move through sourced events.</h2>
          </div>
          <Clock3 className="h-8 w-8 text-gold" aria-hidden="true" />
        </div>

        <label className="mt-7 block max-w-xl">
          <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-gold">Find a heritage site</span>
          <input
            type="search"
            value={query}
            onChange={(change) => setQuery(change.target.value)}
            placeholder="Search the heritage catalogue"
            className="h-12 w-full rounded-xl border border-white/15 bg-[#17120e] px-4 text-sm text-parchment placeholder:text-parchment/40 focus:border-gold/70 focus:outline-none focus:ring-2 focus:ring-gold/25"
          />
        </label>
        <label className="mt-4 block max-w-xl">
          <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-gold">Choose a heritage site</span>
          <select
            value={siteId}
            onChange={(change) => chooseSite(change.target.value)}
            disabled={sites.length === 0}
            className="h-12 w-full rounded-xl border border-white/15 bg-[#17120e] px-4 text-sm text-parchment focus:border-gold/70 focus:outline-none focus:ring-2 focus:ring-gold/25 disabled:opacity-60"
          >
            {sites.length === 0 ? <option value="">No sites available</option> : null}
            {sites.map((item) => <option key={item.routeId} value={item.routeId}>{item.name} · {item.location}</option>)}
          </select>
        </label>

        {listError ? (
          <div role="alert" className="mt-6 rounded-xl border border-red-400/30 bg-red-950/20 p-4 text-sm text-red-100">
            <p>{listError}</p>
            <button type="button" onClick={retry} className="mt-3 underline underline-offset-4">Retry loading sites</button>
          </div>
        ) : null}
        {detailError ? (
          <div role="alert" className="mt-6 rounded-xl border border-red-400/30 bg-red-950/20 p-4 text-sm text-red-100">
            <p>{detailError}</p>
            <button type="button" onClick={retry} className="mt-3 underline underline-offset-4">Retry this site</button>
          </div>
        ) : null}
        {listLoading ? <p role="status" className="mt-6 text-sm text-parchment/60">Loading heritage sites…</p> : null}
        {detailLoading ? <p role="status" className="mt-6 text-sm text-parchment/60">Loading events for this site…</p> : null}
        {!listLoading && !listError && query.trim() && searchResultCount === 0 ? (
          <p className="mt-3 text-xs text-parchment/50">No site matches this search. Your current selection remains available.</p>
        ) : null}

        {site && !detailLoading && event && moment ? (
          <>
            <motion.article key={`${site.routeId}-${event.id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="relative mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-linear-to-br from-[#302117] to-[#14100d] p-7 md:p-12">
              <p className="text-xs uppercase tracking-[0.3em] text-gold">
                <span>{moment.label}: </span>
                {moment.precision === "day" ? <time dateTime={event.event_date ?? undefined}>{moment.value}</time> : moment.value}
              </p>
              <h3 className="font-display mt-4 max-w-3xl text-3xl text-parchment md:text-5xl">{event.title}</h3>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-parchment/75 md:text-base">
                {event.description}
                <CitationLinks sources={site.sources} sourceIds={[event.source_id]} recordId={site.databaseId ?? site.routeId} />
              </p>
              <p className="mt-3 text-xs leading-5 text-parchment/45">The date refers to this event; it does not imply when the site was built or discovered.</p>
              <p className="mt-7 text-xs uppercase tracking-[0.16em] text-parchment/45">{site.name} · {site.location}</p>
            </motion.article>
            {events.length > 1 ? (
              <div className="mt-8">
                <label htmlFor="timeline-event-range" className="sr-only">Choose a documented timeline event</label>
                <input id="timeline-event-range" type="range" min={0} max={events.length - 1} step={1} value={eventIndex} aria-valuetext={moment ? `${moment.label}: ${moment.value} — ${event.title}` : undefined} onChange={(change) => setEventIndex(Number(change.target.value))} className="w-full accent-[var(--color-gold)]" />
                <ol className="mt-4 flex justify-between gap-2 text-[10px] uppercase tracking-[0.15em] text-parchment/50">
                  {events.map((item, index) => {
                    const itemMoment = presentTimelineMoment(item, site.sources);
                    return (
                      <li key={item.id} className="min-w-0">
                        <button type="button" onClick={() => setEventIndex(index)} aria-current={index === eventIndex ? "step" : undefined} aria-label={`${itemMoment.label}: ${itemMoment.value} — ${item.title}`} className="max-w-28 truncate text-left hover:text-gold-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
                          {itemMoment.value}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : null}
          </>
        ) : null}
        {site && !detailLoading && !event ? <p className="mt-7 rounded-xl border border-white/10 p-5 text-sm text-parchment/60">No sourced timeline events are recorded for {site.name} yet.</p> : null}
        {!listLoading && !listError && !query.trim() && sites.length === 0 ? (
          <p className="mt-7 rounded-xl border border-white/10 p-5 text-sm text-parchment/60">
            No published heritage records are available yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function TimeMachine() {
  const selection = useHeritageSelection({ hasTimeline: true });

  return (
    <TimeMachineView
      sites={selection.siteOptions}
      siteId={selection.siteId}
      site={selection.site}
      query={selection.query}
      searchResultCount={selection.searchResultCount}
      listLoading={selection.listLoading}
      detailLoading={selection.detailLoading}
      listError={selection.listError}
      detailError={selection.detailError}
      setQuery={selection.setQuery}
      selectSite={selection.selectSite}
      retry={selection.retry}
    />
  );
}
