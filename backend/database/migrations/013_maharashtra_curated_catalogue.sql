-- Move public catalogue membership to 30 curated destinations in Maharashtra.
-- This migration keeps all heritage rows and every user relationship intact.
BEGIN;

INSERT INTO heritage_categories (name, slug) VALUES
  ('Museum', 'museum'),
  ('Natural and archaeological heritage', 'archaeological'),
  ('Historic urban ensemble', 'historic-urban')
ON CONFLICT (slug) DO NOTHING;

-- Canonicalize the existing Panhala record while preserving its old URL.
DO $$
DECLARE
  old_id INTEGER;
  canonical_id INTEGER;
BEGIN
  SELECT id INTO old_id FROM heritage
   WHERE slug = 'asi-panhala-fort-pohala-kolhapur-maharashtra-df4d9de25a';
  SELECT id INTO canonical_id FROM heritage WHERE slug = 'panhala-fort';
  IF old_id IS NOT NULL AND canonical_id IS NOT NULL AND old_id <> canonical_id THEN
    RAISE EXCEPTION 'Both legacy and canonical Panhala records exist; refusing to merge identities';
  END IF;
  IF old_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM heritage_slug_aliases
       WHERE slug_alias = 'asi-panhala-fort-pohala-kolhapur-maharashtra-df4d9de25a'
         AND heritage_id <> old_id
    ) THEN
      RAISE EXCEPTION 'The legacy Panhala slug already points to a different heritage record';
    END IF;
    INSERT INTO heritage_slug_aliases (slug_alias, heritage_id, reason)
    VALUES (
      'asi-panhala-fort-pohala-kolhapur-maharashtra-df4d9de25a',
      old_id,
      'Legacy ASI catalogue slug retained after Maharashtra catalogue canonicalization'
    ) ON CONFLICT (slug_alias) DO NOTHING;
    UPDATE heritage SET slug = 'panhala-fort', updated_at = NOW()
     WHERE id = old_id AND slug = 'asi-panhala-fort-pohala-kolhapur-maharashtra-df4d9de25a';
  END IF;
END $$;

