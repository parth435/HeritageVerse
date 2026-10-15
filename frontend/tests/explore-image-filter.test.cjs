"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fsSync = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const curatedImages = require("../../backend/utilities/curated-heritage-images");
const catalogue = require("../../backend/database/selected-catalogue.json");

const projectRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(projectRoot, "src");
let viteServerPromise;

test.after(async () => {
  if (viteServerPromise) {
    const server = await viteServerPromise;
    await server.close();
    viteServerPromise = null;
  }
});

async function loadImageModules() {
  const [{ createServer }, reactPlugin] = await Promise.all([
    import("vite"),
    import("@vitejs/plugin-react"),
  ]);
  if (!viteServerPromise) {
    viteServerPromise = createServer({
      root: projectRoot,
      configFile: false,
      appType: "custom",
      logLevel: "silent",
      plugins: [reactPlugin.default()],
      resolve: { alias: { "@": sourceRoot } },
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
  }
  const server = await viteServerPromise;
  return {
    ...(await server.ssrLoadModule("/src/lib/exploreImages.ts")),
    getHeritageImageSource: (await server.ssrLoadModule("/src/lib/image-assets.js")).getHeritageImageSource,
  };
}

function publicRecord(id, slug, media = []) {
  return {
    id,
    slug,
    name: slug.replaceAll("-", " "),
    description: "Published heritage record",
    category: { id: 1, name: "Heritage", slug: "heritage" },
    category_id: 1,
    state: "Maharashtra",
    district: "Pune",
    locality: "Pune",
    latitude: 18.5,
    longitude: 73.8,
    coordinates_verified: true,
    image_url: media[0]?.url ?? null,
    media,
  };
}

test("Explore attaches local photos to all 30 published records without a verification gate", async () => {
  const { prepareExplorePlaces, getHeritageImageSource } = await loadImageModules();
  const places = prepareExplorePlaces(catalogue.places.map((place, index) => publicRecord(index + 1, place.slug, [])));

  assert.equal(Object.keys(curatedImages.CURATED_IMAGES).length, 30);
  assert.equal(places.length, 30);
  for (const place of places) {
    const image = curatedImages.CURATED_IMAGES[place.slug];
    assert.ok(image, `${place.slug} has a photo mapping`);
    assert.equal(place.gallery[0].src, image.url, `${place.slug} uses its mapped local file`);
    assert.equal(getHeritageImageSource({ url: place.gallery[0].src }), image.url);
  }
  const shaniwar = places.find((item) => item.slug === "shaniwar-wada");
  assert.equal(shaniwar.gallery[0].verificationStatus, "verified");
  assert.equal(shaniwar.gallery[0].creator, "Shree$432");
  assert.equal(shaniwar.gallery[0].license, "CC BY-SA 4.0");
  assert.match(shaniwar.gallery[0].sourceUrl, /^https:\/\/commons\.wikimedia\.org\//);
});

test("all catalogue image paths resolve to distinct, nonempty local JPEG assets", async () => {
  const fs = await import("node:fs/promises");
  const hashes = new Set();
  assert.equal(catalogue.places.length, 30);
  assert.deepEqual(new Set(Object.keys(curatedImages.CURATED_IMAGES)), new Set(catalogue.places.map((place) => place.slug)));
  for (const [slug, image] of Object.entries(curatedImages.CURATED_IMAGES)) {
    const filePath = path.join(projectRoot, "public", image.url.replace(/^\//, ""));
    const bytes = await fs.readFile(filePath);
    assert.ok(bytes.length > 20000, `${slug} has a usable local photo`);
    assert.equal(bytes[0], 0xff, `${slug} starts with JPEG signature`);
    assert.equal(bytes[1], 0xd8, `${slug} starts with JPEG signature`);
    assert.equal(bytes.at(-2), 0xff, `${slug} has a JPEG end marker`);
    assert.equal(bytes.at(-1), 0xd9, `${slug} has a JPEG end marker`);
    assert.ok(image.source_url.startsWith("https://commons.wikimedia.org/wiki/File:"), `${slug} has a Commons source`);
    assert.ok(image.creator && image.credit && image.license, `${slug} has attribution and license metadata`);
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    assert.equal(hashes.has(hash), false, `${slug} uses a distinct photograph`);
    hashes.add(hash);
  }
});

test("Explore retains catalogue records when images fail and preserves search, pagination, and map behavior", async () => {
  const explore = await import("node:fs/promises").then(({ readFile }) =>
    readFile(path.join(sourceRoot, "pages/ExplorePage.tsx"), "utf8")
  );
  assert.match(explore, /getAllMatchingPlaces\(/);
  assert.match(explore, /setItems\(prepareExplorePlaces\(records\)\)/);
  assert.doesNotMatch(explore, /filterUsableHeritageImages|onImageUnavailable=\{/);
  assert.match(explore, /resultCount=\{loading \? 0 : items\.length\}/);
  assert.match(explore, /visibleCount < items\.length/);
  assert.match(explore, /mapSites\.flatMap\(\(site\) =>/);
  assert.match(explore, /gallery: catalogueItem\.gallery/);
  assert.doesNotMatch(explore, /withVerifiedPhoto\s*:\s*true/);
  const card = fsSync.readFileSync(path.join(sourceRoot, "components/heritage/HeritageCard.tsx"), "utf8");
  assert.match(card, /Image unavailable/);
  assert.match(card, /setFailedImageUrl\(imageSrc\)/);
});

test("the homepage hero renders a local attributed heritage photograph without an API photo requirement", () => {
  const component = fsSync.readFileSync(path.join(sourceRoot, "components/CinematicMonument.tsx"), "utf8");
  assert.match(component, /curatedImages\["ajanta-caves"\]/);
  assert.match(component, /src=\{backgroundImage\.url\}/);
  assert.match(component, /backgroundImage\.source_url/);
  assert.doesNotMatch(component, /getHeritage\(|withVerifiedPhoto/);
});

test("an unmapped API record stays in the ordinary catalogue and uses the card placeholder", async () => {
  const { prepareExplorePlaces } = await loadImageModules();
  const places = prepareExplorePlaces([publicRecord(90, "unmapped-place")]);
  assert.equal(places.length, 1);
  assert.equal(places[0].gallery.length, 0);
  const card = fsSync.readFileSync(path.join(sourceRoot, "components/heritage/HeritageCard.tsx"), "utf8");
  assert.match(card, /Image unavailable/);
});
