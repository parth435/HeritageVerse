export type HeritageCategory = {
  id: number;
  name: string;
  slug: string;
};

export type HeritageMedia = {
  id: number;
  heritage_id: number;
  media_type: "image" | "video" | "audio" | "document";
  url: string;
  caption: string | null;
  alt_text: string | null;
  credit: string | null;
  license: string | null;
  display_order: number;
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
  source_url: string;
  source_note: string | null;
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
  /** PostgreSQL NUMERIC values may arrive as strings unless the API normalizes them. */
  latitude: number | string | null;
  longitude: number | string | null;
  publication_status?: HeritagePublicationStatus;
  created_at?: string;
  updated_at?: string;
  media?: HeritageMedia[];
  timeline_events?: HeritageTimelineEvent[];
  artifacts?: HeritageArtifact[];
  architectural_layers?: HeritageArchitecturalLayer[];
  sources?: HeritageSource[];
};
