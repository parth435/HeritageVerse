"use strict";

const OPENAI_IMAGE_EDITS_URL = "https://api.openai.com/v1/images/edits";
const OPENAI_IMAGE_MODELS = new Set(["gpt-image-2.5-sunburst", "gpt-image-2.5-flare"]);
const IMAGE_HOSTS = new Set(["thumb.wikimedia.org", "upload.wikimedia.org"]);
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
const MAX_PROVIDER_RESPONSE_BYTES = 20 * 1024 * 1024;
const OPENAI_IMAGE_GUIDE = "https://developers.openai.com/api/docs/guides/image-generation";

class ReconstructionError extends Error {
  constructor(code, status, message) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function readConfiguration(options = {}) {
  const openaiApiKey = options.openaiApiKey ?? process.env.OPENAI_API_KEY?.trim() ?? "";
  const configuredProvider = (options.provider ?? process.env.HERITAGE_RECONSTRUCTION_PROVIDER?.trim().toLowerCase()) || (openaiApiKey ? "openai" : "custom");

  if (configuredProvider === "openai") {
    if (!openaiApiKey) return { configured: false, reason: "provider_not_configured" };
    const model = options.model ?? process.env.OPENAI_IMAGE_MODEL?.trim() ?? "gpt-image-2.5-sunburst";
    if (!OPENAI_IMAGE_MODELS.has(model)) return { configured: false, reason: "provider_configuration_invalid" };
    return { configured: true, provider: "OpenAI Image API", mode: "openai", endpoint: OPENAI_IMAGE_EDITS_URL, apiKey: openaiApiKey, model };
  }

  if (configuredProvider !== "custom") return { configured: false, reason: "provider_configuration_invalid" };
  const endpoint = options.endpoint ?? process.env.HERITAGE_RECONSTRUCTION_URL?.trim() ?? "";
  const apiKey = options.apiKey ?? process.env.HERITAGE_RECONSTRUCTION_API_KEY?.trim() ?? "";
  if (!endpoint || !apiKey) return { configured: false, reason: "provider_not_configured" };
  try {
    const url = new URL(endpoint);
    const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (!(url.protocol === "https:" || (url.protocol === "http:" && isLoopback)) || url.username || url.password || url.hash) {
      return { configured: false, reason: "provider_configuration_invalid" };
    }
    return { configured: true, provider: "Configured image provider", mode: "custom", endpoint: url.href, apiKey };
  } catch {
    return { configured: false, reason: "provider_configuration_invalid" };
  }
}

function getReconstructionStatus(options) {
  const configuration = readConfiguration(options);
  return {
    configured: configuration.configured,
    reason: configuration.reason ?? null,
    provider: configuration.configured ? configuration.provider : null,
  };
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validReferenceImage(referenceImage) {
  return Boolean(referenceImage &&
    referenceImage.verification_status === "verified" &&
    !referenceImage.is_illustrative &&
    validHttpsUrl(referenceImage.url) &&
    validHttpsUrl(referenceImage.source_url) &&
    referenceImage.creator &&
    referenceImage.documented_date &&
    referenceImage.license &&
    validHttpsUrl(referenceImage.license_url));
}

async function readLimitedBody(response, maximumBytes, errorCode, message) {
  const contentLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new ReconstructionError(errorCode, 413, message);
  }

  if (!response.body?.getReader) {
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > maximumBytes) throw new ReconstructionError(errorCode, 413, message);
    return body;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel().catch(() => {});
      throw new ReconstructionError(errorCode, 413, message);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

function imageMimeFromBytes(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function validateReferenceImageUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ReconstructionError("verified_historical_reference_required", 422, "A verified historical image URL is required.");
  }
  if (url.protocol !== "https:" || url.username || url.password || !IMAGE_HOSTS.has(url.hostname)) {
    throw new ReconstructionError("reference_image_host_not_allowed", 422, "The verified historical image must be hosted by Wikimedia Commons.");
  }
  return url;
}

async function downloadReferenceImage(referenceImage, fetchImpl) {
  let url = validateReferenceImageUrl(referenceImage.url);
  let response;
  try {
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      response = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers?.get?.("location");
      if (!location || redirects === 3) throw new ReconstructionError("reference_image_unavailable", 502, "The historical reference image could not be loaded.");
      url = validateReferenceImageUrl(new URL(location, url).href);
    }
  } catch (error) {
    if (error instanceof ReconstructionError) throw error;
    const code = error?.name === "TimeoutError" || error?.name === "AbortError" ? "reference_image_timeout" : "reference_image_unavailable";
    throw new ReconstructionError(code, 502, "The historical reference image could not be reached from this server.");
  }

