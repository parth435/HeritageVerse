-- Match the source claim metadata to the timeline events already stored.
-- This only adds claims for sources that are directly linked to those events.
BEGIN;

UPDATE heritage_sources AS source
   SET claims_supported = array_append(source.claims_supported, 'timeline_event')
 WHERE NOT ('timeline_event' = ANY(source.claims_supported))
   AND EXISTS (
     SELECT 1
       FROM heritage_timeline_events AS event
      WHERE event.source_id = source.id
   );

UPDATE heritage_sources AS source
   SET claims_supported = array_append(source.claims_supported, 'protected_status')
 WHERE NOT ('protected_status' = ANY(source.claims_supported))
   AND EXISTS (
     SELECT 1
       FROM heritage_timeline_events AS event
      WHERE event.source_id = source.id
        AND event.title = 'Inscribed on UNESCO World Heritage List'
   );

COMMIT;
