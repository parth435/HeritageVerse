#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const pool = require("../config/db");

const manifestPath = path.join(__dirname, "selected-catalogue.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const expectedRows = manifest.places.map((place) => ({
  display_order: place.order,
  catalogue_key: place.key,
  expected_id: place.recordId,
  name: place.name,
  slug: place.slug,
  category_slug: place.category,
  state: place.state,
  country: place.country,
  district: place.district,
  locality: place.locality,
  expected_latitude: place.coordinates.latitude,
  expected_longitude: place.coordinates.longitude,
  coordinate_status: place.coordinates.status,
  coordinate_source_url: place.coordinates.sourceUrl ?? null,
}));

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '10s'");

    const schemaState = await client.query(`
      SELECT
        to_regclass('heritage_catalog_membership') IS NOT NULL AS membership_table,
        to_regclass('heritage_catalog_aliases') IS NOT NULL AS aliases_table,
        to_regclass('heritage_slug_aliases') IS NOT NULL AS slug_aliases_table,
        EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'heritage' AND column_name = 'country') AS country_column
    `);
    const schema = schemaState.rows[0];
    if (!schema.membership_table || !schema.aliases_table || !schema.slug_aliases_table || !schema.country_column) {
      console.log(JSON.stringify({
        status: "NOT_READY",
        reason: "The reversible catalogue schema migration has not been applied to the database being inspected.",
        schema,
        migration: "014_add_heritage_country.sql",
        transaction: "read-only; rolled back",
      }, null, 2));
      process.exitCode = 2;
      return;
    }

    const places = await client.query(`
      WITH expected AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS e(
          display_order INTEGER,
          catalogue_key TEXT,
          expected_id INTEGER,
          name TEXT,
          slug TEXT,
          category_slug TEXT,
          state TEXT,
          country TEXT,
          district TEXT,
          locality TEXT,
          expected_latitude NUMERIC,
          expected_longitude NUMERIC,
          coordinate_status TEXT,
          coordinate_source_url TEXT
        )
      )
      SELECT
        e.display_order,
        e.catalogue_key,
        h.id,
        h.name,
        h.slug,
        c.slug AS category_slug,
        h.state,
        h.country,
        h.district,
        h.locality,
        h.latitude,
        h.longitude,
        membership.heritage_id IS NOT NULL AS is_member,
        membership.display_order AS stored_order,
        EXISTS (
          SELECT 1 FROM heritage_sources source
          WHERE source.heritage_id = h.id
            AND 'coordinates' = ANY(source.claims_supported)
            AND source.review_status = 'approved'
            AND (e.coordinate_source_url IS NULL OR source.source_url = e.coordinate_source_url)
            AND h.latitude IS NOT NULL AND h.longitude IS NOT NULL
            AND (e.expected_latitude IS NULL OR h.latitude = e.expected_latitude)
            AND (e.expected_longitude IS NULL OR h.longitude = e.expected_longitude)
        ) AS coordinates_verified,
        COALESCE(media.image_count, 0) AS image_count,
        COALESCE(media.verified_image_count, 0) AS verified_image_count,
        COALESCE(media.complete_metadata_count, 0) AS complete_image_metadata_count,
        EXISTS (
          SELECT 1 FROM heritage_sources source
          WHERE source.heritage_id = h.id
            AND source.review_status = 'approved'
            AND source.claims_supported && ARRAY['description','history','cultural_significance','architecture','location']::TEXT[]
        ) AS has_approved_supporting_source,
        EXISTS (
          SELECT 1 FROM heritage_sources source
          WHERE source.heritage_id = h.id
            AND source.review_status <> 'rejected'
            AND source.claims_supported && ARRAY['description','history','cultural_significance','architecture','location']::TEXT[]
        ) AS has_supporting_reference,
        (h.id IS NOT NULL
          AND h.name = e.name
          AND h.slug = e.slug
          AND c.slug = e.category_slug
          AND h.state = e.state
          AND h.country = e.country
          AND h.district = e.district
          AND h.locality = e.locality
          AND NULLIF(BTRIM(h.address), '') IS NOT NULL
          AND (e.expected_id IS NULL OR h.id = e.expected_id)
          AND membership.display_order = e.display_order
        ) AS identity_matches
      FROM expected e
      LEFT JOIN heritage h ON h.slug = e.slug
      LEFT JOIN heritage_categories c ON c.id = h.category_id
      LEFT JOIN heritage_catalog_membership membership ON membership.heritage_id = h.id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE media.media_type = 'image')::INTEGER AS image_count,
          COUNT(*) FILTER (WHERE media.media_type = 'image' AND media.verification_status = 'verified'
            AND media.is_illustrative = FALSE)::INTEGER AS verified_image_count,
          COUNT(*) FILTER (WHERE media.media_type = 'image'
            AND media.verification_status = 'verified' AND media.is_illustrative = FALSE
            AND NULLIF(BTRIM(media.alt_text), '') IS NOT NULL
            AND NULLIF(BTRIM(COALESCE(media.credit, media.creator)), '') IS NOT NULL
            AND NULLIF(BTRIM(media.license), '') IS NOT NULL
            AND NULLIF(BTRIM(media.source_url), '') IS NOT NULL
          )::INTEGER AS complete_metadata_count
        FROM heritage_media media WHERE media.heritage_id = h.id
      ) media ON TRUE
      ORDER BY e.display_order
    `, [JSON.stringify(expectedRows)]);

    const catalogue = await client.query(`
      SELECT
        (SELECT COUNT(*)::INTEGER FROM heritage_catalog_membership) AS membership_count,
        (SELECT COUNT(DISTINCT membership.catalogue_key)::INTEGER FROM heritage_catalog_membership membership) AS unique_keys,
        (SELECT COUNT(DISTINCT membership.display_order)::INTEGER FROM heritage_catalog_membership membership) AS unique_orders,
        (SELECT COUNT(*)::INTEGER FROM heritage_catalog_membership membership
          JOIN heritage h ON h.id = membership.heritage_id
          WHERE h.publication_status = 'published') AS published_list_count,
        (SELECT COUNT(*)::INTEGER FROM heritage_catalog_membership membership
          JOIN heritage h ON h.id = membership.heritage_id
          WHERE NULLIF(BTRIM(h.address), '') IS NOT NULL) AS addressed_places,
        (SELECT COUNT(DISTINCT c.id)::INTEGER FROM heritage_catalog_membership membership
          JOIN heritage h ON h.id = membership.heritage_id
          JOIN heritage_categories c ON c.id = h.category_id
          WHERE h.publication_status = 'published') AS categories_count,
        (SELECT COUNT(DISTINCT h.state)::INTEGER FROM heritage_catalog_membership membership
          JOIN heritage h ON h.id = membership.heritage_id
          WHERE h.publication_status = 'published') AS states_count,
        (SELECT COUNT(DISTINCT h.country)::INTEGER FROM heritage_catalog_membership membership
          JOIN heritage h ON h.id = membership.heritage_id
          WHERE h.publication_status = 'published') AS countries_count,
        (SELECT COUNT(*)::INTEGER FROM heritage_catalog_membership membership
          JOIN heritage h ON h.id = membership.heritage_id
          WHERE h.publication_status = 'published' AND h.country = 'India') AS india_country_count,
        (SELECT COUNT(DISTINCT h.district)::INTEGER FROM heritage_catalog_membership membership
          JOIN heritage h ON h.id = membership.heritage_id
          WHERE h.publication_status = 'published' AND NULLIF(BTRIM(h.district), '') IS NOT NULL) AS districts_count,
        (SELECT COUNT(*)::INTEGER FROM heritage_catalog_membership membership
          JOIN heritage h ON h.id = membership.heritage_id
          WHERE h.publication_status = 'published'
            AND h.latitude IS NOT NULL AND h.longitude IS NOT NULL
            AND h.latitude BETWEEN -90 AND 90 AND h.longitude BETWEEN -180 AND 180
            AND EXISTS (SELECT 1 FROM heritage_sources source WHERE source.heritage_id = h.id
              AND 'coordinates' = ANY(source.claims_supported) AND source.review_status = 'approved')) AS verified_map_count,
        (SELECT COUNT(*)::INTEGER FROM heritage_catalog_aliases alias
          JOIN heritage_catalog_membership membership ON membership.heritage_id = alias.alias_heritage_id) AS duplicate_aliases_in_public_list,
        (SELECT COUNT(*)::INTEGER FROM heritage_catalog_aliases) AS duplicate_alias_count,
        (SELECT COUNT(*)::INTEGER FROM heritage_slug_aliases) AS preserved_old_slug_count
    `);

    const imageCounts = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE media.media_type='image')::INTEGER AS total,
        COUNT(*) FILTER (WHERE media.media_type='image' AND media.verification_status='verified')::INTEGER AS verified,
        COUNT(*) FILTER (WHERE media.media_type='image' AND media.verification_status='unverified')::INTEGER AS unverified,
        COUNT(*) FILTER (WHERE media.media_type='image' AND media.verification_status NOT IN ('verified','unverified'))::INTEGER AS other_status,
        COUNT(*) FILTER (WHERE media.media_type='image' AND media.url ~ '^https://')::INTEGER AS https_urls,
        COUNT(*) FILTER (WHERE media.media_type='image' AND NULLIF(BTRIM(media.alt_text),'') IS NOT NULL
          AND NULLIF(BTRIM(COALESCE(media.credit,media.creator)),'') IS NOT NULL
          AND NULLIF(BTRIM(media.license),'') IS NOT NULL
          AND NULLIF(BTRIM(media.source_url),'') IS NOT NULL)::INTEGER AS complete_metadata
      FROM heritage_catalog_membership membership
      JOIN heritage_media media ON media.heritage_id=membership.heritage_id
      WHERE media.media_type='image'
    `);

    const preservedData = await client.query(`
      SELECT
        (SELECT COUNT(*)::INTEGER FROM users) AS users,
        (SELECT COUNT(*)::INTEGER FROM favorites) AS favorites,
        (SELECT COUNT(*)::INTEGER FROM visited_places) AS visits,
        (SELECT COUNT(*)::INTEGER FROM reviews) AS reviews,
        (SELECT COUNT(*)::INTEGER FROM journeys) AS journeys,
        (SELECT COUNT(*)::INTEGER FROM journey_stops) AS journey_stops,
        (SELECT COUNT(*)::INTEGER FROM favorites WHERE heritage_id=22) AS mumbai_ensemble_favorites,
        (SELECT COUNT(*)::INTEGER FROM reviews WHERE heritage_id=2) AS elephanta_reviews
    `);

    const rows = places.rows;
    const expectedCount = manifest.expectedCount;
    const identityMismatchCount = rows.filter((row) => row.identity_matches !== true).length;
    const coordinateVerifiedCount = rows.filter((row) => row.coordinates_verified === true).length;
    const placesWithAttributedImage = rows.filter((row) => Number(row.complete_image_metadata_count) > 0).length;
    const placesWithSupportingReference = rows.filter((row) => row.has_supporting_reference === true).length;
    const coordinateIncorrectCount = rows.filter((row) =>
      row.id !== null && row.latitude !== null && row.longitude !== null && row.coordinates_verified !== true
    ).length;
    const imageRecordCount = Number(imageCounts.rows[0].total);
    const report = {
      status: catalogue.rows[0].membership_count === expectedCount &&
        catalogue.rows[0].published_list_count === expectedCount &&
        catalogue.rows[0].states_count === 1 &&
        catalogue.rows[0].countries_count === 1 &&
        catalogue.rows[0].india_country_count === expectedCount &&
        catalogue.rows[0].unique_keys === expectedCount &&
        catalogue.rows[0].unique_orders === expectedCount &&
        catalogue.rows[0].addressed_places === expectedCount &&
        identityMismatchCount === 0 &&
        coordinateVerifiedCount === expectedCount &&
        placesWithSupportingReference === expectedCount &&
        placesWithAttributedImage === expectedCount ? "PASS" : "INCOMPLETE",
      transaction: "read-only; rolled back",
      catalogue: {
        expected_count: expectedCount,
        database: catalogue.rows[0],
        identity_mismatch_count: identityMismatchCount,
        missing_or_incorrect_places: rows.filter((row) => row.identity_matches !== true).map((row) => ({ order: row.display_order, name: row.name || "missing", slug: row.slug || row.catalogue_key })),
        missing_address_count: expectedCount - Number(catalogue.rows[0].addressed_places),
      },
      coordinates: {
        verified_count: coordinateVerifiedCount,
        unverified_count: rows.filter((row) => row.id !== null && row.coordinates_verified !== true).length,
        incorrect_count: coordinateIncorrectCount,
        note: "A point is verified only when its current coordinates match the manifest and an approved source row supports that coordinate claim.",
      },
      images: {
        ...imageCounts.rows[0],
        places_with_verified_attributed_image: placesWithAttributedImage,
        places_without_images: rows.filter((row) => Number(row.verified_image_count) === 0).map((row) => row.name || row.catalogue_key),
        places_with_images_missing_attribution: rows.filter((row) => Number(row.verified_image_count) > 0 &&
          Number(row.verified_image_count) !== Number(row.complete_image_metadata_count)).map((row) => row.name || row.catalogue_key),
        accessibility_checked: false,
        visual_match_checked: false,
      },
      descriptions: {
        places_with_supporting_reference: rows.filter((row) => row.has_supporting_reference === true).length,
        places_without_supporting_reference: rows.filter((row) => row.has_supporting_reference !== true).map((row) => row.name || row.catalogue_key),
        places_with_approved_reviewed_reference: rows.filter((row) => row.has_approved_supporting_source === true).length,
        places_without_approved_reviewed_reference: rows.filter((row) => row.has_approved_supporting_source !== true).map((row) => row.name || row.catalogue_key),
      },
      public_api_eligibility_counts: {
        list_and_detail: Number(catalogue.rows[0].published_list_count),
        categories: Number(catalogue.rows[0].categories_count),
        states: Number(catalogue.rows[0].states_count),
        districts: Number(catalogue.rows[0].districts_count),
        map: Number(catalogue.rows[0].verified_map_count),
        note: "These are read-only SQL eligibility counts used by the API filters; this command does not call a running HTTP server.",
      },
      existing_user_data_counts: preservedData.rows[0],
    };
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "PASS") process.exitCode = 1;
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(`Read-only catalogue verification failed: ${error.code || error.message || "unknown error"}`);
  process.exitCode = 1;
});
