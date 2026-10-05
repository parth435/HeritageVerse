import { monuments } from "@/data/monuments";
import { localMonumentToView, type HeritageView } from "@/lib/heritageAdapter";

/**
 * Temporary local-only data source. Heritage APIs do not exist in the current backend,
 * so this provider deliberately makes no network requests and does not simulate persistence.
 */
export async function listFallbackHeritage(): Promise<HeritageView[]> {
  return monuments.map(localMonumentToView);
}

export async function getFallbackHeritage(identifier: string): Promise<HeritageView | null> {
  const items = await listFallbackHeritage();
  return (
    items.find((item) => item.routeId === identifier || item.slug === identifier) ?? null
  );
}
