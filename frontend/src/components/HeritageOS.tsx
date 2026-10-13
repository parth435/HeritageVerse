import { motion } from "motion/react";
import { Layers3, Landmark, Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getCategories, getHeritage } from "@/lib/api";
import { RouterLink } from "@/lib/router";

type CatalogSummary = { heritage: number; museums: number; categories: number };

export function HeritageOS() {
  const [summary, setSummary] = useState<CatalogSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void Promise.all([
      getHeritage({ limit: 1 }, { signal: controller.signal }),
      getHeritage({ category: "museum", limit: 1 }, { signal: controller.signal }),
      getCategories({ signal: controller.signal }),
    ])
      .then(([heritage, museums, categories]) => {
        if (active) setSummary({ heritage: heritage.pagination.total, museums: museums.pagination.total, categories: categories.length });
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Collection statistics could not load.");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const stats = [
    { icon: Landmark, label: "Published heritage records", value: summary?.heritage },
    { icon: Building2, label: "Published museum records", value: summary?.museums },
    { icon: Layers3, label: "Catalogue categories", value: summary?.categories },
  ];

  return (
    <section id="os" className="bg-ink px-5 py-24 md:px-12">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs uppercase tracking-[0.4em] text-gold">07 · HeritageVerse</p>
        <h2 className="font-display mt-3 text-4xl md:text-6xl">The catalogue, as it stands.</h2>
        <p className="mt-4 max-w-2xl text-parchment/70">Counts come from the published catalogue and its category filters. No visitor totals or live conservation data are shown because those feeds are not connected.</p>
        {error ? <p role="alert" className="mt-6 rounded-xl border border-red-400/30 bg-red-950/20 p-4 text-sm text-red-100">{error}</p> : null}
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((stat, index) => (
            <motion.article key={stat.label} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.08 }} className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <stat.icon className="h-5 w-5 text-gold" aria-hidden="true" />
              <p className="mt-4 font-display text-4xl text-parchment">{stat.value ?? "—"}</p>
              <p className="mt-2 text-xs uppercase tracking-widest text-parchment/50">{stat.label}</p>
            </motion.article>
          ))}
        </div>
        <RouterLink to="/explore" className="mt-8 inline-flex rounded-full border border-gold/40 px-5 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-gold-bright hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Browse the catalogue</RouterLink>
      </div>
    </section>
  );
}
