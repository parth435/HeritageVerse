-- Fill the remaining selected-place address fields only for exact natural-key
-- matches whose catalogue identity, state, district, and category were checked.
-- This migration changes no IDs, source rows, aliases, or user-owned data.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    WITH expected(slug, name, state, district, category_slug) AS (VALUES
      ('khajuraho-monuments','Khajuraho Group of Monuments','Madhya Pradesh','Chhatarpur','temple-religious'),
      ('konark-sun-temple','Konark Sun Temple','Odisha','Puri','temple-religious'),
      ('red-fort','Red Fort','Delhi','Central Delhi','fort-palace'),
      ('taj-mahal','Taj Mahal','Uttar Pradesh','Agra','mausoleum-tomb'),
      ('hampi','Hampi Group of Monuments','Karnataka','Vijayanagara','archaeological')
    )
    SELECT 1
    FROM expected
    LEFT JOIN heritage h ON h.slug=expected.slug
    LEFT JOIN heritage_categories category ON category.id=h.category_id
    WHERE h.id IS NULL
       OR h.name IS DISTINCT FROM expected.name
       OR h.state IS DISTINCT FROM expected.state
       OR h.district IS DISTINCT FROM expected.district
       OR category.slug IS DISTINCT FROM expected.category_slug
  ) THEN
    RAISE EXCEPTION 'A selected-place address correction has no exact slug/name/state/district/category match.';
  END IF;
END $$;

UPDATE heritage SET address='Khajuraho, Chhatarpur district, Madhya Pradesh', updated_at=NOW()
 WHERE slug='khajuraho-monuments'
   AND name='Khajuraho Group of Monuments'
   AND state='Madhya Pradesh' AND district='Chhatarpur';
UPDATE heritage SET address='Konark, Puri district, Odisha', updated_at=NOW()
 WHERE slug='konark-sun-temple'
   AND name='Konark Sun Temple'
   AND state='Odisha' AND district='Puri';
UPDATE heritage SET address='Red Fort, Chandni Chowk, Delhi', updated_at=NOW()
 WHERE slug='red-fort' AND name='Red Fort'
   AND state='Delhi' AND district='Central Delhi';
UPDATE heritage SET address='Taj Mahal, Tajganj, Agra, Uttar Pradesh', updated_at=NOW()
 WHERE slug='taj-mahal' AND name='Taj Mahal'
   AND state='Uttar Pradesh' AND district='Agra';
UPDATE heritage SET address='Hampi, Vijayanagara district, Karnataka', updated_at=NOW()
 WHERE slug='hampi' AND name='Hampi Group of Monuments'
   AND state='Karnataka' AND district='Vijayanagara';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM heritage_catalog_membership) <> 30 THEN
    RAISE EXCEPTION 'Address validation expects exactly 30 selected catalogue members.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM heritage_catalog_membership membership
    JOIN heritage h ON h.id=membership.heritage_id
    WHERE NULLIF(BTRIM(h.address), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'A selected catalogue place is still missing an address.';
  END IF;
END $$;

COMMIT;
