import { Compass } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-ink px-5 py-12 md:px-12">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-gold" />
          <span className="font-display text-lg">HeritageVerse</span>
        </div>
        <p className="text-sm text-parchment/50">
          A cinematic atlas of Indian monuments — built as React, not a brochure.
        </p>
      </div>
    </footer>
  );
}
