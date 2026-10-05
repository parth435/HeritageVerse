import { layers, monuments, type Monument } from "@/data/monuments";
import type {
  Heritage,
  HeritageArtifact,
  HeritageMedia,
  HeritageSource,
  HeritageTimelineEvent,
} from "@/types/heritage";

export type HeritageCategoryView = {
  id?: number;
  name: string;
  slug: string;
};

export type HeritageGalleryImage = {
  src: string;
  alt: string;
  label?: string;
};

export type HeritageLayerView = {
  id?: number;
  name: string;
  description: string;
  display_order: number;
};

export type HeritageView = {
  /** Route key: a local monument id for fallback data, numeric id for API data. */
  routeId: string;
  databaseId?: number;
  slug: string;
  name: string;
  description?: string;
  history?: string;
  culturalSignificance?: string;
  architecture?: string;
  historicalPeriod?: string;
  category?: HeritageCategoryView;
  state?: string;
  district?: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  hasCoordinates: boolean;
  media: HeritageMedia[];
  gallery: HeritageGalleryImage[];
  timelineEvents: HeritageTimelineEvent[];
  artifacts: HeritageArtifact[];
  architecturalLayers: HeritageLayerView[];
  sources: HeritageSource[];
  /** Local view data lets the existing Monument components remain unchanged. */
  localMonument?: Monument;
};

/**
 * Nullable adapter boundary for API records. The legacy Monument shape requires
 * values that the database does not guarantee (coordinates, UNESCO status, and
 * media), so API-backed records must not be typed as complete Monument values.
 */
export type HeritageMonumentAdapter = Omit<
  Monument,
  "year" | "unesco" | "x" | "y" | "image" | "thenImage" | "nowImage"
> & {
  year: string | null;
  unesco: boolean | null;
  x: number | null;
  y: number | null;
  image: string | null;
  thenImage: string | null;
  nowImage: string | null;
};

const localSlugById: Record<string, string> = {
  taj: "taj-mahal",
  hampi: "hampi",
  konark: "konark-sun-temple",
  ajanta: "ajanta-caves",
  qutub: "qutb-minar",
  meenakshi: "meenakshi-amman",
};

const localIdBySlug = Object.fromEntries(
  Object.entries(localSlugById).map(([id, slug]) => [slug, id]),
);

const localCategories: Record<string, HeritageCategoryView> = {
  taj: { name: "Fort and palace", slug: "fort-palace" },
  hampi: { name: "Archaeological site", slug: "archaeological" },
  konark: { name: "Temple and religious site", slug: "temple-religious" },
  ajanta: { name: "Cave and rock-cut site", slug: "cave-rock-cut" },
  qutub: { name: "Archaeological site", slug: "archaeological" },
  meenakshi: { name: "Temple and religious site", slug: "temple-religious" },
};

function getLocalMonument(slug: string) {
  const localId = localIdBySlug[slug] ?? slug;
  return monuments.find((monument) => monument.id === localId);
}

