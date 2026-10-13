import { layers, type Monument } from "@/data/monuments";
import type {
  Heritage,
  HeritageArtifact,
  HeritageMapRecord,
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
  thumbnailSrc?: string;
  alt: string;
  label?: string;
  creator?: string | null;
  credit?: string | null;
  documentedDate?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
  sourceUrl?: string | null;
  mediaRole?: HeritageMedia["media_role"];
  mediaContext?: string | null;
  verificationStatus?: HeritageMedia["verification_status"];
  isIllustrative?: boolean;
};

export type HeritageLayerView = {
  id?: number;
  name: string;
  description: string;
  display_order: number;
  source_id?: number | null;
};

export type HeritageView = {
  /** Route key: a local monument id for explicit demo data, numeric id for API data. */
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
  locality?: string;
  address?: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  hasCoordinates: boolean;
  coordinateStatus: "verified" | "unverified" | "missing";
  media: HeritageMedia[];
  gallery: HeritageGalleryImage[];
  timelineEvents: HeritageTimelineEvent[];
  artifacts: HeritageArtifact[];
  architecturalLayers: HeritageLayerView[];
  sources: HeritageSource[];
  /** Present only for the explicit local demo data source. */
  localMonument?: Monument;
};

export type HeritageMapView = Pick<
  HeritageView,
  "routeId" | "name" | "description" | "location" | "latitude" | "longitude" | "hasCoordinates" | "gallery"
>;

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
  taj: { name: "Mausoleum and tomb", slug: "mausoleum-tomb" },
  hampi: { name: "Archaeological site", slug: "archaeological" },
  konark: { name: "Temple and religious site", slug: "temple-religious" },
  ajanta: { name: "Cave and rock-cut site", slug: "cave-rock-cut" },
  qutub: { name: "Archaeological site", slug: "archaeological" },
  meenakshi: { name: "Temple and religious site", slug: "temple-religious" },
};

function parseCoordinate(value: number | string | null | undefined) {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function validCoordinatePair(latitude: number | null, longitude: number | null) {
  return latitude !== null &&
    longitude !== null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;
}

function safeImageUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function makeLocation(locality?: string | null, district?: string | null, state?: string | null) {
  return [locality, district, state].filter((part): part is string => Boolean(part?.trim())).join(", ") || "Location not recorded";
}

function galleryFromMedia(name: string, media: HeritageMedia[] = []): HeritageGalleryImage[] {
  return [...media]
    .sort((a, b) => a.display_order - b.display_order)
    .filter((item) => item.media_type === "image" && Boolean(safeImageUrl(item.url?.trim())))
    .map((item) => ({
      src: safeImageUrl(item.url.trim())!,
      thumbnailSrc: safeImageUrl(item.thumbnail_url?.trim()) ?? undefined,
      alt: item.alt_text || item.caption || name,
      label: item.caption || undefined,
      creator: item.creator,
      credit: item.credit,
      documentedDate: item.documented_date,
      license: item.license,
      licenseUrl: item.license_url,
      sourceUrl: item.source_url,
      mediaRole: item.media_role,
      mediaContext: item.media_context,
      verificationStatus: item.verification_status,
      isIllustrative: item.is_illustrative,
    }));
}

function localLocation(monument: Monument) {
  const [first, ...rest] = monument.place.split(",").map((part) => part.trim());
  if (rest.length === 0) return { state: first, district: undefined, locality: undefined };
  return { locality: first, state: rest.join(", "), district: undefined };
}

export function heritageToView(heritage: Heritage): HeritageView {
  const media = [...(heritage.media ?? [])].sort(
    (a, b) => a.display_order - b.display_order,
  );
  const gallery = galleryFromMedia(heritage.name, media);

  const latitude = parseCoordinate(heritage.latitude);
  const longitude = parseCoordinate(heritage.longitude);
  const hasCoordinatePair = validCoordinatePair(latitude, longitude);
  const hasCoordinates = heritage.coordinates_verified === true && hasCoordinatePair;

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
    locality: heritage.locality ?? undefined,
    address: heritage.address ?? undefined,
    location: makeLocation(heritage.locality, heritage.district, heritage.state),
    latitude: hasCoordinates ? latitude : null,
    longitude: hasCoordinates ? longitude : null,
    hasCoordinates,
    coordinateStatus: hasCoordinates ? "verified" : hasCoordinatePair ? "unverified" : "missing",
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
  };
}

export function heritageMapToView(heritage: HeritageMapRecord): HeritageMapView {
  const latitude = parseCoordinate(heritage.latitude);
  const longitude = parseCoordinate(heritage.longitude);
  const hasCoordinates = heritage.coordinates_verified === true && validCoordinatePair(latitude, longitude);

  return {
    routeId: String(heritage.id),
    name: heritage.name,
    description: heritage.description,
    location: makeLocation(heritage.locality, heritage.district, heritage.state),
    latitude: hasCoordinates ? latitude : null,
    longitude: hasCoordinates ? longitude : null,
    hasCoordinates,
    gallery: galleryFromMedia(heritage.name, heritage.media ?? []),
  };
}

export function localMonumentToView(monument: Monument): HeritageView {
  const { state, district, locality } = localLocation(monument);
  const localLayers = monument.id === "taj" ? layers : [];
  const gallery = [
    { src: monument.image, alt: `${monument.name} main view`, label: "Collection image" },
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
    locality,
    location: makeLocation(locality, district, state),
    latitude: null,
    longitude: null,
    hasCoordinates: false,
    coordinateStatus: "missing",
    media: [],
    gallery,
    timelineEvents: [],
    artifacts: [],
    architecturalLayers: localLayers.map((layer, index) => ({
      name: layer.label,
      description: layer.note,
      display_order: index,
      source_id: null,
    })),
    sources: [],
    localMonument: monument,
  };
}

/** Converts schema/API fields to a nullable boundary for legacy visual fields. */
export function heritageToMonument(heritage: Heritage): HeritageMonumentAdapter {
  const view = heritageToView(heritage);
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
    id: heritage.slug,
    name: heritage.name,
    place: view.location,
    era: heritage.historical_period || "Period not recorded",
    // Historical period is not a construction year, and timeline dates are not
    // assumed to be construction dates. Keep unknown years unknown.
    year: null,
    // The database has no UNESCO field; unknown status stays unknown.
    unesco: null,
    x: mapPosition?.x ?? null,
    y: mapPosition?.y ?? null,
    image: firstImage,
    thenImage: null,
    nowImage: null,
    blurb: heritage.description,
    material: firstMaterial ?? "Not recorded",
  };
}

export function legacyIdForSlug(slug: string) {
  return localIdBySlug[slug];
}
