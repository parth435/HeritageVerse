import { readAuthToken } from "@/lib/sessionToken";
import { buildApiUrl, getApiBaseUrl } from "@/lib/apiUrl.js";
import type { ApiErrorEnvelope, PaginatedApiResponse } from "@/types/api";
import type { AuthResponse, User } from "@/types/auth";
import type { Heritage, HeritageCategory, HeritageMapRecord, HeritageMedia } from "@/types/heritage";

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiRequestOptions = {
  method?: ApiMethod;
  body?: unknown;
  headers?: HeadersInit;
  /** Set false for public calls that should not attach a stored bearer token. */
  authenticated?: boolean;
  signal?: AbortSignal;
};

export type PublicHeritageScope = {
  withVerifiedPhoto?: boolean;
};

const API_BASE_URL = getApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.payload = payload;
    if (isApiError(payload) && payload.code) this.code = payload.code;
  }
}

function isApiError(value: unknown): value is ApiErrorEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    value.success === false &&
    "message" in value &&
    typeof value.message === "string"
  );
}

function getErrorMessage(payload: unknown, status: number) {
  if (isApiError(payload)) return payload.message;
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }
  return `Request failed (${status}).`;
}

/** Sends JSON requests and handles authentication, parsing, and HTTP errors centrally. */
export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { method = "GET", body, headers, authenticated = true, signal } = options;
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json");
  if (body !== undefined) requestHeaders.set("Content-Type", "application/json");

  const token = authenticated ? readAuthToken() : null;
  if (token) requestHeaders.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(buildApiUrl(path, API_BASE_URL), {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw error;
    }
    throw new ApiRequestError(
      "Unable to reach the HeritageVerse API. Check your connection and try again.",
      0,
      null,
    );
  }

  if (response.status === 204) return undefined as T;

  const raw = await response.text();
  let payload: unknown;
  if (raw) {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      payload = undefined;
    }
  }

  if (!response.ok || isApiError(payload)) {
    throw new ApiRequestError(getErrorMessage(payload, response.status), response.status, payload);
  }

  if (payload === undefined) {
    throw new ApiRequestError("The server returned an unreadable or empty response.", response.status, null);
  }

  return payload as T;
}

export type SignupInput = { name: string; email: string; password: string };
export type SigninInput = { email: string; password: string };

export function authSignup(input: SignupInput) {
  return apiRequest<AuthResponse>("auth/signup", {
    method: "POST",
    authenticated: false,
    body: input,
  });
}

export function authSignin(input: SigninInput) {
  return apiRequest<AuthResponse>("auth/signin", {
    method: "POST",
    authenticated: false,
    body: input,
  });
}

export async function authMe(requestOptions: Pick<ApiRequestOptions, "signal"> = {}) {
  const response = await apiRequest<{ success: true; user: User }>("auth/me", requestOptions);
  return response.user;
}

export async function getCategories(
  requestOptions: Pick<ApiRequestOptions, "signal"> = {},
  scope: PublicHeritageScope = {},
) {
  const suffix = scope.withVerifiedPhoto === undefined
    ? ""
    : `?withVerifiedPhoto=${String(scope.withVerifiedPhoto)}`;
  const response = await apiRequest<{ success: true; categories: HeritageCategory[] }>(`categories${suffix}`, requestOptions);
  return response.categories;
}

export async function getHeritageFacets(
  state?: string,
  requestOptions: Pick<ApiRequestOptions, "signal"> = {},
  scope: PublicHeritageScope = {},
) {
  const params = new URLSearchParams();
  if (state?.trim()) params.set("state", state.trim());
  if (scope.withVerifiedPhoto !== undefined) params.set("withVerifiedPhoto", String(scope.withVerifiedPhoto));
  const suffix = params.size ? `?${params.toString()}` : "";
  return apiRequest<{ success: true; states: string[]; districts: string[] }>(`heritage-facets${suffix}`, requestOptions);
}

export type HeritageQuery = {
  q?: string;
  category?: string;
  state?: string;
  district?: string;
  hasTimeline?: boolean;
  withVerifiedPhoto?: boolean;
  limit?: number;
  offset?: number;
};