WITH additions(slug, name, description, history, cultural_significance, architecture,
               historical_period, category_slug, district, locality, address) AS (VALUES
  (
    'lohagad-fort', 'Lohagad Fort',
    'A hill fort near Lonavala and part of the UNESCO-listed Maratha Military Landscapes of India.',
    'Lohagad was one of the hill fortifications incorporated into the Maratha military landscape. UNESCO inscribed the serial property in 2025.',
    'The fort illustrates the use of elevated Sahyadri terrain in a regional network of defensive strongholds.',
    'A hilltop fort with stone ramparts and gateways adapted to the ridge.',
    'Medieval and Maratha periods; UNESCO inscription of the serial property in 2025',
    'fort-palace', 'Pune', 'Lonavala', 'Lohagad Fort, near Lonavala, Pune district, Maharashtra'
  ),
  (
    'vasai-fort', 'Vasai Fort',
    'A coastal fort in Vasai associated with Portuguese rule and the changing military history of the Konkan coast.',
    'The fort served as a major Portuguese center on the west coast before it passed to Maratha control in the eighteenth century. It is a component of India’s UNESCO Tentative List submission for Konkan coastal fortifications, not an inscribed World Heritage property.',
    'Its fortifications and churches preserve evidence of coastal trade, colonial rule, and Maratha campaigns.',
    'A fortified coastal settlement with bastions, gates, churches, and military structures.',
    'Portuguese and Maratha periods, sixteenth to eighteenth centuries',
    'fort-palace', 'Palghar', 'Vasai', 'Vasai Fort, Vasai, Palghar district, Maharashtra'
  ),
  (
    'chhatrapati-shivaji-maharaj-vastu-sangrahalaya', 'Chhatrapati Shivaji Maharaj Vastu Sangrahalaya',
    'A public museum in Mumbai with collections spanning archaeology, art, natural history, and material culture.',
    'The museum’s foundation stone was laid in 1905 and it opened to the public in 1922. It was formerly known as the Prince of Wales Museum of Western India.',
    'Its collections document the cultural and artistic histories of India and neighboring regions.',
    'George Wittet designed the building in the Indo-Saracenic style; it forms part of Mumbai’s Victorian Gothic and Art Deco UNESCO property.',
    'Built 1905–1914; opened as a museum in 1922',
    'museum', 'Mumbai City', 'Mumbai', '159–161 Mahatma Gandhi Road, Fort, Mumbai, Maharashtra'
  ),
  (
    'pitalkhora-caves', 'Pitalkhora Caves',
    'A group of fourteen Buddhist rock-cut caves in the Satmala range near Amba village.',
    'The caves date from around the second century BCE and include monasteries, prayer halls, inscriptions, and surviving traces of painting.',
    'The complex is an early example of rock-cut Buddhist architecture in western India.',
    'Fourteen basalt caves arranged in two groups, including chaityas and viharas.',
    'Circa second century BCE onward',
    'cave-rock-cut', 'Chhatrapati Sambhajinagar', 'near Amba village', 'Pitalkhora Caves, near Amba village, Kannad taluka, Chhatrapati Sambhajinagar district, Maharashtra'
  ),
  (
    'lonar-lake', 'Lonar Lake',
    'A saline and alkaline lake occupying an impact crater in basalt in Buldhana district.',
    'The lake formed after a meteorite impact. It is recognized as a Ramsar Site and a national geo-heritage feature.',
    'The crater and lake are important for geological research and the study of unusual saline and alkaline ecosystems.',
    'A roughly circular impact crater with a lake, crater rim, and surrounding basaltic landscape.',
    'Geological feature formed in the late Pleistocene; Ramsar designation in 2020',
    'archaeological', 'Buldhana', 'Lonar', 'Lonar Lake, Lonar, Buldhana district, Maharashtra'
  ),
  (
    'pataleshwar-caves', 'Pataleshwar Caves',
    'A rock-cut Shaiva cave temple in central Pune, carved into the Deccan basalt.',
    'The cave temple is generally dated to the eighth century and is associated with the Rashtrakuta period.',
    'The site preserves an early example of rock-cut religious architecture in the Pune region.',
    'A basalt excavation with a pillared porch and a circular Nandi mandapa.',
    'Eighth century CE',
    'cave-rock-cut', 'Pune', 'Pune', 'Pataleshwar Cave Temple, Jungli Maharaj Road, Pune, Maharashtra'
  ),
  (
    'panhala-fort', 'Panhala Fort',
    'A major hill fort in Kolhapur district and a component of the UNESCO-listed Maratha Military Landscapes of India.',
    'Panhala developed as an important Deccan fort and was later incorporated into the Maratha defensive network. The serial property was inscribed by UNESCO in 2025.',
    'The fort is a prominent example of the military and political history of the Deccan and the Maratha period.',
    'A hill fort with extensive stone defenses, gateways, bastions, and water structures.',
    'Medieval and Maratha periods; UNESCO inscription of the serial property in 2025',
    'fort-palace', 'Kolhapur', 'Panhala', 'Panhala Fort, Panhala, Kolhapur district, Maharashtra'
  )
)
INSERT INTO heritage (
  name, slug, description, history, cultural_significance, architecture,
  historical_period, category_id, state, district, locality, address,
  latitude, longitude, publication_status
)
SELECT a.name, a.slug, a.description, a.history, a.cultural_significance,
       a.architecture, a.historical_period, c.id, 'Maharashtra', a.district,
       a.locality, a.address, NULL, NULL, 'published'
  FROM additions a
  JOIN heritage_categories c ON c.slug = a.category_slug
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  history = EXCLUDED.history,
  cultural_significance = EXCLUDED.cultural_significance,
  architecture = EXCLUDED.architecture,
  historical_period = EXCLUDED.historical_period,
  category_id = EXCLUDED.category_id,
  state = EXCLUDED.state,
  district = EXCLUDED.district,
  locality = EXCLUDED.locality,
  address = EXCLUDED.address,
  updated_at = NOW();

-- Complete the Mumbai ensemble and Panhala identities without changing IDs.
UPDATE heritage
   SET name = 'Victorian Gothic and Art Deco Ensembles of Mumbai',
       description = 'A UNESCO-listed urban ensemble of Victorian Gothic and Art Deco buildings around Mumbai’s Oval Maidan.',
       history = 'The ensemble reflects successive phases of Mumbai’s growth in the nineteenth and twentieth centuries and was inscribed on the World Heritage List in 2018.',
       cultural_significance = 'The precinct demonstrates how international architectural styles were adapted to Mumbai’s urban setting.',
       architecture = 'Victorian Gothic civic buildings and Art Deco residential buildings form two complementary streetscapes around Oval Maidan.',
       historical_period = 'Nineteenth and twentieth centuries; UNESCO inscription in 2018',
       category_id = (SELECT id FROM heritage_categories WHERE slug = 'historic-urban'),
       state = 'Maharashtra', district = 'Mumbai City', locality = 'Mumbai',
       address = 'Oval Maidan and adjoining precinct, Mumbai, Maharashtra',
       updated_at = NOW()
 WHERE slug = 'mumbai-victorian-art-deco';

