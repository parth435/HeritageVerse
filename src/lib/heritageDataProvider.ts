import { monuments } from "@/data/monuments";
import { localMonumentToView, type HeritageView } from "@/lib/heritageAdapter";

/**
 * Explicit local demo catalogue. Live Explore and detail pages use the API provider and
 * must not switch to this data when a request fails, so demo records cannot look database-backed.
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
