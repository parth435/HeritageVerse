import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { layers } from "@/data/monuments";

export function MonumentDissection() {
  const [active, setActive] = useState(layers[2].id);
  const layer = layers.find((l) => l.id === active) ?? layers[2];

  return (
    <section id="dissection" className="bg-[#0a0807] px-5 py-24 md:px-12">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-gold">
            04 · Monument Dissection
          </p>
          <h2 className="font-display mt-3 text-4xl md:text-6xl">
            Explode the mausoleum.
          </h2>
          <p className="mt-4 text-parchment/70">
            Hover each stratum. Architecture is a stack: floodplain, garden,
            tomb, dome, finial.
          </p>
          <ul className="mt-8 space-y-2">
            {layers.map((item, i) => (
              <li key={item.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(item.id)}
                  onFocus={() => setActive(item.id)}
                  onClick={() => setActive(item.id)}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left ${
                    active === item.id
                      ? "border-gold bg-gold/10 text-gold-bright"
                      : "border-white/10 text-parchment/70 hover:border-gold/40"
                  }`}
                >
                  <span className="font-display text-xl">{item.label}</span>
                  <span className="text-xs tracking-widest">0{i + 1}</span>
                </button>
              </li>
            ))}
          </ul>
          <AnimatePresence mode="wait">
            <motion.p
              key={layer.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-6 text-parchment/80"
            >
              {layer.note}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="relative mx-auto h-[560px] w-full max-w-md">
          <img
            src="https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=900&q=80"
            alt="Taj Mahal for dissection"
            className="h-full w-full rounded-[2rem] object-cover opacity-40"
          />
          {layers.map((item, i) => (
            <motion.button
              key={item.id}
              type="button"
              onHoverStart={() => setActive(item.id)}
              onClick={() => setActive(item.id)}
              animate={{
                x: active === item.id ? 18 : 0,
                scale: active === item.id ? 1.04 : 1,
                opacity: active === item.id ? 1 : 0.55,
              }}
              className="absolute left-[12%] right-[12%] overflow-hidden rounded-xl border border-gold/50"
              style={{ top: `${item.y}%`, height: `${item.height}%` }}
            >
              <div
                className="h-full w-full bg-cover bg-center"
                style={{
                  backgroundImage:
                    "url(https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=900&q=80)",
                  backgroundPosition: `center ${item.y}%`,
                }}
              />
              <span className="absolute left-3 top-2 text-[10px] uppercase tracking-widest text-gold">
                Layer {i + 1}
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}
