"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const imageHelpers = import("../src/lib/image-assets.js");
const frontendRoot = path.resolve(__dirname, "..");

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
  assert.equal(getHeritageImageFallback(image, image.url), "/heritage-image-fallback.svg");
  assert.equal(getHeritageImageFallback(image, "/heritage-image-fallback.svg"), null);
});

test("unsafe thumbnail URLs fall back to the safe source and unsafe sources are rejected", async () => {
  const { getHeritageImageSource, getHeritageImageFallback } = await imageHelpers;
  const image = {
    url: "https://commons.wikimedia.org/wiki/File:photo.jpg",
    thumbnail_url: "javascript:alert(1)",
  };
  assert.equal(getHeritageImageSource(image), image.url);
  assert.equal(getHeritageImageSource({ url: "http://example.test/photo.jpg" }), null);
  assert.equal(getHeritageImageFallback({ url: "javascript:alert(1)" }, "https://bad.example"), "/heritage-image-fallback.svg");
});

test("the four existing verified Commons photographs use exact local copies with source-specific fallback", async () => {
  const { getHeritageImageSource, getHeritageImageFallback } = await imageHelpers;
  const cases = [
    ["https://upload.wikimedia.org/wikipedia/commons/e/e5/Ajanta_cave_no._9_2010.jpg", "ajanta-caves.jpg"],
    ["https://upload.wikimedia.org/wikipedia/commons/4/41/Elephanta_Caves%2C_India.jpg", "elephanta-caves.jpg"],
    ["https://upload.wikimedia.org/wikipedia/commons/3/3a/Ellora_Caves%2C_India%2C_Kailasanatha_Temple_2.jpg", "ellora-caves.jpg"],
    ["https://upload.wikimedia.org/wikipedia/commons/7/77/Remotest_Rampart_on_Panhala.jpg", "panhala-fort.jpg"],
  ];
  for (const [url, localFilename] of cases) {
    const image = { url };
    const local = `/heritage-images/${localFilename}`;
    assert.equal(getHeritageImageSource(image), local);
    assert.equal(getHeritageImageFallback(image, "https://upload.wikimedia.org/wikipedia/commons/verified/failed.jpg"), local);
    assert.equal(getHeritageImageFallback(image, local), "/heritage-image-fallback.svg");
    assert.equal(getHeritageImageFallback(image, "/heritage-image-fallback.svg"), null);
    assert.equal(fs.existsSync(path.join(frontendRoot, "public", "heritage-images", localFilename)), true);
  }
});

test("same-origin curated public image paths resolve directly and fail to the image placeholder", async () => {
  const { getHeritageImageSource, getHeritageImageFallback } = await imageHelpers;
  const local = "/heritage-images/gateway-of-india.jpg";
  assert.equal(getHeritageImageSource({ url: local }), local);
  assert.equal(getHeritageImageFallback({ url: local }, local), "/heritage-image-fallback.svg");
  assert.equal(getHeritageImageFallback({ url: local }, "/heritage-image-fallback.svg"), null);
  assert.equal(getHeritageImageSource({ url: "/heritage-images/../private.jpg" }), null);
  assert.equal(getHeritageImageSource({ url: "//untrusted.example/photo.jpg" }), null);
});

test("local image fallbacks do not apply to unrelated Wikimedia or other HTTPS URLs", async () => {
  const { getHeritageImageSource, getHeritageImageFallback } = await imageHelpers;
  const image = { url: "https://upload.wikimedia.org/wikipedia/commons/verified/another-place.jpg" };
  assert.equal(getHeritageImageSource(image), image.url);
  assert.equal(getHeritageImageFallback(image, image.url), "/heritage-image-fallback.svg");
  assert.equal(getHeritageImageSource({ url: "https://example.test/wikipedia/commons/e/e5/Ajanta_cave_no._9_2010.jpg" }), "https://example.test/wikipedia/commons/e/e5/Ajanta_cave_no._9_2010.jpg");
});

test("detail pages use only verified current images as heroes and keep historical images in the gallery", async () => {
  const { getCurrentHeritageHeroImage, getHeritageHeroImage, getVerifiedHeritageImages } = await imageHelpers;
  const historical = { id: 1, mediaRole: "historical", verificationStatus: "verified", isIllustrative: false };
  const undated = { id: 2, mediaRole: "gallery", verificationStatus: "verified", isIllustrative: false };
  const current = { id: 3, mediaRole: "current", verificationStatus: "verified", isIllustrative: false };
  const unverifiedCurrent = { id: 4, mediaRole: "current", verificationStatus: "unverified", isIllustrative: false };
  const illustrativeCurrent = { id: 5, mediaRole: "current", verificationStatus: "verified", isIllustrative: true };
  assert.equal(getCurrentHeritageHeroImage([historical, undated, current, unverifiedCurrent, illustrativeCurrent]), current);
  assert.equal(getHeritageHeroImage([historical, undated, current, unverifiedCurrent, illustrativeCurrent]), current);
  assert.deepEqual(getVerifiedHeritageImages([historical, undated, current, unverifiedCurrent, illustrativeCurrent]), [historical, undated, current]);
  assert.equal(getCurrentHeritageHeroImage([historical, undated]), null, "dark fallback is used when there is no reliably dated current image");
  assert.equal(getHeritageHeroImage([historical, undated]), historical, "a verified gallery photo can fill the detail hero when no current photo exists");
});
