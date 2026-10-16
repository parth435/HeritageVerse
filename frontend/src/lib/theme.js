export const THEME_STORAGE_KEY = "heritageverse-theme";

export function resolveTheme(savedTheme, prefersDark = false) {
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  return prefersDark ? "dark" : "light";
}

export function readTheme(storage, prefersDark = false) {
  try {
    return resolveTheme(storage?.getItem(THEME_STORAGE_KEY), prefersDark);
  } catch {
    return resolveTheme(null, prefersDark);
  }
}

export function applyTheme(theme, documentRef, storage) {
  const value = resolveTheme(theme);
  documentRef?.documentElement?.setAttribute("data-theme", value);
  if (documentRef?.documentElement?.style) documentRef.documentElement.style.colorScheme = value;
  try {
    storage?.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // The in-memory theme remains active when storage is disabled.
  }
  return value;
}
