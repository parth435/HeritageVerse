"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  acquireImageForHeritage,
  allowedWikimediaImageUrl,
  classifyMediaRole,
  createUserAgent,
  createWikimediaClient,
  discoverEntityMatch,
  parseCommonsImageInfo,
  parseEntityBatch,
  parseRetryAfter,
  parseWikidataEntityData,
  MINIMUM_MATCH_CONFIDENCE,
  scoreEntityMatch,
} = require("../database/wikimedia-images");
const { exitCodeForSummary, parseArguments, processRecord, saveOutcome, selectImportRecords } = require("../database/import-wikimedia-images");
const discoveryCli = require("../database/discover-wikidata-entities");

const taj = {
  id: 1,
  name: "Taj Mahal",
  state: "Uttar Pradesh",
  district: "Agra",
  locality: "Agra",
  latitude: 27.175,
  longitude: 78.042,
  wikidata_qid: null,
};

const commonsPage = {
  ns: 6,
  title: "File:Taj_Mahal.jpg",
  imageinfo: [{
    url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Taj_Mahal.jpg",
    thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Taj_Mahal.jpg/1000px-Taj_Mahal.jpg",
    descriptionurl: "https://commons.wikimedia.org/wiki/File:Taj_Mahal.jpg",
    timestamp: "2024-03-01T00:00:00Z",
    extmetadata: {
      ObjectName: { value: "Taj Mahal" },
      ImageDescription: { value: "The Taj Mahal in Agra, India" },
      Artist: { value: "<a href=\"https://commons.wikimedia.org/wiki/User:Example\">Example Photographer</a>" },
      LicenseShortName: { value: "CC BY-SA 4.0" },
      LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0/" },
    },
  }],
};

function mockClient(overrides = {}) {
  return {
    searchWikidata: async () => [],
    loadEntityData: async () => ({ qid: "Q9141", label: "Taj Mahal", aliases: [], description: "mausoleum in India", countryIsIndia: true, coordinate: { latitude: 27.175, longitude: 78.042 }, imageFiles: [] }),
    loadCommonsFile: async () => null,
    searchCommons: async () => [],
    ...overrides,
  };
}

function mockResponse({ status = 200, payload = {}, retryAfter = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === "retry-after" ? retryAfter : null },
    text: async () => JSON.stringify(payload),
  };
}

const representativeSites = [
  {
    site: { id: 1, name: "Rock Shelters of Bhimbetka", state: "Madhya Pradesh", district: "Raisen", locality: null, latitude: null, longitude: null, wikidata_qid: null },
    qid: "Q331603", label: "Bhimbetka rock shelters", aliases: [], officialName: "Rock Shelters of Bhimbetka",
    description: "30,000+ years old archaeological World Heritage site in Madhya Pradesh, India",
    coordinate: { latitude: 22.938633, longitude: 77.614381 }, imageFile: "Bhimbetka Cave Paintings.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Bhimbetka_Cave_Paintings.jpg", creator: "Raveesh Vyas", license: "CC BY-SA 2.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    beforeConfidence: 0.84,
  },
  {
    site: { id: 2, name: "Elephanta Caves", state: "Maharashtra", district: "Mumbai Suburban", locality: null, latitude: null, longitude: null, wikidata_qid: null },
    qid: "Q649384", label: "Elephanta Caves", aliases: [], officialName: "Elephanta Caves",
    description: "Shiva cave temples and UNESCO world heritage site on a Mumbai harbor island",
    coordinate: { latitude: 18.963333, longitude: 72.931389 }, imageFile: "Elephanta Caves, India.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Elephanta_Caves,_India.jpg", creator: "Vyacheslav Argenberg", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    beforeConfidence: 0.915,
    locationConflict: "Wikidata lists Raigad district; the heritage row says Mumbai Suburban.",
  },
  {
    site: { id: 3, name: "Ellora Caves", state: "Maharashtra", district: "Chhatrapati Sambhajinagar", locality: null, latitude: 20.02639, longitude: 75.17917, wikidata_qid: null },
    qid: "Q189616", label: "Ellora Caves", aliases: [], officialName: "Ellora Caves",
    description: "ancient cave temples of Hinduism, Buddhism and Jainism in Maharashtra, India",
    coordinate: { latitude: 20.026389, longitude: 75.179167 }, imageFile: "Ellora Caves, India, Kailasanatha Temple 2.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Ellora_Caves,_India,_Kailasanatha_Temple_2.jpg", creator: "Vyacheslav Argenberg", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    beforeConfidence: 0.995,
  },
  {
    site: { id: 4, name: "Ajanta Caves", state: "Maharashtra", district: "Chhatrapati Sambhajinagar", locality: null, latitude: 20.553111, longitude: 75.70025, wikidata_qid: null },
    qid: "Q184427", label: "Ajanta Caves", aliases: [], officialName: "Ajanta Caves",
    description: "2nd century BCE to 1st century CE Buddhist cave monuments located in Maharashtra, India",
    coordinate: { latitude: 20.553417, longitude: 75.700472 }, imageFile: "Ajanta cave no. 9 2010.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Ajanta_cave_no._9_2010.jpg", creator: "Marcin Białek", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    beforeConfidence: 0.995,
  },
  {
    site: { id: 5, name: "Mahabodhi Temple Complex at Bodh Gaya", state: "Bihar", district: "Gaya", locality: null, latitude: null, longitude: null, wikidata_qid: null },
    qid: "Q4513", label: "Mahabodhi Temple", aliases: ["Mahabodhi Temple Complex at Bodh Gaya"], officialName: "Mahabodhi Temple Complex at Bodh Gaya",
    description: "Buddhist temple in Bodh Gaya, Bihar, India",
    coordinate: { latitude: 24.6961, longitude: 84.9914 }, imageFile: "Mahabodhitemple.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Mahabodhitemple.jpg", creator: "Bpilgrim", license: "CC BY-SA 2.5", licenseUrl: "https://creativecommons.org/licenses/by-sa/2.5/",
    beforeConfidence: 0.925,
  },
].map((entry) => ({
  ...entry,
  wikidataEntity() {
    return {
      id: this.qid,
      labels: { en: { value: this.label } },
      aliases: { en: this.aliases.map((value) => ({ value })) },
      descriptions: { en: { value: this.description } },
      claims: {
        P18: [{ mainsnak: { datavalue: { value: this.imageFile } } }],
        P17: [{ mainsnak: { datavalue: { value: { id: "Q668" } } } }],
        P625: [{ mainsnak: { datavalue: { value: this.coordinate } } }],
        P1448: [{ mainsnak: { datavalue: { value: { text: this.officialName, language: "en" } } } }],
      },
    };
  },
  commonsApiPage() {
    const safeFile = this.imageFile.replace(/[^a-z0-9]+/gi, "_");
    return {
      ns: 6,
      title: `File:${this.imageFile}`,
      imageinfo: [{
        url: `https://upload.wikimedia.org/wikipedia/commons/mock/${safeFile}`,
        thumburl: `https://upload.wikimedia.org/wikipedia/commons/mock/thumb/1000px-${safeFile}`,
        descriptionurl: this.sourceUrl,
        extmetadata: {
          ObjectName: { value: this.imageFile },
          ImageDescription: { value: this.description },
          Artist: { value: this.creator },
          LicenseShortName: { value: this.license },
          LicenseUrl: { value: this.licenseUrl },
        },
      }],
    };
  },
}));