UPDATE heritage
   SET name = 'Panhala Fort',
       description = 'A major hill fort in Kolhapur district and a component of the UNESCO-listed Maratha Military Landscapes of India.',
       history = 'Panhala developed as an important Deccan fort and was later incorporated into the Maratha defensive network. The serial property was inscribed by UNESCO in 2025.',
       cultural_significance = 'The fort is a prominent example of the military and political history of the Deccan and the Maratha period.',
       architecture = 'A hill fort with extensive stone defenses, gateways, bastions, and water structures.',
       historical_period = 'Medieval and Maratha periods; UNESCO inscription of the serial property in 2025',
       category_id = (SELECT id FROM heritage_categories WHERE slug = 'fort-palace'),
       state = 'Maharashtra', district = 'Kolhapur', locality = 'Panhala',
       address = 'Panhala Fort, Panhala, Kolhapur district, Maharashtra',
       updated_at = NOW()
 WHERE slug = 'panhala-fort';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM heritage WHERE slug = 'mumbai-victorian-art-deco') THEN
    RAISE EXCEPTION 'The existing Mumbai Victorian and Art Deco record is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM heritage WHERE slug = 'panhala-fort') THEN
    RAISE EXCEPTION 'The existing Panhala record is missing';
  END IF;
  IF (SELECT count(*) FROM heritage WHERE slug IN (
    'lohagad-fort','vasai-fort','chhatrapati-shivaji-maharaj-vastu-sangrahalaya',
    'pitalkhora-caves','lonar-lake','pataleshwar-caves'
  )) <> 6 THEN
    RAISE EXCEPTION 'One or more curated Maharashtra destinations could not be created';
  END IF;
END $$;

