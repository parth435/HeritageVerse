export type HeritageTheme = "light" | "dark";
export const THEME_STORAGE_KEY: string;
export function resolveTheme(savedTheme: string | null | undefined, prefersDark?: boolean): HeritageTheme;
export function readTheme(storage: Pick<Storage, "getItem"> | null | undefined, prefersDark?: boolean): HeritageTheme;
export function applyTheme(theme: string, documentRef: Document | null | undefined, storage?: Pick<Storage, "setItem"> | null): HeritageTheme;
