import type { HeritageMedia, HeritageSource, HeritageTimelineEvent } from "@/types/heritage";
import type { HeritageView, HeritageLayerView } from "@/lib/heritageAdapter";

export type HeritageFeatureDetailState = {
  loading: boolean;
  site: HeritageView | null;
  error: string | null;
};

export type HeritageFeatureDetailAction =
  | { type: "loading" }
  | { type: "success"; site: HeritageView }
  | { type: "error"; message: string }
  | { type: "reset" };

export function heritageFeatureDetailReducer(
  state: HeritageFeatureDetailState,
  action: HeritageFeatureDetailAction,
): HeritageFeatureDetailState;

export function presentTimelineMoment(
  event: HeritageTimelineEvent,
  sources?: HeritageSource[],
): {
  label: string;
  value: string;
  precision: "day" | "period" | "unknown";
  sourceLinked: boolean;
};

export function sortTimelineEvents(events?: HeritageTimelineEvent[]): HeritageTimelineEvent[];
export function getClaimSources(sources: HeritageSource[] | undefined, claim: string): HeritageSource[];

export function getArchitectureEvidence(site: HeritageView | null): {
  architecture: string;
  architectureSources: HeritageSource[];
  historicalPeriod: string;
  periodSources: HeritageSource[];
  layers: HeritageLayerView[];
  artifactMaterials: Array<{
    id: number;
    name: string;
    description: string;
    period: string | null;
    material: string;
    source_id: number | null;
  }>;
};

export function getDefaultHeritageOption(
  options?: HeritageView[],
  preferences?: { hasTimeline?: boolean },
): HeritageView | null;
export function isValidHeritageSiteId(value: unknown): value is string;
export function getVerifiedComparisonPair(media?: HeritageMedia[]): {
  historical: HeritageMedia | null;
  current: HeritageMedia | null;
};

export function architecturalLayerKey(layer: HeritageLayerView): string;
export function heritageSourceHref(heritageId: string | number, sourceId: number | null | undefined): string | null;

export const initialFeatureDetailState: HeritageFeatureDetailState;