const MAX_HERITAGE_LIMIT = 100;
const MAX_HERITAGE_OFFSET = 1_000_000;

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(Math.floor(value), maximum));
}

export function getHeritage(query: HeritageQuery = {}, requestOptions: Pick<ApiRequestOptions, "signal" | "authenticated"> = {}) {
  const params = new URLSearchParams();
  for (const key of ["q", "category", "state", "district"] as const) {
    const value = query[key]?.trim();
    if (value) params.set(key, value);
  }
  if (query.hasTimeline !== undefined) params.set("hasTimeline", String(query.hasTimeline));
  if (query.withVerifiedPhoto !== undefined) params.set("withVerifiedPhoto", String(query.withVerifiedPhoto));
  params.set("limit", String(boundedInteger(query.limit, 24, 1, MAX_HERITAGE_LIMIT)));
  params.set("offset", String(boundedInteger(query.offset, 0, 0, MAX_HERITAGE_OFFSET)));

  return apiRequest<PaginatedApiResponse<Heritage>>(`heritage?${params.toString()}`, requestOptions);
}

export type LocationSearchResult = {
  label: string;
  latitude: number;
  longitude: number;
  osm_type: string | null;
  osm_id: string | null;
  category: string | null;
  type: string | null;
};

export async function searchLocation(query: string, requestOptions: Pick<ApiRequestOptions, "signal"> = {}) {
  const params = new URLSearchParams({ q: query.trim() });
  return apiRequest<{ success: true; results: LocationSearchResult[]; attribution: string }>(`locations/search?${params.toString()}`, {
    ...requestOptions,
    authenticated: false,
  });
}

export type HeritageMapQuery = Pick<HeritageQuery, "q" | "category" | "state" | "district" | "withVerifiedPhoto">;
export type HeritageMapPage = {
  success: true;
  items: HeritageMapRecord[];
  pagination: { limit: number; offset: number; total: number };
};

const HERITAGE_MAP_PAGE_SIZE = 100;

export function getHeritageMapPage(
  query: HeritageMapQuery & { limit?: number; offset?: number } = {},
  requestOptions: Pick<ApiRequestOptions, "signal"> = {},
) {
  const params = new URLSearchParams();
  for (const key of ["q", "category", "state", "district"] as const) {
    const value = query[key]?.trim();
    if (value) params.set(key, value);
  }
  if (query.withVerifiedPhoto !== undefined) params.set("withVerifiedPhoto", String(query.withVerifiedPhoto));
  params.set("limit", String(boundedInteger(query.limit, HERITAGE_MAP_PAGE_SIZE, 1, MAX_HERITAGE_LIMIT)));
  params.set("offset", String(boundedInteger(query.offset, 0, 0, MAX_HERITAGE_OFFSET)));
  return apiRequest<HeritageMapPage>("heritage-map?" + params.toString(), requestOptions);
}

export async function getHeritageMapSites(
  query: HeritageMapQuery = {},
  requestOptions: Pick<ApiRequestOptions, "signal"> = {},
) {
  const sites = new Map<number, HeritageMapRecord>();
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const page = await getHeritageMapPage(
      { ...query, limit: HERITAGE_MAP_PAGE_SIZE, offset },
      requestOptions,
    );
    total = page.pagination.total;
    if (page.items.length === 0) break;
    for (const site of page.items) {
      if (!sites.has(site.id)) sites.set(site.id, site);
    }
    offset = page.pagination.offset + page.items.length;
  }

  return [...sites.values()];
}

export async function getHeritageById(id: string | number, requestOptions: Pick<ApiRequestOptions, "signal"> = {}) {
  const response = await apiRequest<{ success: true; heritage: Heritage }>(
    `heritage/${encodeURIComponent(String(id))}`,
    requestOptions,
  );
  return response.heritage;
}

