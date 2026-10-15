"use strict";

const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../src");

test("Explore shows the catalogue regardless of photo checks while preserving map safeguards", async () => {
  const [api, explore, atlas, map, card, grid, adapter, imageFilter] = await Promise.all([
    readFile(path.join(root, "lib/api.ts"), "utf8"),
    readFile(path.join(root, "pages/ExplorePage.tsx"), "utf8"),
    readFile(path.join(root, "components/LivingAtlas.tsx"), "utf8"),
    readFile(path.join(root, "components/heritage/HeritageMap.tsx"), "utf8"),
    readFile(path.join(root, "components/heritage/HeritageCard.tsx"), "utf8"),
    readFile(path.join(root, "components/heritage/HeritageGrid.tsx"), "utf8"),
    readFile(path.join(root, "lib/heritageAdapter.ts"), "utf8"),
    readFile(path.join(root, "lib/exploreImages.ts"), "utf8"),
  ]);

  assert.match(api, /withVerifiedPhoto\?: boolean/);
  assert.match(api, /params\.set\("withVerifiedPhoto", String\(query\.withVerifiedPhoto\)\)/);
  assert.match(api, /if \(query\.withVerifiedPhoto !== undefined\) params\.set\("withVerifiedPhoto"/);
  assert.match(explore, /getCategories\(\{ signal: controller\.signal \}\)/);
  assert.match(explore, /getHeritageFacets\(state, \{ signal: controller\.signal \}\)/);
  assert.doesNotMatch(explore, /withVerifiedPhoto\s*:\s*true/);
  assert.doesNotMatch(atlas, /withVerifiedPhoto\s*:\s*true/);
  assert.match(atlas, /getCategories\(\{ signal: controller\.signal \}\)/);
  assert.match(atlas, /getHeritageFacets\(undefined, \{ signal: controller\.signal \}\)/);
  assert.match(explore, /limit: API_PAGE_SIZE/);
  assert.match(explore, /setItems\(prepareExplorePlaces\(records\)\)/);
  assert.doesNotMatch(explore, /filterUsableHeritageImages|withVerifiedPhoto\s*:\s*true|verifiedPhotoOnly/);
  assert.match(atlas, /getHeritage\(\{ q: query, category, state, limit: PAGE_SIZE/);
  assert.match(explore, /getHeritageMapSites\(\s*\{ q: debouncedSearch, category, state, district \}/);
  assert.match(atlas, /getHeritageMapSites\(\{ q: query, category, state \}/);
  assert.match(atlas, /<HeritageMap[^>]*verifiedPhotoOnly/);
  assert.match(explore, /setVisibleCount\(\(current\) => Math\.min\(current \+ PAGE_SIZE, items\.length\)\)/);
  assert.match(explore, /No published places match these filters/);
  assert.match(explore, /resultCount=\{loading \? 0 : items\.length\}/);
  assert.match(grid, /items\.map\(\(item, index\)/);
  assert.match(explore, /mapSites\.flatMap\(\(site\) =>/);
  assert.match(explore, /gallery: catalogueItem\.gallery/);
  assert.match(card, /Image unavailable/);
  assert.match(card, /setFailedImageUrl\(imageSrc\)/);
  assert.doesNotMatch(imageFilter, /browserImageAvailable|filterUsableHeritageImages/);
  assert.match(imageFilter, /prepareExplorePlaces\(records: Heritage\[\]\)/);
  assert.match(atlas, /selectedImage\.sourceUrl/);
  assert.match(map, /if \(verifiedPhotoOnly\)/);
  assert.match(adapter, /coordinates_verified === true && validCoordinatePair/);
  assert.match(map, /filterMappableSites/);
  assert.match(map, /placeholder\.textContent = "Image unavailable"/);
});

test("Living Atlas keeps successful catalogue results when category or facet loading fails", async () => {
  const atlas = await readFile(path.join(root, "components/LivingAtlas.tsx"), "utf8");
  const filtersEffect = atlas.match(/Promise\.allSettled\(\[\s*getCategories\([\s\S]*?setFiltersError\(errors\.length \? errors\.join\(" "\) : null\);/)?.[0];
  const catalogueEffect = atlas.match(/getHeritage\([\s\S]*?\}, \[category, offset, query, state\]\);/)?.[0];

  assert.ok(filtersEffect, "expected a separate category and facet request effect");
  assert.ok(catalogueEffect, "expected a separate catalogue request effect");
  assert.match(filtersEffect, /Promise\.allSettled\(/);
  assert.match(filtersEffect, /categoriesResult\.status === "fulfilled"/);
  assert.match(filtersEffect, /facetsResult\.status === "fulfilled"/);
  assert.doesNotMatch(filtersEffect, /setError\(/);
  assert.match(catalogueEffect, /setSites\(\(current\) => append \? \[\.\.\.current, \.\.\.page\] : page\)/);
  assert.match(catalogueEffect, /setError\(reason instanceof Error \? reason\.message : "The heritage atlas could not load\."\)/);
  assert.match(atlas, /filtersError \? \([\s\S]*?role="status"[\s\S]*?Some filter options could not load\. You can still view the collection\./);
});

test("photo-focused modules keep their verified-photo scope and the homepage uses a local attributed hero", async () => {
  const files = [
    "components/MuseumInMotion.tsx",
    "components/ThenNow.tsx",
  ];
  const contents = await Promise.all(files.map((file) => readFile(path.join(root, file), "utf8")));

  for (const source of contents) assert.match(source, /withVerifiedPhoto: true/);
  assert.match(contents[0], /ImageAttribution/);
  assert.match(contents[1], /isHeritageImageFallback\(imageSource\)/);
  assert.match(contents[1], /isHeritageImageFallback\(source\)/);
  const homepage = await readFile(path.join(root, "components/CinematicMonument.tsx"), "utf8");
  assert.match(homepage, /curatedImages\["ajanta-caves"\]/);
  assert.match(homepage, /src=\{backgroundImage\.url\}/);
  assert.match(homepage, /backgroundImage\.source_url/);
  assert.doesNotMatch(homepage, /getHeritage\(|withVerifiedPhoto/);
});

test("Time Machine and Monument Dissection load published catalogue records without photo or timeline filters", async () => {
  const [selection, timeMachine, dissection] = await Promise.all([
    readFile(path.join(root, "hooks/useHeritageSelection.ts"), "utf8"),
    readFile(path.join(root, "components/TimeMachine.tsx"), "utf8"),
    readFile(path.join(root, "components/MonumentDissection.tsx"), "utf8"),
  ]);

  assert.match(selection, /getHeritage\(\{ q: query\.trim\(\) \|\| undefined, limit: SITE_PAGE_SIZE \}/);
  assert.doesNotMatch(selection, /withVerifiedPhoto|hasTimeline/);
  assert.match(timeMachine, /useHeritageSelection\(\)/);
  assert.match(dissection, /useHeritageSelection\(\)/);
  assert.match(timeMachine, /No sourced timeline events are recorded for/);
  assert.match(dissection, /Architectural details, construction techniques, and materials are not recorded/);
});
