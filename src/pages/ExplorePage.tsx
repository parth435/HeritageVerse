import { useEffect, useMemo, useState } from "react";
import { Compass } from "lucide-react";
import { HeritageFilters, type HeritageSort } from "@/components/heritage/HeritageFilters";
import { HeritageGrid } from "@/components/heritage/HeritageGrid";
import { HeritagePageHeader } from "@/components/heritage/HeritagePageHeader";
import { getCategories, getHeritage } from "@/lib/api";
import type { HeritageCategoryView, HeritageView } from "@/lib/heritageAdapter";
import { heritageToView } from "@/lib/heritageAdapter";

const PAGE_SIZE = 24;

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The heritage collection could not load. Please try again.";
}

export function ExplorePage() {
  const [items, setItems] = useState<HeritageView[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<HeritageCategoryView[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [sort, setSort] = useState<HeritageSort>("name-asc");
  const [offset, setOffset] = useState(0);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setOffset(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void getCategories({ signal: controller.signal })
      .then((results) => {
        if (!active) return;
        setCategories(results);
        setCategoriesError(null);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setCategoriesError(errorMessage(reason));
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [retryKey]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const append = offset > 0;
    setLoading(!append);
    setLoadingMore(append);
    setError(null);

    void getHeritage(
      {
        q: debouncedSearch,
        category,
        state,
        district,
        limit: PAGE_SIZE,
        offset,
      },
      { signal: controller.signal },
    )
      .then((response) => {
        if (!active) return;
        const page = response.items.map(heritageToView);
        setItems((current) => append ? [...current, ...page] : page);
        setTotal(response.pagination.total);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(errorMessage(reason));
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setLoadingMore(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [debouncedSearch, category, state, district, offset, retryKey]);

  const states = useMemo(
    () => [...new Set(items.map((item) => item.state).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)),
    [items],
  );
  const districts = useMemo(
    () => [...new Set(items.map((item) => item.district).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)),
    [items],
  );
  const visibleItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (sort === "name-desc") return b.name.localeCompare(a.name);
      if (sort === "period") {
        return (a.historicalPeriod ?? "").localeCompare(b.historicalPeriod ?? "") || a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });
  }, [items, sort]);

  function resetFilters() {
    setSearch("");
    setDebouncedSearch("");
    setCategory("");
    setState("");
    setDistrict("");
    setSort("name-asc");
    setOffset(0);
  }

  function updateCategory(value: string) {
    setCategory(value);
    setOffset(0);
  }

  function updateState(value: string) {
    setState(value);
    setDistrict("");
    setOffset(0);
  }

  function updateDistrict(value: string) {
    setDistrict(value);
    setOffset(0);
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
            Find places by name, region, or architectural tradition. Search and filters use the published heritage collection.
          </p>
        </div>

        {categoriesError ? (
          <p role="status" className="mt-6 rounded-xl border border-gold/20 bg-gold/5 px-4 py-3 text-sm text-parchment/70">
            Category options could not load. You can still search and filter by region. {categoriesError}
          </p>
        ) : null}

        <div className="mt-9">
          <HeritageFilters
            search={search}
            category={category}
            state={state}
            district={district}
            sort={sort}
            categories={categories}
            states={states}
            districts={districts}
            resultCount={loading ? 0 : total}
            onSearchChange={setSearch}
            onCategoryChange={updateCategory}
            onStateChange={updateState}
            onDistrictChange={updateDistrict}
            onSortChange={setSort}
            onReset={resetFilters}
          />
        </div>

        <div className="mt-7">
          <HeritageGrid
            items={visibleItems}
            loading={loading && offset === 0}
            error={error}
            onRetry={() => setRetryKey((current) => current + 1)}
            emptyMessage="Try another search or clear one of the filters."
          />
        </div>

        {!loading && !error && items.length < total ? (
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => setOffset(items.length)}
              disabled={loadingMore}
              className="rounded-full border border-gold/40 px-6 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-gold-bright hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-60"
            >
              {loadingMore ? "Loading places…" : `Load more places (${items.length} of ${total})`}
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
