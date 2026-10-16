export type HeritageCategory = {
  id: number;
  name: string;
  slug: string;
};

export type HeritageMedia = {
  /** Omitted for curated static public media that has no database row. */
  id?: number;
  heritage_id?: number;
  media_type: "image" | "video" | "audio" | "document";
  url: string;
  caption: string | null;
  alt_text: string | null;
  credit: string | null;
  license: string | null;
  display_order: number;
  source_url?: string | null;
  creator?: string | null;
  documented_date?: string | null;
  license_url?: string | null;
  media_role?: "gallery" | "historical" | "current" | "reconstruction";
  media_context?: string | null;
  verification_status?: "unverified" | "verified";
  is_illustrative?: boolean;
  source_accessed_on?: string | null;
  thumbnail_url?: string | null;
  provider?: string;
  wikimedia_filename?: string | null;
  match_confidence?: number | string | null;
};

export type HeritageTimelineEvent = {
  id: number;
  heritage_id: number;
  title: string;
  description: string;
  event_period: string;
  event_date: string | null;
  display_order: number;
  source_id: number | null;
};

export type HeritageArtifact = {
  id: number;
  heritage_id: number;
  name: string;
  description: string;
  period: string | null;
  material: string | null;
  source_id: number | null;
};

export type HeritageArchitecturalLayer = {
  id: number;
  heritage_id: number;
  name: string;
  description: string;
  display_order: number;
  source_id: number | null;
};

export type HeritageSource = {
  id: number;
  heritage_id: number;
  source_name: string;
  source_title: string | null;
  publisher: string | null;
  source_url: string;
  source_note: string | null;
  accessed_on: string | null;
  claims_supported: string[];
  confidence?: number | string | null;
  review_status?: "unreviewed" | "pending" | "approved" | "rejected";
  reviewed_by?: string | null;
  reviewed_on?: string | null;
};

export type HeritagePublicationStatus = "draft" | "published" | "archived";

/** Mirrors the repository SQL schema and the proposed public detail contract. */
export type Heritage = {
  id: number;
  name: string;
  slug: string;
  description: string;
  history: string;
  cultural_significance: string;
  architecture: string;
  historical_period: string;
  category_id: number;
  category?: HeritageCategory;
  state: string;
  district: string | null;
  locality: string | null;
  address: string | null;
  /** PostgreSQL NUMERIC values may arrive as strings unless the API normalizes them. */
  latitude: number | string | null;
  longitude: number | string | null;
  /** True only when a stored source citation explicitly supports the coordinates. */
  coordinates_verified?: boolean;
  publication_status?: HeritagePublicationStatus;
  created_at?: string;
  updated_at?: string;
  image_url?: string | null;
  media?: HeritageMedia[];
  timeline_events?: HeritageTimelineEvent[];
  artifacts?: HeritageArtifact[];
  architectural_layers?: HeritageArchitecturalLayer[];
  sources?: HeritageSource[];
};

export type HeritageMapRecord = Pick<
  Heritage,
  "id" | "slug" | "name" | "description" | "state" | "district" | "locality" | "latitude" | "longitude"
> & {
  coordinates_verified: boolean;
  media?: HeritageMedia[] | null;
};
