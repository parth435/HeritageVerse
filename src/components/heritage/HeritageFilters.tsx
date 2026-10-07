import type { ChangeEvent } from "react";
import { Search, X } from "lucide-react";
import type { HeritageCategoryView } from "@/lib/heritageAdapter";

export type HeritageSort = "name-asc" | "name-desc" | "period";

type HeritageFiltersProps = {
  search: string;
  category: string;
  state: string;
  district: string;
  sort: HeritageSort;
  categories: HeritageCategoryView[];
  states: string[];
  districts: string[];
  resultCount: number;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onStateChange: (value: string) => void;
  onDistrictChange: (value: string) => void;
  onSortChange: (value: HeritageSort) => void;
  onReset: () => void;
};

export function HeritageFilters({
  search,
  category,
  state,
  district,
  sort,
  categories,
  states,
  districts,
  resultCount,
  onSearchChange,
  onCategoryChange,
  onStateChange,
  onDistrictChange,
  onSortChange,
  onReset,
}: HeritageFiltersProps) {
  const change = (handler: (value: string) => void) => (event: ChangeEvent<HTMLSelectElement>) => handler(event.target.value);

  return (
    <section aria-label="Filter heritage places" className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 md:p-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.6fr)_repeat(4,minmax(0,1fr))_auto]">
        <label className="relative block">
          <span className="sr-only">Search places</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gold/70" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search places or stories"
            className="h-11 w-full rounded-xl border border-white/10 bg-ink/70 pl-10 pr-3 text-sm text-parchment placeholder:text-parchment/40 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25"
          />
        </label>
        <label className="block">
          <span className="sr-only">Filter by category</span>
          <select value={category} onChange={change(onCategoryChange)} className="h-11 w-full rounded-xl border border-white/10 bg-ink px-3 text-sm text-parchment focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25">
            <option value="">All categories</option>
            {categories.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Filter by state</span>
          <select value={state} onChange={change(onStateChange)} className="h-11 w-full rounded-xl border border-white/10 bg-ink px-3 text-sm text-parchment focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25">
            <option value="">All states and territories</option>
            {states.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Filter by district</span>
          <select value={district} onChange={change(onDistrictChange)} className="h-11 w-full rounded-xl border border-white/10 bg-ink px-3 text-sm text-parchment focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25">
            <option value="">All districts</option>
            {districts.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Sort heritage places</span>
          <select value={sort} onChange={change((value) => onSortChange(value as HeritageSort))} className="h-11 w-full rounded-xl border border-white/10 bg-ink px-3 text-sm text-parchment focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/25">
            <option value="name-asc">Name: A to Z</option>
            <option value="name-desc">Name: Z to A</option>
            <option value="period">Period (A–Z)</option>
          </select>
        </label>
        <button type="button" onClick={onReset} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 text-xs uppercase tracking-[0.12em] text-parchment/75 hover:border-gold/40 hover:text-gold-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
          <X className="h-3.5 w-3.5" aria-hidden="true" /> Reset
        </button>
      </div>
      <p className="mt-4 text-xs text-parchment/50" aria-live="polite">{resultCount} {resultCount === 1 ? "place" : "places"}</p>
    </section>
  );
}
