import { CinematicMonument } from "@/components/CinematicMonument";
import { HeritageOS } from "@/components/HeritageOS";
import { LivingAtlas } from "@/components/LivingAtlas";
import { MonumentDissection } from "@/components/MonumentDissection";
import { MuseumInMotion } from "@/components/MuseumInMotion";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import { ThenNow } from "@/components/ThenNow";
import { TheJourney } from "@/components/TheJourney";
import { TimeMachine } from "@/components/TimeMachine";

/** Keeps the existing home experience composed exactly as before. */
export function HomePage() {
  return (
    <div className="min-h-svh bg-ink text-parchment">
      <SiteNav />
      <main>
        <CinematicMonument />
        <LivingAtlas />
        <MuseumInMotion />
        <TimeMachine />
        <MonumentDissection />
        <ThenNow />
        <TheJourney />
        <HeritageOS />
      </main>
      <SiteFooter />
    </div>
  );
}
