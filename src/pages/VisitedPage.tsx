import { Compass, MapPin } from "lucide-react";
import { HeritagePageHeader } from "@/components/heritage/HeritagePageHeader";
import { RouterLink } from "@/lib/router";

export function VisitedPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <div className="min-h-svh bg-ink text-parchment">
      <HeritagePageHeader />
      <main className="mx-auto max-w-5xl px-5 py-12 md:px-10 md:py-16">
        <p className="text-[10px] uppercase tracking-[0.32em] text-gold">Your travels</p>
        <h1 className="font-display mt-3 text-5xl md:text-6xl">Visited places</h1>
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.035] px-6 py-12 text-center" role="status">
          <MapPin className="mx-auto h-9 w-9 text-gold/75" aria-hidden="true" />
          <h2 className="font-display mt-4 text-2xl text-parchment">{isAuthenticated ? "Visit tracking is coming soon" : "Sign in to see your visits"}</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-parchment/60">
            {isAuthenticated
              ? "Visited places are not connected to a backend yet. No visit history is being stored locally."
              : "Sign in to see your visit history after the visited-places service is available."}
          </p>
          <RouterLink to={isAuthenticated ? "/explore" : "/login"} className="mt-6 inline-flex items-center gap-2 rounded-full border border-gold/40 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-gold-bright hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
            <Compass className="h-4 w-4" aria-hidden="true" /> {isAuthenticated ? "Explore places" : "Sign in"}
          </RouterLink>
        </section>
      </main>
    </div>
  );
}
