import { ArrowLeft } from "lucide-react";
import { RouterLink } from "@/lib/router";

export function NotFoundPage() {
  return (
    <main className="grid min-h-svh place-items-center bg-ink px-5 text-parchment">
      <div className="max-w-xl text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">404 · Page not found</p>
        <h1 className="font-display mt-4 text-5xl md:text-6xl">This path has not been mapped.</h1>
        <p className="mt-4 text-sm leading-6 text-parchment/65">The page may have moved, or the address may be incomplete.</p>
        <RouterLink to="/" className="mt-7 inline-flex items-center gap-2 rounded-full bg-gold px-5 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-ink hover:bg-gold-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Return home</RouterLink>
      </div>
    </main>
  );
}
