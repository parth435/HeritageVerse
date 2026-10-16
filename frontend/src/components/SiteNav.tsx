import { motion } from "motion/react";
import { Compass, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/context/AuthContext";
import { RouterLink } from "@/lib/router";

const navLinks = [
  { href: "/explore", label: "Explore", route: true },
  { href: "/nearby", label: "Nearby", route: true },
  { href: "#atlas", label: "Atlas" },
  { href: "#museum", label: "Museum" },
  { href: "#time", label: "Time" },
  { href: "#dissection", label: "Anatomy" },
  { href: "#then-now", label: "Then & Now" },
  { href: "#journey", label: "Journey" },
  { href: "#os", label: "Verse" },
];

const desktopLinkClass =
  "whitespace-nowrap text-[10px] uppercase tracking-[0.1em] text-parchment/70 transition-colors hover:text-gold-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold xl:text-[11px] xl:tracking-[0.12em]";

function NavigationLinks({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  return navLinks.map((link) => {
    const className = mobile
      ? "whitespace-nowrap text-xs uppercase tracking-[0.12em] text-parchment/80 transition-colors hover:text-gold-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      : desktopLinkClass;

    return link.route ? (
      <RouterLink key={link.href} to={link.href} onClick={onNavigate} className={className}>
        {link.label}
      </RouterLink>
    ) : (
      <a key={link.href} href={link.href} onClick={onNavigate} className={className}>
        {link.label}
      </a>
    );
  });
}

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const isActiveAdmin = user?.role?.toLowerCase() === "admin" && user.status?.toUpperCase() === "ACTIVE";
  const adminPath = isActiveAdmin ? "/admin" : "/admin/login";
  const adminLabel = isActiveAdmin ? "Admin workspace" : "Admin login";
  const closeMenu = () => setOpen(false);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-ink/70 backdrop-blur-xl"
    >
      <div className="mx-auto flex w-full max-w-screen-2xl items-center gap-3 px-4 py-3 sm:px-6 xl:px-8">
        <a href="#top" className="flex shrink-0 items-center gap-2 text-parchment">
          <Compass className="h-5 w-5 text-gold" />
          <span className="whitespace-nowrap font-display text-xl tracking-wide">HeritageVerse</span>
        </a>

        <nav aria-label="Main navigation" className="hidden min-w-0 flex-1 items-center justify-center gap-2 lg:flex xl:gap-3 2xl:gap-4">
          <NavigationLinks />
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3 lg:ml-0">
          <ThemeToggle compact iconOnly />

          {user ? (
            <div className="hidden items-center gap-2 lg:flex xl:gap-3">
              <span className="hidden max-w-28 truncate text-xs text-parchment/60 2xl:block">{user.name}</span>
              <RouterLink to={adminPath} className="whitespace-nowrap text-[10px] uppercase tracking-[0.1em] text-gold-bright hover:text-parchment xl:text-[11px]">{adminLabel}</RouterLink>
              <Button variant="outline" size="sm" onClick={signOut} className="whitespace-nowrap">
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </Button>
            </div>
          ) : (
            <div className="hidden items-center gap-2 lg:flex xl:gap-4">
              <RouterLink to="/admin/login" className="whitespace-nowrap text-[10px] uppercase tracking-[0.1em] text-gold-bright hover:text-parchment xl:text-[11px]">Admin login</RouterLink>
              <RouterLink to="/login" className="whitespace-nowrap text-[10px] uppercase tracking-[0.1em] text-parchment/70 hover:text-gold-bright xl:text-[11px]">Sign in</RouterLink>
              <RouterLink to="/signup" className="whitespace-nowrap rounded-full border border-gold/50 px-3 py-2 text-[10px] uppercase tracking-[0.1em] text-gold-bright hover:bg-gold/10 xl:px-4 xl:text-[11px]">Join</RouterLink>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="site-navigation-mobile"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {open ? (
        <div id="site-navigation-mobile" className="border-t border-white/10 px-4 py-4 sm:px-6 lg:hidden">
          <nav aria-label="Mobile navigation" className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <NavigationLinks mobile onNavigate={closeMenu} />
          </nav>
          {user ? (
            <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-white/10 pt-4">
              <RouterLink to={adminPath} onClick={closeMenu} className="whitespace-nowrap text-xs uppercase tracking-[0.12em] text-gold-bright">{adminLabel}</RouterLink>
              <Button variant="outline" size="sm" onClick={() => { signOut(); closeMenu(); }}>
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </Button>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 sm:flex sm:flex-wrap sm:items-center sm:gap-5">
              <RouterLink to="/admin/login" onClick={closeMenu} className="whitespace-nowrap text-xs uppercase tracking-[0.12em] text-gold-bright">Admin login</RouterLink>
              <RouterLink to="/login" onClick={closeMenu} className="whitespace-nowrap text-xs uppercase tracking-[0.12em] text-parchment/80">Sign in</RouterLink>
              <RouterLink to="/signup" onClick={closeMenu} className="whitespace-nowrap text-xs uppercase tracking-[0.12em] text-gold-bright">Join</RouterLink>
            </div>
          )}
        </div>
      ) : null}
    </motion.header>
  );
}
