import { readAuthToken } from "@/lib/sessionToken";
import type { ApiErrorEnvelope } from "@/types/api";

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiRequestOptions = {
  method?: ApiMethod;
  body?: unknown;
  headers?: HeadersInit;
  /** Set false for public calls that should not attach a stored bearer token. */
  authenticated?: boolean;
};

function getApiBaseUrl() {
  const configured = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "");
  const fallback = "http://localhost:5000/api/auth";
  const base = configured || fallback;

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

/** Sends JSON requests and leaves successful response shapes to their callers. */
export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { method = "GET", body, headers, authenticated = true } = options;
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json");
  if (body !== undefined) requestHeaders.set("Content-Type", "application/json");

  const token = authenticated ? readAuthToken() : null;
  if (token) requestHeaders.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}/${path.replace(/^\/+/, "")}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

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

  if (!response.ok) {
    throw new ApiRequestError(getErrorMessage(payload, response.status), response.status, payload);
  }

  if (payload === undefined) {
    throw new ApiRequestError("The server returned an empty response.", response.status, payload);
  }

  return payload as T;
}
