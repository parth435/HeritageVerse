import { Compass } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { RouterLink } from "@/lib/router";

export function HeritagePageHeader() {
  const { user } = useAuth();

  return (
    <header className="border-b border-white/10 bg-ink/90">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-10">
        <RouterLink to="/" className="flex items-center gap-2 rounded-sm text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
          <Compass className="h-5 w-5 text-gold" aria-hidden="true" />
          <span className="font-display text-xl tracking-wide">HeritageVerse</span>
        </RouterLink>
        <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs uppercase tracking-[0.16em]">
          <RouterLink to="/explore" className="text-gold-bright hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
            Explore
          </RouterLink>
          {user ? (
            <>
              <RouterLink to="/favorites" className="text-parchment/70 hover:text-gold-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Favorites</RouterLink>
              <RouterLink to="/visited" className="text-parchment/70 hover:text-gold-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Visited</RouterLink>
              <RouterLink to="/profile" className="text-parchment/70 hover:text-gold-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Profile</RouterLink>
            </>
          ) : (
            <RouterLink to="/login" className="text-parchment/70 hover:text-gold-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Sign in</RouterLink>
          )}
        </nav>
      </div>
    </header>
  );
}
