"use strict";

const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const assets = import("../src/lib/image-assets.js");
const frontendRoot = path.resolve(__dirname, "..");

test("public image selection excludes unverified and illustrative media", async () => {
  const {
    getHeritageHeroImage,
    getHeritageImageFallback,
    getVerifiedHeritageImages,
    isHeritageImageFallback,
  } = await assets;
  const provisional = {
    src: "https://upload.wikimedia.org/wikipedia/commons/0/00/provisional.jpg",
    verificationStatus: "unverified",
    mediaContext: "provisional-user-supplied-candidate",
    mediaRole: "current",
    isIllustrative: false,
  };
  const illustrative = {
    src: "https://upload.wikimedia.org/wikipedia/commons/0/01/illustration.jpg",
    verificationStatus: "verified",
    isIllustrative: true,
  };
  const verified = {
    src: "https://upload.wikimedia.org/wikipedia/commons/0/02/verified.jpg",
    verificationStatus: "verified",
    mediaRole: "gallery",
    isIllustrative: false,
  };

  assert.deepEqual(getVerifiedHeritageImages([provisional, illustrative, verified]), [verified]);
  assert.equal(getHeritageHeroImage([provisional, illustrative]), null);
  assert.equal(getHeritageHeroImage([provisional, verified]), verified);
  assert.equal(getHeritageImageFallback({ url: provisional.src }, provisional.src), "/heritage-image-fallback.svg");
  assert.equal(isHeritageImageFallback("/heritage-image-fallback.svg"), true);
  assert.equal(isHeritageImageFallback(provisional.src), false);
});

test("cards, map popups, and detail pages use verified images and identify their placeholders", async () => {
  const [adapter, card, map, detail] = await Promise.all([
    readFile(path.join(frontendRoot, "src/lib/heritageAdapter.ts"), "utf8"),
    readFile(path.join(frontendRoot, "src/components/heritage/HeritageCard.tsx"), "utf8"),
    readFile(path.join(frontendRoot, "src/components/heritage/HeritageMap.tsx"), "utf8"),
    readFile(path.join(frontendRoot, "src/pages/HeritageDetailPage.tsx"), "utf8"),
  ]);

  assert.match(adapter, /item\.verification_status === "verified" && item\.is_illustrative !== true/);
  assert.match(card, /getVerifiedHeritageImages\(item\.gallery\)/);
  assert.match(card, /onError=\{\(\) => setFailedImageUrl\(imageSrc\)\}/);
  assert.match(card, /No verified photograph/);
  assert.match(card, /Illustrative placeholder/);
  assert.match(map, /getVerifiedHeritageImages\(site\.gallery\)/);
  assert.match(map, /Verified photograph unavailable/);
  assert.match(map, /No verified photograph/);
  assert.match(detail, /getVerifiedHeritageImages\(item\.gallery\)/);
  assert.match(detail, /getHeritageHeroImage\(item\.gallery\)/);
  assert.match(detail, /onError=\{\(\) => setFailedUrl\(source\)\}/);
  assert.match(detail, /Illustrative placeholder; verified photograph unavailable/);
  assert.match(detail, /No verified media is available yet/);
  for (const source of [card, map, detail]) {
    assert.doesNotMatch(source, /Provisional.*unverified/i);
  }
});
