import { AuthPage } from "@/components/AuthPage";
import { AdminApp } from "@/components/admin/AdminApp";
import { ExplorePage } from "@/pages/ExplorePage";
import { FavoritesPage } from "@/pages/FavoritesPage";
import { HeritageDetailPage } from "@/pages/HeritageDetailPage";
import { HomePage } from "@/pages/HomePage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { VisitedPage } from "@/pages/VisitedPage";
import { useAuth } from "@/context/AuthContext";
import { useLocation, useNavigate } from "@/lib/router";

const adminRoutes = new Set([
  "/admin",
  "/admin/dashboard",
  "/admin/heritage",
  "/admin/timeline",
  "/admin/stories",
  "/admin/media",
  "/admin/users",
  "/admin/settings",
]);

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

  if (normalizedPath === "/admin" || normalizedPath.startsWith("/admin/")) {
    if (!adminRoutes.has(normalizedPath)) return <NotFoundPage />;
    return <AdminApp key={normalizedPath} />;
  }

  if (pathname === "/explore") return <ExplorePage />;
  if (pathname === "/favorites") return <FavoritesPage isAuthenticated={Boolean(user)} />;
  if (pathname === "/visited") return <VisitedPage isAuthenticated={Boolean(user)} />;
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
    if (!user) {
      return (
        <AuthPage
          initialMode="signin"
          notice={sessionMessage}
          onModeChange={(mode) => navigate(mode === "signup" ? "/signup" : "/login")}
        />
      );
    }
    return <HomePage />;
  }

  return <NotFoundPage />;
}