-- Source of record facts and verified coordinate evidence for all 30 places.
WITH coordinates(slug, latitude, longitude, source_name, source_title, publisher, source_url, source_note) AS (VALUES
  ('chhatrapati-shivaji-maharaj-terminus',18.940122,72.836203,'UNESCO World Heritage Centre','Victorian Gothic and Art Deco Ensembles of Mumbai - Maps','UNESCO World Heritage Centre','https://whc.unesco.org/en/list/945/maps/','UNESCO geographical data for the CSMT property.'),
  ('gateway-of-india',18.921960,72.834560,'OpenStreetMap','Gateway of India, Colaba, Mumbai','OpenStreetMap contributors','https://www.openstreetmap.org/way/28845634','Mapped monument footprint in Colaba, cross-checked against the named Gateway of India feature.'),
  ('elephanta-caves',18.966670,72.935830,'UNESCO World Heritage Centre','Elephanta Caves - Maps','UNESCO World Heritage Centre','https://whc.unesco.org/en/list/244/maps/','UNESCO geographical data for the Elephanta Caves property.'),
  ('kanheri-caves',19.208000,72.906000,'Getty Research Institute','Kanheri Caves - TGN 1103310','Getty Thesaurus of Geographic Names','https://vocab.getty.edu/page/tgn/1103310','Getty TGN point for the Kanheri sacred and archaeological site.'),
  ('ajanta-caves',20.553111,75.700250,'UNESCO World Heritage Centre','Ajanta Caves - Maps','UNESCO World Heritage Centre','https://whc.unesco.org/en/list/242/maps/','UNESCO geographical data for the Ajanta Caves property.'),
  ('ellora-caves',20.026390,75.179170,'UNESCO World Heritage Centre','Ellora Caves - Maps','UNESCO World Heritage Centre','https://whc.unesco.org/en/list/243/maps/','UNESCO geographical data for the Ellora Caves property.'),
  ('daulatabad-fort',19.944056,75.219917,'National Monuments Authority','Location and Setting of Daulatabad Fort and Monuments','Government of India','https://www.nma.gov.in/showfile.php?lang=2&level=1&lid=2102&ls_id=1688','Coordinates transcribed from the Government of India monument setting report.'),
  ('bibi-ka-maqbara',19.901389,75.320278,'National Monuments Authority','Location and Setting of Bibi-ka-Maqbara','Government of India','https://www.nma.gov.in/showfile.php?lang=1&level=1&lid=2045&ls_id=1647','Coordinates transcribed from the Government of India protected monument report.'),
  ('raigad-fort',18.236111,73.444444,'UNESCO World Heritage Centre','Maratha Military Landscapes of India - Maps','UNESCO World Heritage Centre','https://whc.unesco.org/en/list/1739/maps/','UNESCO component coordinate for Raigad.'),
  ('shivneri-fort',19.196667,73.858333,'UNESCO World Heritage Centre','Maratha Military Landscapes of India - Maps','UNESCO World Heritage Centre','https://whc.unesco.org/en/list/1739/maps/','UNESCO component coordinate for Shivneri Fort.'),
  ('sinhagad-fort',18.364660,73.756700,'OpenStreetMap','Sinhagad Fort','OpenStreetMap contributors','https://www.openstreetmap.org/way/126392859','Mapped fort footprint in Donaje, Haveli taluka.'),
  ('shaniwar-wada',18.519500,73.855300,'Geological Survey of India','Potential Geoparks of India','Government of India','https://geoheritage.in/assets/img/Library/Popular%20articles/Monograph_Potential%20Geoparks%20of%20India.pdf','Published geographic point for Shaniwar Wada in Pune.'),
  ('aga-khan-palace',18.552360,73.901450,'OpenStreetMap','Aga Khan Palace','OpenStreetMap contributors','https://www.openstreetmap.org/way/215998839','Mapped palace footprint in Pune.'),
  ('pratapgad-fort',17.935833,73.578611,'UNESCO World Heritage Centre','Maratha Military Landscapes of India - Maps','UNESCO World Heritage Centre','https://whc.unesco.org/en/list/1739/maps/','UNESCO component coordinate for Pratapgad.'),
  ('sindhudurg-fort',16.042500,73.459722,'UNESCO World Heritage Centre','Maratha Military Landscapes of India - Maps','UNESCO World Heritage Centre','https://whc.unesco.org/en/list/1739/maps/','UNESCO component coordinate for Sindhudurg.'),
  ('vijaydurg-fort',16.560833,73.333333,'UNESCO World Heritage Centre','Maratha Military Landscapes of India - Maps','UNESCO World Heritage Centre','https://whc.unesco.org/en/list/1739/maps/','UNESCO component coordinate for Vijaydurg.'),
  ('murud-janjira-fort',18.299917,72.964411,'Permanent Delegation of India to UNESCO','Serial nomination of Coastal Fortifications along the Konkan Coast, Maharashtra','UNESCO Tentative Lists','https://whc.unesco.org/en/tentativelists/6703','Coordinates in India’s tentative-list submission; Janjira is not described here as an inscribed property.'),
  ('karla-caves',18.783740,73.470320,'OpenStreetMap','Karla Caves','OpenStreetMap contributors','https://mapcarta.com/N1065807980','Mapped cave complex point near Karla, Lonavala.'),
  ('bhaja-caves',18.727000,73.481000,'Getty Research Institute','Bhaja Caves - TGN 8697395','Getty Thesaurus of Geographic Names','https://vocab.getty.edu/page/tgn/8697395','Getty TGN point for the Bhaja sacred and archaeological site.'),
  ('pandavleni-caves',19.939600,73.748500,'Getty Research Institute','Pandav Caves - TGN 8697409','Getty Thesaurus of Geographic Names','https://vocab.getty.edu/page/tgn/8697409','Getty TGN point for Pandav Caves near Nashik.'),
  ('kalaram-temple',20.006950,73.795220,'OpenStreetMap','Kalaram Mandir, Nashik','OpenStreetMap contributors','https://www.openstreetmap.org/way/361247890','Mapped temple footprint in Panchavati, Nashik.'),
  ('deekshabhoomi',21.128200,79.066930,'OpenStreetMap','Deekshabhoomi, Nagpur','OpenStreetMap contributors','https://www.openstreetmap.org/node/297521871','Mapped Deekshabhoomi monument point in Nagpur.'),
  ('mumbai-victorian-art-deco',18.929806,72.830083,'UNESCO World Heritage Centre','Victorian Gothic and Art Deco Ensembles of Mumbai - Maps','UNESCO World Heritage Centre','https://whc.unesco.org/en/list/1480/maps/','UNESCO geographical data for the inscribed Mumbai urban ensemble.'),
  ('panhala-fort',16.811111,74.108056,'UNESCO World Heritage Centre','Maratha Military Landscapes of India - Maps','UNESCO World Heritage Centre','https://whc.unesco.org/en/list/1739/maps/','UNESCO component coordinate for Panhala Fort.'),
  ('lohagad-fort',18.710000,73.476667,'UNESCO World Heritage Centre','Maratha Military Landscapes of India - Maps','UNESCO World Heritage Centre','https://whc.unesco.org/en/list/1739/maps/','UNESCO component coordinate for Lohagad.'),
  ('vasai-fort',19.330497,72.815572,'Permanent Delegation of India to UNESCO','Serial nomination of Coastal Fortifications along the Konkan Coast, Maharashtra','UNESCO Tentative Lists','https://whc.unesco.org/en/tentativelists/6703','Coordinates in India’s tentative-list submission; Vasai is not described here as an inscribed property.'),
  ('chhatrapati-shivaji-maharaj-vastu-sangrahalaya',18.926873,72.832613,'Museums of India','Chhatrapati Shivaji Maharaja Vastu Sangralaya','Ministry of Culture, Government of India','https://shop.museumsofindia.org/node/330','Museum directory record supplies the address and mapped coordinates.'),
  ('pitalkhora-caves',20.313889,74.992500,'National Mission on Monuments and Antiquities','NMMA Training Manual - Pitalkhora Caves','Government of India','https://nmma.nic.in/nmma/NAS1/nmma_doc/NMMA_Training_Manual_English.pdf','Coordinates are listed in the monument documentation case for Pitalkhora Caves.'),
  ('lonar-lake',19.975833,76.508333,'Ramsar Sites Information Service','Ramsar Information Sheet - Lonar Lake, site 2441','Convention on Wetlands','https://rsis.ramsar.org/RISapp/files/RISrep/IN2441RIS_2011_en.pdf','Coordinates from the official Lonar Lake Ramsar Information Sheet.'),
  ('pataleshwar-caves',18.526800,73.850700,'Geoheritage India','Potential Geoparks of India','Geoheritage India','https://geoheritage.in/assets/img/Library/Popular%20articles/Monograph_Potential%20Geoparks%20of%20India.pdf','Published site coordinate for Pataleshwar cave temple in Pune.')
)
INSERT INTO heritage_sources (
  heritage_id, source_name, source_title, publisher, source_url,
  source_note, accessed_on, claims_supported, review_status
)
SELECT h.id, c.source_name, c.source_title, c.publisher, c.source_url,
       c.source_note, CURRENT_DATE, ARRAY['coordinates']::TEXT[], 'approved'
  FROM coordinates c
  JOIN heritage h ON h.slug = c.slug
