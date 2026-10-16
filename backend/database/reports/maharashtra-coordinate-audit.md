# Maharashtra Heritage Coordinates Audit

**Generated:** 2026-10-13  
**Read-only database snapshot:** 2026-10-12T18:52:01.463Z  
**Input:** `maharashtra_heritage_all_205_coordinates.csv`  
**Database scope:** published HeritageVerse records with state `Maharashtra`.

## Summary

| Finding | Result |
| --- | ---: |
| Input rows | 205 |
| Valid coordinate pairs | 205 |
| Missing input coordinates | 0 |
| Out-of-range input coordinates | 0 |
| Exact duplicate input rows | 0 |
| Repeated-name groups | 9 |
| Repeated-name groups with different coordinates | 6 |
| Shared-coordinate groups | 43 (143 rows participate) |
| Exact normalized-name catalog candidates | 204 rows |
| Rows with a matching inferred context district | 86 |
| Rows with matching catalog locality text in context | 35 |

### Candidate classifications

| Classification | Rows |
| --- | ---: |
| `EXISTING_MATCH` | 76 |
| `POSSIBLE_DUPLICATE` | 4 |
| `NEW_SITE_CANDIDATE` | 0 |
| `AMBIGUOUS` | 125 |
| `INVALID_COORDINATES` | 0 |

The 76 conservative matches identify 76 unique published records that currently lack approved coordinates. They are **coordinate-review candidates only**; the CSV provides no evidence to approve a pair.

The four `POSSIBLE_DUPLICATE` rows form two groups: Ajanta Caves (input rows 6-7; catalog IDs 4 and 1169) and Ellora Caves (rows 61-62; IDs 3 and 1171). Each pair repeats one proposed point, the second row is labeled duplicate, and the catalog has two exact-name records. No database records were merged. Rows 156-158 (Stone Circle A/B/C contexts) remain ambiguous because the file does not establish whether they are components of one catalog site or separate features.

No row is classified as a new site. 204 rows have an exact normalized name candidate; row 116 has a near-title candidate but not an exact match. 125 rows remain unresolved because district/locality context conflicts, names are generic or component-level, or no unique identifier resolves the candidate.

## Coordinate review

The live catalog contains **205** published Maharashtra records:

| Existing coordinate state | Records |
| --- | ---: |
| Approved coordinate pair | 2 |
| Missing coordinate pair | 203 |
| Partial pair | 0 |
| Pair present without approved coordinate source | 0 |