test("Wikidata entity parser reads labels, aliases, coordinates, India, and P18", () => {
  const result = parseWikidataEntityData({ entities: { Q9141: {
    id: "Q9141",
    labels: { en: { value: "Taj Mahal" } },
    aliases: { en: [{ value: "Taj" }] },
    descriptions: { en: { value: "mausoleum in India" } },
    claims: {
      P18: [{ mainsnak: { datavalue: { value: "Taj Mahal.jpg" } } }],
      P17: [{ mainsnak: { datavalue: { value: { id: "Q668" } } } }],
      P625: [{ mainsnak: { datavalue: { value: { latitude: 27.175, longitude: 78.042 } } } }],
      P1448: [{ mainsnak: { datavalue: { value: { text: "Taj Mahal", language: "en" } } } }],
    },
  } } }, "Q9141");
  assert.equal(result.label, "Taj Mahal");
  assert.deepEqual(result.aliases, ["Taj"]);
  assert.deepEqual(result.officialNames, ["Taj Mahal"]);
  assert.equal(result.countryIsIndia, true);
  assert.deepEqual(result.coordinate, { latitude: 27.175, longitude: 78.042 });
  assert.deepEqual(result.imageFiles, ["Taj Mahal.jpg"]);
});

test("entity batch parser reads English official names and ignores non-English P1448 values", () => {
  const result = parseEntityBatch({ entities: { Q9141: {
    id: "Q9141",
    labels: { en: { value: "Bhimbetka rock shelters" } },
    claims: { P1448: [
      { mainsnak: { datavalue: { value: { text: "Rock Shelters of Bhimbetka", language: "en" } } } },
      { mainsnak: { datavalue: { value: { text: "Abris sous-roche du Bhimbetka", language: "fr" } } } },
    ] },
  } } }, ["Q9141"]);
  assert.deepEqual(result[0].officialNames, ["Rock Shelters of Bhimbetka"]);
});

test("missing and malformed Wikidata QIDs are rejected without inventing an entity", () => {
  assert.throws(() => parseWikidataEntityData({ entities: {} }, "Q999"), /missing or malformed/);
  assert.throws(() => parseWikidataEntityData({ entities: { Q999: { id: "Q999", missing: "" } } }, "Q999"), /missing or malformed/);
  assert.throws(() => parseWikidataEntityData({ entities: {} }, "not-a-qid"), /invalid entity identifier/);
});

test("entity matching uses name, geographic context, and coordinates", () => {
  const exact = { qid: "Q9141", label: "Taj Mahal", aliases: [], description: "mausoleum in India", countryIsIndia: true, coordinate: { latitude: 27.175, longitude: 78.042 } };
  assert.ok(scoreEntityMatch(taj, exact) >= 0.95);
  assert.equal(scoreEntityMatch(taj, { ...exact, coordinate: { latitude: 41.9, longitude: 12.5 } }), 0);
  assert.equal(scoreEntityMatch(taj, { ...exact, label: "Some other monument", aliases: [] }), 0);
});

