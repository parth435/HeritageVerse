"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

test("manual coordinate entry and browser location errors are validated", async () => {
  const { parseCoordinateText, geolocationErrorMessage } = await import("../src/lib/directions.js");
  assert.deepEqual(parseCoordinateText("28.6139, 77.2090"), { latitude: 28.6139, longitude: 77.209 });
  assert.equal(parseCoordinateText("north, west"), null);
  assert.equal(parseCoordinateText("91, 77.2"), null);
  assert.match(geolocationErrorMessage(1), /permission was denied/i);
  assert.match(geolocationErrorMessage(2), /location is unavailable/i);
  assert.match(geolocationErrorMessage(3), /timed out/i);
});

test("route distance and duration display the provider-supplied values", async () => {
  const { formatRouteDistance, formatRouteDuration } = await import("../src/lib/directions.js");
  assert.equal(formatRouteDistance(870), "870 m");
  assert.equal(formatRouteDistance(10_500), "10.5 km");
  assert.equal(formatRouteDuration(1_800), "30 min");
  assert.equal(formatRouteDuration(3_900), "1 hr 5 min");
});

test("Google Maps directions URL uses the real destination and selected origin coordinates", async () => {
  const { buildGoogleMapsDirectionsUrl } = await import("../src/lib/directions.js");
  const url = new URL(buildGoogleMapsDirectionsUrl(
    { latitude: 27.1751, longitude: 78.0421 },
    { latitude: 28.6139, longitude: 77.209 },
  ));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/maps/dir/");
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("origin"), "28.6139,77.209");
  assert.equal(url.searchParams.get("destination"), "27.1751,78.0421");
  assert.equal(url.searchParams.get("travelmode"), "driving");
  assert.equal(url.searchParams.get("dir_action"), "navigate");
});

test("Google Maps directions URL omits an unknown origin and rejects invalid destinations", async () => {
  const { buildGoogleMapsDirectionsUrl } = await import("../src/lib/directions.js");
  const url = new URL(buildGoogleMapsDirectionsUrl({ latitude: 27.1751, longitude: 78.0421 }));
  assert.equal(url.searchParams.has("origin"), false);
  assert.equal(url.searchParams.get("destination"), "27.1751,78.0421");
  assert.throws(() => buildGoogleMapsDirectionsUrl({ latitude: 91, longitude: 78 }), /valid destination/);
});
