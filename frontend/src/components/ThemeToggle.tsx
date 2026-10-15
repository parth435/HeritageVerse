import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import type { HeritageTheme } from "@/lib/theme.js";

const choices: { value: HeritageTheme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  return (
    <div role="group" aria-label="Color theme" className="inline-flex shrink-0 items-center rounded-full border border-white/15 bg-white/[0.035] p-1">
      {choices.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={`${label} theme`}
          aria-pressed={theme === value}
          title={`${label} theme`}
          onClick={() => setTheme(value)}
          className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-full px-2.5 text-[10px] font-semibold uppercase tracking-[0.09em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${theme === value ? "bg-gold text-ink" : "text-parchment/70 hover:text-parchment"}`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          <span className={compact ? "hidden sm:inline" : ""}>{label}</span>
        </button>
      ))}
    </div>
  );
}
