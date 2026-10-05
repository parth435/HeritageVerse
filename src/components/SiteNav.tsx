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
          <span className="hidden max-w-32 truncate text-xs text-parchment/60 sm:block">
            {user?.name}
          </span>
          <Button variant="outline" size="sm" onClick={signOut} className="hidden sm:inline-flex">
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      {open ? (
        <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4 lg:hidden">
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
          <Button variant="outline" size="sm" onClick={signOut} className="mt-2 w-fit">
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      ) : null}
    </motion.header>
  );
}
