"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const imageHelpers = import("../src/lib/image-assets.js");

test("shared heritage image helper prefers a responsive thumbnail", async () => {
  const { getHeritageImageSource } = await imageHelpers;
  assert.equal(getHeritageImageSource({
    url: "https://upload.wikimedia.org/wikipedia/commons/a/original.jpg",
    thumbnail_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/thumb.jpg",
  }), "https://upload.wikimedia.org/wikipedia/commons/thumb/a/thumb.jpg");
});

test("broken thumbnails fall back to the original image before the component fallback", async () => {
  const { getHeritageImageFallback } = await imageHelpers;
  const image = {
    url: "https://upload.wikimedia.org/wikipedia/commons/a/original.jpg",
    thumbnail_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/thumb.jpg",
  };
  assert.equal(getHeritageImageFallback(image, image.thumbnail_url), image.url);
  assert.equal(getHeritageImageFallback(image, image.url), null);
});

test("unsafe thumbnail URLs fall back to the safe source and unsafe sources are rejected", async () => {
  const { getHeritageImageSource, getHeritageImageFallback } = await imageHelpers;
  const image = {
    url: "https://commons.wikimedia.org/wiki/File:photo.jpg",
    thumbnail_url: "javascript:alert(1)",
  };
  assert.equal(getHeritageImageSource(image), image.url);
  assert.equal(getHeritageImageSource({ url: "http://example.test/photo.jpg" }), null);
  assert.equal(getHeritageImageFallback({ url: "javascript:alert(1)" }, "https://bad.example"), null);
});

test("detail pages use only verified current images as heroes and keep historical images in the gallery", async () => {
  const { getCurrentHeritageHeroImage, getVerifiedHeritageImages } = await imageHelpers;
  const historical = { id: 1, mediaRole: "historical", verificationStatus: "verified", isIllustrative: false };
  const undated = { id: 2, mediaRole: "gallery", verificationStatus: "verified", isIllustrative: false };
  const current = { id: 3, mediaRole: "current", verificationStatus: "verified", isIllustrative: false };
  const unverifiedCurrent = { id: 4, mediaRole: "current", verificationStatus: "unverified", isIllustrative: false };
  const illustrativeCurrent = { id: 5, mediaRole: "current", verificationStatus: "verified", isIllustrative: true };
  assert.equal(getCurrentHeritageHeroImage([historical, undated, current, unverifiedCurrent, illustrativeCurrent]), current);
  assert.deepEqual(getVerifiedHeritageImages([historical, undated, current, unverifiedCurrent, illustrativeCurrent]), [historical, undated, current]);
  assert.equal(getCurrentHeritageHeroImage([historical, undated]), null, "dark fallback is used when there is no reliably dated current image");
});
