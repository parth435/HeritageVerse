-- Additive location detail for source-provided locality and address fields.
BEGIN;

ALTER TABLE heritage ADD COLUMN IF NOT EXISTS locality TEXT;
ALTER TABLE heritage ADD COLUMN IF NOT EXISTS address TEXT;

COMMIT;
