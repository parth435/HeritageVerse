import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { monuments } from "@/data/monuments";

export function ThenNow() {
  const [siteIndex, setSiteIndex] = useState(0);
  const [wipe, setWipe] = useState(52);
  const site = monuments[siteIndex];

  return (
    <section id="then-now" className="bg-ink px-5 py-24 md:px-12">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs uppercase tracking-[0.4em] text-gold">05 · Then / Now</p>
        <h2 className="font-display mt-3 text-4xl md:text-6xl">
          One stone, two centuries.
        </h2>
        <div className="mt-6 flex flex-wrap gap-2">
          {monuments.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSiteIndex(i)}
              className={`rounded-full border px-4 py-2 text-xs uppercase tracking-widest ${
                i === siteIndex
                  ? "border-gold bg-gold text-ink"
                  : "border-white/15 text-parchment/70 hover:border-gold/50"
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>

        <div className="relative mt-10 aspect-16/10 overflow-hidden rounded-[2rem] border border-white/10">
          <img
            src={site.thenImage}
            alt={`${site.name} then`}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - wipe}% 0 0)` }}
          >
            <img
              src={site.nowImage}
              alt={`${site.name} now`}
              className="h-full w-full object-cover"
            />
          </div>
          <div
            className="absolute inset-y-0 w-0.5 bg-gold"
            style={{ left: `${wipe}%` }}
          />
          <span className="absolute left-5 top-5 rounded-full bg-ink/70 px-3 py-1 text-[10px] uppercase tracking-widest">
            Then
          </span>
          <span className="absolute right-5 top-5 rounded-full bg-ink/70 px-3 py-1 text-[10px] uppercase tracking-widest">
            Now
          </span>
        </div>
        <div className="mt-8">
          <Slider
            min={4}
            max={96}
            step={1}
            value={[wipe]}
            onValueChange={(v) => setWipe(v[0] ?? 52)}
          />
        </div>
      </div>
    </section>
  );
}