  if (!response?.ok) throw new ReconstructionError("reference_image_unavailable", 502, "The historical reference image could not be loaded.");
  const declaredMime = response.headers?.get?.("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp"].includes(declaredMime)) {
    throw new ReconstructionError("reference_image_invalid_type", 422, "The historical reference URL did not return a supported image type.");
  }
  const bytes = await readLimitedBody(response, MAX_REFERENCE_BYTES, "reference_image_too_large", "The historical reference image exceeds the 8 MB limit.");
  if (imageMimeFromBytes(bytes) !== declaredMime) {
    throw new ReconstructionError("reference_image_invalid_type", 422, "The historical reference image content does not match its declared type.");
  }
  const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[declaredMime];
  return { bytes, mime: declaredMime, filename: `heritage-reference.${extension}` };
}

function reconstructionPrompt(heritage, referenceImage) {
  return [
    `Create an explicitly illustrative visualization inspired by the documented heritage site ${heritage.name}.`,
    `Reference image context: ${referenceImage.documented_date}; photographed by ${referenceImage.creator}; ${referenceImage.media_context || ""}`,
    `Documented period: ${heritage.historical_period || "not recorded"}. Documented history: ${heritage.history || "not recorded"}. Documented architecture: ${heritage.architecture || "not recorded"}.`,
    "Use the reference image as visual context, but do not claim photographic reconstruction or add architectural, costume, event, or landscape details that the supplied record does not support.",
    "The output must be clearly understood as AI-generated interpretation, not an authentic historical photograph.",
  ].join("\n").slice(0, 5000);
}

