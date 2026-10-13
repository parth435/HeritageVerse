import { motion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { getHeritage } from "@/lib/api";
import type { Heritage } from "@/types/heritage";
import { RouterLink } from "@/lib/router";

export function MuseumInMotion() {
  const [museums, setMuseums] = useState<Heritage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const rail = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: rail, offset: ["start end", "end start"] });
  const x = useTransform(scrollYProgress, [0, 1], ["2%", "-2%"]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void getHeritage({ category: "museum", limit: 100 }, { signal: controller.signal })
      .then((response) => {
        if (!active) return;
        setMuseums(response.items);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Museum records could not load.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return (
    <section id="museum" className="overflow-hidden bg-[#120e0b] py-24">
      <div className="px-5 md:px-12">
        <p className="text-xs uppercase tracking-[0.4em] text-gold">02 · Museum in Motion</p>
        <h2 className="font-display mt-3 max-w-3xl text-4xl md:text-6xl">Museums, drawn from the collection.</h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-parchment/60">Only records classified as museums appear here. Collection imagery and visiting details will appear when a museum record has verified, attributed information.</p>
      </div>
      {error ? <p role="alert" className="mx-5 mt-8 rounded-xl border border-red-400/30 bg-red-950/20 p-4 text-sm text-red-100 md:mx-12">{error}</p> : null}
      {loading ? <p role="status" className="px-5 pt-8 text-sm text-parchment/60 md:px-12">Loading museum records…</p> : null}
      {!loading && !error && museums.length === 0 ? <p className="mx-5 mt-8 rounded-xl border border-white/10 p-5 text-sm text-parchment/60 md:mx-12">There are no published museum records in this category yet.</p> : null}
      {museums.length > 0 ? (
        <div ref={rail} className="mt-10">
          <motion.div style={{ x }} className="mx-auto grid max-w-7xl gap-4 px-5 sm:grid-cols-2 lg:grid-cols-3 md:px-12">
            {museums.map((museum, index) => (
              <motion.article key={museum.id} whileHover={{ y: -4 }} transition={{ duration: 0.2 }} className="flex min-h-64 flex-col rounded-3xl border border-white/10 bg-white/[0.035] p-6">
                <p className="text-[10px] uppercase tracking-[0.3em] text-gold">Museum {String(index + 1).padStart(2, "0")}</p>
                <h3 className="font-display mt-4 text-2xl text-parchment">{museum.name}</h3>
                <p className="mt-1 text-xs text-parchment/55">{[museum.district, museum.state].filter(Boolean).join(", ")}</p>
                <p className="mt-4 flex-1 text-sm leading-6 text-parchment/70">{museum.description}</p>
                <RouterLink to={`/heritage/${museum.id}`} className="mt-5 inline-flex w-fit rounded-full border border-gold/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-gold-bright hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Explore museum</RouterLink>
              </motion.article>
            ))}
          </motion.div>
        </div>
      ) : null}
    </section>
  );
}
