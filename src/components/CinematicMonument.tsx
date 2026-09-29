import { motion, useScroll, useTransform } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";

export function CinematicMonument() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const imageY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const titleY = useTransform(scrollYProgress, [0, 1], ["0%", "40%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <section
      id="top"
      ref={ref}
      className="relative h-[100svh] overflow-hidden bg-ink"
    >
      <motion.div style={{ y: imageY }} className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=2400&q=80"
          alt="Taj Mahal at dusk"
          className="h-[120%] w-full object-cover"
        />
        <div className="absolute inset-0 bg-linear-to-b from-ink/40 via-ink/20 to-ink" />
        <div className="absolute inset-0 bg-linear-to-r from-ink/70 via-transparent to-ink/50" />
      </motion.div>

      <motion.div
        style={{ y: titleY, opacity }}
        className="relative z-10 flex h-full flex-col justify-end px-6 pb-20 pt-28 md:px-16 lg:px-24"
      >
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="mb-4 text-xs uppercase tracking-[0.45em] text-gold"
        >
          A cinema of stone · India
        </motion.p>
        <motion.h1
          initial={{ clipPath: "inset(100% 0 0 0)", y: 40 }}
          animate={{ clipPath: "inset(0% 0 0 0)", y: 0 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          className="font-display max-w-5xl text-5xl leading-[0.9] text-parchment sm:text-7xl lg:text-8xl"
        >
          Monuments
          <span className="italic text-gold-bright"> still breathing.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 1 }}
          className="mt-6 max-w-xl text-base text-parchment/75 md:text-lg"
        >
          Scroll through HeritageVerse — atlas, museum, time machine, and the
          anatomy of a mausoleum.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1 }}
          className="mt-8 flex flex-wrap gap-3"
        >
          <Button asChild>
            <a href="#atlas">Enter the atlas</a>
          </Button>
          <Button variant="outline" asChild>
            <a href="#os">Open the Verse</a>
          </Button>
        </motion.div>
      </motion.div>

      <motion.a
        href="#atlas"
        animate={{ y: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
        className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-gold"
      >
        <ChevronDown className="h-7 w-7" />
      </motion.a>
    </section>
  );
}