ON CONFLICT (heritage_id, source_url) DO UPDATE SET
  claims_supported = ARRAY(
    SELECT DISTINCT claim
      FROM unnest(heritage_sources.claims_supported || EXCLUDED.claims_supported) AS claim
     ORDER BY claim
  );

-- Add content references for the eight records newly included or curated here.
WITH curated_sources(slug, source_name, source_title, publisher, source_url, source_note, claims_supported) AS (VALUES
  ('mumbai-victorian-art-deco','UNESCO World Heritage Centre','Victorian Gothic and Art Deco Ensembles of Mumbai','UNESCO World Heritage Centre','https://whc.unesco.org/en/list/1480/','Official property record; concise paraphrases.',ARRAY['description','history','cultural_significance','architecture','historical_period']::TEXT[]),
  ('panhala-fort','UNESCO World Heritage Centre','Maratha Military Landscapes of India','UNESCO World Heritage Centre','https://whc.unesco.org/en/list/1739/','Official serial-property record; concise paraphrases.',ARRAY['description','history','cultural_significance','architecture','historical_period']::TEXT[]),
  ('lohagad-fort','UNESCO World Heritage Centre','Maratha Military Landscapes of India','UNESCO World Heritage Centre','https://whc.unesco.org/en/list/1739/','Official serial-property record; concise paraphrases.',ARRAY['description','history','cultural_significance','architecture','historical_period']::TEXT[]),
  ('vasai-fort','Permanent Delegation of India to UNESCO','Serial nomination of Coastal Fortifications along the Konkan Coast, Maharashtra','UNESCO Tentative Lists','https://whc.unesco.org/en/tentativelists/6703','India’s tentative-list submission; Vasai is not an inscribed World Heritage property.',ARRAY['description','history','cultural_significance','architecture','historical_period']::TEXT[]),
  ('chhatrapati-shivaji-maharaj-vastu-sangrahalaya','Chhatrapati Shivaji Maharaj Vastu Sangrahalaya','Museum Annual Review 2021–2022','Chhatrapati Shivaji Maharaj Vastu Sangrahalaya','https://csmvs.in/wp-content/uploads/2023/07/ANNUAL-REVIEW-2021-2022-low-res.pdf','Official museum annual review; concise paraphrases.',ARRAY['description','history','cultural_significance','architecture','historical_period']::TEXT[]),
  ('pitalkhora-caves','Department of Tourism Maharashtra','Pitalkhora Caves','Government of Maharashtra','https://maharashtratourism.gov.in/cave/pitalkhora/','Official state tourism entry; concise paraphrases.',ARRAY['description','history','cultural_significance','architecture','historical_period']::TEXT[]),
  ('lonar-lake','Ramsar Sites Information Service','Ramsar Information Sheet - Lonar Lake, site 2441','Convention on Wetlands','https://rsis.ramsar.org/RISapp/files/RISrep/IN2441RIS_2011_en.pdf','Official Ramsar Information Sheet; concise paraphrases.',ARRAY['description','history','cultural_significance','historical_period','protected_status']::TEXT[]),
  ('pataleshwar-caves','Geoheritage India','Potential Geoparks of India','Geoheritage India','https://geoheritage.in/assets/img/Library/Popular%20articles/Monograph_Potential%20Geoparks%20of%20India.pdf','Published geological and cultural heritage study; concise paraphrases.',ARRAY['description','history','cultural_significance','architecture','historical_period']::TEXT[])
)
INSERT INTO heritage_sources (
  heritage_id, source_name, source_title, publisher, source_url,
  source_note, accessed_on, claims_supported, review_status
)
SELECT h.id, r.source_name, r.source_title, r.publisher, r.source_url,
       r.source_note, CURRENT_DATE, r.claims_supported, 'approved'
  FROM curated_sources r
  JOIN heritage h ON h.slug = r.slug
