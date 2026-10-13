import { useEffect, useState } from "react";
import { Bookmark, Compass } from "lucide-react";
import { HeritageGrid } from "@/components/heritage/HeritageGrid";
import { HeritagePageHeader } from "@/components/heritage/HeritagePageHeader";
import { ApiRequestError, getFavorites } from "@/lib/api";
import { heritageToView, type HeritageView } from "@/lib/heritageAdapter";
import { RouterLink } from "@/lib/router";

export function FavoritesPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [items, setItems] = useState<HeritageView[]>([]);
  const [loading, setLoading] = useState(isAuthenticated);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) {
      setItems([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    void getFavorites({ signal: controller.signal })
      .then((favorites) => {
        if (active) setItems(favorites.map((favorite) => heritageToView(favorite.heritage)));
      })
      .catch((reason: unknown) => {
        if (!active) return;
        if (reason instanceof ApiRequestError && reason.status === 401) {
          setError("Your session has expired. Please sign in again to view your favorites.");
          return;
        }
        setError(reason instanceof Error ? reason.message : "Favorites could not load. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [isAuthenticated, retryKey]);

  return (
    <div className="min-h-svh bg-ink text-parchment">
      <HeritagePageHeader />
      <main className="mx-auto max-w-5xl px-5 py-12 md:px-10 md:py-16">
        <p className="text-[10px] uppercase tracking-[0.32em] text-gold">Your collection</p>
        <h1 className="font-display mt-3 text-5xl md:text-6xl">Favorites</h1>
        {!isAuthenticated ? (
          <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.035] px-6 py-12 text-center" role="status">
            <Bookmark className="mx-auto h-9 w-9 text-gold/75" aria-hidden="true" />
            <h2 className="font-display mt-4 text-2xl text-parchment">Sign in to see your collection</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-parchment/60">Your saved places are available after you sign in.</p>
            <RouterLink to="/login" className="mt-6 inline-flex items-center gap-2 rounded-full border border-gold/40 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-gold-bright hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
              <Compass className="h-4 w-4" aria-hidden="true" /> Sign in
            </RouterLink>
          </section>
        ) : (
          <section className="mt-8">
            <HeritageGrid
              items={items}
              loading={loading}
              error={error}
              onRetry={() => setRetryKey((current) => current + 1)}
              emptyMessage="Save places from their heritage pages to build your collection."
            />
            {!loading && !error && items.length === 0 ? (
              <div className="mt-6 text-center">
                <RouterLink to="/explore" className="inline-flex items-center gap-2 rounded-full border border-gold/40 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-gold-bright hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
                  <Compass className="h-4 w-4" aria-hidden="true" /> Explore places
                </RouterLink>
              </div>
            ) : null}
          </section>
        )}
      </main>
    </div>
  );
}