test("official names and independent location evidence clear the unchanged threshold only with corroboration", () => {
  assert.equal(MINIMUM_MATCH_CONFIDENCE, 0.95);
  const bhimbetka = {
    name: "Rock Shelters of Bhimbetka", state: "Madhya Pradesh", district: "Raisen",
    latitude: null, longitude: null,
  };
  const bhimbetkaEntity = {
    label: "Bhimbetka rock shelters", aliases: [], officialNames: ["Rock Shelters of Bhimbetka"],
    description: "30,000+ years old archaeological World Heritage site in Madhya Pradesh, India",
    countryIsIndia: true, coordinate: { latitude: 22.938633, longitude: 77.614381 },
  };
  assert.equal(scoreEntityMatch(bhimbetka, bhimbetkaEntity), 0.95);

  const mahabodhi = {
    name: "Mahabodhi Temple Complex at Bodh Gaya", state: "Bihar", district: "Gaya",
    latitude: null, longitude: null,
  };
  const mahabodhiEntity = {
    label: "Mahabodhi Temple", aliases: ["Mahabodhi Temple Complex at Bodh Gaya"],
    officialNames: ["Mahabodhi Temple Complex at Bodh Gaya"],
    description: "Buddhist temple in Bodh Gaya, Bihar, India", countryIsIndia: true,
    coordinate: { latitude: 24.6961, longitude: 84.9914 },
  };
  assert.equal(scoreEntityMatch(mahabodhi, mahabodhiEntity), 0.98);

  const elephanta = {
    name: "Elephanta Caves", state: "Maharashtra", district: "Mumbai Suburban",
    latitude: null, longitude: null,
  };
  const elephantaEntity = {
    label: "Elephanta Caves", aliases: [], officialNames: ["Elephanta Caves"],
    description: "Shiva cave temples and UNESCO world heritage site on a Mumbai harbor island",
    countryIsIndia: true, coordinate: { latitude: 18.963333, longitude: 72.931389 },
  };
  assert.equal(scoreEntityMatch(elephanta, elephantaEntity), 0.915);
  assert.ok(scoreEntityMatch(elephanta, elephantaEntity) < MINIMUM_MATCH_CONFIDENCE);
});

test("five-site mocked API diagnostic records queries, P18 candidates, metadata, scores, and rejection reasons", async () => {
  const diagnostics = [];
  for (const fixture of representativeSites) {
    const searchQueries = [];
    let commonsReads = 0;
    const entity = fixture.wikidataEntity();
    const commonsPage = fixture.commonsApiPage();
    const client = createWikimediaClient({
      userAgent: "HeritageVerseImageImporter/1.0 (diagnostic@example.org)",
      delayMs: 1000,
      sleepImpl: async () => {},
      maxRetries: 0,
      writeCache: false,
      fetchImpl: async (rawUrl) => {
        const url = new URL(rawUrl);
        if (url.hostname === "www.wikidata.org" && url.searchParams.get("action") === "wbsearchentities") {
          const query = url.searchParams.get("search");
          searchQueries.push(query);
          if (query !== fixture.site.name) return mockResponse({ payload: { search: [] } });
          return mockResponse({ payload: { search: [{ id: fixture.qid, label: fixture.label, description: fixture.description }] } });
        }
        if (url.hostname === "www.wikidata.org" && url.searchParams.get("action") === "wbgetentities") {
          return mockResponse({ payload: { entities: { [fixture.qid]: entity } } });
        }
        if (url.hostname === "www.wikidata.org" && url.pathname.includes("Special:EntityData")) {
          return mockResponse({ payload: { entities: { [fixture.qid]: entity } } });
        }
        if (url.hostname === "commons.wikimedia.org") {
          commonsReads += 1;
          return mockResponse({ payload: { query: { pages: [commonsPage] } } });
        }
        throw new Error(`Unexpected mock request: ${url.href}`);
      },
    });

    const outcome = await acquireImageForHeritage(fixture.site, client);
    const metadata = parseCommonsImageInfo(commonsPage, fixture.site.name);
    const afterConfidence = outcome.entityConfidence ?? outcome.candidates[0]?.confidence ?? null;
    const beforeStatus = fixture.beforeConfidence >= MINIMUM_MATCH_CONFIDENCE && metadata.hasRequiredMetadata ? "verified" : "needs_review";
    const rejectionReason = outcome.status === "needs_review"
      ? `${outcome.errorCode}: ${outcome.errorMessage}`
      : null;
    diagnostics.push({
      heritageId: fixture.site.id,
      searchQueries,
      legacyContextSearchQuery: `${fixture.site.name} ${fixture.site.locality || fixture.site.district || fixture.site.state || ""} India`.trim(),
      legacyContextSearchFoundQid: false,
      nameOnlySearchFoundQid: searchQueries[0] === fixture.site.name,
      qid: fixture.qid,
      candidateTitle: fixture.imageFile,
      candidateSourcePage: fixture.sourceUrl,
      heritageCoordinates: fixture.site.latitude === null ? null : [fixture.site.latitude, fixture.site.longitude],
      wikidataCoordinates: [fixture.coordinate.latitude, fixture.coordinate.longitude],
      imageMetadata: { creator: metadata.creator, license: metadata.license, licenseUrl: metadata.licenseUrl, requiredMetadataPresent: metadata.hasRequiredMetadata },
      scoreBefore: fixture.beforeConfidence,
      scoreAfter: afterConfidence,
      statusBefore: beforeStatus,
      statusAfter: outcome.status,
      rejectionReasonBefore: beforeStatus === "needs_review"
        ? `entity_match_below_threshold: ${fixture.beforeConfidence} is below ${MINIMUM_MATCH_CONFIDENCE}`
        : null,
      rejectionReason,
      locationConflict: fixture.locationConflict ?? null,
      p18CommonsReads: commonsReads,
    });

    assert.ok(searchQueries.length);
    assert.equal(searchQueries[0], fixture.site.name);
    if (fixture.site.id === 2) assert.equal(searchQueries[1], "Elephanta Caves Mumbai Suburban Maharashtra India");
    else assert.equal(searchQueries.length, 1);
    assert.equal(metadata.hasRequiredMetadata, true);
    assert.equal(outcome.status, fixture.site.id === 2 ? "needs_review" : "verified");
    if (fixture.site.id === 2) {
      assert.equal(outcome.errorCode, "entity_match_below_threshold");
      assert.equal(commonsReads, 0, "ambiguous geography should stop before image fetching");
      assert.match(outcome.errorMessage, /automatic verification threshold/);
    } else {
      assert.equal(outcome.image.filename, fixture.imageFile);
      assert.equal(outcome.image.sourceUrl, fixture.sourceUrl);
      assert.equal(outcome.image.creator, fixture.creator);
      assert.equal(outcome.image.license, fixture.license);
    }
  }

  const beforeVerified = diagnostics.filter((row) => row.statusBefore === "verified").length;
  const afterVerified = diagnostics.filter((row) => row.statusAfter === "verified").length;
  assert.equal(beforeVerified, 2);
  assert.equal(afterVerified, 4);
  console.log(`FIVE_SITE_DIAGNOSTIC ${JSON.stringify({ beforeVerified, afterVerified, sites: diagnostics })}`);
});

