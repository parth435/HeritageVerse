#!/usr/bin/env node
"use strict";

const pool = require("../config/db");

async function main() {
  const [catalog, categories, provenance, states] = await Promise.all([
    pool.query(`SELECT COUNT(*) FILTER (WHERE publication_status='published')::INTEGER AS published,
      COUNT(*) FILTER (WHERE publication_status='published' AND latitude IS NOT NULL AND longitude IS NOT NULL)::INTEGER AS geocoded,
      COUNT(*) FILTER (WHERE publication_status='published' AND latitude IS NOT NULL AND longitude IS NOT NULL AND EXISTS (
        SELECT 1 FROM heritage_sources s WHERE s.heritage_id=heritage.id AND 'coordinates'=ANY(s.claims_supported)
      ))::INTEGER AS verified_coordinates,
      COUNT(*) FILTER (WHERE publication_status='published' AND latitude IS NOT NULL AND longitude IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM heritage_sources s WHERE s.heritage_id=heritage.id AND 'coordinates'=ANY(s.claims_supported)
      ))::INTEGER AS coordinates_without_source,
      COUNT(*) FILTER (WHERE publication_status='published' AND ((latitude IS NULL) <> (longitude IS NULL)))::INTEGER AS incomplete_coordinate_pairs,
      COUNT(*) FILTER (WHERE publication_status='published' AND NOT EXISTS (
        SELECT 1 FROM heritage_sources s WHERE s.heritage_id=heritage.id
      ))::INTEGER AS without_sources
      FROM heritage`),
    pool.query(`SELECT c.slug, COUNT(*)::INTEGER AS count
      FROM heritage h JOIN heritage_categories c ON c.id=h.category_id
      WHERE h.publication_status='published' GROUP BY c.slug ORDER BY c.slug`),
    pool.query(`SELECT COUNT(*)::INTEGER AS records, COUNT(*) FILTER (
      WHERE source_title IS NULL OR publisher IS NULL OR cardinality(claims_supported)=0
    )::INTEGER AS incomplete FROM heritage_sources`),
    pool.query(`SELECT COUNT(DISTINCT state)::INTEGER AS states_or_territories
      FROM heritage WHERE publication_status='published'`),
  ]);
  const summary = {
    catalog: catalog.rows[0],
    categories: categories.rows,
    provenance: provenance.rows[0],
    states_or_territories: states.rows[0].states_or_territories,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (
    Number(summary.catalog.without_sources) !== 0 ||
    Number(summary.provenance.incomplete) !== 0 ||
    Number(summary.catalog.coordinates_without_source) !== 0 ||
    Number(summary.catalog.incomplete_coordinate_pairs) !== 0
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Catalog verification failed: ${error.message}`);
  process.exitCode = 1;
}).finally(() => pool.end());
