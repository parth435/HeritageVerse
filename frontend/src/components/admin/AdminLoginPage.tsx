import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Eye, EyeOff, KeyRound, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { RouterLink, useNavigate } from "@/lib/router";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { User } from "@/types/auth";

function isActiveAdministrator(user: User | null) {
  return user?.role?.toLowerCase() === "admin" && user.status?.toUpperCase() === "ACTIVE";
}

export function AdminLoginPage({ notice }: { notice?: string | null }) {
  const { user, signIn, signOut } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Enter your administrator email and password.");
      return;
    }

    setPending(true);
    try {
      const signedInUser = await signIn(email, password);
      if (!isActiveAdministrator(signedInUser)) {
        setError("This account is signed in, but it does not have active administrator access.");
        return;
      }
      navigate("/admin", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in could not be completed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const activeAdmin = isActiveAdministrator(user);

  return (
    <main className="relative isolate min-h-svh overflow-hidden bg-ink text-parchment">
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6"><ThemeToggle compact /></div>
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        <img
          src="https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1800&q=80"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center opacity-35"
        />
        <div className="absolute inset-0 bg-linear-to-r from-ink/95 via-ink/80 to-ink/95" />
        <div className="absolute inset-0 bg-linear-to-t from-ink via-transparent to-ink/60" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_22%_44%,rgba(214,160,78,0.15),transparent_42%)]" />
      </div>

      <div className="mx-auto grid min-h-svh max-w-7xl lg:grid-cols-[1.08fr_0.92fr]">
        <section className="flex flex-col justify-between px-6 pb-8 pt-7 sm:px-10 lg:px-14 lg:py-12">
          <RouterLink to="/" className="inline-flex w-fit items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
            <span className="grid h-11 w-11 place-items-center rounded-2xl border border-gold/30 bg-gold/[0.08] font-display text-2xl text-gold">H</span>
            <span>
              <span className="block font-display text-xl leading-none">HeritageVerse</span>
              <span className="mt-1 block text-[9px] uppercase tracking-[0.24em] text-parchment/45">Administrator portal</span>
            </span>
          </RouterLink>

          <div className="hidden max-w-xl py-16 lg:block">
            <p className="text-[10px] uppercase tracking-[0.36em] text-gold">The living archive</p>
            <h1 className="font-display mt-5 text-6xl leading-[1.04] text-parchment xl:text-7xl">Steward the stories that endure.</h1>
            <p className="mt-6 max-w-md text-sm leading-7 text-parchment/60">A focused workspace for preserving places, provenance, and the images that bring each record to life.</p>
          </div>

          <RouterLink to="/" className="hidden w-fit items-center gap-2 text-xs text-parchment/50 transition hover:text-gold-bright lg:inline-flex">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />Return to the main website
          </RouterLink>
        </section>

        <section className="flex items-center justify-center px-5 pb-12 sm:px-8 lg:border-l lg:border-white/[0.08] lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md rounded-[1.75rem] border border-white/[0.1] bg-surface/90 p-6 shadow-[0_24px_90px_rgba(0,0,0,0.48)] backdrop-blur-xl sm:p-9"
          >
            <div className="mb-7 flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-gold/25 bg-gold/[0.08] text-gold">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-gold">HeritageVerse Admin</p>
                <h2 className="font-display mt-1 text-3xl">Sign in</h2>
                <p className="mt-1 text-xs leading-5 text-parchment/50">Use your existing administrator account.</p>
              </div>
            </div>

            {user && !activeAdmin ? (
              <div className="space-y-4">
                <p role="alert" className="rounded-2xl border border-red-300/20 bg-red-950/30 px-4 py-3 text-sm leading-6 text-parchment/85">
                  This account does not have active administrator access. Dashboard management remains restricted.
                </p>
                <p className="break-all text-xs text-parchment/45">Signed in as {user.email}</p>
                <Button type="button" variant="outline" className="w-full" onClick={() => { signOut(); setError(""); }}>
                  Sign out and use another account
                </Button>
              </div>
            ) : (
              <form onSubmit={(event) => void onSubmit(event)} className="space-y-5">
                {notice ? <p role="status" className="rounded-2xl border border-gold/25 bg-gold/[0.08] px-4 py-3 text-sm leading-6 text-parchment/75">{notice}</p> : null}

                <label className="block">
                  <span className="mb-2 block text-[10px] uppercase tracking-[0.24em] text-parchment/55">Email</span>
                  <span className="relative block">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gold/80" aria-hidden="true" />
                    <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="username" required disabled={pending} className="pl-11" />
                  </span>
                </label>

                <label className="block">
                  <span className="mb-2 block text-[10px] uppercase tracking-[0.24em] text-parchment/55">Password</span>
                  <span className="relative block">
                    <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gold/80" aria-hidden="true" />
                    <Input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" required disabled={pending} className="px-11" />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-parchment/55 transition hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span key={showPassword ? "hide" : "show"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                        </motion.span>
                      </AnimatePresence>
                    </button>
                  </span>
                </label>

                {error ? <p role="alert" className="rounded-2xl border border-red-300/20 bg-red-950/30 px-4 py-3 text-sm leading-6 text-red-100">{error}</p> : null}

                <Button type="submit" disabled={pending} className="min-h-12 w-full uppercase tracking-[0.14em]">
                  {pending ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Signing in…</> : "Sign in to admin"}
                </Button>
                <p className="text-center text-[11px] leading-5 text-parchment/40">Administrator access is provisioned securely. Public administrator registration is unavailable.</p>
              </form>
            )}

            <RouterLink to="/" className="mt-7 inline-flex items-center gap-2 text-xs text-parchment/55 transition hover:text-gold-bright lg:hidden">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />Return to the main website
            </RouterLink>
          </motion.div>
        </section>
      </div>
    </main>
  );
}