export type ReconstructionStatus = { configured: boolean; reason: "provider_not_configured" | "provider_configuration_invalid" | null; provider: string | null };
export type HistoricalIllustration = { image_url: string; provider: string; license: string | null; license_url: string | null; rights_notice: string | null; provider_documentation: string | null; generated_at: string; is_illustrative: true; disclaimer: string };
export function getReconstructionStatus() {
  return apiRequest<{ success: true; reconstruction: ReconstructionStatus }>("reconstruction/status", { authenticated: false }).then((response) => response.reconstruction);
}
export function requestHistoricalIllustration(heritageId: number) {
  return apiRequest<{ success: true; illustration: HistoricalIllustration }>(`heritage/${heritageId}/reconstruction`, { method: "POST" }).then((response) => response.illustration);
}

export type Favorite = {
  heritage: Heritage;
  created_at: string;
};

export async function getFavorites(requestOptions: Pick<ApiRequestOptions, "signal"> = {}) {
  const response = await apiRequest<{ success: true; favorites: Favorite[] }>("favorites", requestOptions);
  return response.favorites;
}

export function addFavorite(heritageId: number) {
  return apiRequest<{ success: true; message: string; favorite: { heritage_id: number; created_at?: string } }>("favorites", {
    method: "POST",
    body: { heritage_id: heritageId },
  });
}

export function removeFavorite(heritageId: number) {
  return apiRequest<{ success: true; message: string; removed: boolean }>(`favorites/${encodeURIComponent(String(heritageId))}`, {
    method: "DELETE",
  });
}

export type VisitedPlace = Favorite;

export async function getVisited(requestOptions: Pick<ApiRequestOptions, "signal"> = {}) {
  const response = await apiRequest<{ success: true; visited: VisitedPlace[] }>("visited", requestOptions);
  return response.visited;
}

export function addVisited(heritageId: number) {
  return apiRequest<{ success: true; message: string }>("visited", { method: "POST", body: { heritage_id: heritageId } });
}

export function removeVisited(heritageId: number) {
  return apiRequest<{ success: true; message: string; removed: boolean }>(`visited/${encodeURIComponent(String(heritageId))}`, { method: "DELETE" });
}

export function updateProfile(name: string) {
  return apiRequest<{ success: true; message: string; user: User }>("users/me", { method: "PATCH", body: { name } });
}

export type Review = { id: number; heritage_id: number; rating: number; comment: string | null; created_at: string; updated_at: string; author: { id: number; name: string } };
export type ReviewSummary = { count: number; average_rating: number | string };
export async function getReviews(heritageId: number, options: Pick<ApiRequestOptions, "signal"> = {}) { return apiRequest<{ success: true; reviews: Review[]; summary: ReviewSummary }>(`heritage/${heritageId}/reviews`, { ...options, authenticated: false }); }
export function saveReview(heritageId: number, rating: number, comment: string) { return apiRequest<{ success: true; review: Review }>(`heritage/${heritageId}/reviews`, { method: "POST", body: { rating, comment } }); }
export function deleteReview(reviewId: number) { return apiRequest<{ success: true }>(`reviews/${reviewId}`, { method: "DELETE" }); }

export type Journey = { id: number; name: string; description: string | null; created_at: string; updated_at: string; stops?: JourneyStop[] };
export type JourneyStop = { id: number; heritage_id: number; stop_order: number; notes: string | null; name: string; slug: string; state: string; district: string | null; locality: string | null; latitude: number | string | null; longitude: number | string | null };
export type JourneyRoute = {
  provider: string;
  mode: "driving";
  distance_meters: number;
  duration_seconds: number;
  duration_kind: "estimated";
  live_traffic: false;
  geometry: { type: "LineString"; coordinates: [number, number][] };
  legs: { distance_meters: number; duration_seconds: number; steps: { instruction: string; distance_meters: number; duration_seconds: number }[] }[];
};
export type RoutePreviewInput = {
  origin: { latitude: number; longitude: number };
  heritage_id: number;
  mode?: "driving";
};
export type RoutePreview = JourneyRoute;
export type RoutePreviewResponse = {
  success: true;
  route: RoutePreview;
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
};
export const calculateRoutePreview = (input: RoutePreviewInput, requestOptions: Pick<ApiRequestOptions, "signal"> = {}) =>
  apiRequest<RoutePreviewResponse>("routes", { method: "POST", body: input, ...requestOptions });