The two approved pairs belong to Ajanta Caves (ID 4) and Ellora Caves (ID 3), with [Ajanta's UNESCO coordinate source](https://whc.unesco.org/en/list/242/) and [Ellora's UNESCO coordinate source](https://whc.unesco.org/en/list/243/). Both source rows have `review_status=approved`; their confidence is null, so numeric confidence was not recorded. The CSV values are rounded equivalents about 5 m from Ajanta's pair and 3 m from Ellora's pair. This proximity does not establish source or accuracy, and no update is indicated.

The other **203** published records remain without approved coordinates. Of these, 76 have a unique exact-name/district match in this file; 127 still lack an unambiguous row-to-record mapping. The CSV has no source URL, source title/publisher, method/accuracy, accessed date, reviewer, confidence, or approval field. `Identified_Monument_Context` is not provenance. Every proposed pair is therefore marked **NOT_APPROVED**.

Coordinates are repeated across 43 groups (143 rows). The largest groups are `19.9836,74.1961` (11 rows), `18.2361,73.4444` (9 rows), `21.1714,74.4917` (8 rows), `18.545,72.9264` (7 rows), `21.4667,77.3167` (7 rows). A shared point may be a precinct point, a reused estimate, or a duplicate; it is not proof that the named features are the same. The CSV gives row references for review.

## Match and validation method

- Each CSV row retains its ordinal, source-file line, original `Row_ID`, and original `Original_Label`. A leading list number is removed only for comparison when followed by a period; original text is unchanged.
- Matching used live records filtered to `state='Maharashtra'` and `publication_status='published'`. Names were normalized for case, punctuation, diacritics, and ampersands. The input has no structured state, district, or external-ID fields; Maharashtra is the task scope and the district was inferred from the final context phrase. District aliases were applied for Nasik/Nashik, Dhulia/Dhule, Yeotmal/Yavatmal, Sholapur/Solapur, Aurangabad/Chhatrapati Sambhajinagar, and Ahmednagar/Ahilyanagar. The catalog has 3 published Wikidata QIDs; candidate IDs are recorded per row in the CSV.
- `EXISTING_MATCH` requires exact normalized name, one district-aligned catalog record, and no unresolved generic-name/locality collision. `POSSIBLE_DUPLICATE` flags the repeated Ajanta/Ellora rows. `AMBIGUOUS` means the context, title, locality, or external ID does not uniquely establish identity. Similar names are not treated as proof. `NEW_SITE_CANDIDATE` requires a distinct context with no plausible published candidate; none met that bar. Missing or out-of-range pairs are `INVALID_COORDINATES`.
- Latitude and longitude are checked against global ranges -90 to 90 and -180 to 180. All input pairs pass. Decimal places and repeated values do not prove accuracy. Distances to stored approved pairs are approximate straight-line distances.
- The catalog was queried in a PostgreSQL `BEGIN READ ONLY` transaction and rolled back. No heritage, source, coordinate, or media rows were changed.

### Examples requiring manual review

| CSV row | Original name | CSV context | Candidate catalog row | Reason |
| ---: | --- | --- | --- | --- |
| 8 | 8. Ambar Mahal | Ambar Mahal, Mhasla/Raigad | ID 1291: Ambar Mahal (Amravati/Ellichpur (Achalpur)) | Exact title exists but input district context conflicts with catalog location (Amravati/Ellichpur (Achalpur)). |
| 10 | 10. An Old Temple | Sinnar Old Temple Cluster, Nashik | ID 1158: An Old Temple (Ahmednagar/Kokamthan) | Exact title exists but input district context conflicts with catalog location (Ahmednagar/Kokamthan). |
| 20 | 20. Balapur fort | Balapur Fort, Akola | ID 1292: Balapur fort (Amravati/Ellichpur (Achalpur)) | Exact title exists but input district context conflicts with catalog location (Amravati/Ellichpur (Achalpur)). |
| 60 | 60. Elephanta Caves | Elephanta Caves, Raigad | ID 2: Elephanta Caves (Mumbai Suburban/no locality) | Exact title exists but input district context conflicts with catalog location (Mumbai Suburban/no locality). |
| 72 | 72. Fort at Pratapgad | Fort at Pratapgad, Satara | ID 1334: Fort at Pratapgad (Nagpur/Ghogra) | Exact title exists but input district context conflicts with catalog location (Nagpur/Ghogra). |
| 116 | 116. Mendha Gateway, v Akot Gateway, v Delhi | Gawilgarh Akot and Delhi Gateways, Amravati | ID 1287: Mendha Gateway, iv Akot Gateway, v Delhi (Amravati/Amner) | Title differs from candidate by one character (iv vs v); context/locality and identity need review. |

## Source, approval, and image rules

The input columns are `Row_ID`, `Original_Label`, `Identified_Monument_Context`, `Latitude`, and `Longitude`; there are no source/provenance, accuracy, state/district, QID, or review columns. There are zero exact full-row duplicates, six repeated-name groups with different points, and shared coordinate groups listed above. Repeated titles alone were not treated as duplicates.

HeritageVerse stores nullable coordinates with global range checks and source citations separately. Adding/changing a coordinate requires a trusted HTTPS source and confidence of at least 0.95; the enrichment workflow requires human approval and reviewer metadata. Existing approved UNESCO sources may have null confidence because confidence was not recorded. See [schema coordinates and source table](../schema.sql#L45), [admin/API coordinate requirements](../../API.md#L177), [coordinate importer validation](../enrich-coordinates.js#L25), and [review metadata migration](../migrations/005_verified_media_and_coordinate_review.sql#L14).

This CSV has no image columns, so it cannot establish image identity or verification. HeritageVerse keeps attached media unverified by default; verified, non-illustrative images follow a separate provenance and rights review. See [API image behavior](../../API.md#L128) and [media verification schema](../schema.sql#L114).

## Row-level output

The companion [CSV audit](./maharashtra-coordinate-audit.csv) contains all 205 records, original names and row numbers, match candidates and reasons, external IDs, existing coordinates/approval and deltas, repeated-name/shared-point references, proposed-coordinate status, and provenance gaps.
