"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createHistoricalIllustration, getReconstructionStatus, ReconstructionError } = require("../integrations/reconstruction");

const heritage = { name: "Example Heritage", history: "Documented history", architecture: "Documented architecture", historical_period: "Recorded period" };
const referenceImage = { url: "https://images.example.test/history.jpg", source_url: "https://source.example.test/file", creator: "Verified creator", documented_date: "1890", license: "CC0", license_url: "https://creativecommons.org/publicdomain/zero/1.0/", verification_status: "verified", is_illustrative: false };
const config = { endpoint: "https://provider.example.test/v1/reconstruct", apiKey: "test-only-secret" };

test("reconstruction reports missing or unsafe provider configuration without exposing credentials", () => {
  assert.deepEqual(getReconstructionStatus({ endpoint: "", apiKey: "" }), { configured: false, reason: "provider_not_configured", provider: null });
  assert.deepEqual(getReconstructionStatus({ endpoint: "http://provider.example.test", apiKey: "secret" }), { configured: false, reason: "provider_configuration_invalid", provider: null });
  assert.deepEqual(getReconstructionStatus(config), { configured: true, reason: null, provider: "Configured image provider" });
  assert.deepEqual(getReconstructionStatus({ provider: "openai", openaiApiKey: "" }), { configured: false, reason: "provider_not_configured", provider: null });
  assert.deepEqual(getReconstructionStatus({ provider: "openai", openaiApiKey: "test-only-secret" }), { configured: true, reason: null, provider: "OpenAI Image API" });
  assert.deepEqual(getReconstructionStatus({ provider: "openai", openaiApiKey: "secret", model: "unsupported" }), { configured: false, reason: "provider_configuration_invalid", provider: null });
});

test("OpenAI image edit downloads only bounded verified Wikimedia images and returns a temporary illustrative PNG", async () => {
  const sourceBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const outputBase64 = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString("base64");
  let providerRequest;
  const result = await createHistoricalIllustration(heritage, {
    ...referenceImage,
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/example.png",
  }, {
    provider: "openai",
    openaiApiKey: "test-only-secret",
    fetchImpl: async (url, options) => {
      if (new URL(url).hostname === "upload.wikimedia.org") {
        return new Response(sourceBytes, { headers: { "content-type": "image/png" } });
      }
      providerRequest = { url: String(url), options };
      return new Response(JSON.stringify({ data: [{ b64_json: outputBase64 }] }), { headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(providerRequest.url, "https://api.openai.com/v1/images/edits");
  assert.equal(providerRequest.options.headers.Authorization, "Bearer test-only-secret");
  assert.equal(providerRequest.options.body.get("model"), "gpt-image-2.5-sunburst");
  assert.equal(providerRequest.options.body.get("image[]").type, "image/png");
  assert.match(providerRequest.options.body.get("prompt"), /not an authentic historical photograph/i);
  assert.match(result.image_url, /^data:image\/png;base64,/);
  assert.equal(result.license, null);
  assert.match(result.rights_notice, /no item-specific license/i);
  assert.equal(result.is_illustrative, true);
});

test("OpenAI image edit rejects untrusted sources, mismatched MIME data, and oversized files", async () => {
  const options = { provider: "openai", openaiApiKey: "test-only-secret" };
  await assert.rejects(createHistoricalIllustration(heritage, { ...referenceImage, url: "https://example.test/image.png" }, { ...options, fetchImpl: async () => { throw new Error("must not fetch"); } }), (error) => error.code === "reference_image_host_not_allowed");
  await assert.rejects(createHistoricalIllustration(heritage, { ...referenceImage, url: "https://upload.wikimedia.org/image.png" }, { ...options, fetchImpl: async () => new Response(Buffer.from("not an image"), { headers: { "content-type": "image/png" } }) }), (error) => error.code === "reference_image_invalid_type");
  await assert.rejects(createHistoricalIllustration(heritage, { ...referenceImage, url: "https://upload.wikimedia.org/image.png" }, { ...options, fetchImpl: async () => new Response(Buffer.alloc(0), { status: 200, headers: { "content-type": "image/png", "content-length": String(9 * 1024 * 1024) } }) }), (error) => error.code === "reference_image_too_large");
});

test("reconstruction sends sourced context and accepts only licensed illustrative output", async () => {
  let request;
  const result = await createHistoricalIllustration(heritage, referenceImage, {
    ...config,
    fetchImpl: async (url, options) => {
      request = { url, options, payload: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ image_url: "https://generated.example.test/result.png", is_generated: true, provider: "Test service", license: "CC0", license_url: "https://creativecommons.org/publicdomain/zero/1.0/" }) };
    },
  });
  assert.equal(request.url, config.endpoint);
  assert.equal(request.options.headers.Authorization, "Bearer test-only-secret");
  assert.equal(request.payload.reference_image.source_url, referenceImage.source_url);
  assert.match(request.payload.required_disclaimer, /not an authentic historical photograph/);
  assert.equal(result.is_illustrative, true);
  assert.match(result.disclaimer, /AI-generated illustrative visualization/);
});

test("reconstruction rejects absent sources, unsafe provider output, and provider failures", async () => {
  await assert.rejects(createHistoricalIllustration(heritage, { ...referenceImage, verification_status: "unverified" }, config), (error) => error.code === "verified_historical_reference_required");
  await assert.rejects(createHistoricalIllustration(heritage, referenceImage, { ...config, fetchImpl: async () => ({ ok: true, json: async () => ({ image_url: "javascript:alert(1)", is_generated: true, license: "CC0", license_url: "https://creativecommons.org/publicdomain/zero/1.0/" }) }) }), (error) => error.code === "reconstruction_provider_invalid_response");
  await assert.rejects(createHistoricalIllustration(heritage, referenceImage, { ...config, fetchImpl: async () => ({ ok: true, json: async () => ({ image_url: referenceImage.url, is_generated: true, license: "CC0", license_url: "https://creativecommons.org/publicdomain/zero/1.0/" }) }) }), (error) => error.code === "reconstruction_provider_invalid_response");
  await assert.rejects(createHistoricalIllustration(heritage, referenceImage, { ...config, fetchImpl: async () => { throw new Error("secret endpoint"); } }), (error) => error instanceof ReconstructionError && error.status === 502 && !error.message.includes("secret endpoint"));
  await assert.rejects(createHistoricalIllustration(heritage, referenceImage, { ...config, fetchImpl: async () => { const error = new Error("timeout"); error.name = "TimeoutError"; throw error; } }), (error) => error.code === "reconstruction_provider_timeout");
});
