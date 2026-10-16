"use strict";

const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("homepage, exploration, and heritage details route without a login requirement", async () => {
  const app = await readFile(path.join(root, "src/App.tsx"), "utf8");
  assert.match(app, /if \(pathname === "\/explore"\) return <ExplorePage \/>/);
  assert.match(app, /if \(pathname === "\/" \|\| pathname === ""\) \{\s*return <HomePage \/>/);
  assert.match(app, /if \(detailMatch\?\.\[1\]\) \{[\s\S]*?return <HeritageDetailPage identifier=\{identifier\} \/>/);
  assert.doesNotMatch(app, /if \(!user\)[\s\S]{0,180}return <RouteRedirect to="\/login"/);
  assert.match(app, /"\/admin\/users"/);
});

test("route pages load as separate chunks with an accessible loading state", async () => {
  const app = await readFile(path.join(root, "src/App.tsx"), "utf8");
  for (const page of ["ExplorePage", "NearbyPage", "HeritageDetailPage", "AdminRealApp", "AuthPage"]) {
    assert.match(app, new RegExp(`const ${page} = lazy\\(`));
  }
  assert.match(app, /<Suspense fallback=\{<RouteLoading \/>\}>/);
  assert.match(app, /role="status" aria-live="polite"/);
});

test("public feature anchors are in the homepage and personal pages use auth state", async () => {
  const [home, museum, dissection, thenNow, timeMachine, favorites, visits, journeys, profile] = await Promise.all([
    readFile(path.join(root, "src/pages/HomePage.tsx"), "utf8"),
    readFile(path.join(root, "src/components/MuseumInMotion.tsx"), "utf8"),
    readFile(path.join(root, "src/components/MonumentDissection.tsx"), "utf8"),
    readFile(path.join(root, "src/components/ThenNow.tsx"), "utf8"),
    readFile(path.join(root, "src/components/TimeMachine.tsx"), "utf8"),
    readFile(path.join(root, "src/pages/FavoritesPage.tsx"), "utf8"),
    readFile(path.join(root, "src/pages/VisitedPage.tsx"), "utf8"),
    readFile(path.join(root, "src/pages/JourneysPage.tsx"), "utf8"),
    readFile(path.join(root, "src/pages/ProfilePage.tsx"), "utf8"),
  ]);
  assert.match(home, /<MuseumInMotion \/>/);
  assert.match(home, /<MonumentDissection \/>/);
  assert.match(home, /<ThenNow \/>/);
  assert.match(home, /<TimeMachine \/>/);
  for (const [source, anchor] of [[museum, "museum"], [dissection, "dissection"], [thenNow, "then-now"], [timeMachine, "time"]]) {
    assert.match(source, new RegExp(`id="${anchor}"`));
  }
  assert.match(favorites, /isAuthenticated/);
  assert.match(visits, /isAuthenticated/);
  assert.match(journeys, /isAuthenticated/);
  assert.match(profile, /user \? \(/);
});
