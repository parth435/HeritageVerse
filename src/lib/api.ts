import { readAuthToken } from "@/lib/sessionToken";
import type { ApiErrorEnvelope, PaginatedApiResponse } from "@/types/api";
import type { AuthResponse, User } from "@/types/auth";
import type { Heritage, HeritageCategory } from "@/types/heritage";

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiRequestOptions = {
  method?: ApiMethod;
  body?: unknown;
  headers?: HeadersInit;
  /** Set false for public calls that should not attach a stored bearer token. */
  authenticated?: boolean;
  signal?: AbortSignal;
};

function getApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "");
  const base = configured || "http://localhost:8000";

  if (/\/api\/auth$/i.test(base)) return base.replace(/\/auth$/i, "");
  if (/\/api$/i.test(base)) return base;
  return `${base}/api`;
}

const API_BASE_URL = getApiBaseUrl();

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
    response = await fetch(`${API_BASE_URL}/${path.replace(/^\/+/, "")}`, {
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

export async function getCategories(requestOptions: Pick<ApiRequestOptions, "signal"> = {}) {
  const response = await apiRequest<{ success: true; categories: HeritageCategory[] }>("categories", requestOptions);
  return response.categories;
}

export type HeritageQuery = {
  q?: string;
  category?: string;
  state?: string;
  district?: string;
  limit?: number;
  offset?: number;
};

const MAX_HERITAGE_LIMIT = 100;
const MAX_HERITAGE_OFFSET = 1_000_000;

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(Math.floor(value), maximum));
}

export function getHeritage(query: HeritageQuery = {}, requestOptions: Pick<ApiRequestOptions, "signal"> = {}) {
  const params = new URLSearchParams();
  for (const key of ["q", "category", "state", "district"] as const) {
    const value = query[key]?.trim();
    if (value) params.set(key, value);
  }
  params.set("limit", String(boundedInteger(query.limit, 24, 1, MAX_HERITAGE_LIMIT)));
  params.set("offset", String(boundedInteger(query.offset, 0, 0, MAX_HERITAGE_OFFSET)));

  return apiRequest<PaginatedApiResponse<Heritage>>(`heritage?${params.toString()}`, requestOptions);
}

export async function getHeritageById(id: string | number, requestOptions: Pick<ApiRequestOptions, "signal"> = {}) {
  const response = await apiRequest<{ success: true; heritage: Heritage }>(
    `heritage/${encodeURIComponent(String(id))}`,
    requestOptions,
  );
  return response.heritage;
}