function parseCoordinate(value: number | string | null | undefined) {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function makeLocation(district?: string | null, state?: string | null) {
  return [district, state].filter((part): part is string => Boolean(part?.trim())).join(", ") || "Location not recorded";
}

function localLocation(monument: Monument) {
  const [first, ...rest] = monument.place.split(",").map((part) => part.trim());
  if (rest.length === 0) return { state: first, district: undefined };
  return { district: first, state: rest.join(", ") };
}

export function heritageToView(heritage: Heritage): HeritageView {
  const localMonument = getLocalMonument(heritage.slug);
  const media = [...(heritage.media ?? [])].sort(
    (a, b) => a.display_order - b.display_order,
  );
  const gallery = media
    .filter((item) => item.media_type === "image" && Boolean(item.url?.trim()))
    .map((item) => ({
      src: item.url.trim(),
      alt: item.alt_text || item.caption || heritage.name,
      label: item.caption || undefined,
    }));

  // Existing local imagery is a display fallback only; it is not written back as DB media.
  if (gallery.length === 0 && localMonument) {
    gallery.push({ src: localMonument.image, alt: localMonument.name, label: "Collection image" });
  }

  const latitude = parseCoordinate(heritage.latitude);
  const longitude = parseCoordinate(heritage.longitude);

  return {
    routeId: String(heritage.id),
    databaseId: heritage.id,
    slug: heritage.slug,
    name: heritage.name,
    description: heritage.description,
    history: heritage.history,
    culturalSignificance: heritage.cultural_significance,
    architecture: heritage.architecture,
    historicalPeriod: heritage.historical_period,
    category: heritage.category,
    state: heritage.state,
    district: heritage.district ?? undefined,
    location: makeLocation(heritage.district, heritage.state),
    latitude,
    longitude,
    hasCoordinates: latitude !== null && longitude !== null,
    media,
    gallery,
    timelineEvents: [...(heritage.timeline_events ?? [])].sort(
      (a, b) => a.display_order - b.display_order,
    ),
    artifacts: heritage.artifacts ?? [],
    architecturalLayers: [...(heritage.architectural_layers ?? [])].sort(
      (a, b) => a.display_order - b.display_order,
    ),
    sources: heritage.sources ?? [],
    localMonument,
  };
}

export function localMonumentToView(monument: Monument): HeritageView {
  const { state, district } = localLocation(monument);
  const localLayers = monument.id === "taj" ? layers : [];
  const gallery = [
    { src: monument.image, alt: `${monument.name} main view`, label: "Collection image" },
    { src: monument.thenImage, alt: `${monument.name}, then`, label: "Then" },
    { src: monument.nowImage, alt: `${monument.name}, now`, label: "Now" },
  ].filter((image) => Boolean(image.src));

  return {
    routeId: monument.id,
    slug: localSlugById[monument.id] ?? monument.id,
    name: monument.name,
    description: monument.blurb,
    historicalPeriod: monument.era,
    category: localCategories[monument.id],
    state,
    district,
    location: makeLocation(district, state),
    latitude: null,
    longitude: null,
    hasCoordinates: false,
    media: [],
    gallery,
    timelineEvents: [],
    artifacts: [],
    architecturalLayers: localLayers.map((layer, index) => ({
      name: layer.label,
      description: layer.note,
      display_order: index,
    })),
    sources: [],
    localMonument: monument,
  };
}

/** Converts schema/API fields to a nullable boundary for legacy visual fields. */
export function heritageToMonument(heritage: Heritage): HeritageMonumentAdapter {
  const view = heritageToView(heritage);
  const local = view.localMonument;
  const latitude = view.latitude;
  const longitude = view.longitude;

  // A simple India-area projection for the existing atlas's percentage-position interface.
  // Only database coordinates or a known local monument position are used.
  const mapPosition = view.hasCoordinates
    ? {
        x: Math.max(2, Math.min(98, ((longitude! - 68) / 30) * 100)),
        y: Math.max(2, Math.min(98, ((38 - latitude!) / 32) * 100)),
      }
    : null;
  const firstImage = view.gallery[0]?.src ?? null;
  const firstMaterial = view.artifacts.find((artifact) => artifact.material)?.material;

  return {
    id: local?.id ?? heritage.slug,
    name: heritage.name,
    place: view.location,
    era: heritage.historical_period || local?.era || "Period not recorded",
    // Historical period is not a construction year, and timeline dates are not
    // assumed to be construction dates. Keep unknown years unknown.
    year: local?.year ?? null,
    // The database has no UNESCO field; unknown status stays unknown.
    unesco: local?.unesco ?? null,
    x: mapPosition?.x ?? local?.x ?? null,
    y: mapPosition?.y ?? local?.y ?? null,
    image: firstImage,
    // Then / Now imagery remains sourced from the existing local record only.
    // API records without a complete local match cannot replace that experience.
    thenImage: local?.thenImage ?? null,
    nowImage: local?.nowImage ?? null,
    blurb: heritage.description,
    material: firstMaterial ?? local?.material ?? "Not recorded",
  };
}

export function legacyIdForSlug(slug: string) {
  return localIdBySlug[slug];
}
