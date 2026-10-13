/**
 * Normalize the configured API origin to exactly one /api path segment.
 * An empty value keeps same-origin requests, which Vite proxies during local development.
 * @param {string | undefined | null} configuredBaseUrl
 */
export function getApiBaseUrl(configuredBaseUrl) {
  const configured = typeof configuredBaseUrl === "string"
    ? configuredBaseUrl.trim().replace(/\/+$/, "")
    : "";

  if (!configured) return "/api";

  const authNormalized = configured.replace(/\/api\/auth$/i, "/api");
  const deduplicated = authNormalized.replace(/(?:\/api){2,}$/i, "/api");
  if (/\/api$/i.test(deduplicated)) return deduplicated;
  return `${deduplicated}/api`;
}

/**
 * Join an API endpoint to a normalized API base without duplicating /api.
 * @param {string} endpoint
 * @param {string} apiBaseUrl
 */
export function buildApiUrl(endpoint, apiBaseUrl) {
  const base = apiBaseUrl.replace(/\/+$/, "");
  const path = endpoint.replace(/^\/+/, "");
  const apiPath = path.replace(/^(?:api(?=\/|[?#]|$)\/?)+/i, "");
  return apiPath ? `${base}/${apiPath}` : base;
}
