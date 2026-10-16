-- Add only official UNESCO World Heritage Centre property points for exact
-- catalogue matches. Values are converted from the source DMS coordinates to
-- decimal degrees and stored to the schema's six-decimal precision. These are
-- property points, not visitor entrances or turn-by-turn access coordinates.
-- This migration is additive and repeatable: existing coordinates are never
-- overwritten, and coordinate claims merge with existing citations.
BEGIN;

CREATE TEMPORARY TABLE verified_unesco_coordinates (
  slug TEXT NOT NULL,
  state TEXT NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  source_url TEXT NOT NULL,
  source_title TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO verified_unesco_coordinates (slug, state, latitude, longitude, source_url, source_title)
VALUES
    ('taj-mahal', 'Uttar Pradesh', 27.174170::NUMERIC, 78.042220::NUMERIC,
      'https://whc.unesco.org/en/list/252/', 'Taj Mahal - World Heritage List geographic data (ID 252)'),
    ('agra-fort', 'Uttar Pradesh', 27.179806::NUMERIC, 78.021528::NUMERIC,
      'https://whc.unesco.org/en/list/251/', 'Agra Fort - World Heritage List geographic data (ID 251)'),
    ('fatehpur-sikri', 'Uttar Pradesh', 27.097528::NUMERIC, 77.666500::NUMERIC,
      'https://whc.unesco.org/en/list/255/', 'Fatehpur Sikri - World Heritage List geographic data (ID 255)'),
    ('ajanta-caves', 'Maharashtra', 20.553111::NUMERIC, 75.700250::NUMERIC,
      'https://whc.unesco.org/en/list/242/', 'Ajanta Caves - World Heritage List geographic data (ID 242)'),
    ('ellora-caves', 'Maharashtra', 20.026390::NUMERIC, 75.179170::NUMERIC,
      'https://whc.unesco.org/en/list/243/', 'Ellora Caves - World Heritage List geographic data (ID 243)'),
    ('hampi', 'Karnataka', 15.314440::NUMERIC, 76.471670::NUMERIC,
      'https://whc.unesco.org/en/list/241/', 'Group of Monuments at Hampi - World Heritage List geographic data (ID 241)'),
    ('qutb-minar', 'Delhi', 28.524483::NUMERIC, 77.185397::NUMERIC,
      'https://whc.unesco.org/document/164615', 'Qutb Minar and its Monuments, Delhi - Periodic Report geographic coordinates (ID 233)'),
    ('sanchi-buddhist-monuments', 'Madhya Pradesh', 23.479440::NUMERIC, 77.739720::NUMERIC,
      'https://whc.unesco.org/en/list/524/', 'Buddhist Monuments at Sanchi - World Heritage List geographic data (ID 524)'),
    ('konark-sun-temple', 'Odisha', 19.887500::NUMERIC, 86.105831::NUMERIC,
      'https://whc.unesco.org/en/list/246/', 'Sun Temple, Konarak - World Heritage List geographic data (ID 246)');

UPDATE heritage h
   SET latitude = c.latitude,
       longitude = c.longitude,
       updated_at = NOW()
  FROM verified_unesco_coordinates c
 WHERE h.slug = c.slug
   AND h.state = c.state
   AND h.latitude IS NULL
   AND h.longitude IS NULL;

INSERT INTO heritage_sources (
  heritage_id, source_name, source_title, publisher, source_url,
  source_note, accessed_on, claims_supported
)
SELECT h.id,
       'UNESCO World Heritage Centre',
       c.source_title,
       'UNESCO World Heritage Centre',
       c.source_url,
       'UNESCO lists this geographic point for the World Heritage property; the published DMS value was converted to decimal degrees and rounded to six decimal places. It is a property point, not a visitor entrance or turn-by-turn access coordinate.',
       DATE '2026-10-10',
       ARRAY['coordinates']::TEXT[]
  FROM verified_unesco_coordinates c
  JOIN heritage h ON h.slug = c.slug AND h.state = c.state
 WHERE h.latitude = c.latitude
   AND h.longitude = c.longitude
ON CONFLICT (heritage_id, source_url) DO UPDATE
  SET source_title = COALESCE(heritage_sources.source_title, EXCLUDED.source_title),
      publisher = COALESCE(heritage_sources.publisher, EXCLUDED.publisher),
      source_note = CASE
        WHEN POSITION('property point, not a visitor entrance' IN COALESCE(heritage_sources.source_note, '')) > 0
          THEN heritage_sources.source_note
        ELSE CONCAT_WS(' ', heritage_sources.source_note, EXCLUDED.source_note)
      END,
      accessed_on = GREATEST(heritage_sources.accessed_on, EXCLUDED.accessed_on),
      claims_supported = ARRAY(
        SELECT DISTINCT claim
          FROM UNNEST(heritage_sources.claims_supported || EXCLUDED.claims_supported) AS claims(claim)
         ORDER BY claim
      );

COMMIT;
