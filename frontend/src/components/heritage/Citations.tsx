import type { HeritageSource } from "@/types/heritage";

const claimLabels: Record<string, string> = {
  name: "Name",
  location: "Location",
  description: "Overview",
  history: "History",
  cultural_significance: "Cultural significance",
  architecture: "Architecture",
  historical_period: "Historical period",
  timeline_event: "Timeline event",
  protected_status: "Protected-site listing",
  coordinates: "Coordinates",
};

function referenceNumber(sources: HeritageSource[], sourceId: number) {
  return sources.findIndex((source) => source.id === sourceId) + 1;
}

export function CitationLinks({
  sources,
  claim,
  sourceIds,
  recordId,
}: {
  sources: HeritageSource[];
  claim?: string;
  sourceIds?: Array<number | null | undefined>;
  /** When rendered outside the detail page, route citations to their source rows. */
  recordId?: string | number;
}) {
  const matching = sourceIds
    ? sources.filter((source) => sourceIds.includes(source.id))
    : sources.filter((source) => source.claims_supported?.includes(claim ?? ""));

  if (matching.length === 0) return null;

  return (
    <span className="ml-1 inline-flex items-baseline gap-1 whitespace-nowrap">
      {matching.map((source) => {
        const number = referenceNumber(sources, source.id);
        return (
          <a
            key={source.id}
            href={recordId === undefined ? `#source-${source.id}` : `/heritage/${encodeURIComponent(String(recordId))}#source-${source.id}`}
            aria-label={`Source ${number}: ${source.source_title || source.source_name}`}
            className="rounded-sm align-super text-[0.72em] font-semibold text-gold-bright underline decoration-gold/50 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            [{number}]
          </a>
        );
      })}
    </span>
  );
}

export function SourcesAndReferences({ sources }: { sources: HeritageSource[] }) {
  if (sources.length === 0) {
    return <p className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-parchment/55">Source records are not available for this heritage entry yet.</p>;
  }

  return (
    <ol className="space-y-4 pl-7 marker:font-semibold marker:text-gold" aria-label="Sources and references">
      {sources.map((source, index) => {
        let safeUrl: string | null = null;
        try {
          const parsed = new URL(source.source_url);
          if (parsed.protocol === "https:" && !parsed.username && !parsed.password) safeUrl = parsed.href;
        } catch {
          safeUrl = null;
        }
        const supportedClaims = (source.claims_supported ?? [])
          .map((claim) => claimLabels[claim] ?? claim.replaceAll("_", " "));
        const title = source.source_title || source.source_name;
        const coordinateReview = source.claims_supported?.includes("coordinates") && source.review_status === "approved";
        const confidence = source.confidence === null || source.confidence === undefined ? null : Number(source.confidence);

        return (
          <li key={source.id} id={`source-${source.id}`} value={index + 1} className="scroll-mt-24 pl-1">
            <p className="font-medium text-parchment">
              {safeUrl ? (
                <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="break-words text-gold-bright underline decoration-gold/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
                  {title}
                </a>
              ) : title}
            </p>
            {source.publisher ? <p className="mt-1 text-xs text-parchment/65">{source.publisher}</p> : null}
            {source.source_note ? <p className="mt-1 text-xs leading-5 text-parchment/55">{source.source_note}</p> : null}
            {supportedClaims.length ? <p className="mt-1 text-xs text-parchment/50">Supports: {supportedClaims.join(", ")}</p> : null}
            {coordinateReview ? <p className="mt-1 text-xs text-parchment/50">Coordinate review: approved{Number.isFinite(confidence) ? ` · confidence ${confidence!.toFixed(2)}` : " · confidence not recorded"}{source.reviewed_on ? ` · reviewed ${source.reviewed_on.slice(0, 10)}` : ""}</p> : null}
            {source.accessed_on ? <p className="mt-1 text-xs text-parchment/45">Accessed {source.accessed_on.slice(0, 10)}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
