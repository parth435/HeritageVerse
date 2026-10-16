import { heritageToView, type HeritageView } from "@/lib/heritageAdapter";
import curatedImages from "../../../shared/curated-heritage-images.json";
import type { Heritage } from "@/types/heritage";

type CuratedImage = (typeof curatedImages)[keyof typeof curatedImages];

export function addCuratedImageForPlace(record: Heritage): Heritage {
  const curated = (curatedImages as Record<string, CuratedImage>)[record.slug];
  if (!curated) return record;
  const media = Array.isArray(record.media) ? record.media : [];
  const curatedMedia = {
    ...curated,
    media_type: "image" as const,
    caption: null,
    media_role: "current" as const,
    media_context: "current",
    verification_status: "verified" as const,
    is_illustrative: false,
    display_order: 0,
    provider: "wikimedia",
  };

  return {
    ...record,
    image_url: curated.url,
    media: [curatedMedia, ...media.filter((image) => image.url !== curated.url).map((image, index) => ({ ...image, display_order: index + 1 }))],
  };
}

export function prepareExplorePlaces(records: Heritage[]): HeritageView[] {
  return records.map((record) => heritageToView(addCuratedImageForPlace(record)));
}
