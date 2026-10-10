/**
 * HeritageVerse Admin API Service
 * Location: src/services/adminApi.ts
 *
 * NOTE: These service functions define the contract for future Admin backend integration.
 * All endpoints below are PLANNED / PENDING BACKEND IMPLEMENTATION.
 * This service is NOT yet connected to AdminApp.tsx or any existing component.
 */

import type {
  AdminActivity,
  AdminDashboardStats,
  AdminUser,
  ApiResponse,
  CreateHeritageSiteInput,
  CreateMediaReferenceInput,
  CreateStoryInput,
  CreateTimelineEventInput,
  HeritageSite,
  MediaReference,
  Story,
  TimelineEvent,
  UpdateHeritageSiteInput,
  UpdateStoryInput,
  UpdateTimelineEventInput,
  UserRole,
  UserStatus,
} from "@/types/admin";

// Base API URL with environment variable support and fallback
const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/auth\/?$/, "") ??
  "http://localhost:5000/api";

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "AdminApiError";
  }
}

/**
 * Internal helper to retrieve the stored auth token
 */
function getAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  try {
    const rawSession = localStorage.getItem("heritageverse-session");
    if (rawSession) {
      const session = JSON.parse(rawSession);
      if (session.token) {
        headers["Authorization"] = `Bearer ${session.token}`;
      }
    }
  } catch {
    // Ignore storage read errors in SSR/fallback environments
  }

  return headers;
}

/**
 * Generic request helper with error parsing and status mapping
 */
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...options.headers,
      },
    });
  } catch {
    throw new AdminApiError(
      "Unable to connect to the HeritageVerse server. Please ensure the backend is running.",
      0
    );
  }

  const data = await response.json().catch(() => ({
    success: false,
    message: `HTTP ${response.status}: Failed to parse JSON response.`,
  }));

  if (!response.ok) {
    let friendlyMessage = data.message;
    if (response.status === 401) {
      friendlyMessage = "Your session has expired or is invalid. Please sign in again.";
    } else if (response.status === 403) {
      friendlyMessage = "Access denied. Administrator privileges required.";
    } else if (response.status >= 500) {
      friendlyMessage = "A server error occurred. Please try again shortly.";
    }
    throw new AdminApiError(
      friendlyMessage || `Request failed with status ${response.status}`,
      response.status
    );
  }

  return data as T;
}

/* =========================================================================
 * 1. DASHBOARD & ANALYTICS
 * ========================================================================= */

/**
 * Fetch aggregate platform metrics for the admin dashboard.
 * PLANNED / PENDING BACKEND IMPLEMENTATION: GET /api/admin/stats
 */
export async function getAdminStats(): Promise<ApiResponse<AdminDashboardStats>> {
  return request<ApiResponse<AdminDashboardStats>>("/admin/stats");
}

/**
 * Fetch the platform audit trail / recent activity feed.
 * PLANNED / PENDING BACKEND IMPLEMENTATION: GET /api/admin/activity
 */
export async function getAdminActivity(): Promise<ApiResponse<AdminActivity[]>> {
  return request<ApiResponse<AdminActivity[]>>("/admin/activity");
}

/* =========================================================================
 * 2. HERITAGE SITES CRUD
 * ========================================================================= */

/**
 * Fetch all heritage sites with optional search, state, and status filters.
 * PLANNED / PENDING BACKEND IMPLEMENTATION: GET /api/admin/sites
 */
export async function getHeritageSites(params?: {
  search?: string;
  state?: string;
  status?: string;
}): Promise<ApiResponse<HeritageSite[]>> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.state && params.state !== "All states") query.set("state", params.state);
  if (params?.status) query.set("status", params.status);

  const queryString = query.toString() ? `?${query.toString()}` : "";
  return request<ApiResponse<HeritageSite[]>>(`/admin/sites${queryString}`);
}

/**
 * Fetch details of a single heritage site by ID.
 * PLANNED / PENDING BACKEND IMPLEMENTATION: GET /api/admin/sites/:id
 */
export async function getHeritageSite(id: string): Promise<ApiResponse<HeritageSite>> {
  return request<ApiResponse<HeritageSite>>(`/admin/sites/${id}`);
}

/**
 * Create a new heritage site record.
 * PLANNED / PENDING BACKEND IMPLEMENTATION: POST /api/admin/sites
 */
