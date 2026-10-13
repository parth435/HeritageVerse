import { motion } from "motion/react";
import { useMemo } from "react";
import { CitationLinks } from "@/components/heritage/Citations";
import { useHeritageSelection } from "@/hooks/useHeritageSelection";
import { getArchitectureEvidence, architecturalLayerKey } from "@/lib/heritageFeatureData.js";
import type { HeritageView } from "@/lib/heritageAdapter";

type MonumentDissectionViewProps = {
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

export function MonumentDissectionView({
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
}: MonumentDissectionViewProps) {
  const evidence = useMemo(() => getArchitectureEvidence(site), [site]);
  const recordId = site?.databaseId ?? site?.routeId;
  const hasArchitectureData = Boolean(
    evidence.architecture || evidence.historicalPeriod || evidence.layers.length || evidence.artifactMaterials.length,
  );

  return (
    <section id="dissection" className="bg-[#0a0807] px-5 py-24 md:px-12">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs uppercase tracking-[0.4em] text-gold">04 · Monument Dissection</p>
        <h2 className="font-display mt-3 text-4xl md:text-6xl">Architecture, from sourced records.</h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-parchment/65">Explore the selected site’s recorded architectural description, period, component details, and artifact materials. Missing or unsupported fields are identified instead of filled with another site’s information.</p>

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
            onChange={(change) => selectSite(change.target.value)}
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
        {detailLoading ? <p role="status" className="mt-6 text-sm text-parchment/60">Loading architectural information for this site…</p> : null}
        {!listLoading && !listError && query.trim() && searchResultCount === 0 ? (
          <p className="mt-3 text-xs text-parchment/50">No site matches this search. Your current selection remains available.</p>
        ) : null}

        {site && !detailLoading ? (
          <div className="mt-8 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <article className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 md:p-8">
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold">{site.category?.name || "Heritage site"}</p>
              <h3 className="font-display mt-3 text-3xl text-parchment">{site.name}</h3>
              <p className="mt-1 text-sm text-parchment/50">{site.location}</p>

              <div className="mt-7 border-t border-white/10 pt-5">
                <h4 className="text-[10px] uppercase tracking-[0.2em] text-gold">Architecture and style</h4>
                {evidence.architecture ? (
                  <p className="mt-2 text-sm leading-7 text-parchment/75">
                    {evidence.architecture}
                    <CitationLinks sources={site.sources} claim="architecture" recordId={recordId} />
                  </p>
                ) : <p className="mt-2 text-sm text-parchment/50">Architectural description not recorded.</p>}
                {evidence.architecture && evidence.architectureSources.length === 0 ? (
                  <p className="mt-2 text-xs leading-5 text-amber-100/70">This record has architecture text but no linked source for it; treat the description as unverified.</p>
                ) : null}
              </div>

              <div className="mt-6 border-t border-white/10 pt-5">
                <h4 className="text-[10px] uppercase tracking-[0.2em] text-gold">Historical period</h4>
                {evidence.historicalPeriod ? (
                  <p className="mt-2 text-sm leading-7 text-parchment/75">
                    {evidence.historicalPeriod}
                    <CitationLinks sources={site.sources} claim="historical_period" recordId={recordId} />
                  </p>
                ) : <p className="mt-2 text-sm text-parchment/50">Historical period not recorded.</p>}
                {evidence.historicalPeriod && evidence.periodSources.length === 0 ? (
                  <p className="mt-2 text-xs leading-5 text-amber-100/70">This record has period text but no linked source for it; treat the period as unverified.</p>
                ) : null}
              </div>
              <a href={`/heritage/${encodeURIComponent(site.routeId)}#sources`} className="mt-7 inline-flex text-xs font-semibold uppercase tracking-[0.15em] text-gold-bright underline decoration-gold/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Open cited record</a>
            </article>

            <div className="space-y-8">
              <section aria-labelledby="recorded-components-heading" className="space-y-3">
                <h3 id="recorded-components-heading" className="font-display text-2xl text-parchment">Recorded components</h3>
                {evidence.layers.length ? evidence.layers.map((layer, index) => (
                  <motion.article key={architecturalLayerKey(layer)} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.04 }} className="rounded-2xl border border-gold/20 bg-[#17120e] p-5">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-gold">Component {String(index + 1).padStart(2, "0")}</p>
                    <h4 className="font-display mt-2 text-xl text-parchment">{layer.name}</h4>
                    {layer.description ? <p className="mt-2 text-sm leading-6 text-parchment/70">{layer.description}<CitationLinks sources={site.sources} sourceIds={[layer.source_id]} recordId={recordId} /></p> : null}
                    {!layer.source_id || !site.sources.some((source) => source.id === layer.source_id) ? <p className="mt-2 text-xs text-amber-100/70">No supporting source is linked to this component.</p> : null}
                  </motion.article>
                )) : <p className="rounded-2xl border border-white/10 p-5 text-sm leading-6 text-parchment/55">No component breakdown is recorded for this site.</p>}
              </section>

              <section aria-labelledby="artifact-materials-heading" className="space-y-3">
                <h3 id="artifact-materials-heading" className="font-display text-2xl text-parchment">Recorded artifact materials</h3>
                <p className="text-xs leading-5 text-parchment/45">These materials describe catalogued artifacts. They are not treated as construction materials for the site.</p>
                {evidence.artifactMaterials.length ? evidence.artifactMaterials.map((artifact) => (
                  <article key={artifact.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
                    <h4 className="font-medium text-parchment">{artifact.name}</h4>
                    <p className="mt-1 text-sm text-parchment/70">Material: {artifact.material}</p>
                    {artifact.period ? <p className="mt-1 text-sm text-parchment/60">Period: {artifact.period}</p> : null}
                    {artifact.description ? <p className="mt-2 text-sm leading-6 text-parchment/65">{artifact.description}</p> : null}
                    <CitationLinks sources={site.sources} sourceIds={[artifact.source_id]} recordId={recordId} />
                    {!artifact.source_id || !site.sources.some((source) => source.id === artifact.source_id) ? <p className="mt-2 text-xs text-amber-100/70">No supporting source is linked to this artifact record.</p> : null}
                  </article>
                )) : <p className="rounded-2xl border border-white/10 p-5 text-sm leading-6 text-parchment/55">No artifact material records are available for this site.</p>}
              </section>

              {!hasArchitectureData ? (
                <p className="rounded-2xl border border-white/10 p-5 text-sm leading-6 text-parchment/55">Architectural details, construction techniques, and materials are not recorded for this site. No details from another site are substituted.</p>
              ) : null}
            </div>
          </div>
        ) : null}
        {!listLoading && !listError && !query.trim() && sites.length === 0 ? (
          <p className="mt-7 rounded-xl border border-white/10 p-5 text-sm text-parchment/60">
            No published heritage records are available yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function MonumentDissection() {
  const selection = useHeritageSelection();

  return (
    <MonumentDissectionView
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