test("Commons text search queries the monument name first and adds location only as a fallback", async () => {
  const queries = [];
  const site = { name: "Temple of the Sun, Konark", state: "Odisha", district: "Puri", locality: null, latitude: null, longitude: null };
  const client = createWikimediaClient({
    userAgent: "HeritageVerseImageImporter/1.0 (diagnostic@example.org)",
    delayMs: 1000,
    sleepImpl: async () => {},
    maxRetries: 0,
    writeCache: false,
    fetchImpl: async (rawUrl) => {
      const url = new URL(rawUrl);
      queries.push(url.searchParams.get("srsearch"));
      return mockResponse({ payload: { query: { search: [] } } });
    },
  });
  const candidates = await client.searchCommons(site);
  assert.deepEqual(queries, [
    "Temple of the Sun, Konark",
    "Temple of the Sun, Konark Puri Odisha India",
  ]);
  assert.deepEqual(candidates, []);
});

test("separate entity discovery accepts only a high-confidence QID", async () => {
  const entity = { qid: "Q9141", label: "Taj Mahal", aliases: [], description: "mausoleum in India", countryIsIndia: true, coordinate: { latitude: 27.175, longitude: 78.042 }, imageFiles: [] };
  const client = mockClient({ searchWikidata: async () => [{ ...entity, confidence: 0.995 }] });
  const result = await discoverEntityMatch(taj, client);
  assert.equal(result.status, "matched");
  assert.equal(result.matchedQid, "Q9141");
  assert.ok(result.confidence >= 0.95);
});

test("a QID entity with no P18 falls back to Commons search", async () => {
  const entity = { qid: "Q9141", label: "Taj Mahal", aliases: [], description: "mausoleum in India", countryIsIndia: true, coordinate: { latitude: 27.175, longitude: 78.042 }, imageFiles: [] };
  const candidate = parseCommonsImageInfo(commonsPage, taj.name);
  const client = mockClient({
    searchWikidata: async () => [{ ...entity, confidence: 0.98 }],
    loadEntityData: async () => entity,
    searchCommons: async () => [{ image: candidate, confidence: 0.97 }],
  });
  const result = await acquireImageForHeritage(taj, client);
  assert.equal(result.status, "verified");
  assert.equal(result.matchedQid, "Q9141");
  assert.equal(result.image.filename, "Taj_Mahal.jpg");
});

test("ambiguous Wikidata entities are sent to review and never fetched as accepted matches", async () => {
  let entityReads = 0;
  const result = await acquireImageForHeritage(taj, mockClient({
    searchWikidata: async () => [
      { qid: "Q9141", label: "Taj Mahal", confidence: 0.98 },
      { qid: "Q123", label: "Taj Mahal monument", confidence: 0.95 },
    ],
    loadEntityData: async () => { entityReads += 1; throw new Error("ambiguous entity must not be fetched as accepted"); },
  }));
  assert.equal(result.status, "needs_review");
  assert.equal(result.errorCode, "ambiguous_entity_match");
  assert.equal(entityReads, 0);
  assert.equal(result.candidates.length, 2);
});

test("stored Wikidata IDs below the unchanged confidence threshold are review-only", async () => {
  let commonsReads = 0;
  const site = { ...taj, wikidata_qid: "Q9141" };
  const result = await acquireImageForHeritage(site, mockClient({
    loadEntityData: async () => ({ qid: "Q9141", label: "Taj Mahal", aliases: [], description: "mausoleum in India", countryIsIndia: true, coordinate: null, imageFiles: ["Taj Mahal.jpg"] }),
    loadCommonsFile: async () => { commonsReads += 1; return parseCommonsImageInfo(commonsPage, site.name); },
  }));
  assert.equal(result.status, "needs_review");
  assert.equal(result.errorCode, "stored_qid_needs_review");
  assert.equal(commonsReads, 0);
});

