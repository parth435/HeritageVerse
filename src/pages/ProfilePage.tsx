import { CircleUserRound, LockKeyhole } from "lucide-react";
import { HeritagePageHeader } from "@/components/heritage/HeritagePageHeader";
import { RouterLink } from "@/lib/router";
import type { User } from "@/types/auth";

export function ProfilePage({ user, sessionMessage }: { user: User | null; sessionMessage?: string | null }) {
  return (
    <div className="min-h-svh bg-ink text-parchment">
      <HeritagePageHeader />
      <main className="mx-auto max-w-5xl px-5 py-12 md:px-10 md:py-16">
        <p className="text-[10px] uppercase tracking-[0.32em] text-gold">Your account</p>
        <h1 className="font-display mt-3 text-5xl text-parchment md:text-6xl">Profile</h1>
        {user ? (
          <section className="mt-8 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.035] p-6 md:p-8" aria-labelledby="profile-card-title">
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold"><CircleUserRound className="h-7 w-7" aria-hidden="true" /></span>
              <div>
                <h2 id="profile-card-title" className="font-display text-2xl text-parchment">{user.name}</h2>
                <p className="mt-1 text-sm text-parchment/60">{user.email}</p>
              </div>
            </div>
            <div className="mt-6 flex gap-3 rounded-xl border border-white/10 bg-ink/60 p-4 text-sm text-parchment/65">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
              <p>Your current session provides these account details. Profile editing will be available when a profile API is implemented; changes are not being saved here.</p>
            </div>
          </section>
        ) : (
          <section className="mt-8 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.035] p-6" role="status">
            <p className="text-parchment/70">{sessionMessage || "Sign in to view the account details available in your current session."}</p>
            <RouterLink to="/login" className="mt-4 inline-flex rounded-full bg-gold px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink hover:bg-gold-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Sign in</RouterLink>
          </section>
        )}
      </main>
    </div>
  );
}
