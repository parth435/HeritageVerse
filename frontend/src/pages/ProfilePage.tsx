import { useState, type FormEvent } from "react";
import { CircleUserRound, LockKeyhole } from "lucide-react";
import { HeritagePageHeader } from "@/components/heritage/HeritagePageHeader";
import { RouterLink } from "@/lib/router";
import type { User } from "@/types/auth";
import { useAuth } from "@/context/AuthContext";

export function ProfilePage({ user, sessionMessage }: { user: User | null; sessionMessage?: string | null }) {
  const { updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setPending(true); setMessage(null);
    try { await updateProfile(name); setMessage("Profile updated."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not update profile."); }
    finally { setPending(false); }
  }

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
              <p>Update the name shown with your HeritageVerse account. Your email and access level cannot be changed here.</p>
            </div>
            <form onSubmit={saveProfile} className="mt-5 flex flex-wrap items-end gap-3">
              <label className="flex-1 text-xs uppercase tracking-[0.14em] text-parchment/50">Display name<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required className="mt-2 w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-parchment" /></label>
              <button type="submit" disabled={pending} className="rounded-full border border-gold/40 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-gold-bright disabled:opacity-50">{pending ? "Saving…" : "Save profile"}</button>
            </form>
            {message ? <p className="mt-3 text-sm text-parchment/65" role="status">{message}</p> : null}
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
