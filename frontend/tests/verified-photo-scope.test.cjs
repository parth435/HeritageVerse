"use strict";

const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../src");

test("Explore keeps verified-photo filtering on cards while map pins use curated scope", async () => {
  const [api, explore, map, card] = await Promise.all([
    readFile(path.join(root, "lib/api.ts"), "utf8"),
    readFile(path.join(root, "pages/ExplorePage.tsx"), "utf8"),
    readFile(path.join(root, "components/heritage/HeritageMap.tsx"), "utf8"),
    readFile(path.join(root, "components/heritage/HeritageCard.tsx"), "utf8"),
  ]);

  assert.match(api, /withVerifiedPhoto\?: boolean/);
  assert.match(api, /params\.set\("withVerifiedPhoto", String\(query\.withVerifiedPhoto\)\)/);
  assert.match(api, /withVerifiedPhoto\?: boolean/);
  assert.match(explore, /getCategories\(\{ signal: controller\.signal \}, \{ withVerifiedPhoto: true \}\)/);
  assert.match(explore, /getHeritageFacets\(state, \{ signal: controller\.signal \}, \{ withVerifiedPhoto: true \}\)/);
  assert.match(explore, /withVerifiedPhoto: true,[\s\S]{0,100}limit: PAGE_SIZE/);
  const mapRequest = explore.match(/getHeritageMapSites\(\s*(\{[^}]*\})/);
  assert.ok(mapRequest);
  assert.doesNotMatch(mapRequest[1], /withVerifiedPhoto/);
  assert.match(explore, /matching curated places without verified photographs/);
  assert.match(explore, /setOffset\(items\.length\)/);
  assert.match(explore, /verifiedPhotoOnly/);
  assert.match(explore, /<HeritageMap[^>]*verifiedPhotoOnly/);
  assert.match(map, /if \(verifiedPhotoOnly\)/);
  assert.match(map, /Verified photograph unavailable/);
  assert.match(card, /verifiedPhotoOnly && isHeritageImageFallback/);
});

test("homepage place features source photographs from the verified-photo API scope", async () => {
  const files = [
    "components/CinematicMonument.tsx",
    "components/LivingAtlas.tsx",
    "components/MuseumInMotion.tsx",
    "components/ThenNow.tsx",
    "hooks/useHeritageSelection.ts",
  ];
  const contents = await Promise.all(files.map((file) => readFile(path.join(root, file), "utf8")));

  for (const source of contents) assert.match(source, /withVerifiedPhoto: true/);
  assert.match(contents[0], /candidate\.verification_status === "verified"/);
  assert.match(contents[0], /candidate\.is_illustrative === false/);
  assert.doesNotMatch(contents[0], /images\.unsplash\.com/);
  assert.match(contents[0], /Source/);
  assert.match(contents[2], /ImageAttribution/);
  assert.match(contents[1], /selectedImage\.sourceUrl/);
  assert.match(contents[3], /isHeritageImageFallback\(imageSource\)/);
  assert.match(contents[3], /isHeritageImageFallback\(source\)/);
});