export async function createHeritageSite(
  data: CreateHeritageSiteInput
): Promise<ApiResponse<HeritageSite>> {
  return request<ApiResponse<HeritageSite>>("/admin/sites", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Update an existing heritage site by ID.
 * PLANNED / PENDING BACKEND IMPLEMENTATION: PUT /api/admin/sites/:id
 */
export async function updateHeritageSite(
  id: string,
  data: UpdateHeritageSiteInput
): Promise<ApiResponse<HeritageSite>> {
  return request<ApiResponse<HeritageSite>>(`/admin/sites/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * Delete or archive a heritage site by ID.
 * PLANNED / PENDING BACKEND IMPLEMENTATION: DELETE /api/admin/sites/:id
 */
export async function deleteHeritageSite(id: string): Promise<ApiResponse<{ id: string }>> {
  return request<ApiResponse<{ id: string }>>(`/admin/sites/${id}`, {
    method: "DELETE",
  });
}

/* =========================================================================
 * 3. TIMELINE EVENTS CRUD
 * ========================================================================= */

/**
 * Fetch timeline events with optional heritage_id filtering.
 * PLANNED / PENDING BACKEND IMPLEMENTATION: GET /api/admin/timeline
 */
export async function getTimelineEvents(
  heritageId?: string
): Promise<ApiResponse<TimelineEvent[]>> {
  const query = heritageId ? `?heritageId=${encodeURIComponent(heritageId)}` : "";
  return request<ApiResponse<TimelineEvent[]>>(`/admin/timeline${query}`);
}

/**
 * Create a new historical timeline event.
 * PLANNED / PENDING BACKEND IMPLEMENTATION: POST /api/admin/timeline
 */
export async function createTimelineEvent(
  data: CreateTimelineEventInput
): Promise<ApiResponse<TimelineEvent>> {
  return request<ApiResponse<TimelineEvent>>("/admin/timeline", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Update an existing timeline event.
 * PLANNED / PENDING BACKEND IMPLEMENTATION: PUT /api/admin/timeline/:id
 */
export async function updateTimelineEvent(
  id: string,
  data: UpdateTimelineEventInput
): Promise<ApiResponse<TimelineEvent>> {
  return request<ApiResponse<TimelineEvent>>(`/admin/timeline/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * Delete a timeline event.
 * PLANNED / PENDING BACKEND IMPLEMENTATION: DELETE /api/admin/timeline/:id
 */
export async function deleteTimelineEvent(id: string): Promise<ApiResponse<{ id: string }>> {
  return request<ApiResponse<{ id: string }>>(`/admin/timeline/${id}`, {
    method: "DELETE",
  });
}

/* =========================================================================
 * 4. STORIES & EDITORIAL CONTENT CRUD
 * ========================================================================= */

/**
 * Fetch all editorial stories.
 * PLANNED / PENDING BACKEND IMPLEMENTATION: GET /api/admin/stories
 */
export async function getStories(): Promise<ApiResponse<Story[]>> {
  return request<ApiResponse<Story[]>>("/admin/stories");
}

/**
 * Create a new editorial story.
 * PLANNED / PENDING BACKEND IMPLEMENTATION: POST /api/admin/stories
 */
export async function createStory(data: CreateStoryInput): Promise<ApiResponse<Story>> {
  return request<ApiResponse<Story>>("/admin/stories", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Update an editorial story.
 * PLANNED / PENDING BACKEND IMPLEMENTATION: PUT /api/admin/stories/:id
 */
export async function updateStory(
  id: string,
  data: UpdateStoryInput
): Promise<ApiResponse<Story>> {
  return request<ApiResponse<Story>>(`/admin/stories/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * Delete an editorial story.
 * PLANNED / PENDING BACKEND IMPLEMENTATION: DELETE /api/admin/stories/:id
 */
export async function deleteStory(id: string): Promise<ApiResponse<{ id: string }>> {
  return request<ApiResponse<{ id: string }>>(`/admin/stories/${id}`, {
    method: "DELETE",
  });
}

/* =========================================================================
 * 5. USER MANAGEMENT (ADMIN VIEW)
 * ========================================================================= */

/**
 * Fetch registered platform users for admin management.
 * PLANNED / PENDING BACKEND IMPLEMENTATION: GET /api/admin/users
 */
export async function getAdminUsers(): Promise<ApiResponse<AdminUser[]>> {
  return request<ApiResponse<AdminUser[]>>("/admin/users");
}

/**
 * Update a user's account status (e.g. ACTIVE vs SUSPENDED).
 * PLANNED / PENDING BACKEND IMPLEMENTATION: PATCH /api/admin/users/:id/status
 */
export async function updateUserStatus(
  id: string,
  status: UserStatus
): Promise<ApiResponse<AdminUser>> {
  return request<ApiResponse<AdminUser>>(`/admin/users/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

/**
 * Update a user's role (e.g. USER vs ADMIN).
 * PLANNED / PENDING BACKEND IMPLEMENTATION: PATCH /api/admin/users/:id/role
 */
export async function updateUserRole(
  id: string,
  role: UserRole
): Promise<ApiResponse<AdminUser>> {
  return request<ApiResponse<AdminUser>>(`/admin/users/${id}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

/* =========================================================================
 * 6. MEDIA LIBRARY CRUD
 * ========================================================================= */

/**
 * Fetch media references linked to heritage sites.
 * PLANNED / PENDING BACKEND IMPLEMENTATION: GET /api/admin/media
 */
export async function getMediaReferences(): Promise<ApiResponse<MediaReference[]>> {
  return request<ApiResponse<MediaReference[]>>("/admin/media");
}

/**
 * Create a new media reference record.
 * PLANNED / PENDING BACKEND IMPLEMENTATION: POST /api/admin/media
 */
export async function createMediaReference(
  data: CreateMediaReferenceInput
): Promise<ApiResponse<MediaReference>> {
  return request<ApiResponse<MediaReference>>("/admin/media", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Delete a media reference.
 * PLANNED / PENDING BACKEND IMPLEMENTATION: DELETE /api/admin/media/:id
 */
export async function deleteMediaReference(id: string): Promise<ApiResponse<{ id: string }>> {
  return request<ApiResponse<{ id: string }>>(`/admin/media/${id}`, {
    method: "DELETE",
  });
}
