import { motion } from "motion/react";
import { Map, MapPinned, Route } from "lucide-react";
import { RouterLink } from "@/lib/router";

const steps = [
  { icon: Map, title: "Find verified places", copy: "Search the published catalogue and check a site's sources and location." },
  { icon: MapPinned, title: "Build your itinerary", copy: "Save a journey, add heritage stops, then edit the stop order or notes." },
  { icon: Route, title: "Review route options", copy: "Open your saved stops and use the linked map directions when coordinates are available." },
];

export function TheJourney() {
  return (
    <section id="journey" className="relative bg-[#120e0b] px-5 py-24 md:px-12">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs uppercase tracking-[0.4em] text-gold">06 · The Journey</p>
        <h2 className="font-display mt-3 text-4xl md:text-6xl">Plan a route through real places.</h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-parchment/65">Create and manage saved journeys with the HeritageVerse catalogue. Route distance and duration are shown only when a route provider and verified coordinates are available.</p>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <motion.li key={step.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.08 }} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
              <step.icon className="h-5 w-5 text-gold" aria-hidden="true" />
              <h3 className="font-display mt-4 text-xl text-parchment">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-parchment/60">{step.copy}</p>
            </motion.li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap gap-3">
          <RouterLink to="/journeys" className="inline-flex rounded-full bg-gold px-5 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-ink hover:bg-gold-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Open journey planner</RouterLink>
          <RouterLink to="/explore" className="inline-flex rounded-full border border-gold/40 px-5 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-gold-bright hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Explore sites</RouterLink>
        </div>
      </div>
    </section>
  );
}
