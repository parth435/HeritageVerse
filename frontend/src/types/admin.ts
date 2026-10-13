/**
 * HeritageVerse Admin System - Type Definitions
 * Location: src/types/admin.ts
 *
 * NOTE: These types reflect the current UI structures in AdminApp.tsx and adminMockData.ts,
 * aligned with the underlying PostgreSQL schema where applicable.
 * DO NOT modify adminMockData.ts directly.
 */

// Publication status values used across Admin entities
export type Status = "PUBLISHED" | "DRAFT" | "ARCHIVED";

// User authorization roles
export type UserRole = "ADMIN" | "USER";

// Account status values
export type UserStatus = "ACTIVE" | "SUSPENDED";

/**
 * Heritage Site entity
 * Based on adminMockData.ts and form fields in AdminApp.tsx#L22
 */
export interface HeritageSite {
  id: string; // Currently string in mock; will map to numeric ID or slug in backend
  name: string;
  location: string;
  state: string;
  category: string;
  era: string;
  status: Status;
  updatedAt: string;
  image: string;
  description?: string; // Captured in AdminApp.tsx form; maps to heritage.description in DB
  slug?: string; // UNCERTAIN: present in PostgreSQL heritage table, but not in current mock data
}

/**
 * Payload for creating a new Heritage Site
 */
export interface CreateHeritageSiteInput {
  name: string;
  location: string;
  state: string;
  category: string;
  era: string;
  status: Status;
  description?: string;
  image?: string;
}

/**
 * Payload for updating an existing Heritage Site
 */
export type UpdateHeritageSiteInput = Partial<CreateHeritageSiteInput>;

/**
 * Timeline Event entity
 * Based on adminMockData.ts#L13-L17 and AdminApp.tsx#L24
 */
export interface TimelineEvent {
  id: string;
  year: string;
  event: string;
  description: string;
  site: string; // Relational site name; maps to heritage_id foreign key in DB
  status: Status;
  heritageId?: number; // UNCERTAIN: present in DB table heritage_timeline_events, not in current mock
}

export interface CreateTimelineEventInput {
  year: string;
  event: string;
  description: string;
  site: string;
  status: Status;
  heritageId?: number;
}

export type UpdateTimelineEventInput = Partial<CreateTimelineEventInput>;

/**
 * Editorial Story entity
 * Based on adminMockData.ts#L23-L27 and AdminApp.tsx#L24
 * NOTE: No corresponding 'stories' table exists yet in schema.sql.
 */
export interface Story {
  id: string;
  title: string;
  category: string;
  author: string;
  status: Status;
  published: string;
  content?: string; // UNCERTAIN: full story body text not currently defined in mock data
}

export interface CreateStoryInput {
  title: string;
  category: string;
  author: string;
  status: Status;
  published?: string;
  content?: string;
}

export type UpdateStoryInput = Partial<CreateStoryInput>;

/**
 * Admin User entity
 * Based on adminMockData.ts#L18-L22 and AdminApp.tsx#L24
 * NOTE: PostgreSQL 'users' table currently lacks 'role' and 'status' columns.
 */
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  joined: string;
}

/**
 * Media Reference entity
 * Based on Media view in AdminApp.tsx#L25 and PostgreSQL 'heritage_media' table
 */
export interface MediaReference {
  id: string;
  siteId: string;
  siteName: string;
  imageUrl: string;
  caption?: string;
  altText?: string;
  mediaType?: "image" | "video" | "audio" | "document";
  status: Status;
  uploadedAt: string;
}

export interface CreateMediaReferenceInput {
  siteId?: string;
  siteName?: string;
  imageUrl: string;
  caption?: string;
  altText?: string;
  mediaType?: "image" | "video" | "audio" | "document";
  status?: Status;
}

/**
 * Dashboard aggregate metrics
 * Based on stats cards in AdminApp.tsx#L20
 */
export interface AdminDashboardStats {
  heritageSitesCount: number;
  heritageSitesChange?: string; // Monthly growth indicator (e.g. "+8 this month")
  registeredUsersCount: number;
  registeredUsersChange?: string;
  timelineEventsCount: number;
  timelineEventsChange?: string;
  publishedStoriesCount: number;
  publishedStoriesChange?: string;
}

/**
 * Recent Activity log item
 * Based on Recent Activity list in AdminApp.tsx#L20
 */
export interface AdminActivity {
  id: string;
  title: string;
  type: "Heritage Site" | "Content" | "User" | "System";
  timeAgo: string;
  timestamp?: string; // ISO 8601 string from backend
}

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

/**
 * Standard API error response
 */
export interface ApiError {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
}
