"use strict";

const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../src");

test("ordinary catalogues include published records without verified photos and retain safe map rules", async () => {
  const [api, explore, atlas, map, card, grid, adapter] = await Promise.all([
    readFile(path.join(root, "lib/api.ts"), "utf8"),
    readFile(path.join(root, "pages/ExplorePage.tsx"), "utf8"),
    readFile(path.join(root, "components/LivingAtlas.tsx"), "utf8"),
    readFile(path.join(root, "components/heritage/HeritageMap.tsx"), "utf8"),
    readFile(path.join(root, "components/heritage/HeritageCard.tsx"), "utf8"),
    readFile(path.join(root, "components/heritage/HeritageGrid.tsx"), "utf8"),
    readFile(path.join(root, "lib/heritageAdapter.ts"), "utf8"),
  ]);

  assert.match(api, /withVerifiedPhoto\?: boolean/);
  assert.match(api, /params\.set\("withVerifiedPhoto", String\(query\.withVerifiedPhoto\)\)/);
  assert.match(api, /if \(query\.withVerifiedPhoto !== undefined\) params\.set\("withVerifiedPhoto"/);
  assert.doesNotMatch(explore, /withVerifiedPhoto\s*:\s*true/);
  assert.doesNotMatch(atlas, /withVerifiedPhoto\s*:\s*true/);
  assert.match(explore, /getCategories\(\{ signal: controller\.signal \}\)/);
  assert.match(explore, /getHeritageFacets\(state, \{ signal: controller\.signal \}\)/);
  assert.match(atlas, /getCategories\(\{ signal: controller\.signal \}\)/);
  assert.match(atlas, /getHeritageFacets\(undefined, \{ signal: controller\.signal \}\)/);
  assert.match(explore, /getHeritage\([\s\S]{0,180}limit: PAGE_SIZE/);
  assert.match(atlas, /getHeritage\(\{ q: query, category, state, limit: PAGE_SIZE/);
  assert.match(explore, /getHeritageMapSites\(/);
  assert.match(atlas, /getHeritageMapSites\(\{ q: query, category, state \}/);
  assert.match(explore, /<HeritageMap[^>]*verifiedPhotoOnly/);
  assert.match(atlas, /<HeritageMap[^>]*verifiedPhotoOnly/);
  assert.match(explore, /setOffset\(items\.length\)/);
  assert.match(explore, /No published places match these filters/);
  assert.match(grid, /items\.map\(\(item, index\)/);
  assert.match(card, /No verified photograph/);
  assert.match(atlas, /selectedImage\.sourceUrl/);
  assert.match(map, /if \(verifiedPhotoOnly\)/);
  assert.match(adapter, /coordinates_verified === true && validCoordinatePair/);
  assert.match(map, /filterMappableSites/);
});

test("photo-focused homepage features retain the verified-photo API scope", async () => {
  const files = [
    "components/CinematicMonument.tsx",
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
  assert.match(contents[1], /ImageAttribution/);
  assert.match(contents[2], /isHeritageImageFallback\(imageSource\)/);
  assert.match(contents[2], /isHeritageImageFallback\(source\)/);
});
