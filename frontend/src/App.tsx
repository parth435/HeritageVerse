import { lazy, Suspense, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import type { User } from "@/types/auth";
import { RouterLink, useLocation, useNavigate } from "@/lib/router";

const AuthPage = lazy(() => import("@/components/AuthPage").then(({ AuthPage }) => ({ default: AuthPage })));
const AdminLoginPage = lazy(() => import("@/components/admin/AdminLoginPage").then(({ AdminLoginPage }) => ({ default: AdminLoginPage })));
const AdminRealApp = lazy(() => import("@/components/admin/AdminRealApp").then(({ AdminRealApp }) => ({ default: AdminRealApp })));
const ExplorePage = lazy(() => import("@/pages/ExplorePage").then(({ ExplorePage }) => ({ default: ExplorePage })));
const FavoritesPage = lazy(() => import("@/pages/FavoritesPage").then(({ FavoritesPage }) => ({ default: FavoritesPage })));
const HeritageDetailPage = lazy(() => import("@/pages/HeritageDetailPage").then(({ HeritageDetailPage }) => ({ default: HeritageDetailPage })));
const HomePage = lazy(() => import("@/pages/HomePage").then(({ HomePage }) => ({ default: HomePage })));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage").then(({ NotFoundPage }) => ({ default: NotFoundPage })));
const ProfilePage = lazy(() => import("@/pages/ProfilePage").then(({ ProfilePage }) => ({ default: ProfilePage })));
const VisitedPage = lazy(() => import("@/pages/VisitedPage").then(({ VisitedPage }) => ({ default: VisitedPage })));
const JourneysPage = lazy(() => import("@/pages/JourneysPage").then(({ JourneysPage }) => ({ default: JourneysPage })));
const NearbyPage = lazy(() => import("@/pages/NearbyPage").then(({ NearbyPage }) => ({ default: NearbyPage })));

const adminRoutes = new Set([
  "/admin",
  "/admin/heritage",
  "/admin/images",
  "/admin/categories",
  "/admin/users",
]);

function isActiveAdministrator(user: User | null) {
  return user?.role?.toLowerCase() === "admin" && user.status?.toUpperCase() === "ACTIVE";
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <AppRoutes />
    </Suspense>
  );
}

function AppRoutes() {
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
  if (pathname === "/nearby") return <NearbyPage />;
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

function RouteLoading() {
  return (
    <main className="grid min-h-svh place-items-center bg-ink px-5 text-parchment" role="status" aria-live="polite">
      <p className="text-sm text-parchment/70">Loading this part of HeritageVerse…</p>
    </main>
  );
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