test("verified Wikidata P18 images retain documented historical and current roles while incomplete files stay review-only", async () => {
  const site = { ...taj, wikidata_qid: "Q9141" };
  const entity = { qid: "Q9141", label: "Taj Mahal", aliases: [], description: "mausoleum in India", countryIsIndia: true, coordinate: { latitude: 27.175, longitude: 78.042 }, imageFiles: ["Old.jpg", "New.jpg", "Unknown.jpg"] };
  const file = (filename, documentedDate, documentedDateSource = "DateTimeOriginal", hasMetadata = true) => ({
    ...parseCommonsImageInfo(commonsPage, site.name), filename, title: filename,
    url: `https://upload.wikimedia.org/wikipedia/commons/a/${filename}`,
    thumbnailUrl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/${filename}`,
    documentedDate, documentedDateSource, hasRequiredMetadata: hasMetadata,
    missingMetadata: hasMetadata ? [] : ["license name"],
  });
  const images = new Map([
    ["Old.jpg", file("Old.jpg", "1890")],
    ["New.jpg", file("New.jpg", "2018")],
    ["Unknown.jpg", file("Unknown.jpg", null, null, false)],
  ]);
  const result = await acquireImageForHeritage(site, mockClient({
    loadEntityData: async () => entity,
    loadCommonsFile: async (filename) => images.get(filename),
  }));
  assert.equal(result.status, "needs_review");
  assert.equal(result.errorCode, "commons_attribution_incomplete");
  assert.deepEqual(result.images.map((image) => [image.filename, image.mediaRole]), [["Old.jpg", "historical"], ["New.jpg", "current"]]);
  assert.equal(result.candidates.at(-1).filename, "Unknown.jpg");
  assert.deepEqual(result.candidates.at(-1).missing_metadata, ["license name"]);
});

test("Commons image metadata parser extracts attribution, license, and documented capture date safely", () => {
  const datedPage = structuredClone(commonsPage);
  datedPage.imageinfo[0].extmetadata.DateTimeOriginal = { value: "1855–1865" };
  datedPage.imageinfo[0].extmetadata.Date = { value: "2010" };
  const result = parseCommonsImageInfo(datedPage, "Taj Mahal");
  assert.equal(result.creator, "Example Photographer");
  assert.equal(result.license, "CC BY-SA 4.0");
  assert.equal(result.licenseUrl, "https://creativecommons.org/licenses/by-sa/4.0/");
  assert.match(result.credit, /Example Photographer/);
  assert.equal(result.hasRequiredMetadata, true);
  assert.equal(result.thumbnailUrl.includes("1000px-Taj_Mahal"), true);
  assert.equal(result.documentedDate, "1855–1865");
  assert.equal(result.documentedDateSource, "DateTimeOriginal");
  assert.equal(classifyMediaRole(result), "historical");
});

test("media roles use documented photo dates and never confuse Commons upload dates with capture dates", () => {
  assert.equal(classifyMediaRole({ documentedDate: "2008-04-01", documentedDateSource: "DateTimeOriginal", uploadedAt: "1900-01-01T00:00:00Z" }), "current");
  assert.equal(classifyMediaRole({ documentedDate: "1982", documentedDateSource: "Date", uploadedAt: "2024-01-01T00:00:00Z" }), "gallery");
  assert.equal(classifyMediaRole({ documentedDate: null, documentedDateSource: null, uploadedAt: "2024-01-01T00:00:00Z" }), "gallery");
  assert.equal(classifyMediaRole({ documentedDate: "unknown", documentedDateSource: "Date" }), "gallery");
});

test("Commons image verification does not require a creation date", () => {
  const withoutDate = structuredClone(commonsPage);
  delete withoutDate.imageinfo[0].timestamp;
  const result = parseCommonsImageInfo(withoutDate, "Taj Mahal");
  assert.equal(result.uploadedAt, null);
  assert.equal(result.hasRequiredMetadata, true);
});

test("Commons missing attribution or license metadata stays review-only", () => {
  const missing = structuredClone(commonsPage);
  missing.imageinfo[0].extmetadata = { ObjectName: { value: "Taj Mahal" } };
  const result = parseCommonsImageInfo(missing, "Taj Mahal");
  assert.equal(result.hasRequiredMetadata, false);
  assert.ok(result.missingMetadata.includes("creator or attribution"));
  assert.ok(result.missingMetadata.includes("license name"));
  assert.ok(result.missingMetadata.includes("license URL"));
});

test("Commons metadata explicitly marked assumed is not presented as verified creator or source attribution", () => {
  const assumed = structuredClone(commonsPage);
  assumed.imageinfo[0].extmetadata = {
    Artist: { value: "No machine-readable author provided. Soman assumed (based on copyright claims)." },
    Credit: { value: "No machine-readable source provided. Own work assumed (based on copyright claims)." },
    LicenseShortName: { value: "CC BY 2.5" },
    LicenseUrl: { value: "https://creativecommons.org/licenses/by/2.5/" },
  };
  const result = parseCommonsImageInfo(assumed, "Ajanta Caves");
  assert.equal(result.creator, null);
  assert.equal(result.credit, null);
  assert.equal(result.hasRequiredMetadata, false);
  assert.ok(result.missingMetadata.includes("creator or attribution"));
});

test("Wikimedia contact validation creates an identifying User-Agent", () => {
  assert.match(createUserAgent("images@example.org"), /^HeritageVerseImageImporter\/1\.0 \(images@example\.org\)$/);
  assert.equal(createUserAgent(), "HeritageVerseImageImporter/1.0 (https://github.com/parth435/HeritageVerse)");
  assert.throws(() => createUserAgent("http://unsafe.example"), /email address or an HTTPS URL/);
  assert.throws(() => createUserAgent(""), /Set HERITAGEVERSE_WIKIMEDIA_CONTACT/);
});

test("image and API URLs are restricted to HTTPS Wikimedia hosts and reject redirects", async () => {
  assert.equal(allowedWikimediaImageUrl("http://upload.wikimedia.org/wikipedia/commons/a/image.jpg"), null);
  assert.equal(allowedWikimediaImageUrl("https://upload.wikimedia.org:8443/wikipedia/commons/a/image.jpg"), null);
  assert.equal(allowedWikimediaImageUrl("https://example.test/wikipedia/commons/a/image.jpg"), null);
  let redirectMode = null;
  const client = createWikimediaClient({
    userAgent: "HeritageVerseImageImporter/1.0 (images@example.org)",
    delayMs: 0,
    fetchImpl: async (_url, init) => { redirectMode = init.redirect; return mockResponse(); },
  });
  await client.requestJson(new URL("https://commons.wikimedia.org/w/api.php?action=test"));
  assert.equal(redirectMode, "error");
});

test("429 retry honors Retry-After and sends the configured User-Agent", async () => {
  let calls = 0;
  const delays = [];
  let sentUserAgent = null;
  const client = createWikimediaClient({
    userAgent: "HeritageVerseImageImporter/1.0 (images@example.org)",
    delayMs: 0,
    maxRetries: 1,
    sleepImpl: async (ms) => { delays.push(ms); },
    fetchImpl: async (_url, init) => {
      calls += 1;
      sentUserAgent = init.headers["User-Agent"];
      return calls === 1 ? mockResponse({ status: 429, retryAfter: "2" }) : mockResponse({ payload: { success: true } });
    },
  });
  const payload = await client.requestJson(new URL("https://www.wikidata.org/w/api.php?action=test"));
  assert.deepEqual(payload, { success: true });
  assert.equal(calls, 2);
  assert.equal(sentUserAgent, "HeritageVerseImageImporter/1.0 (images@example.org)");
  assert.ok(delays.includes(2000));
  assert.equal(parseRetryAfter("3", 0), 3000);
});

test("network failures preserve only a sanitized underlying diagnostic code", async () => {
  const client = createWikimediaClient({
    userAgent: "HeritageVerseImageImporter/1.0 (images@example.org)",
    delayMs: 0,
    maxRetries: 0,
    sleepImpl: async () => {},
    fetchImpl: async () => { throw Object.assign(new Error("private transport detail"), { cause: Object.assign(new Error("blocked"), { code: "EACCES" }) }); },
  });
  await assert.rejects(client.requestJson(new URL("https://commons.wikimedia.org/w/api.php?action=test")), (error) => {
    assert.equal(error.code, "provider_network_error");
    assert.equal(error.diagnosticCode, "EACCES");
    assert.equal(error.message, "Wikimedia request failed");
    assert.doesNotMatch(error.message, /private transport detail|blocked/);
    return true;
  });
});

test("upstream requests stay spaced when several records run concurrently", async () => {
  let now = 0;
  const starts = [];
  const client = createWikimediaClient({
    userAgent: "HeritageVerseImageImporter/1.0 (images@example.org)",
    delayMs: 1000,
    now: () => now,
    sleepImpl: async (ms) => { now += ms; },
    fetchImpl: async () => { starts.push(now); return mockResponse(); },
  });
  await Promise.all([
    client.requestJson(new URL("https://www.wikidata.org/w/api.php?action=first")),
    client.requestJson(new URL("https://commons.wikimedia.org/w/api.php?action=second")),
  ]);
  assert.deepEqual(starts, [0, 1000]);
});

test("CLI validates batches, IDs, concurrency, and provider-safe request delays", () => {
  assert.deepEqual(parseArguments(["--ids", "4,8", "--batch-size", "5", "--concurrency", "2"]), {
    apply: false, refresh: false, retryFailed: false, resume: false, limit: null, heritageId: null, batchSize: 5, delayMs: 1000, concurrency: 2, ids: [4, 8], help: false,
  });
  const scoped = parseArguments(["--dry-run", "--limit", "5", "--heritage-id", "42", "--resume", "--retry-failed"]);
  assert.equal(scoped.limit, 5);
  assert.equal(scoped.heritageId, 42);
  assert.deepEqual(scoped.ids, [42]);
  assert.equal(scoped.resume, true);
  assert.throws(() => parseArguments(["--limit", "0"]), /between 1 and/);
  assert.throws(() => parseArguments(["--heritage-id", "42", "--ids", "42"]), /either --heritage-id or --ids/);
  assert.throws(() => parseArguments(["--ids", "2,2"]), /duplicate IDs/);
  assert.throws(() => parseArguments(["--concurrency", "4"]), /between 1 and 3/);
  assert.throws(() => parseArguments(["--delay-ms", "500"]), /at least 1000 ms/);
  assert.throws(() => parseArguments(["--retry-failed", "--refresh"]), /separate selection modes/);
  assert.throws(() => parseArguments(["--resume", "--refresh"]), /separate selection modes/);
});

test("batch selection targets incomplete image coverage so each place can acquire historical and current images", () => {
  const records = [
    { id: 1, acquisition_status: "verified", has_complete_coverage: true },
    { id: 2, acquisition_status: "needs_review", has_complete_coverage: false },
    { id: 3, acquisition_status: "not_found", has_complete_coverage: false },
    { id: 4, acquisition_status: "failed", has_complete_coverage: false },
    { id: 5, acquisition_status: null, has_complete_coverage: false },
    { id: 6, acquisition_status: "verified", has_complete_coverage: false },
    { id: 7, acquisition_status: null, has_complete_coverage: false, has_verified_current: true, has_verified_historical: false },
  ];
  const normal = selectImportRecords(records, { refresh: false, retryFailed: false });
  assert.deepEqual(normal.records.map((record) => record.id), [2, 5, 7]);
  assert.deepEqual(normal.skipped, { already_complete: 1, already_processed: 1, needs_review: 0, not_found: 1, failed: 1, not_failed: 0, limited: 0 });
  const retry = selectImportRecords(records, { refresh: false, retryFailed: true });
  assert.deepEqual(retry.records.map((record) => record.id), [4]);
  const resume = selectImportRecords(records, { refresh: false, retryFailed: false, resume: true });
  assert.deepEqual(resume.records.map((record) => record.id), [5, 7]);
  assert.equal(resume.skipped.needs_review, 1);
  const bounded = selectImportRecords(records, { refresh: false, retryFailed: false, limit: 1 });
  assert.deepEqual(bounded.records.map((record) => record.id), [2]);
  assert.equal(bounded.skipped.limited, 2);
});

test("dry-run processing returns candidates without invoking database persistence", async () => {
  const candidate = parseCommonsImageInfo(commonsPage, taj.name);
  const entity = { qid: "Q9141", label: "Taj Mahal", aliases: [], description: "mausoleum in India", countryIsIndia: true, coordinate: { latitude: 27.175, longitude: 78.042 }, imageFiles: [] };
  const client = mockClient({
    searchWikidata: async () => [{ ...entity, confidence: 0.98 }],
    loadEntityData: async () => entity,
    searchCommons: async () => [{ image: candidate, confidence: 0.97 }],
  });
  const outcome = await processRecord(taj, { apply: false }, client);
  assert.equal(outcome.status, "verified");
  assert.equal(outcome.image.url, "https://upload.wikimedia.org/wikipedia/commons/a/ab/Taj_Mahal.jpg");
});

test("import command reports per-record provider failures with a failing exit status", () => {
  assert.equal(exitCodeForSummary({ failed: 0 }), 0);
  assert.equal(exitCodeForSummary({ failed: 1 }), 1);
});

test("entity discovery CLI supports independent dry-run, apply, and failed-only retry selection", () => {
  assert.equal(discoveryCli.parseArguments(["--dry-run", "--batch-size", "5"]).batchSize, 5);
  assert.throws(() => discoveryCli.parseArguments(["--delay-ms", "500"]), /at least 1000 ms/);
  const selected = discoveryCli.selectRecords([
    { id: 1, wikidata_qid: "Q9141", match_status: "matched" },
    { id: 2, wikidata_qid: null, match_status: "needs_review" },
    { id: 3, wikidata_qid: null, match_status: "failed" },
  ], { refresh: false, retryFailed: false });
  assert.deepEqual(selected.selected.map((record) => record.id), [2]);
  const retry = discoveryCli.selectRecords([
    { id: 1, wikidata_qid: null, match_status: "needs_review" },
    { id: 2, wikidata_qid: null, match_status: "failed" },
  ], { refresh: false, retryFailed: true });
  assert.deepEqual(retry.selected.map((record) => record.id), [2]);
});

test("entity discovery stores a confirmed QID but keeps ambiguous entities in review", async () => {
  const statements = [];
  const database = {
    connect: async () => ({ query: async (sql) => { statements.push(sql); return { rows: [] }; }, release() {} }),
  };
  await discoveryCli.saveOutcome(taj, { status: "matched", matchedQid: "Q9141", confidence: 0.98, candidates: [] }, database);
  assert.ok(statements.some((sql) => /UPDATE heritage SET wikidata_qid/.test(sql)));
  assert.ok(statements.some((sql) => /INSERT INTO heritage_entity_matches/.test(sql)));
  assert.equal(statements.at(-1), "COMMIT");
  statements.length = 0;
  await discoveryCli.saveOutcome(taj, { status: "needs_review", matchedQid: null, confidence: 0.9, candidates: [{ qid: "Q1" }] }, database);
  assert.ok(!statements.some((sql) => /UPDATE heritage SET wikidata_qid/.test(sql)));
});

test("verified asset persistence is idempotent and preserves any existing media row", async () => {
  const statements = [];
  const database = {
    connect: async () => ({
      query: async (sql) => {
        statements.push(sql);
        return String(sql).includes("INSERT INTO heritage_media") ? { rows: [{ id: 42 }] } : { rows: [] };
      },
      release() {},
    }),
  };
  await saveOutcome(taj, {
    status: "verified",
    confidence: 0.98,
    matchedQid: "Q9141",
    candidates: [],
    image: parseCommonsImageInfo(commonsPage, taj.name),
  }, database);
  assert.ok(statements.some((sql) => /INSERT INTO heritage_media[\s\S]*ON CONFLICT DO NOTHING/.test(sql)));
  assert.ok(statements.some((sql) => /INSERT INTO heritage_image_acquisition/.test(sql)));
  assert.ok(!statements.some((sql) => /UPDATE heritage_media|DELETE FROM heritage_media/i.test(sql)));
  assert.equal(statements[0], "BEGIN");
  assert.equal(statements.at(-1), "COMMIT");
});

test("image persistence stores Commons photo dates and role labels even when sibling candidates need review", async () => {
  const inserts = [];
  const database = {
    connect: async () => ({
      query: async (sql, values) => {
        if (String(sql).includes("INSERT INTO heritage_media")) {
          inserts.push({ sql: String(sql), values });
          return { rows: [{ id: inserts.length }] };
        }
        return { rows: [] };
      },
      release() {},
    }),
  };
  const makeImage = (filename, role, date) => ({
    ...parseCommonsImageInfo(commonsPage, taj.name), filename,
    url: `https://upload.wikimedia.org/wikipedia/commons/a/${filename}`,
    documentedDate: date,
    documentedDateSource: "DateTimeOriginal",
    mediaRole: role,
  });
  const result = await saveOutcome(taj, {
    status: "needs_review",
    confidence: 0.98,
    matchedQid: "Q9141",
    candidates: [{ filename: "incomplete.jpg", missing_metadata: ["license name"] }],
    images: [makeImage("old.jpg", "historical", "1890"), makeImage("new.jpg", "current", "2018")],
  }, database);
  assert.equal(result.status, "needs_review");
  assert.equal(inserts.length, 2);
  assert.deepEqual(inserts.map(({ values }) => [values[7], values[11]]), [["1890", "historical"], ["2018", "current"]]);
  assert.ok(inserts.every(({ sql }) => /documented_date/.test(sql)));
});

