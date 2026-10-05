import { useEffect, useMemo, useState } from "react";
import { Compass } from "lucide-react";
import { HeritageFilters, type HeritageSort } from "@/components/heritage/HeritageFilters";
import { HeritageGrid } from "@/components/heritage/HeritageGrid";
import { HeritagePageHeader } from "@/components/heritage/HeritagePageHeader";
import { listFallbackHeritage } from "@/lib/heritageDataProvider";
import type { HeritageCategoryView, HeritageView } from "@/lib/heritageAdapter";

export function ExplorePage() {
  const [items, setItems] = useState<HeritageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [state, setState] = useState("");
  const [sort, setSort] = useState<HeritageSort>("name-asc");

  async function loadCollection() {
    setLoading(true);
    setError(null);
    try {
      // Temporary provider is local-only until public heritage APIs are implemented.
      setItems(await listFallbackHeritage());
    } catch {
      setError("The temporary local collection could not be read. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCollection();
  }, []);

  const categories = useMemo<HeritageCategoryView[]>(() => {
    const bySlug = new Map<string, HeritageCategoryView>();
    items.forEach((item) => {
      if (item.category) bySlug.set(item.category.slug, item.category);
    });
    return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const states = useMemo(
    () => [...new Set(items.map((item) => item.state).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)),
    [items],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const result = items.filter((item) => {
      const matchesSearch = !query || [item.name, item.description, item.location, item.historicalPeriod]
        .some((value) => value?.toLocaleLowerCase().includes(query));
      const matchesCategory = !category || item.category?.slug === category;
      const matchesState = !state || item.state === state;
      return matchesSearch && matchesCategory && matchesState;
    });

    return result.sort((a, b) => {
      if (sort === "name-desc") return b.name.localeCompare(a.name);
      if (sort === "period") {
        return (a.historicalPeriod ?? "").localeCompare(b.historicalPeriod ?? "") || a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });
  }, [items, search, category, state, sort]);

  function resetFilters() {
    setSearch("");
    setCategory("");
    setState("");
    setSort("name-asc");
  }

  return (
    <div className="min-h-svh bg-ink text-parchment">
      <HeritagePageHeader />
      <main className="mx-auto max-w-7xl px-5 pb-20 pt-12 md:px-10 md:pt-16">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.35em] text-gold">
            <Compass className="h-4 w-4" aria-hidden="true" /> A living collection
          </p>
          <h1 className="font-display mt-4 text-5xl leading-[0.98] text-parchment md:text-7xl">Explore the heritage atlas.</h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-parchment/65 md:text-base">
            Find places by name, region, or architectural tradition. The collection below currently uses the existing local monument set while heritage APIs are being prepared.
          </p>
        </div>

        <div className="mt-9">
          <HeritageFilters
            search={search}
            category={category}
            state={state}
            sort={sort}
            categories={categories}
            states={states}
            resultCount={loading ? 0 : filtered.length}
            onSearchChange={setSearch}
            onCategoryChange={setCategory}
            onStateChange={setState}
            onSortChange={setSort}
            onReset={resetFilters}
          />
        </div>

        <div className="mt-7">
          <HeritageGrid
            items={filtered}
            loading={loading}
            error={error}
            onRetry={() => void loadCollection()}
            emptyMessage="Try another search or clear one of the filters."
          />
        </div>
      </main>
    </div>
  );
}
