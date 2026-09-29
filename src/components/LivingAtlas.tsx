import { AnimatePresence, motion } from "motion/react";
import { MapPin } from "lucide-react";
import { useState } from "react";
import { monuments, type Monument } from "@/data/monuments";

export function LivingAtlas() {
  const [active, setActive] = useState<Monument>(monuments[0]);

  return (
    <section id="atlas" className="relative bg-ink px-5 py-24 md:px-12">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs uppercase tracking-[0.4em] text-gold">01 · Living Atlas</p>
        <h2 className="font-display mt-3 text-4xl text-parchment md:text-6xl">
          A subcontinent, pinned in light.
        </h2>
        <p className="mt-4 max-w-2xl text-parchment/70">
          Hover a site. The atlas is not a map of ruins — it is a live index of
          material, empire, and memory.
        </p>

        <div className="mt-12 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="relative aspect-4/5 overflow-hidden rounded-3xl border border-white/10 bg-[#1a1510] md:aspect-5/4">
            <div className="absolute inset-6 rounded-[2rem] border border-gold/20" />
            <svg viewBox="0 0 100 100" className="h-full w-full opacity-30">
              <path
                d="M48 8 C52 10 62 14 68 22 C74 30 78 38 80 48 C82 60 76 70 70 78 C62 88 52 94 46 96 C38 92 32 84 28 74 C22 62 22 50 26 38 C30 24 38 12 48 8Z"
                fill="none"
                stroke="#d4af7a"
                strokeWidth="0.4"
              />
            </svg>
            {monuments.map((m) => (
              <button
                key={m.id}
                type="button"
                onMouseEnter={() => setActive(m)}
                onFocus={() => setActive(m)}
                onClick={() => setActive(m)}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${m.x}%`, top: `${m.y}%` }}
                aria-label={m.name}
              >
                <motion.span
                  animate={{
                    scale: active.id === m.id ? 1.25 : 1,
                    opacity: 1,
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-gold bg-ink/80 text-gold"
                >
                  <MapPin className="h-4 w-4" />
                </motion.span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.article
              key={active.id}
              initial={{ opacity: 0, y: 24, clipPath: "inset(8% 8% 8% 8%)" }}
              animate={{ opacity: 1, y: 0, clipPath: "inset(0% 0% 0% 0%)" }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden rounded-3xl border border-white/10 bg-stone-950"
            >
              <div className="relative h-64">
                <motion.img
                  layoutId={`atlas-${active.id}`}
                  src={active.image}
                  alt={active.name}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-linear-to-t from-ink to-transparent" />
              </div>
              <div className="p-6">
                <p className="text-xs uppercase tracking-[0.3em] text-gold">
                  {active.era} · {active.year}
                </p>
                <h3 className="font-display mt-2 text-3xl">{active.name}</h3>
                <p className="text-sm text-parchment/60">{active.place}</p>
                <p className="mt-4 text-parchment/80">{active.blurb}</p>
                <p className="mt-4 text-xs uppercase tracking-widest text-gold/80">
                  {active.material}
                  {active.unesco ? " · UNESCO" : ""}
                </p>
              </div>
            </motion.article>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
