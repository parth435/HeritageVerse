import { motion } from "motion/react";
import { Compass, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { RouterLink } from "@/lib/router";

const links = [
  { href: "#atlas", label: "Atlas" },
  { href: "#museum", label: "Museum" },
  { href: "#time", label: "Time" },
  { href: "#dissection", label: "Anatomy" },
  { href: "#then-now", label: "Then / Now" },
  { href: "#journey", label: "Journey" },
  { href: "#os", label: "Verse" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const isActiveAdmin = user?.role?.toLowerCase() === "admin" && user.status?.toUpperCase() === "ACTIVE";
  const adminPath = isActiveAdmin ? "/admin" : "/admin/login";
  const adminLabel = isActiveAdmin ? "Admin workspace" : "Admin login";

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-ink/70 backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 md:px-8">
        <a href="#top" className="flex items-center gap-2 text-parchment">
          <Compass className="h-5 w-5 text-gold" />
          <span className="font-display text-xl tracking-wide">HeritageVerse</span>
        </a>
        <nav className="hidden items-center gap-7 lg:flex">
          <RouterLink
            to="/explore"
            className="text-xs uppercase tracking-[0.2em] text-parchment/70 hover:text-gold-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            Explore
          </RouterLink>
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-xs uppercase tracking-[0.2em] text-parchment/70 hover:text-gold-bright"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span className="hidden max-w-32 truncate text-xs text-parchment/60 sm:block">{user.name}</span>
              <RouterLink to={adminPath} className="hidden text-xs uppercase tracking-[0.12em] text-gold-bright hover:text-parchment sm:inline-flex">{adminLabel}</RouterLink>
              <Button variant="outline" size="sm" onClick={signOut} className="hidden sm:inline-flex">
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </Button>
            </>
          ) : (
            <div className="hidden items-center gap-3 sm:flex">
              <RouterLink to="/admin/login" className="text-xs uppercase tracking-[0.12em] text-gold-bright hover:text-parchment">Admin login</RouterLink>
              <RouterLink to="/login" className="text-xs uppercase tracking-[0.15em] text-parchment/70 hover:text-gold-bright">Sign in</RouterLink>
              <RouterLink to="/signup" className="rounded-full border border-gold/50 px-4 py-2 text-xs uppercase tracking-[0.15em] text-gold-bright hover:bg-gold/10">Join</RouterLink>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
            aria-controls="site-navigation-mobile"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      {open ? (
        <div id="site-navigation-mobile" className="flex flex-col gap-3 border-t border-white/10 px-5 py-4 lg:hidden">
          <RouterLink
            to="/explore"
            onClick={() => setOpen(false)}
            className="text-sm uppercase tracking-[0.18em] text-parchment/80"
          >
            Explore
          </RouterLink>
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="text-sm uppercase tracking-[0.18em] text-parchment/80"
            >
              {link.label}
            </a>
          ))}
          {user ? (
            <>
              <RouterLink to={adminPath} onClick={() => setOpen(false)} className="mt-2 text-sm uppercase tracking-[0.15em] text-gold-bright">{adminLabel}</RouterLink>
              <Button variant="outline" size="sm" onClick={signOut} className="mt-2 w-fit">
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </Button>
            </>
          ) : (
            <div className="mt-2 flex gap-4">
              <RouterLink to="/admin/login" onClick={() => setOpen(false)} className="text-sm uppercase tracking-[0.15em] text-gold-bright">Admin login</RouterLink>
              <RouterLink to="/login" onClick={() => setOpen(false)} className="text-sm uppercase tracking-[0.15em] text-parchment/80">Sign in</RouterLink>
              <RouterLink to="/signup" onClick={() => setOpen(false)} className="text-sm uppercase tracking-[0.15em] text-gold-bright">Join</RouterLink>
            </div>
          )}
        </div>
      ) : null}
    </motion.header>
  );
}