async function createOpenAiIllustration(heritage, referenceImage, configuration, fetchImpl, options) {
  const source = await downloadReferenceImage(referenceImage, fetchImpl);
  const form = new FormData();
  form.append("model", configuration.model);
  form.append("prompt", reconstructionPrompt(heritage, referenceImage));
  form.append("size", "1024x1024");
  form.append("quality", "low");
  form.append("output_format", "png");
  form.append("image[]", new Blob([source.bytes], { type: source.mime }), source.filename);

  let response;
  try {
    response = await fetchImpl(configuration.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${configuration.apiKey}`, Accept: "application/json" },
      body: form,
      signal: AbortSignal.timeout(options.timeoutMs ?? 90_000),
    });
  } catch (error) {
    const code = error?.name === "TimeoutError" || error?.name === "AbortError" ? "reconstruction_provider_timeout" : "reconstruction_provider_unavailable";
    throw new ReconstructionError(code, 502, "The image provider could not be reached. Try again later.");
  }
  if (!response.ok) {
    const status = response.status === 429 ? 503 : 502;
    const code = response.status === 429 ? "reconstruction_provider_rate_limited" : "reconstruction_provider_error";
    throw new ReconstructionError(code, status, response.status === 429 ? "The image provider is rate-limiting requests. Try again later." : "The image provider returned an error.");
  }

  let result;
  try {
    const responseBytes = await readLimitedBody(response, MAX_PROVIDER_RESPONSE_BYTES, "reconstruction_provider_response_too_large", "The image provider response exceeded the 20 MB limit.");
    result = JSON.parse(responseBytes.toString("utf8"));
  } catch (error) {
    if (error instanceof ReconstructionError) throw error;
    throw new ReconstructionError("reconstruction_provider_invalid_response", 502, "The image provider returned unreadable output.");
  }
  const imageBase64 = result?.data?.[0]?.b64_json;
  if (typeof imageBase64 !== "string" || imageBase64.length > 19 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
    throw new ReconstructionError("reconstruction_provider_invalid_response", 502, "The image provider did not return a valid generated image.");
  }
  const generatedBytes = Buffer.from(imageBase64, "base64");
  if (generatedBytes.length > 14 * 1024 * 1024 || imageMimeFromBytes(generatedBytes) !== "image/png") {
    throw new ReconstructionError("reconstruction_provider_invalid_response", 502, "The image provider returned an unsupported image payload.");
  }
  return {
    image_url: `data:image/png;base64,${imageBase64}`,
    provider: "OpenAI Image API",
    license: null,
    license_url: null,
    rights_notice: "The provider response has no item-specific license. Review provider documentation before reuse.",
    provider_documentation: OPENAI_IMAGE_GUIDE,
    generated_at: new Date().toISOString(),
    is_illustrative: true,
    disclaimer: "AI-generated illustrative visualization — not an authentic historical photograph.",
  };
}

async function createHistoricalIllustration(heritage, referenceImage, options = {}) {
  const configuration = readConfiguration(options);
  if (!configuration.configured) {
    throw new ReconstructionError(configuration.reason ?? "provider_not_configured", 503, "Historical illustration generation is not configured on this server.");
  }
  if (!validReferenceImage(referenceImage)) {
    throw new ReconstructionError("verified_historical_reference_required", 422, "A verified, attributed historical image is required before reconstruction.");
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (configuration.mode === "openai") return createOpenAiIllustration(heritage, referenceImage, configuration, fetchImpl, options);

  const payload = {
    task: "heritage_historical_illustration",
    site: {
      name: heritage.name,
      historical_period: heritage.historical_period,
      documented_history: heritage.history,
      documented_architecture: heritage.architecture,
    },
    reference_image: {
      url: referenceImage.url,
      date: referenceImage.documented_date,
      creator: referenceImage.creator,
      source_url: referenceImage.source_url,
      license: referenceImage.license,
    },
    prompt: "Create an explicitly illustrative interpretation informed by the supplied source and documented site notes. Do not present it as an authentic historical photograph. Do not add specific historical details that are unsupported by the supplied record. Clearly label the result as AI-generated and illustrative.",
    required_disclaimer: "AI-generated illustrative visualization — not an authentic historical photograph.",
    response_contract: { image_url: "HTTPS URL", is_generated: true, license: "string", license_url: "HTTPS URL" },
  };

  let response;
  try {
    response = await fetchImpl(configuration.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${configuration.apiKey}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
    });
  } catch (error) {
    const code = error?.name === "TimeoutError" || error?.name === "AbortError" ? "reconstruction_provider_timeout" : "reconstruction_provider_unavailable";
    throw new ReconstructionError(code, 502, "The image provider could not be reached. Try again later.");
  }
  if (!response.ok) throw new ReconstructionError("reconstruction_provider_error", 502, "The image provider returned an error.");

  let result;
  try {
    result = await response.json();
  } catch {
    throw new ReconstructionError("reconstruction_provider_invalid_response", 502, "The image provider returned unreadable output.");
  }
  if (result?.is_generated !== true || !validHttpsUrl(result.image_url) || new URL(result.image_url).href === new URL(referenceImage.url).href || typeof result.license !== "string" || !result.license.trim() || !validHttpsUrl(result.license_url)) {
    throw new ReconstructionError("reconstruction_provider_invalid_response", 502, "The image provider did not return an attributed generated image and license.");
  }
  return {
    image_url: new URL(result.image_url).href,
    provider: typeof result.provider === "string" ? result.provider.slice(0, 100) : configuration.provider,
    license: result.license.trim().slice(0, 300),
    license_url: new URL(result.license_url).href,
    rights_notice: null,
    provider_documentation: null,
    generated_at: new Date().toISOString(),
    is_illustrative: true,
    disclaimer: "AI-generated illustrative visualization — not an authentic historical photograph.",
  };
}

module.exports = { ReconstructionError, createHistoricalIllustration, getReconstructionStatus };
