import { motion } from "motion/react";
import { Clock } from "lucide-react";
import { useMemo, useState } from "react";
import { Slider } from "@/components/ui/slider";

const frames = [
  {
    year: 1192,
    title: "Foundation of a tower",
    copy: "The first storey of Qutub Minar rises. A new skyline is written in sandstone.",
    image:
      "https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=1600&q=80",
  },
  {
    year: 1250,
    title: "Chariot of Surya",
    copy: "Konark is conceived as a machine of time — wheels that are calendars.",
    image:
      "https://images.unsplash.com/photo-1627894483216-2138af692e32?auto=format&fit=crop&w=1600&q=80",
  },
  {
    year: 1510,
    title: "Imperial Hampi",
    copy: "Vijayanagara’s bazaars roar. Stone pillars become a city of percussion.",
    image:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSD01hxHwFQbbp_rvjlKbxChgKCB8FOaCW2N3nOeHjGcZ55zXfQJ8t-kL8&s=10",
  },
  {
    year: 1653,
    title: "The marble is complete",
    copy: "The Taj Mahal’s dome is closed. A private grief becomes a public geometry.",
    image:
      "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1600&q=80",
  },
  {
    year: 1983,
    title: "Inscribed in the world",
    copy: "UNESCO recognition turns conservation into a shared protocol.",
    image:
      "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1600&q=80",
  },
  {
    year: 2026,
    title: "HeritageVerse",
    copy: "Sites are no longer only visited. They are read, compared, dissected, replayed.",
    image:
      "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=1600&q=80",
  },
];

export function TimeMachine() {
  const [index, setIndex] = useState(3);
  const frame = frames[index];
  const yearLabel = useMemo(() => frame.year, [frame]);

  return (
    <section id="time" className="bg-ink px-5 py-24 md:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-gold">03 · Time Machine</p>
            <h2 className="font-display mt-3 text-4xl md:text-6xl">Drag the centuries.</h2>
          </div>
          <div className="flex items-center gap-2 text-gold">
            <Clock className="h-5 w-5" />
            <motion.span
              key={yearLabel}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="font-display text-4xl md:text-5xl"
            >
              {yearLabel}
            </motion.span>
          </div>
        </div>

        <div className="relative mt-10 overflow-hidden rounded-[2rem] border border-white/10">
          <motion.img
            key={frame.image}
            src={frame.image}
            alt={frame.title}
            initial={{ scale: 1.12, opacity: 0, clipPath: "inset(0 40% 0 40%)" }}
            animate={{ scale: 1, opacity: 1, clipPath: "inset(0 0% 0 0%)" }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="h-[52vh] w-full object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-t from-ink via-ink/30 to-transparent" />
          <motion.div
            key={frame.title}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="absolute bottom-0 max-w-xl p-8"
          >
            <h3 className="font-display text-3xl">{frame.title}</h3>
            <p className="mt-2 text-parchment/75">{frame.copy}</p>
          </motion.div>
        </div>

        <div className="mt-10">
          <Slider
            min={0}
            max={frames.length - 1}
            step={1}
            value={[index]}
            onValueChange={(v) => setIndex(v[0] ?? 0)}
          />
          <div className="mt-4 flex justify-between text-[10px] uppercase tracking-[0.25em] text-parchment/50">
            {frames.map((f) => (
              <span key={f.year}>{f.year}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