export const getJourneys = () => apiRequest<{ success: true; journeys: Journey[] }>("journeys").then((response) => response.journeys);
export const createJourney = (name: string, description: string) => apiRequest<{ success: true; journey: Journey }>("journeys", { method: "POST", body: { name, description } });
export const getJourney = (id: number) => apiRequest<{ success: true; journey: Journey }>(`journeys/${id}`).then((response) => response.journey);
export const getJourneyRoute = (id: number) => apiRequest<{ success: true; route: JourneyRoute; stops: JourneyStop[] }>(`journeys/${id}/route`);
export const updateJourney = (id: number, name: string, description: string) => apiRequest<{ success: true; journey: Journey }>(`journeys/${id}`, { method: "PATCH", body: { name, description } });
export const deleteJourney = (id: number) => apiRequest<{ success: true }>(`journeys/${id}`, { method: "DELETE" });
export const addJourneyStop = (journeyId: number, heritageId: number, stopOrder: number, notes: string) => apiRequest<{ success: true }>(`journeys/${journeyId}/stops`, { method: "POST", body: { heritage_id: heritageId, stop_order: stopOrder, notes } });
export const removeJourneyStop = (journeyId: number, stopId: number) => apiRequest<{ success: true }>(`journeys/${journeyId}/stops/${stopId}`, { method: "DELETE" });

