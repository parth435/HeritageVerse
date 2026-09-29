import { AnimatePresence, motion } from "motion/react";
import { Compass, Eye, EyeOff, Lock, Mail, UserRound } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";

type Mode = "signin" | "signup";

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
      return;
    }
    if (mode === "signup" && name.trim().length < 2) {
      setError("Please enter your name.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setPending(true);
    try {
      if (mode === "signup") {
        await signUp(name, email, password);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-svh bg-ink lg:grid-cols-2">
      <motion.aside
        initial={{ clipPath: "inset(0 40% 0 0)" }}
        animate={{ clipPath: "inset(0 0% 0 0)" }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        className="relative hidden overflow-hidden lg:block"
      >
        <motion.img
          src="https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1800&q=80"
          alt="Monument at dusk"
          initial={{ scale: 1.12 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-linear-to-t from-ink via-ink/40 to-ink/20" />
        <div className="absolute inset-0 bg-linear-to-r from-transparent to-ink/80" />
        <div className="absolute bottom-12 left-12 right-12">
          <p className="text-xs uppercase tracking-[0.4em] text-gold">
            A cinema of stone
          </p>
          <h1 className="font-display mt-3 text-5xl leading-tight text-parchment">
            Enter HeritageVerse.
          </h1>
          <p className="mt-3 max-w-md text-parchment/70">
            Atlas, museum, time machine, and the anatomy of monuments — unlocked
            for those who sign in.
          </p>
        </div>
      </motion.aside>

      <main className="relative flex items-center justify-center px-6 py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(212,175,122,0.12),transparent_45%)]" />
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="relative w-full max-w-md"
        >
          <div className="mb-8 flex items-center gap-2">
            <Compass className="h-6 w-6 text-gold" />
            <span className="font-display text-2xl tracking-wide">
              HeritageVerse
            </span>
          </div>

          <div className="mb-8 grid grid-cols-2 rounded-full border border-white/10 bg-white/5 p-1">
            {(["signin", "signup"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setMode(item);
                  setError("");
                }}
                className={`rounded-full py-2.5 text-xs uppercase tracking-[0.22em] ${
                  mode === item
                    ? "bg-gold text-ink"
                    : "text-parchment/60 hover:text-parchment"
                }`}
              >
                {item === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.form
              key={mode}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.28 }}
              onSubmit={onSubmit}
              className="space-y-4"
            >
              {mode === "signup" ? (
                <Field label="Name">
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gold/80" />
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      autoComplete="name"
                      className="pl-11"
                    />
                  </div>
                </Field>
              ) : null}

              <Field label="Email">
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gold/80" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@heritageverse.app"
                    autoComplete="email"
                    className="pl-11"
                  />
                </div>
              </Field>

              <Field label="Password">
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gold/80" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                    className="px-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-parchment/60 hover:text-gold"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </Field>

              {error ? (
                <p className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </p>
              ) : null}

              <Button type="submit" className="mt-2 w-full" disabled={pending}>
                {pending
                  ? "Opening the verse…"
                  : mode === "signup"
                    ? "Create account"
                    : "Enter HeritageVerse"}
              </Button>
            </motion.form>
          </AnimatePresence>

          <p className="mt-8 text-xs leading-relaxed text-parchment/45">
            Accounts are stored on this device for the demo. Create an account
            first, then sign in on later visits.
          </p>
        </motion.div>
      </main>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] uppercase tracking-[0.28em] text-gold/80">
        {label}
      </span>
      {children}
    </label>
  );
}
