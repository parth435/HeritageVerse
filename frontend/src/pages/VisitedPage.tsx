import { useEffect, useState } from "react";
import { Compass, MapPin } from "lucide-react";
import { HeritageGrid } from "@/components/heritage/HeritageGrid";
import { HeritagePageHeader } from "@/components/heritage/HeritagePageHeader";
import { getVisited } from "@/lib/api";
import { heritageToView, type HeritageView } from "@/lib/heritageAdapter";
import { RouterLink } from "@/lib/router";

export function VisitedPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [items, setItems] = useState<HeritageView[]>([]);
  const [loading, setLoading] = useState(isAuthenticated);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) { setItems([]); setLoading(false); return; }
    const controller = new AbortController(); let active = true;
    setLoading(true); setError(null);
    void getVisited({ signal: controller.signal })
      .then((visited) => { if (active) setItems(visited.map((place) => heritageToView(place.heritage))); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Visited places could not load."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [isAuthenticated, retryKey]);

  return (
    <div className="min-h-svh bg-ink text-parchment">
      <HeritagePageHeader />
      <main className="mx-auto max-w-5xl px-5 py-12 md:px-10 md:py-16">
        <p className="text-[10px] uppercase tracking-[0.32em] text-gold">Your travels</p>
        <h1 className="font-display mt-3 text-5xl md:text-6xl">Visited places</h1>
        {!isAuthenticated ? <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.035] px-6 py-12 text-center" role="status">
          <MapPin className="mx-auto h-9 w-9 text-gold/75" aria-hidden="true" />
          <h2 className="font-display mt-4 text-2xl text-parchment">Sign in to see your visits</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-parchment/60">
            Sign in to see the places you have marked as visited.
          </p>
          <RouterLink to="/login" className="mt-6 inline-flex items-center gap-2 rounded-full border border-gold/40 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-gold-bright hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
            <Compass className="h-4 w-4" aria-hidden="true" /> Sign in
          </RouterLink>
        </section> : <section className="mt-8"><HeritageGrid items={items} loading={loading} error={error} onRetry={() => setRetryKey((value) => value + 1)} emptyMessage="Mark places as visited from their heritage pages." /></section>}
      </main>
    </div>
  );
}
