import { AlertCircle, Landmark } from "lucide-react";
import { HeritageCard } from "@/components/heritage/HeritageCard";
import type { HeritageView } from "@/lib/heritageAdapter";

type HeritageGridProps = {
  items: HeritageView[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyMessage?: string;
};

export function HeritageGrid({
  items,
  loading = false,
  error = null,
  onRetry,
  emptyMessage = "No heritage places match these filters.",
}: HeritageGridProps) {
  if (loading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading heritage places" aria-busy="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
            <div className="aspect-[4/3] animate-pulse bg-white/5 motion-reduce:animate-none" />
            <div className="space-y-3 p-5">
              <div className="h-6 w-2/3 animate-pulse rounded bg-white/10 motion-reduce:animate-none" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-white/10 motion-reduce:animate-none" />
              <div className="h-12 animate-pulse rounded bg-white/5 motion-reduce:animate-none" />
            </div>
          </div>
        ))}
        <span className="sr-only">Loading the heritage collection.</span>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200/20 bg-red-950/20 p-8 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-gold" aria-hidden="true" />
        <h2 className="font-display mt-3 text-2xl text-parchment">The collection could not load</h2>
        <p className="mt-2 text-sm text-parchment/65">{error}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className="mt-5 rounded-full border border-gold/40 px-4 py-2 text-xs uppercase tracking-[0.15em] text-gold-bright hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
            Try again
          </button>
        ) : null}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.025] px-6 py-14 text-center" role="status">
        <Landmark className="mx-auto h-9 w-9 text-gold/70" aria-hidden="true" />
        <h2 className="font-display mt-4 text-2xl text-parchment">No places found</h2>
        <p className="mt-2 text-sm text-parchment/60">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite">
      {items.map((item, index) => <HeritageCard key={`${item.slug}-${item.routeId}`} item={item} index={index} />)}
    </div>
  );
}
