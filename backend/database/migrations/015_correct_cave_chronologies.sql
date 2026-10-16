-- Correct catalogue date ranges to match UNESCO's current site histories:
-- Ajanta has two separate excavation phases, while Ellora spans the 6th–12th
-- centuries. Guard each update by the exact previous text to avoid replacing
-- later editorial changes or administrator-maintained descriptions.
BEGIN;

UPDATE heritage
   SET historical_period = '2nd–1st centuries BCE; 5th–6th centuries CE',
       history = 'Ajanta was excavated in two phases: the first from the 2nd to 1st centuries BCE and the second from the 5th to 6th centuries CE, separated by about four centuries.'
 WHERE slug = 'ajanta-caves'
   AND historical_period = '2nd century BCE–5th century CE'
   AND history = 'The caves were created in phases from the 2nd century BCE through the later ancient period.';

UPDATE heritage
   SET historical_period = '6th–12th centuries CE',
       history = 'The 34 caves were excavated in three phases from the 6th to the 12th centuries CE and represent Buddhist, Hindu, and Jain traditions.'
 WHERE slug = 'ellora-caves'
   AND historical_period = '6th–10th centuries CE'
   AND history = 'The caves were created over several centuries in the first millennium CE.';

COMMIT;
