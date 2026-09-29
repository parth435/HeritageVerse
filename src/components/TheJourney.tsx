import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { journeyStops } from "@/data/monuments";

export function TheJourney() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.8", "end 0.2"],
  });
  const pathLength = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section id="journey" ref={ref} className="relative bg-[#120e0b] px-5 py-24 md:px-12">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs uppercase tracking-[0.4em] text-gold">06 · The Journey</p>
        <h2 className="font-display mt-3 text-4xl md:text-6xl">A pilgrim line through time.</h2>

        <div className="relative mt-16">
          <svg
            className="absolute left-4 top-0 h-full w-8 md:left-1/2 md:-ml-4"
            viewBox="0 0 8 1000"
            preserveAspectRatio="none"
          >
            <motion.line
              x1="4"
              y1="0"
              x2="4"
              y2="1000"
              stroke="#d4af7a"
              strokeWidth="2"
              style={{ pathLength }}
            />
          </svg>
          <ol className="space-y-16">
            {journeyStops.map((stop, i) => (
              <motion.li
                key={stop.year}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6, delay: i * 0.05 }}
                className={`relative pl-14 md:w-[46%] md:pl-0 ${
                  i % 2 === 0 ? "md:mr-auto md:pr-12 md:text-right" : "md:ml-auto md:pl-12"
                }`}
              >
                <span className="text-xs uppercase tracking-[0.3em] text-gold">
                  {stop.year}
                </span>
                <h3 className="font-display mt-2 text-3xl">{stop.title}</h3>
                <p className="mt-2 text-parchment/70">{stop.copy}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