export type AdminDashboard = { heritage: { total: number; published: number; draft: number }; users: number; reviews: number; categories: number; images: { verified: number; missing: number; needs_review: number; provider_network_errors: number } };
export type AdminUser = Pick<User, "id" | "name" | "email" | "created_at"> & { role: "user" | "admin"; status: "ACTIVE" | "SUSPENDED" };
export type AdminUserDetails = AdminUser & { favorites_count: number; visits_count: number; reviews_count: number; journeys_count: number };
export type AdminUserQuery = { q?: string; role?: "user" | "admin"; status?: "ACTIVE" | "SUSPENDED"; limit?: number; offset?: number };
export type AdminImage = Pick<HeritageMedia, "url" | "thumbnail_url" | "alt_text" | "caption" | "credit" | "creator" | "license" | "license_url" | "source_url" | "provider" | "verification_status" | "match_confidence"> & { media_id: number; heritage_id: number; name: string; slug: string; state: string; district: string | null };
export type AdminImageCandidate = { filename?: string; title?: string; source_url?: string; creator?: string | null; license?: string | null; license_url?: string | null; confidence?: number; missing_metadata?: string[]; qid?: string; label?: string; description?: string; coordinate?: unknown; candidate_kind?: string; candidate_image_url?: string | null; candidate_resolution_status?: string; commons_page_status?: string; supplied_url_http_status?: number | null; candidate_url_matches_commons?: boolean | null; submitted_creator_claim?: string | null; submitted_license_claim?: string | null; creator_claim_matches?: boolean | null; license_claim_matches?: boolean | null; image_url?: string | null; thumbnail_url?: string | null; destination_match?: boolean; destination_match_evidence?: string | null; destination_match_reason?: string | null; destination_distance_km?: number | null; binary_verified?: boolean };
export type AdminImageReview = { heritage_id: number; name: string; slug: string; state: string; district: string | null; publication_status?: string; acquisition_status: "needs_review" | "failed" | null; error_code: string | null; error_message: string | null; last_checked_at: string | null; retry_count: number | null; candidates: AdminImageCandidate[]; unverified_images: Omit<AdminImage, "media_id" | "heritage_id" | "name" | "slug" | "state" | "district">[] };
export type AdminHeritage = Pick<Heritage, "id" | "name" | "slug" | "state" | "district" | "locality" | "address" | "historical_period" | "publication_status"> & { category: HeritageCategory; updated_at: string; image: (Pick<HeritageMedia, "id" | "url" | "thumbnail_url" | "alt_text" | "verification_status" | "creator" | "credit" | "license" | "license_url" | "source_url" | "provider" | "is_illustrative">) | null; image_status: string };
export const getAdminDashboard = () => apiRequest<{ success: true; dashboard: AdminDashboard }>("admin/dashboard").then((response) => response.dashboard);
export function getAdminUsers(query: AdminUserQuery = {}) {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.role) params.set("role", query.role);
  if (query.status) params.set("status", query.status);
  params.set("limit", String(boundedInteger(query.limit, 25, 1, 100)));
  params.set("offset", String(boundedInteger(query.offset, 0, 0, MAX_HERITAGE_OFFSET)));
  return apiRequest<{ success: true; users: AdminUser[]; pagination: { total: number; limit: number; offset: number } }>(`admin/users?${params}`);
}
export const getAdminUserById = (id: number) => apiRequest<{ success: true; user: AdminUserDetails }>(`admin/users/${encodeURIComponent(String(id))}`).then((response) => response.user);
export const updateAdminUserRole = (id: number, role: AdminUser["role"]) => apiRequest<{ success: true; message: string; user: AdminUser }>(`admin/users/${encodeURIComponent(String(id))}/role`, { method: "PATCH", body: { role } });
export const updateAdminUserStatus = (id: number, status: AdminUser["status"]) => apiRequest<{ success: true; message: string; user: AdminUser }>(`admin/users/${encodeURIComponent(String(id))}/status`, { method: "PATCH", body: { status } });
export type AdminHeritageQuery = { q?: string; state?: string; category?: number; status?: string; limit?: number; offset?: number };
export type AdminPage<T> = { items: T[]; total: number; limit: number; offset: number };
export function getAdminHeritage(query: AdminHeritageQuery = {}) {
  const params = new URLSearchParams();
  for (const key of ["q", "state", "category", "status"] as const) {
    const value = query[key];
    if (value !== undefined && String(value).trim()) params.set(key, String(value).trim());
  }
  params.set("limit", String(boundedInteger(query.limit, 25, 1, 100)));
  params.set("offset", String(boundedInteger(query.offset, 0, 0, MAX_HERITAGE_OFFSET)));
  return apiRequest<{ success: true; heritage: AdminHeritage[]; pagination: { total: number; limit: number; offset: number }; states: string[] }>(`admin/heritage?${params}`).then((response) => ({ heritage: response.heritage, pagination: response.pagination, states: response.states }));
}
export function getAdminImages(view: "verified" | "missing" | "review", limit = 24, offset = 0) {
  const params = new URLSearchParams({ view, limit: String(boundedInteger(limit, 24, 1, 100)), offset: String(boundedInteger(offset, 0, 0, MAX_HERITAGE_OFFSET)) });
  return apiRequest<{ success: true; view: "verified" | "missing" | "review"; images: AdminImage[] | AdminImageReview[]; pagination: { total: number; limit: number; offset: number } }>(`admin/images?${params}`);
}
export const getAdminHeritageById = (id: number) => apiRequest<{ success: true; heritage: Heritage }>(`admin/heritage/${id}`).then((response) => response.heritage);
export const createAdminHeritage = (body: Record<string, unknown>) => apiRequest<{ success: true; heritage: Heritage }>("admin/heritage", { method: "POST", body });
export const updateAdminHeritage = (id: number, body: Record<string, unknown>) => apiRequest<{ success: true; heritage: Heritage }>(`admin/heritage/${id}`, { method: "PATCH", body });
export const archiveAdminHeritage = (id: number) => apiRequest<{ success: true; heritage: Pick<Heritage, "id" | "publication_status"> }>(`admin/heritage/${id}`, { method: "DELETE" });
export const createAdminCategory = (body: { name: string; slug: string }) => apiRequest<{ success: true; category: HeritageCategory }>("admin/categories", { method: "POST", body });
export const updateAdminCategory = (id: number, body: { name: string; slug: string }) => apiRequest<{ success: true; category: HeritageCategory }>(`admin/categories/${id}`, { method: "PATCH", body });
export const deleteAdminCategory = (id: number) => apiRequest<{ success: true }>(`admin/categories/${id}`, { method: "DELETE" });