test("an existing verified duplicate is preserved without updating its media metadata", async () => {
  const statements = [];
  const database = {
    connect: async () => ({
      query: async (sql) => {
        statements.push(sql);
        if (String(sql).includes("SELECT id, url, verification_status")) return { rows: [{ id: 42, url: commonsPage.imageinfo[0].url, verification_status: "verified", media_role: "gallery", is_illustrative: false }] };
        return { rows: [] };
      },
      release() {},
    }),
  };
  const outcome = await saveOutcome(taj, {
    status: "verified", confidence: 0.98, matchedQid: "Q9141", candidates: [], image: parseCommonsImageInfo(commonsPage, taj.name),
  }, database);
  assert.equal(outcome.status, "verified");
  assert.ok(!statements.some((sql) => /UPDATE heritage_media/i.test(sql)));
});

test("same-QID heritage records share an existing Wikimedia asset instead of inserting a duplicate", async () => {
  const statements = [];
  const database = {
    connect: async () => ({
      query: async (sql) => {
        statements.push(String(sql));
        if (String(sql).includes("JOIN heritage owner")) return { rows: [{ id: 42, heritage_id: 4, wikidata_qid: "Q9141", matched_qid: null }] };
        return { rows: [] };
      },
      release() {},
    }),
  };
  const result = await saveOutcome({ ...taj, id: 1169 }, {
    status: "verified", confidence: 0.98, matchedQid: "Q9141", candidates: [],
    image: parseCommonsImageInfo(commonsPage, taj.name),
  }, database);
  assert.equal(result.status, "verified");
  assert.ok(statements.some((sql) => /JOIN heritage owner/.test(sql)));
  assert.ok(!statements.some((sql) => /INSERT INTO heritage_media/.test(sql)));
  assert.ok(statements.some((sql) => /UPDATE heritage target[\s\S]*wikidata_qid/.test(sql)));
});

