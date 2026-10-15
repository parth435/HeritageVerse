-- Store the country for curated Maharashtra destinations without assigning
-- a value to unrelated legacy heritage records.
BEGIN;

ALTER TABLE heritage ADD COLUMN IF NOT EXISTS country TEXT;

UPDATE heritage h
   SET country = 'India', updated_at = NOW()
  FROM heritage_catalog_membership membership
 WHERE membership.heritage_id = h.id
   AND h.state = 'Maharashtra'
   AND h.country IS DISTINCT FROM 'India';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM heritage_catalog_membership membership
       JOIN heritage h ON h.id = membership.heritage_id
      WHERE h.state = 'Maharashtra' AND h.country = 'India') <> 30 THEN
    RAISE EXCEPTION 'All 30 curated Maharashtra destinations must have country India';
  END IF;
END $$;

COMMIT;
