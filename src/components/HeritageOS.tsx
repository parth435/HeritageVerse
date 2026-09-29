import { motion } from "motion/react";
import { Activity, Landmark, Shield, Users } from "lucide-react";
import { useState } from "react";
import { monuments } from "@/data/monuments";

const stats = [
  { icon: Landmark, label: "Monitored sites", value: "6" },
  { icon: Shield, label: "UNESCO locked", value: "5" },
  { icon: Users, label: "Annual pilgrims", value: "28M+" },
  { icon: Activity, label: "Conservation pulses", value: "Live" },
];

export function HeritageOS() {
  const [selected, setSelected] = useState(monuments[0].id);
  const site = monuments.find((m) => m.id === selected) ?? monuments[0];

  return (
    <section id="os" className="bg-ink px-5 py-24 md:px-12">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs uppercase tracking-[0.4em] text-gold">07 · HeritageVerse</p>
        <h2 className="font-display mt-3 text-4xl md:text-6xl">
          The dashboard of a civilisation.
        </h2>
        <p className="mt-4 max-w-2xl text-parchment/70">
          Not a brochure. An interface — sites as processes, material as status,
          visitors as load.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="rounded-2xl border border-white/10 bg-white/5 p-5"
            >
              <s.icon className="h-5 w-5 text-gold" />
              <p className="mt-4 font-display text-3xl">{s.value}</p>
              <p className="text-xs uppercase tracking-widest text-parchment/50">
                {s.label}
              </p>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 overflow-hidden rounded-[2rem] border border-white/10">
          <div className="grid lg:grid-cols-[240px_1fr]">
            <aside className="border-b border-white/10 bg-stone-950 p-4 lg:border-b-0 lg:border-r">
              <p className="mb-3 text-[10px] uppercase tracking-[0.3em] text-parchment/40">
                Processes
              </p>
              {monuments.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelected(m.id)}
                  className={`mb-1 block w-full rounded-xl px-3 py-2 text-left text-sm ${
                    selected === m.id
                      ? "bg-gold/15 text-gold-bright"
                      : "text-parchment/70 hover:bg-white/5"
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </aside>
            <div className="relative min-h-[320px]">
              <motion.img
                key={site.id}
                src={site.image}
                alt={site.name}
                initial={{ opacity: 0, scale: 1.06 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6 }}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-linear-to-t from-ink via-ink/20 to-transparent" />
              <div className="absolute bottom-0 grid w-full gap-3 p-6 sm:grid-cols-3">
                <HudChip label="Era" value={site.era} />
                <HudChip label="Material" value={site.material} />
                <HudChip label="Status" value={site.unesco ? "Protected" : "Living shrine"} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HudChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-ink/70 px-4 py-3 backdrop-blur-md">
      <p className="text-[10px] uppercase tracking-[0.25em] text-gold">{label}</p>
      <p className="mt-1 text-sm text-parchment">{value}</p>
    </div>
  );
}