ON CONFLICT (heritage_id, source_url) DO UPDATE SET
  claims_supported = ARRAY(
    SELECT DISTINCT claim
      FROM unnest(heritage_sources.claims_supported || EXCLUDED.claims_supported) AS claim
     ORDER BY claim
  );

-- Refuse to replace coordinates that conflict with the reviewed source set.
DO $$
BEGIN
  IF EXISTS (
    WITH expected(slug, latitude, longitude) AS (VALUES
      ('chhatrapati-shivaji-maharaj-terminus',18.940122,72.836203),('gateway-of-india',18.921960,72.834560),
      ('elephanta-caves',18.966670,72.935830),('kanheri-caves',19.208000,72.906000),
      ('ajanta-caves',20.553111,75.700250),('ellora-caves',20.026390,75.179170),
      ('daulatabad-fort',19.944056,75.219917),('bibi-ka-maqbara',19.901389,75.320278),
      ('raigad-fort',18.236111,73.444444),('shivneri-fort',19.196667,73.858333),
      ('sinhagad-fort',18.364660,73.756700),('shaniwar-wada',18.519500,73.855300),
      ('aga-khan-palace',18.552360,73.901450),('pratapgad-fort',17.935833,73.578611),
      ('sindhudurg-fort',16.042500,73.459722),('vijaydurg-fort',16.560833,73.333333),
      ('murud-janjira-fort',18.299917,72.964411),('karla-caves',18.783740,73.470320),
      ('bhaja-caves',18.727000,73.481000),('pandavleni-caves',19.939600,73.748500),
      ('kalaram-temple',20.006950,73.795220),('deekshabhoomi',21.128200,79.066930),
      ('mumbai-victorian-art-deco',18.929806,72.830083),('panhala-fort',16.811111,74.108056),
      ('lohagad-fort',18.710000,73.476667),('vasai-fort',19.330497,72.815572),
      ('chhatrapati-shivaji-maharaj-vastu-sangrahalaya',18.926873,72.832613),
      ('pitalkhora-caves',20.313889,74.992500),('lonar-lake',19.975833,76.508333),
      ('pataleshwar-caves',18.526800,73.850700)
    )
    SELECT 1 FROM expected e JOIN heritage h ON h.slug = e.slug
     WHERE (h.latitude IS NOT NULL AND h.latitude <> e.latitude)
        OR (h.longitude IS NOT NULL AND h.longitude <> e.longitude)
  ) THEN
    RAISE EXCEPTION 'Existing selected coordinates conflict with reviewed catalogue evidence; manual review is required';
  END IF;
END $$;

UPDATE heritage h
   SET latitude = expected.latitude,
       longitude = expected.longitude,
       updated_at = NOW()
  FROM (VALUES
    ('chhatrapati-shivaji-maharaj-terminus',18.940122,72.836203),('gateway-of-india',18.921960,72.834560),
    ('elephanta-caves',18.966670,72.935830),('kanheri-caves',19.208000,72.906000),
    ('ajanta-caves',20.553111,75.700250),('ellora-caves',20.026390,75.179170),
    ('daulatabad-fort',19.944056,75.219917),('bibi-ka-maqbara',19.901389,75.320278),
    ('raigad-fort',18.236111,73.444444),('shivneri-fort',19.196667,73.858333),
    ('sinhagad-fort',18.364660,73.756700),('shaniwar-wada',18.519500,73.855300),
    ('aga-khan-palace',18.552360,73.901450),('pratapgad-fort',17.935833,73.578611),
    ('sindhudurg-fort',16.042500,73.459722),('vijaydurg-fort',16.560833,73.333333),
    ('murud-janjira-fort',18.299917,72.964411),('karla-caves',18.783740,73.470320),
    ('bhaja-caves',18.727000,73.481000),('pandavleni-caves',19.939600,73.748500),
    ('kalaram-temple',20.006950,73.795220),('deekshabhoomi',21.128200,79.066930),
    ('mumbai-victorian-art-deco',18.929806,72.830083),('panhala-fort',16.811111,74.108056),
    ('lohagad-fort',18.710000,73.476667),('vasai-fort',19.330497,72.815572),
    ('chhatrapati-shivaji-maharaj-vastu-sangrahalaya',18.926873,72.832613),
    ('pitalkhora-caves',20.313889,74.992500),('lonar-lake',19.975833,76.508333),
    ('pataleshwar-caves',18.526800,73.850700)
  ) AS expected(slug, latitude, longitude)
 WHERE h.slug = expected.slug;

