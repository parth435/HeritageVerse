import { AuthPage } from "@/components/AuthPage";
import { CinematicMonument } from "@/components/CinematicMonument";
import { HeritageOS } from "@/components/HeritageOS";
import { LivingAtlas } from "@/components/LivingAtlas";
import { MonumentDissection } from "@/components/MonumentDissection";
import { MuseumInMotion } from "@/components/MuseumInMotion";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import { ThenNow } from "@/components/ThenNow";
import { TheJourney } from "@/components/TheJourney";
import { TimeMachine } from "@/components/TimeMachine";
import { useAuth } from "@/context/AuthContext";
import { AdminApp } from "@/components/admin/AdminApp";

export default function App() {
  const { user } = useAuth();

  if (!user) {
    return <AuthPage />;
  }

  if (window.location.pathname.startsWith("/admin")) {
    if (user.role !== "ADMIN") {
      return (
        <div className="min-h-svh bg-stone-950 flex flex-col items-center justify-center p-6 text-center text-stone-200">
          <h1 className="font-display text-3xl text-[#d4af7a] mb-2">Access Denied</h1>
          <p className="text-sm text-stone-400 max-w-md mb-6">
            Your account does not possess administrator privileges. Administrator credentials are required to access this workspace.
          </p>
          <a
            href="/"
            className="bg-stone-900 border border-stone-700 hover:bg-stone-800 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition"
          >
            Return to HeritageVerse
          </a>
        </div>
      );
    }
    return <AdminApp />;
  }


  return (
    <div className="min-h-svh bg-ink text-parchment">
      <SiteNav />
      <main>
        <CinematicMonument />
        <LivingAtlas />
        <MuseumInMotion />
        <TimeMachine />
        <MonumentDissection />
        <ThenNow />
        <TheJourney />
        <HeritageOS />
      </main>
      <SiteFooter />
    </div>
  );
}
