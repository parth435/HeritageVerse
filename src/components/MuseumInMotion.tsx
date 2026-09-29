import { motion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { monuments } from "@/data/monuments";

export function MuseumInMotion() {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const rail = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: rail,
    offset: ["start end", "end start"],
  });
  const x = useTransform(scrollYProgress, [0, 1], ["8%", "-28%"]);

  return (
    <section id="museum" className="overflow-hidden bg-[#120e0b] py-24">
      <div className="px-5 md:px-12">
        <p className="text-xs uppercase tracking-[0.4em] text-gold">02 · Museum in Motion</p>
        <h2 className="font-display mt-3 max-w-3xl text-4xl md:text-6xl">
          Galleries that refuse to sit still.
        </h2>
      </div>
      <div ref={rail} className="mt-14">
        <motion.div style={{ x }} className="flex w-max gap-6 px-8">
          {monuments.map((m, i) => (
            <motion.figure
              key={m.id}
              onHoverStart={() => setHoverId(m.id)}
              onHoverEnd={() => setHoverId(null)}
              whileHover={{ scale: 1.04 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="relative h-[420px] w-[280px] overflow-hidden rounded-3xl border border-white/10 md:h-[520px] md:w-[360px]"
            >
              <motion.img
                src={m.image}
                alt={m.name}
                animate={{ scale: hoverId === m.id ? 1.12 : 1 }}
                transition={{ duration: 0.7 }}
                className="h-full w-full object-cover"
              />
              <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-ink via-ink/70 to-transparent p-6">
                <p className="text-[10px] uppercase tracking-[0.35em] text-gold">
                  Gallery {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="font-display mt-1 text-2xl">{m.name}</h3>
              </figcaption>
            </motion.figure>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
