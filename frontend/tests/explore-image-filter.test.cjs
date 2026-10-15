"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const curatedImages = require("../../backend/utilities/curated-heritage-images");

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
    heritageToView: (await server.ssrLoadModule("/src/lib/heritageAdapter.ts")).heritageToView,
    filterUsableHeritageImages: (await server.ssrLoadModule("/src/lib/exploreImages.ts")).filterUsableHeritageImages,
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

test("Explore retains only loaded verified photographs and preserves matching attribution", async () => {
  const { heritageToView, filterUsableHeritageImages } = await loadImageModules();
  const records = Object.entries(curatedImages.CURATED_IMAGES).map(([slug, image], index) =>
    curatedImages.applyCuratedImageFallback(publicRecord(index + 1, slug, []))
  );
  records.push(publicRecord(90, "unlisted-place"));
  records.push(publicRecord(91, "unverified-place", [{
    media_type: "image",
    media_role: "current",
    url: "https://images.example/unverified.jpg",
    verification_status: "unverified",
    is_illustrative: false,
  }]));

  const unavailableSlug = "gateway-of-india";
  const unavailableUrl = curatedImages.CURATED_IMAGES[unavailableSlug].url;
  const views = records.map(heritageToView);
  const usable = await filterUsableHeritageImages(views, async (url) => url !== unavailableUrl);

  assert.equal(usable.length, Object.keys(curatedImages.CURATED_IMAGES).length - 1);
  assert.equal(usable.some((item) => item.slug === unavailableSlug), false, "broken image is excluded");
  assert.equal(usable.some((item) => item.slug === "unlisted-place"), false, "null image is excluded");
  assert.equal(usable.some((item) => item.slug === "unverified-place"), false, "unverified media is excluded");
  const shaniwar = usable.find((item) => item.slug === "shaniwar-wada");
  assert.equal(shaniwar.gallery[0].verificationStatus, "verified");
  assert.equal(shaniwar.gallery[0].creator, "Subhodeep Mukherjee");
  assert.equal(shaniwar.gallery[0].license, "CC BY-SA 4.0");
  assert.match(shaniwar.gallery[0].sourceUrl, /^https:\/\/commons\.wikimedia\.org\//);
});

test("Explore applies image availability before counting, pagination, and map membership", async () => {
  const explore = await import("node:fs/promises").then(({ readFile }) =>
    readFile(path.join(sourceRoot, "pages/ExplorePage.tsx"), "utf8")
  );
  assert.match(explore, /getAllMatchingPlaces\(/);
  assert.match(explore, /filterUsableHeritageImages\(/);
  assert.match(explore, /resultCount=\{loading \? 0 : items\.length\}/);
  assert.match(explore, /visibleCount < items\.length/);
  assert.match(explore, /mapSites\.flatMap\(\(site\) =>/);
  assert.match(explore, /gallery: catalogueItem\.gallery/);
  assert.match(explore, /onImageUnavailable=\{removeUnavailableImage\}/);
  assert.match(explore, /withVerifiedPhoto: true/);
});

test("Explore keeps the exact working remote source when its local copy is unavailable", async () => {
  const { heritageToView, filterUsableHeritageImages, getHeritageImageSource } = await loadImageModules();
  const image = curatedImages.CURATED_IMAGES["ajanta-caves"];
  const view = heritageToView(curatedImages.applyCuratedImageFallback(publicRecord(1, "ajanta-caves", [])));
  const usable = await filterUsableHeritageImages([view], async (url) => url === image.url);

  assert.equal(usable.length, 1);
  assert.equal(usable[0].gallery[0].displaySrc, image.url);
  assert.equal(getHeritageImageSource({ url: usable[0].gallery[0].src, displaySrc: usable[0].gallery[0].displaySrc }), image.url);
});
