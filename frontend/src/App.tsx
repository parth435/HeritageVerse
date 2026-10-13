import { useEffect } from "react";
import { AuthPage } from "@/components/AuthPage";
import { AdminLoginPage } from "@/components/admin/AdminLoginPage";
import { AdminRealApp } from "@/components/admin/AdminRealApp";
import { ExplorePage } from "@/pages/ExplorePage";
import { FavoritesPage } from "@/pages/FavoritesPage";
import { HeritageDetailPage } from "@/pages/HeritageDetailPage";
import { HomePage } from "@/pages/HomePage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { VisitedPage } from "@/pages/VisitedPage";
import { JourneysPage } from "@/pages/JourneysPage";
import { useAuth } from "@/context/AuthContext";
import type { User } from "@/types/auth";
import { RouterLink, useLocation, useNavigate } from "@/lib/router";

const adminRoutes = new Set([
  "/admin",
  "/admin/heritage",
  "/admin/images",
  "/admin/categories",
]);

function isActiveAdministrator(user: User | null) {
  return user?.role?.toLowerCase() === "admin" && user.status?.toUpperCase() === "ACTIVE";
}

export default function App() {
  const { user, isReady, sessionMessage } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";

  if (!isReady) {
    return (
      <main className="grid min-h-svh place-items-center bg-ink px-5 text-parchment" role="status" aria-live="polite">
        <p className="text-sm text-parchment/70">Verifying your HeritageVerse session…</p>
      </main>
    );
  }

  if (normalizedPath === "/admin/login") {
    if (isActiveAdministrator(user)) return <RouteRedirect to="/admin" label="Opening the administrator dashboard…" />;
    return <AdminLoginPage notice={sessionMessage} />;
  }

  if (normalizedPath === "/admin" || normalizedPath.startsWith("/admin/")) {
    if (!adminRoutes.has(normalizedPath)) return <NotFoundPage />;
    if (!user) return <RouteRedirect to="/admin/login" label="Redirecting to administrator sign in…" />;
    if (!isActiveAdministrator(user)) return <AdminAccessPage />;
    return <AdminRealApp key={normalizedPath} />;
  }

  if (pathname === "/explore") return <ExplorePage />;
  if (pathname === "/favorites") return <FavoritesPage isAuthenticated={Boolean(user)} />;
  if (pathname === "/visited") return <VisitedPage isAuthenticated={Boolean(user)} />;
  if (pathname === "/journeys") return <JourneysPage isAuthenticated={Boolean(user)} />;
  if (pathname === "/profile") return <ProfilePage user={user} sessionMessage={sessionMessage} />;

  if (pathname === "/login" || pathname === "/signup") {
    if (user) return <HomePage />;
    const initialMode = pathname === "/signup" ? "signup" : "signin";
    return (
      <AuthPage
        initialMode={initialMode}
        notice={sessionMessage}
        onModeChange={(mode) => navigate(mode === "signup" ? "/signup" : "/login")}
      />
    );
  }

  const detailMatch = pathname.match(/^\/heritage\/([^/]+)\/?$/);
  if (detailMatch?.[1]) {
    let identifier = detailMatch[1];
    try {
      identifier = decodeURIComponent(identifier);
    } catch {
      return <NotFoundPage />;
    }
    return <HeritageDetailPage identifier={identifier} />;
  }

  if (pathname === "/" || pathname === "") {
    return <HomePage />;
  }

  return <NotFoundPage />;
}

function RouteRedirect({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate();
  useEffect(() => navigate(to, { replace: true }), [navigate, to]);
  return (
    <main className="grid min-h-svh place-items-center bg-ink px-5 text-parchment" role="status" aria-live="polite">
      <p className="text-sm text-parchment/70">{label}</p>
    </main>
  );
}

function AdminAccessPage() {
  const { signOut } = useAuth();
  return (
    <main className="grid min-h-svh place-items-center bg-ink px-5 text-parchment">
      <div className="max-w-xl text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Administrator access required</p>
        <h1 className="font-display mt-4 text-4xl md:text-5xl">
          This account cannot manage HeritageVerse.
        </h1>
        <p className="mt-4 text-sm leading-6 text-parchment/65">
          Administrator privileges are required to view this workspace.
        </p>
        <RouterLink
          to="/"
          className="mt-7 inline-flex rounded-full bg-gold px-5 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-ink hover:bg-gold-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Return home
        </RouterLink>
        <button type="button" onClick={signOut} className="ml-3 mt-7 inline-flex rounded-full border border-white/15 px-5 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-parchment/75 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
          Sign out
        </button>
      </div>
    </main>
  );
}