test("a globally duplicated Wikimedia asset with a different or unknown entity stays in review", async () => {
  const statements = [];
  const database = {
    connect: async () => ({
      query: async (sql) => {
        statements.push(String(sql));
        if (String(sql).includes("JOIN heritage owner")) return { rows: [{ id: 42, heritage_id: 99, wikidata_qid: "Q777", matched_qid: null }] };
        return { rows: [] };
      },
      release() {},
    }),
  };
  const result = await saveOutcome({ ...taj, id: 1169 }, {
    status: "verified", confidence: 0.98, matchedQid: "Q9141", candidates: [],
    image: parseCommonsImageInfo(commonsPage, taj.name),
  }, database);
  assert.equal(result.status, "needs_review");
  assert.equal(result.errorCode, "duplicate_asset_linked_elsewhere");
  assert.ok(!statements.some((sql) => /INSERT INTO heritage_media/.test(sql)));
});

test("dry-run processing does not persist acquisition or image records", async () => {
  let writes = 0;
  const result = await processRecord(taj, { apply: false }, mockClient({
    searchWikidata: async () => [{ qid: "Q9141", label: "Taj Mahal", confidence: 0.98 }],
    loadEntityData: async () => ({ qid: "Q9141", label: "Taj Mahal", aliases: [], description: "mausoleum in India", countryIsIndia: true, coordinate: { latitude: 27.175, longitude: 78.042 }, imageFiles: ["Taj Mahal.jpg"] }),
    loadCommonsFile: async () => parseCommonsImageInfo(commonsPage, taj.name),
  }), { connect: async () => { writes += 1; throw new Error("dry-run must not connect for writes"); } });
  assert.equal(result.status, "verified");
  assert.equal(writes, 0);
});