-- Membership controls public list, detail, map, search, and category visibility.
-- Heritage records and their favorites, visits, reviews, journeys, and stops remain.
WITH selected(slug, catalogue_key, display_order) AS (VALUES
  ('chhatrapati-shivaji-maharaj-terminus','chhatrapati-shivaji-maharaj-terminus',1),
  ('gateway-of-india','gateway-of-india',2),('elephanta-caves','elephanta-caves',3),
  ('kanheri-caves','kanheri-caves',4),('ajanta-caves','ajanta-caves',5),('ellora-caves','ellora-caves',6),
  ('daulatabad-fort','daulatabad-fort',7),('bibi-ka-maqbara','bibi-ka-maqbara',8),
  ('raigad-fort','raigad-fort',9),('shivneri-fort','shivneri-fort',10),
  ('sinhagad-fort','sinhagad-fort',11),('shaniwar-wada','shaniwar-wada',12),
  ('aga-khan-palace','aga-khan-palace',13),('pratapgad-fort','pratapgad-fort',14),
  ('sindhudurg-fort','sindhudurg-fort',15),('vijaydurg-fort','vijaydurg-fort',16),
  ('murud-janjira-fort','murud-janjira-fort',17),('karla-caves','karla-caves',18),
  ('bhaja-caves','bhaja-caves',19),('pandavleni-caves','pandavleni-caves',20),
  ('kalaram-temple','kalaram-temple',21),('deekshabhoomi','deekshabhoomi',22),
  ('mumbai-victorian-art-deco','mumbai-victorian-art-deco',23),('panhala-fort','panhala-fort',24),
  ('lohagad-fort','lohagad-fort',25),('vasai-fort','vasai-fort',26),
  ('chhatrapati-shivaji-maharaj-vastu-sangrahalaya','chhatrapati-shivaji-maharaj-vastu-sangrahalaya',27),
  ('pitalkhora-caves','pitalkhora-caves',28),('lonar-lake','lonar-lake',29),
  ('pataleshwar-caves','pataleshwar-caves',30)
)
DELETE FROM heritage_catalog_membership current_member
 WHERE NOT EXISTS (
   SELECT 1 FROM selected
    JOIN heritage h ON h.slug = selected.slug
    WHERE h.id = current_member.heritage_id
 );

WITH selected(slug, catalogue_key, display_order) AS (VALUES
  ('chhatrapati-shivaji-maharaj-terminus','chhatrapati-shivaji-maharaj-terminus',1),('gateway-of-india','gateway-of-india',2),
  ('elephanta-caves','elephanta-caves',3),('kanheri-caves','kanheri-caves',4),('ajanta-caves','ajanta-caves',5),
  ('ellora-caves','ellora-caves',6),('daulatabad-fort','daulatabad-fort',7),('bibi-ka-maqbara','bibi-ka-maqbara',8),
  ('raigad-fort','raigad-fort',9),('shivneri-fort','shivneri-fort',10),('sinhagad-fort','sinhagad-fort',11),
  ('shaniwar-wada','shaniwar-wada',12),('aga-khan-palace','aga-khan-palace',13),('pratapgad-fort','pratapgad-fort',14),
  ('sindhudurg-fort','sindhudurg-fort',15),('vijaydurg-fort','vijaydurg-fort',16),('murud-janjira-fort','murud-janjira-fort',17),
  ('karla-caves','karla-caves',18),('bhaja-caves','bhaja-caves',19),('pandavleni-caves','pandavleni-caves',20),
  ('kalaram-temple','kalaram-temple',21),('deekshabhoomi','deekshabhoomi',22),('mumbai-victorian-art-deco','mumbai-victorian-art-deco',23),
  ('panhala-fort','panhala-fort',24),('lohagad-fort','lohagad-fort',25),('vasai-fort','vasai-fort',26),
  ('chhatrapati-shivaji-maharaj-vastu-sangrahalaya','chhatrapati-shivaji-maharaj-vastu-sangrahalaya',27),
  ('pitalkhora-caves','pitalkhora-caves',28),('lonar-lake','lonar-lake',29),('pataleshwar-caves','pataleshwar-caves',30)
)
INSERT INTO heritage_catalog_membership (heritage_id, catalogue_key, display_order)
SELECT h.id, selected.catalogue_key, selected.display_order
  FROM selected JOIN heritage h ON h.slug = selected.slug
ON CONFLICT (heritage_id) DO UPDATE SET
  catalogue_key = EXCLUDED.catalogue_key,
  display_order = EXCLUDED.display_order;

DO $$
DECLARE
  missing_slug TEXT;
