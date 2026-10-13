"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { MINIMUM_CONFIDENCE, candidatesFromInput, coordinateApplyBlockReason, dateValue, parseCandidateJson, validate } = require("../database/enrich-coordinates");

const approvedCandidate = {
  heritage_slug: "verified-site-slug",
  state: "Example State",
  latitude: 20.5,
  longitude: 80.25,
  source_title: "Official source page",
  publisher: "Official archaeology department",
  source_url: "https://example.org/heritage-location",
  confidence: 0.98,
  review_status: "approved",
  reviewed_by: "Verified reviewer",
  reviewed_on: new Date().toISOString().slice(0, 10),
};

test("coordinate candidate validation requires an exact, reviewed, high-confidence source", () => {
  assert.equal(MINIMUM_CONFIDENCE, 0.95);
  assert.deepEqual(validate(approvedCandidate, 0), []);
  assert.match(validate({ ...approvedCandidate, review_status: "pending" }, 0).join(" "), /approved by a human reviewer/);
  assert.match(validate({ ...approvedCandidate, confidence: 0.94 }, 0).join(" "), /confidence must be between/);
  assert.match(validate({ ...approvedCandidate, source_url: "http://example.org/coordinates" }, 0).join(" "), /HTTPS/);
  assert.match(validate({ ...approvedCandidate, latitude: 92 }, 0).join(" "), /latitude must be a valid/);
  assert.match(validate({ ...approvedCandidate, longitude: -190 }, 0).join(" "), /longitude must be a valid/);
});

test("coordinate candidate dates reject impossible or future dates", () => {
  assert.equal(dateValue("2024-02-29"), true);
  assert.equal(dateValue("2025-02-29"), false);
  assert.equal(dateValue("2025-13-01"), false);
});

test("coordinate application preserves approved, partial, and different existing coordinate data", () => {
  const empty = { latitude: null, longitude: null, coordinates_approved: false };
  assert.equal(coordinateApplyBlockReason(empty, approvedCandidate), null);
  assert.match(coordinateApplyBlockReason({ ...empty, coordinates_approved: true }, approvedCandidate), /already has approved coordinates/);
  assert.match(coordinateApplyBlockReason({ ...empty, latitude: 18 }, approvedCandidate), /partial coordinate pair/);
  assert.match(coordinateApplyBlockReason({ ...empty, latitude: 19, longitude: 80.25 }, approvedCandidate), /different coordinate pair/);
  assert.equal(coordinateApplyBlockReason({ ...empty, latitude: approvedCandidate.latitude, longitude: approvedCandidate.longitude }, approvedCandidate), null);
});

test("applying a dry-run report requires an explicitly approved human review", () => {
  const report = {
    mode: "dry-run",
    database_mutated: false,
    records: [{
      site_id: 1,
      site_slug: "verified-site-slug",
      state: "Example State",
      match_status: "needs_review",
      review_status: "pending",
      proposed_coordinates: { latitude: 20.5, longitude: 80.25 },
      source: { provider: "Wikidata", title: "Verified site item", publisher: "Wikidata", url: "https://www.wikidata.org/wiki/Q12345", attribution: "Wikidata contributors" },
    }],
  };
  assert.throws(() => candidatesFromInput(report, { apply: true }), /No eligible candidates are marked approved/);
  const reviewed = {
    ...report,
    records: [{
      ...report.records[0],
      review_status: "approved",
      review_confidence: 0.98,
      reviewed_by: "Site reviewer",
      reviewed_on: new Date().toISOString().slice(0, 10),
    }],
  };
  const [candidate] = candidatesFromInput(reviewed, { apply: true });
  assert.deepEqual(validate(candidate, 0), []);
  assert.equal(candidate.review_status, "approved");
  assert.match(candidate.source_note, /Wikidata contributors/);
});

test("review candidate JSON accepts a Windows UTF-8 BOM", () => {
  assert.deepEqual(parseCandidateJson("\uFEFF[{\"heritage_slug\":\"x\"}]"), [{ heritage_slug: "x" }]);
});
