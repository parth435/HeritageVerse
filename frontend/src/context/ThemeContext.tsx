import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { applyTheme, readTheme, type HeritageTheme } from "@/lib/theme.js";

type ThemeContextValue = { theme: HeritageTheme; setTheme: (theme: HeritageTheme) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<HeritageTheme>(() => {
    if (typeof document !== "undefined") {
      const initial = document.documentElement.dataset.theme;
      if (initial === "light" || initial === "dark") return initial;
    }
    return readTheme(browserStorage(), systemPrefersDark());
  });

  const setTheme = useCallback((nextTheme: HeritageTheme) => setThemeState(nextTheme), []);

  useEffect(() => {
    applyTheme(theme, document, browserStorage());
  }, [theme]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "heritageverse-theme") return;
      setThemeState(readTheme(browserStorage(), systemPrefersDark()));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