BEGIN
  IF (SELECT count(*) FROM heritage_catalog_membership) <> 30 THEN
    RAISE EXCEPTION 'Curated Maharashtra catalogue must contain exactly 30 records';
  END IF;
  IF EXISTS (
    SELECT 1 FROM heritage_catalog_membership m JOIN heritage h ON h.id = m.heritage_id
     WHERE h.state <> 'Maharashtra' OR h.publication_status <> 'published'
        OR h.latitude IS NULL OR h.longitude IS NULL
  ) THEN
    RAISE EXCEPTION 'Every curated member must be a published Maharashtra record with coordinates';
  END IF;
  SELECT h.slug INTO missing_slug
    FROM heritage_catalog_membership m JOIN heritage h ON h.id = m.heritage_id
     WHERE NOT EXISTS (
       SELECT 1 FROM heritage_sources s
        WHERE s.heritage_id = h.id AND s.review_status = 'approved'
          AND 'coordinates' = ANY(s.claims_supported)
          AND s.source_url = CASE h.slug
            WHEN 'chhatrapati-shivaji-maharaj-terminus' THEN 'https://whc.unesco.org/en/list/945/maps/'
            WHEN 'gateway-of-india' THEN 'https://www.openstreetmap.org/way/28845634'
            WHEN 'elephanta-caves' THEN 'https://whc.unesco.org/en/list/244/maps/'
            WHEN 'kanheri-caves' THEN 'https://vocab.getty.edu/page/tgn/1103310'
            WHEN 'ajanta-caves' THEN 'https://whc.unesco.org/en/list/242/maps/'
            WHEN 'ellora-caves' THEN 'https://whc.unesco.org/en/list/243/maps/'
            WHEN 'daulatabad-fort' THEN 'https://www.nma.gov.in/showfile.php?lang=2&level=1&lid=2102&ls_id=1688'
            WHEN 'bibi-ka-maqbara' THEN 'https://www.nma.gov.in/showfile.php?lang=1&level=1&lid=2045&ls_id=1647'
            WHEN 'raigad-fort' THEN 'https://whc.unesco.org/en/list/1739/maps/'
            WHEN 'shivneri-fort' THEN 'https://whc.unesco.org/en/list/1739/maps/'
            WHEN 'sinhagad-fort' THEN 'https://www.openstreetmap.org/way/126392859'
            WHEN 'shaniwar-wada' THEN 'https://geoheritage.in/assets/img/Library/Popular%20articles/Monograph_Potential%20Geoparks%20of%20India.pdf'
            WHEN 'aga-khan-palace' THEN 'https://www.openstreetmap.org/way/215998839'
            WHEN 'pratapgad-fort' THEN 'https://whc.unesco.org/en/list/1739/maps/'
            WHEN 'sindhudurg-fort' THEN 'https://whc.unesco.org/en/list/1739/maps/'
            WHEN 'vijaydurg-fort' THEN 'https://whc.unesco.org/en/list/1739/maps/'
            WHEN 'murud-janjira-fort' THEN 'https://whc.unesco.org/en/tentativelists/6703'
            WHEN 'karla-caves' THEN 'https://mapcarta.com/N1065807980'
            WHEN 'bhaja-caves' THEN 'https://vocab.getty.edu/page/tgn/8697395'
            WHEN 'pandavleni-caves' THEN 'https://vocab.getty.edu/page/tgn/8697409'
            WHEN 'kalaram-temple' THEN 'https://www.openstreetmap.org/way/361247890'
            WHEN 'deekshabhoomi' THEN 'https://www.openstreetmap.org/node/297521871'
            WHEN 'mumbai-victorian-art-deco' THEN 'https://whc.unesco.org/en/list/1480/maps/'
            WHEN 'panhala-fort' THEN 'https://whc.unesco.org/en/list/1739/maps/'
            WHEN 'lohagad-fort' THEN 'https://whc.unesco.org/en/list/1739/maps/'
            WHEN 'vasai-fort' THEN 'https://whc.unesco.org/en/tentativelists/6703'
            WHEN 'chhatrapati-shivaji-maharaj-vastu-sangrahalaya' THEN 'https://shop.museumsofindia.org/node/330'
            WHEN 'pitalkhora-caves' THEN 'https://nmma.nic.in/nmma/NAS1/nmma_doc/NMMA_Training_Manual_English.pdf'
            WHEN 'lonar-lake' THEN 'https://rsis.ramsar.org/RISapp/files/RISrep/IN2441RIS_2011_en.pdf'
            WHEN 'pataleshwar-caves' THEN 'https://geoheritage.in/assets/img/Library/Popular%20articles/Monograph_Potential%20Geoparks%20of%20India.pdf'
          END
      )
     LIMIT 1;
  IF missing_slug IS NOT NULL THEN
    RAISE EXCEPTION 'Curated coordinate evidence is missing for %', missing_slug;
  END IF;
END $$;

COMMIT;
