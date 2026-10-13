-- Populate only the selected 30-place catalogue and correct confirmed matches.
-- This migration preserves every heritage row and all user-owned data.
-- Review and validate this file on an isolated Neon branch before any remote use.
BEGIN;

INSERT INTO heritage_categories (name, slug)
VALUES ('Architectural landmark', 'architectural-landmark')
ON CONFLICT (slug) DO NOTHING;

CREATE TEMPORARY TABLE selected_catalogue_legacy_identity (
  old_slug TEXT PRIMARY KEY,
  canonical_slug TEXT NOT NULL,
  expected_names TEXT[] NOT NULL,
  expected_districts TEXT[] NOT NULL,
  expected_locality TEXT NOT NULL,
  correction_reason TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO selected_catalogue_legacy_identity VALUES
  ('asi-pandav-lena-caves-pathardi-nasik-maharashtra-023c1a32cd','pandavleni-caves',ARRAY['pandav lena caves'],ARRAY['nasik','nashik'],'pathardi','Canonical title and locality corrected to Pandavleni Caves.'),
  ('asi-cave-temples-and-inscriptions-bhaja-pune-maharashtra-ececf3ce0a','bhaja-caves',ARRAY['cave temples and inscriptions'],ARRAY['pune'],'bhaja','Generic ASI title resolved to Bhaja Caves using its locality.'),
  ('asi-fort-of-shivneri-junnar-pune-maharashtra-647780fb7f','shivneri-fort',ARRAY['fort of shivneri'],ARRAY['pune'],'junnar','Variant ASI title corrected to Shivneri Fort.'),
  ('asi-cave-temples-and-inscriptions-karla-pune-maharashtra-42c59f0637','karla-caves',ARRAY['cave temples and inscriptions'],ARRAY['pune'],'karla','Generic ASI title resolved to Karla Caves using its locality.'),
  ('asi-aga-khan-palace-building-pune-pune-maharashtra-4137c6ffce','aga-khan-palace',ARRAY['aga khan palace building'],ARRAY['pune'],'pune','Variant ASI title corrected to Aga Khan Palace.'),
  ('asi-old-citadel-known-as-shanwar-wada-pune-pune-maharashtra-578a826bc6','shaniwar-wada',ARRAY['old citadel known as shanwar wada'],ARRAY['pune'],'pune','Variant ASI title corrected to Shaniwar Wada.'),
  ('asi-fort-of-raygad-rajpuri-raigad-maharashtra-9f363d1af5','raigad-fort',ARRAY['fort of raygad'],ARRAY['raigad'],'rajpuri','Variant ASI title and incorrect Rajpuri locality corrected to Raigad Fort.'),
  ('asi-janjira-fort-tala-raigad-maharashtra-823878abce','murud-janjira-fort',ARRAY['janjira fort'],ARRAY['raigad'],'tala','Janjira Fort identity retained and locality corrected to Murud; Rajpuri remains the access point.');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM heritage_categories
     WHERE slug = 'architectural-landmark' AND name = 'Architectural landmark'
  ) THEN
    RAISE EXCEPTION 'The architectural-landmark category slug is already assigned to a different category.';
  END IF;

  IF EXISTS (
    WITH required_categories(slug, name) AS (VALUES
      ('architectural-landmark','Architectural landmark'),
      ('cave-rock-cut','Cave and rock-cut site'),
      ('fort-palace','Fort and palace'),
      ('mausoleum-tomb','Mausoleum and tomb'),
      ('buddhist-monument','Buddhist monument'),
      ('archaeological','Archaeological site'),
      ('temple-religious','Temple and religious site')
    )
    SELECT 1 FROM required_categories required
    LEFT JOIN heritage_categories category ON category.slug=required.slug
    WHERE category.id IS NULL OR category.name IS DISTINCT FROM required.name
  ) THEN
    RAISE EXCEPTION 'A selected-catalogue category is missing or its slug/name assignment is inconsistent.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM selected_catalogue_legacy_identity expected
    JOIN heritage h ON h.slug=expected.old_slug
    LEFT JOIN heritage_categories category ON category.id=h.category_id
    WHERE lower(h.name) <> ALL(expected.expected_names)
       OR lower(h.state) <> 'maharashtra'
       OR lower(COALESCE(h.district,'')) <> ALL(expected.expected_districts)
       OR lower(COALESCE(h.locality,'')) <> expected.expected_locality
       OR category.slug <> 'asi-protected'
  ) THEN
    RAISE EXCEPTION 'A legacy alias slug exists but its title, state, district, locality, or category does not match the reviewed identity.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM selected_catalogue_legacy_identity expected
    JOIN heritage legacy ON legacy.slug=expected.old_slug
    JOIN heritage canonical ON canonical.slug=expected.canonical_slug
    WHERE legacy.id <> canonical.id
  ) THEN
    RAISE EXCEPTION 'A legacy variant and canonical slug both exist as different records; manual identity review is required.';
  END IF;

  IF EXISTS (
    WITH canonical_identity(slug, accepted_names, state) AS (VALUES
      ('elephanta-caves',ARRAY['elephanta caves']::TEXT[],'Maharashtra'),
      ('ajanta-caves',ARRAY['ajanta caves']::TEXT[],'Maharashtra'),
      ('ellora-caves',ARRAY['ellora caves']::TEXT[],'Maharashtra'),
      ('taj-mahal',ARRAY['taj mahal']::TEXT[],'Uttar Pradesh'),
      ('red-fort',ARRAY['red fort complex','red fort']::TEXT[],'Delhi'),
      ('hampi',ARRAY['group of monuments at hampi','hampi group of monuments']::TEXT[],'Karnataka'),
      ('konark-sun-temple',ARRAY['sun temple, konarak','konark sun temple']::TEXT[],'Odisha'),
      ('khajuraho-monuments',ARRAY['khajuraho group of monuments']::TEXT[],'Madhya Pradesh')
    )
    SELECT 1
    FROM canonical_identity expected
    JOIN heritage h ON h.slug=expected.slug
    WHERE lower(h.name) <> ALL(expected.accepted_names)
       OR h.state IS DISTINCT FROM expected.state
  ) THEN
    RAISE EXCEPTION 'A canonical selected slug exists with an unexpected title or state; manual identity review is required.';
  END IF;
END $$;

-- Category references below must resolve before any heritage rows are changed.
-- The schema also declares heritage.category_id NOT NULL, but this explicit
-- guard makes a missing lookup fail here instead of silently dropping inserts.
DO $$
BEGIN
  IF EXISTS (
    WITH required_categories(slug) AS (VALUES
      ('architectural-landmark'),
      ('cave-rock-cut'),
      ('fort-palace'),
      ('mausoleum-tomb'),
      ('buddhist-monument'),
      ('archaeological'),
      ('temple-religious')
    )
    SELECT 1
      FROM required_categories required
      LEFT JOIN heritage_categories category ON category.slug=required.slug
     WHERE category.id IS NULL
  ) THEN
    RAISE EXCEPTION 'A category required by the selected catalogue is missing; no catalogue rows were changed.';
  END IF;
END $$;

-- Preserve old slugs before correcting the confirmed variant-title records.
CREATE TEMPORARY TABLE selected_catalogue_old_slugs (
  heritage_id INTEGER PRIMARY KEY,
  old_slug TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO selected_catalogue_old_slugs (heritage_id, old_slug, reason)
SELECT h.id, expected.old_slug, expected.correction_reason
FROM selected_catalogue_legacy_identity expected
JOIN heritage h ON h.slug=expected.old_slug;

-- Correct confirmed records in place, preserving their IDs and all child rows.
UPDATE heritage h SET
  name='Pandavleni Caves', slug='pandavleni-caves', category_id=(SELECT id FROM heritage_categories WHERE slug='cave-rock-cut'),
  state='Maharashtra', district='Nashik', locality='Nashik', address='Trirashmi Hill, Nashik',
  description='A group of Buddhist rock-cut caves on Trirashmi Hill near Nashik.',
  history='Maharashtra Tourism dates the caves broadly from the 2nd century BCE to the 6th century CE and identifies them with Buddhist monastic use.',
  cultural_significance='The caves preserve evidence of Buddhist monastic life, inscriptions, sculpture, and worship spaces in the Nashik region.',
  architecture='The complex includes rock-cut viharas, chaitya halls, stupas, carved facades, and water features.',
  historical_period='2nd century BCE–6th century CE', updated_at=NOW()
WHERE h.slug='asi-pandav-lena-caves-pathardi-nasik-maharashtra-023c1a32cd';

UPDATE heritage h SET
  name='Bhaja Caves', slug='bhaja-caves', category_id=(SELECT id FROM heritage_categories WHERE slug='cave-rock-cut'),
  state='Maharashtra', district='Pune', locality='Lonavala', address='Bhaja, near Lonavala, Pune district',
  description='An early Buddhist rock-cut cave group near Lonavala, with a prominent chaitya hall and monastic caves.',
  history='Maharashtra Tourism dates the caves broadly to around the 2nd century BCE and describes their use by Buddhist monks.',
  cultural_significance='The site records early Buddhist monastic and artistic traditions in western India.',
  architecture='The rock-cut complex includes a chaitya hall with a stupa, viharas, relief carvings, and stone forms that echo timber construction.',
  historical_period='Around the 2nd century BCE', updated_at=NOW()
WHERE h.slug='asi-cave-temples-and-inscriptions-bhaja-pune-maharashtra-ececf3ce0a';

UPDATE heritage h SET
  name='Shivneri Fort', slug='shivneri-fort', category_id=(SELECT id FROM heritage_categories WHERE slug='fort-palace'),
  state='Maharashtra', district='Pune', locality='Junnar', address='Junnar, Pune district',
  description='A hill fort at Junnar associated with the birth of Chhatrapati Shivaji Maharaj.',
  history='The fort has a long history under several ruling powers and is associated with Shivaji Maharaj’s birth and early life.',
  cultural_significance='Shivneri is an important Maratha-era heritage site and a place associated with the early life of Shivaji Maharaj.',
  architecture='The fort occupies a steep hill and includes defensive gates, water tanks, and springs described by Maharashtra Tourism.',
  historical_period='Historic fort; detailed construction chronology is not established by the cited page', updated_at=NOW()
WHERE h.slug='asi-fort-of-shivneri-junnar-pune-maharashtra-647780fb7f';

UPDATE heritage h SET
  name='Karla Caves', slug='karla-caves', category_id=(SELECT id FROM heritage_categories WHERE slug='cave-rock-cut'),
  state='Maharashtra', district='Pune', locality='Lonavala', address='Karla, near Lonavala, Pune district',
  description='A Buddhist rock-cut cave complex near Lonavala, including the Great Chaitya hall.',
  history='Maharashtra Tourism dates the complex broadly between the 2nd century BCE and the 5th century CE.',
  cultural_significance='The caves preserve early Buddhist worship and monastic architecture in the western Deccan.',
  architecture='The complex includes a large chaitya hall and rock-cut monastic spaces; the Great Chaitya is identified as Cave 8 by Maharashtra Tourism.',
  historical_period='2nd century BCE–5th century CE', updated_at=NOW()
WHERE h.slug='asi-cave-temples-and-inscriptions-karla-pune-maharashtra-42c59f0637';

UPDATE heritage h SET
  name='Aga Khan Palace', slug='aga-khan-palace', category_id=(SELECT id FROM heritage_categories WHERE slug='fort-palace'),
  state='Maharashtra', district='Pune', locality='Pune', address='Pune, Maharashtra',
  description='A palace in Pune built in 1892 and now associated with the Gandhi National Memorial Society.',
  history='Official tourism sources state that Aga Khan III built the palace in 1892 and that Mahatma Gandhi, Kasturba Gandhi, and Mahadev Desai were held there during the Quit India period.',
  cultural_significance='The palace is connected with India’s freedom struggle and the memory of Gandhi, Kasturba Gandhi, and Mahadev Desai.',
  architecture='The Ministry of Tourism describes Italian arches and halls within the palace complex.',
  historical_period='Late 19th century; built in 1892', updated_at=NOW()
WHERE h.slug='asi-aga-khan-palace-building-pune-pune-maharashtra-4137c6ffce';

UPDATE heritage h SET
  name='Shaniwar Wada', slug='shaniwar-wada', category_id=(SELECT id FROM heritage_categories WHERE slug='fort-palace'),
  state='Maharashtra', district='Pune', locality='Pune', address='Pune, Maharashtra',
  description='A historic fortified residence in Pune built by the Peshwas and associated with their rule.',
  history='The Pune district tourism source identifies Shaniwar Wada as the Peshwas’ seat and records that a fire destroyed much of it in 1828.',
  cultural_significance='The site is an important landmark in Pune’s Maratha and Peshwa history.',
  architecture='A fortified palace precinct in Pune; the cited district source does not provide a detailed building-by-building architectural inventory.',
  historical_period='18th century; damaged by fire in 1828', updated_at=NOW()
WHERE h.slug='asi-old-citadel-known-as-shanwar-wada-pune-pune-maharashtra-578a826bc6';

UPDATE heritage h SET
  name='Raigad Fort', slug='raigad-fort', category_id=(SELECT id FROM heritage_categories WHERE slug='fort-palace'),
  state='Maharashtra', district='Raigad', locality='Mahad', address='Raigad district, Maharashtra',
  description='A hill fort in the Sahyadri range overlooking Mahad in Raigad district.',
  history='Maharashtra Tourism records Raigad as the Maratha capital from 1674 to 1818.',
  cultural_significance='The fort is closely associated with the Maratha state and its capital in the late 17th and 18th centuries.',
  architecture='A fortified hilltop site in the Sahyadri range; the reviewed source establishes its setting and strategic position but not a complete architectural inventory.',
  historical_period='Maratha period; capital from 1674 to 1818', updated_at=NOW()
WHERE h.slug='asi-fort-of-raygad-rajpuri-raigad-maharashtra-9f363d1af5';

UPDATE heritage h SET
  name='Murud-Janjira Fort', slug='murud-janjira-fort', category_id=(SELECT id FROM heritage_categories WHERE slug='fort-palace'),
  state='Maharashtra', district='Raigad', locality='Murud', address='Sea access via Rajapuri jetty, Raigad district',
  description='An island sea fort off the coast near Murud in Raigad district, reached by boat from the Rajapuri side.',
  history='Maharashtra Tourism describes the fort as a coastal stronghold associated with the Siddi rulers and maritime history.',
  cultural_significance='The fort is a prominent example of the maritime heritage of the Raigad coast.',
  architecture='A fortified site on a rocky island in the Arabian Sea, with defensive walls, bastions, and sea-facing access points.',
  historical_period='Medieval and early modern periods; exact chronology varies by source', updated_at=NOW()
WHERE h.slug='asi-janjira-fort-tala-raigad-maharashtra-823878abce';

-- Keep Chhatrapati Shivaji Terminus separate from the Mumbai heritage ensemble.
UPDATE heritage SET
  name='Red Fort', state='Delhi', district='Central Delhi', locality='Delhi',
  latitude=28.655556, longitude=77.240833, updated_at=NOW()
WHERE slug='red-fort';

UPDATE heritage SET
  state='Maharashtra', district='Mumbai Suburban', locality='Elephanta Island',
  address='Elephanta Island, Mumbai Harbour; ferry access from Mumbai',
  latitude=18.966670, longitude=72.935830, updated_at=NOW()
WHERE slug='elephanta-caves';

UPDATE heritage SET
  name='Hampi Group of Monuments', district='Vijayanagara', locality='Hampi', updated_at=NOW()
WHERE slug='hampi';

UPDATE heritage SET
  name='Konark Sun Temple', district='Puri', locality='Konark',
  latitude=19.887500, longitude=86.094720, updated_at=NOW()
WHERE slug='konark-sun-temple';

UPDATE heritage SET
  district='Chhatarpur', locality='Khajuraho', updated_at=NOW()
WHERE slug='khajuraho-monuments';

UPDATE heritage SET
  district='Agra', locality='Agra', updated_at=NOW()
WHERE slug='taj-mahal';

UPDATE heritage SET
  district='Chhatrapati Sambhajinagar', locality='Ajanta',
  address='Ajanta Caves, Ajanta, Chhatrapati Sambhajinagar district, Maharashtra', updated_at=NOW()
WHERE slug='ajanta-caves';

UPDATE heritage SET
  district='Chhatrapati Sambhajinagar', locality='Ellora',
  address='Ellora Caves, Ellora, Chhatrapati Sambhajinagar district, Maharashtra', updated_at=NOW()
WHERE slug='ellora-caves';

-- Retain every old URL slug as a reversible alias.
INSERT INTO heritage_slug_aliases (slug_alias, heritage_id, reason)
SELECT old.old_slug, old.heritage_id, old.reason
  FROM selected_catalogue_old_slugs old
  JOIN heritage h ON h.id=old.heritage_id
 WHERE h.slug <> old.old_slug
ON CONFLICT (slug_alias) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM selected_catalogue_old_slugs old
    LEFT JOIN heritage_slug_aliases alias ON alias.slug_alias=old.old_slug
    WHERE alias.heritage_id IS DISTINCT FROM old.heritage_id
  ) THEN
    RAISE EXCEPTION 'An old slug is already aliased to a different heritage record.';
  END IF;
END $$;

-- Add only the selected records absent from the audited database snapshot.
WITH new_sites (
  slug, name, description, history, cultural_significance, architecture,
  historical_period, category_slug, state, district, locality, address
) AS (VALUES
  ('pandavleni-caves','Pandavleni Caves',
   'A group of Buddhist rock-cut caves on Trirashmi Hill near Nashik.',
   'Maharashtra Tourism dates the caves broadly from the 2nd century BCE to the 6th century CE and identifies them with Buddhist monastic use.',
   'The caves preserve evidence of Buddhist monastic life, inscriptions, sculpture, and worship spaces in the Nashik region.',
   'The complex includes rock-cut viharas, chaitya halls, stupas, carved facades, and water features.',
   '2nd century BCE–6th century CE','cave-rock-cut','Maharashtra','Nashik','Nashik','Trirashmi Hill, Nashik'),
  ('bhaja-caves','Bhaja Caves',
   'An early Buddhist rock-cut cave group near Lonavala, with a prominent chaitya hall and monastic caves.',
   'Maharashtra Tourism dates the caves broadly to around the 2nd century BCE and describes their use by Buddhist monks.',
   'The site records early Buddhist monastic and artistic traditions in western India.',
   'The rock-cut complex includes a chaitya hall with a stupa, viharas, relief carvings, and stone forms that echo timber construction.',
   'Around the 2nd century BCE','cave-rock-cut','Maharashtra','Pune','Lonavala','Bhaja, near Lonavala, Pune district'),
  ('shivneri-fort','Shivneri Fort',
   'A hill fort at Junnar associated with the birth of Chhatrapati Shivaji Maharaj.',
   'The fort has a long history under several ruling powers and is associated with Shivaji Maharaj’s birth and early life.',
   'Shivneri is an important Maratha-era heritage site and a place associated with the early life of Shivaji Maharaj.',
   'The fort occupies a steep hill and includes defensive gates, water tanks, and springs described by Maharashtra Tourism.',
   'Historic fort; detailed construction chronology is not established by the cited page','fort-palace','Maharashtra','Pune','Junnar','Junnar, Pune district'),
  ('karla-caves','Karla Caves',
   'A Buddhist rock-cut cave complex near Lonavala, including the Great Chaitya hall.',
   'Maharashtra Tourism dates the complex broadly between the 2nd century BCE and the 5th century CE.',
   'The caves preserve early Buddhist worship and monastic architecture in the western Deccan.',
   'The complex includes a large chaitya hall and rock-cut monastic spaces; the Great Chaitya is identified as Cave 8 by Maharashtra Tourism.',
   '2nd century BCE–5th century CE','cave-rock-cut','Maharashtra','Pune','Lonavala','Karla, near Lonavala, Pune district'),
  ('aga-khan-palace','Aga Khan Palace',
   'A palace in Pune built in 1892 and now associated with the Gandhi National Memorial Society.',
   'Official tourism sources state that Aga Khan III built the palace in 1892 and that Mahatma Gandhi, Kasturba Gandhi, and Mahadev Desai were held there during the Quit India period.',
   'The palace is connected with India’s freedom struggle and the memory of Gandhi, Kasturba Gandhi, and Mahadev Desai.',
   'The Ministry of Tourism describes Italian arches and halls within the palace complex.',
   'Late 19th century; built in 1892','fort-palace','Maharashtra','Pune','Pune','Pune, Maharashtra'),
  ('shaniwar-wada','Shaniwar Wada',
   'A historic fortified residence in Pune built by the Peshwas and associated with their rule.',
   'The Pune district tourism source identifies Shaniwar Wada as the Peshwas’ seat and records that a fire destroyed much of it in 1828.',
   'The site is an important landmark in Pune’s Maratha and Peshwa history.',
   'A fortified palace precinct in Pune; the cited district source does not provide a detailed building-by-building architectural inventory.',
   '18th century; damaged by fire in 1828','fort-palace','Maharashtra','Pune','Pune','Pune, Maharashtra'),
  ('raigad-fort','Raigad Fort',
   'A hill fort in the Sahyadri range overlooking Mahad in Raigad district.',
   'Maharashtra Tourism records Raigad as the Maratha capital from 1674 to 1818.',
   'The fort is closely associated with the Maratha state and its capital in the late 17th and 18th centuries.',
   'A fortified hilltop site in the Sahyadri range; the reviewed source establishes its setting and strategic position but not a complete architectural inventory.',
   'Maratha period; capital from 1674 to 1818','fort-palace','Maharashtra','Raigad','Mahad','Raigad district, Maharashtra'),
  ('murud-janjira-fort','Murud-Janjira Fort',
   'An island sea fort off the coast near Murud in Raigad district, reached by boat from the Rajapuri side.',
   'Maharashtra Tourism describes the fort as a coastal stronghold associated with the Siddi rulers and maritime history.',
   'The fort is a prominent example of the maritime heritage of the Raigad coast.',
   'A fortified site on a rocky island in the Arabian Sea, with defensive walls, bastions, and sea-facing access points.',
   'Medieval and early modern periods; exact chronology varies by source','fort-palace','Maharashtra','Raigad','Murud','Sea access via Rajapuri jetty, Raigad district'),
  ('chhatrapati-shivaji-maharaj-terminus','Chhatrapati Shivaji Maharaj Terminus',
   'A major railway terminus in Mumbai recognized for Victorian Gothic Revival architecture blended with Indian architectural themes.',
   'The station was completed in 1887 and was formerly known as Victoria Terminus; the current name is Chhatrapati Shivaji Maharaj Terminus.',
   'UNESCO recognizes the station as an outstanding architectural work and a major landmark of Mumbai.',
   'A Victorian Gothic Revival railway building incorporating themes from Indian traditional architecture.',
   'Late 19th century; opened in 1887','architectural-landmark','Maharashtra','Mumbai City','Mumbai','Mumbai, Maharashtra'),
  ('gateway-of-india','Gateway of India',
   'A basalt arch monument on the waterfront at Apollo Bunder in South Mumbai.',
   'The foundation stone was laid in 1911 to commemorate the visit of King George V and Queen Mary; the monument was completed in 1924.',
   'The monument became a ceremonial waterfront landmark of Mumbai.',
   'A 26-metre basalt arch with Indo-Saracenic, Indian, and Islamic design elements.',
   'Early 20th century; completed in 1924','architectural-landmark','Maharashtra','Mumbai City','Mumbai','Apollo Bunder, Mumbai'),
  ('kanheri-caves','Kanheri Caves',
   'A Buddhist rock-cut cave complex within Sanjay Gandhi National Park in Mumbai.',
   'Maharashtra Tourism describes the caves as a long-running Buddhist monastic site, with activity extending from the early centuries BCE into the first millennium CE.',
   'The complex preserves evidence of Buddhist monastic life, worship, inscriptions, sculpture, and water management.',
   'The basalt complex includes rock-cut halls, stupas, viharas, cisterns, and carved features.',
   '1st century BCE–10th century CE, as summarized by Maharashtra Tourism','cave-rock-cut','Maharashtra','Mumbai Suburban','Sanjay Gandhi National Park','Sanjay Gandhi National Park, Mumbai'),
  ('daulatabad-fort','Daulatabad Fort',
   'A hill fort at Daulatabad, historically known as Deogiri, with a defensive route cut into the hill.',
   'The fort was known as Deogiri and later changed hands among several powers; Maharashtra Tourism describes its use as a strategic fortress across successive periods.',
   'The site illustrates the strategic importance of fortified hill settlements in the Deccan.',
   'Its defenses use the steep hill, a narrow winding approach, gates, walls, and a moat described by Maharashtra Tourism.',
   'Medieval period; multiple dynastic phases','fort-palace','Maharashtra','Chhatrapati Sambhajinagar','Daulatabad','Daulatabad, Chhatrapati Sambhajinagar district'),
  ('bibi-ka-maqbara','Bibi Ka Maqbara',
   'A Mughal-period mausoleum in Chhatrapati Sambhajinagar associated with Rabia-ud-Durrani.',
   'Maharashtra Tourism identifies it as the burial place of Aurangzeb’s wife, Rabia-ud-Durrani, and notes its design resemblance to the Taj Mahal.',
   'The mausoleum is a major Mughal-era landmark of Chhatrapati Sambhajinagar.',
   'A domed mausoleum whose design is compared by Maharashtra Tourism with the Taj Mahal.',
   'Mughal period; exact construction date not stated in the cited tourism source','mausoleum-tomb','Maharashtra','Chhatrapati Sambhajinagar','Chhatrapati Sambhajinagar','Chhatrapati Sambhajinagar, Maharashtra'),
  ('sinhagad-fort','Sinhagad Fort',
   'A hill fort southwest of Pune, formerly known as Kondhana.',
   'Maharashtra Tourism highlights the 1670 Battle of Sinhagad and the fort’s role in Maratha history.',
   'The fort is associated with the Maratha campaign of 1670 and the memory of Tanaji Malusare.',
   'A hilltop fort with defensive gates, bastions, and water storage features described by Maharashtra Tourism.',
   'Historic fort; especially associated with the 1670 battle','fort-palace','Maharashtra','Pune','Pune','Pune district, Maharashtra'),
  ('pratapgad-fort','Pratapgad Fort',
   'A mountain fort near Mahabaleshwar in Satara district.',
   'Maharashtra Tourism dates the fort to 1656 and records the 1659 Battle of Pratapgad involving Shivaji Maharaj and Afzal Khan.',
   'The site is associated with a pivotal episode in Maratha history.',
   'The fort comprises upper and lower defensive sections, with bastions and walls on a Sahyadri spur.',
   '17th century; built in 1656','fort-palace','Maharashtra','Satara','Mahabaleshwar','Near Mahabaleshwar, Satara district'),
  ('sindhudurg-fort','Sindhudurg Fort',
   'A sea fort on an island off Malvan on the Konkan coast.',
   'Maharashtra Tourism dates construction to 1664–1667 under Chhatrapati Shivaji Maharaj and identifies it as a coastal defensive stronghold.',
   'The fort is an important example of Maratha maritime history and coastal defense.',
   'The fort has sea walls, bastions, and a concealed entrance; access is by boat from Malvan.',
   '17th century; built 1664–1667','fort-palace','Maharashtra','Sindhudurg','Malvan','Off Malvan coast, Sindhudurg district'),
  ('vijaydurg-fort','Vijaydurg Fort',
   'A sea fort on the Konkan coast near Vijaydurg village in Sindhudurg district.',
   'Maharashtra Tourism traces the fort to the 12th century and records its capture and renaming under Shivaji Maharaj in the 17th century.',
   'The fort is associated with Maratha naval history and coastal defense.',
   'Its laterite fortifications include layered walls and bastions along the coast.',
   '12th century origins; Maratha-era expansion in the 17th century','fort-palace','Maharashtra','Sindhudurg','Vijaydurg','Vijaydurg, Sindhudurg district'),
  ('kalaram-temple','Kalaram Temple',
   'A temple dedicated to Rama in the Panchavati area of Nashik, named for its black-stone image.',
   'Maharashtra Tourism dates the temple’s construction to 1788–1792 and also records the 1930 temple-entry satyagraha led by Dr. B. R. Ambedkar.',
   'The temple is a religious landmark and a site connected with a major social-reform movement.',
   'Maharashtra Tourism describes a black-basalt temple in Hemadpanthi style.',
   'Late 18th century; built 1788–1792','temple-religious','Maharashtra','Nashik','Nashik','Panchavati, Nashik'),
  ('deekshabhoomi','Deekshabhoomi',
   'A Buddhist memorial and pilgrimage site in Nagpur associated with Dr. B. R. Ambedkar’s conversion to Buddhism.',
   'The Nagpur district government records the conversion ceremony at this site on 14 October 1956 and notes that a stupa was later built there.',
   'The site is significant to Buddhist communities and to the history of the Ambedkarite movement.',
   'The memorial includes a stupa; detailed architectural specifications are not provided by the cited district source.',
   '20th century; associated with the 1956 ceremony','buddhist-monument','Maharashtra','Nagpur','Nagpur','Nagpur, Maharashtra'),
  ('qutub-minar-tower','Qutub Minar',
   'The red-sandstone tower at the centre of the larger Qutb Minar archaeological complex in Delhi.',
   'UNESCO dates the tower to the early 13th century and describes its construction as part of the broader Qutb complex.',
   'The tower is a major example of early Indo-Islamic architecture; the larger UNESCO property includes additional monuments.',
   'A tapering 72.5-metre red-sandstone minaret with fluted surfaces and projecting balconies, as described by UNESCO.',
   'Early 13th century','architectural-landmark','Delhi','South Delhi','Mehrauli','Mehrauli, South Delhi, Delhi'),
  ('sanchi-stupa-1','Sanchi Stupa',
   'The Great Stupa, or Stupa 1, at Sanchi, Madhya Pradesh; distinct from the wider Buddhist Monuments at Sanchi property.',
   'UNESCO describes an early brick stupa attributed to the Mauryan period and later enlarged under the Sunga, Satavahana, and Gupta periods.',
   'Stupa 1 is a major surviving Buddhist monument and an important example of early Indian stupa art.',
   'The hemispherical stupa has a stone veneer, circumambulatory paths, railings, a harmika, and four carved gateways.',
   '3rd century BCE origins with later additions through the 5th century CE','buddhist-monument','Madhya Pradesh','Raisen','Sanchi','Sanchi, Raisen district'),
  ('amer-fort','Amer Fort',
   'A hilltop fort and palace complex at Amer near Jaipur, Rajasthan.',
   'Rajasthan Tourism dates the start of the palace construction under Raja Man Singh I to 1592; it later served as the Kachwaha seat before the capital shifted to Jaipur.',
   'The complex is part of the UNESCO-listed Hill Forts of Rajasthan and records the history of the former Amber capital.',
   'A palace complex of pale yellow and pink sandstone and white marble, arranged around courtyards.',
   'Late 16th century onward; construction began in 1592','fort-palace','Rajasthan','Jaipur','Amer','Amer, Jaipur district, Rajasthan')
)
INSERT INTO heritage (
  name, slug, description, history, cultural_significance, architecture,
  historical_period, category_id, state, district, locality, address,
  latitude, longitude, publication_status
)
SELECT s.name, s.slug, s.description, s.history, s.cultural_significance,
       s.architecture, s.historical_period, c.id, s.state, s.district,
       s.locality, s.address,
       CASE WHEN s.slug='chhatrapati-shivaji-maharaj-terminus' THEN 18.940122::NUMERIC END,
       CASE WHEN s.slug='chhatrapati-shivaji-maharaj-terminus' THEN 72.836203::NUMERIC END,
       'published'
  FROM new_sites s
  JOIN heritage_categories c ON c.slug=s.category_slug
ON CONFLICT (slug) DO NOTHING;

-- These historical references support the paraphrased record fields, but the
-- migration does not record an individual source-review attestation. New rows
-- therefore remain pending, and conflicts leave all existing source fields
-- and review decisions untouched.
WITH evidence (slug, source_name, source_title, publisher, source_url, source_note, claims_supported) AS (VALUES
  ('chhatrapati-shivaji-maharaj-terminus','UNESCO World Heritage Centre','Chhatrapati Shivaji Terminus - World Heritage List','UNESCO World Heritage Centre','https://whc.unesco.org/en/list/945/','Official property description for the station and its architectural character.','{description,history,cultural_significance,architecture,historical_period}'),
  ('chhatrapati-shivaji-maharaj-terminus','Department of Tourism Maharashtra','Mumbai City - Department of Tourism Maharashtra','Government of Maharashtra','https://maharashtratourism.gov.in/districts/mumbai-city/','Official Maharashtra tourism source for the current station name and city context.','{description,history,location}'),
  ('gateway-of-india','Department of Tourism Maharashtra','The Gateway of India','Government of Maharashtra','https://aai-portal.maharashtratourism.gov.in/spotlights/the-gateway-of-india/','Official tourism source for location, commemoration, construction, and architectural summary.','{description,history,cultural_significance,architecture,location,historical_period}'),
  ('kanheri-caves','Department of Tourism Maharashtra','Kanheri Caves','Government of Maharashtra','https://maharashtratourism.gov.in/cave/kanheri/','Official tourism source for the cave complex, its setting, use, and architectural features.','{description,history,cultural_significance,architecture,location,historical_period}'),
  ('daulatabad-fort','Department of Tourism Maharashtra','Devgiri / Daulatabad','Government of Maharashtra','https://maharashtratourism.gov.in/fort/devgiri-daulatabad/','Official tourism source for the fort’s former name, defensive setting, and historical overview.','{description,history,cultural_significance,architecture,location,historical_period}'),
  ('bibi-ka-maqbara','Department of Tourism Maharashtra','Bibi-ka-Maqbara','Government of Maharashtra','https://maharashtratourism.gov.in/heritage/bibi-ka-maqbara/','Official tourism source for the mausoleum’s identity, association, design comparison, and city location.','{description,history,cultural_significance,architecture,location}'),
  ('raigad-fort','Department of Tourism Maharashtra','Forts - Raigad Fort','Government of Maharashtra','https://aai-portal.maharashtratourism.gov.in/tourist-intrests/forts/','Official tourism source for Raigad Fort’s location and role as the Maratha capital.','{description,history,cultural_significance,location}'),
  ('shivneri-fort','Department of Tourism Maharashtra','Shivneri Fort','Government of Maharashtra','https://maharashtratourism.gov.in/fort/shivneri/','Official tourism source for Junnar location, historical association, and fort features.','{description,history,cultural_significance,architecture,location}'),
  ('sinhagad-fort','Department of Tourism Maharashtra','Sinhagad Fort','Government of Maharashtra','https://maharashtratourism.gov.in/fort/sinhagad/','Official tourism source for the fort’s location, the 1670 battle, and defensive features.','{description,history,cultural_significance,architecture,location,historical_period}'),
  ('shaniwar-wada','Department of Tourism Maharashtra','Pune district - Shaniwar Wada','Government of Maharashtra','https://maharashtratourism.gov.in/districts/pune/','Official district tourism source identifying the Peshwa association, location, and 1828 fire.','{description,history,cultural_significance,location,historical_period}'),
  ('aga-khan-palace','Department of Tourism Maharashtra','Pune district - Aga Khan Palace','Government of Maharashtra','https://maharashtratourism.gov.in/districts/pune/','Official district tourism source for the palace’s 1892 date and freedom-struggle association.','{description,history,cultural_significance,location,historical_period}'),
  ('aga-khan-palace','Incredible India','Aga Khan Palace - Gandhi National Memorial','Ministry of Tourism, Government of India','https://www.incredibleindia.gov.in/en/maharashtra/pune/aga-khan-palace','Government of India tourism source for the palace’s architecture and memorial association.','{description,history,cultural_significance,architecture}'),
  ('pratapgad-fort','Department of Tourism Maharashtra','Pratapgad Fort','Government of Maharashtra','https://maharashtratourism.gov.in/fort/pratapgad/','Official tourism source for the Satara district setting, 1656 construction, and 1659 battle.','{description,history,cultural_significance,architecture,location,historical_period}'),
  ('sindhudurg-fort','Department of Tourism Maharashtra','Sindhudurg Fort','Government of Maharashtra','https://maharashtratourism.gov.in/fort/sindhudurg/','Official tourism source for Malvan location, construction period, sea defenses, and boat access.','{description,history,cultural_significance,architecture,location,historical_period}'),
  ('vijaydurg-fort','Department of Tourism Maharashtra','Vijaydurg Fort','Government of Maharashtra','https://maharashtratourism.gov.in/fort/vijaydurg/','Official tourism source distinguishing Vijaydurg’s location and history from Tala Fort.','{description,history,cultural_significance,architecture,location,historical_period}'),
  ('murud-janjira-fort','Department of Tourism Maharashtra','Murud-Janjira Fort','Government of Maharashtra','https://maharashtratourism.gov.in/fort/murud-janjira/','Official tourism source for the island-fort identity and location near Murud.','{description,history,cultural_significance,architecture,location}'),
  ('karla-caves','Department of Tourism Maharashtra','Caves - Karla Caves','Government of Maharashtra','https://aai-portal.maharashtratourism.gov.in/tourist-intrests/caves/','Official tourism source for the Karla complex, its Great Chaitya, and period.','{description,history,cultural_significance,architecture,location,historical_period}'),
  ('bhaja-caves','Department of Tourism Maharashtra','Bhaja Caves','Government of Maharashtra','https://maharashtratourism.gov.in/cave/bhaja/','Official tourism source for the site’s location, period, Buddhist use, and architectural features.','{description,history,cultural_significance,architecture,location,historical_period}'),
  ('pandavleni-caves','Department of Tourism Maharashtra','Pandavleni Caves','Government of Maharashtra','https://maharashtratourism.gov.in/cave/pandavleni/','Official tourism source for the Nashik location, Buddhist use, period, and cave features.','{description,history,cultural_significance,architecture,location,historical_period}'),
  ('kalaram-temple','Department of Tourism Maharashtra','Kalaram Temple','Government of Maharashtra','https://maharashtratourism.gov.in/temple/kalaram/','Official tourism source for the temple, construction period, architecture, and 1930 satyagraha.','{description,history,cultural_significance,architecture,location,historical_period}'),
  ('deekshabhoomi','District Nagpur','Historical Places - Deekshabhoomi','Government of Maharashtra','https://nagpur.gov.in/historical-places/','Official district source for the 1956 conversion ceremony and the memorial stupa.','{description,history,cultural_significance,architecture,location,historical_period}'),
  ('qutub-minar-tower','UNESCO World Heritage Centre','Qutb Minar and its Monuments, Delhi','UNESCO World Heritage Centre','https://whc.unesco.org/en/list/233/','Official UNESCO description distinguishes the red-sandstone Qutb Minar tower from the surrounding larger archaeological property.','{description,history,cultural_significance,architecture,location,historical_period}'),
  ('sanchi-stupa-1','UNESCO World Heritage Centre','Buddhist Monuments at Sanchi','UNESCO World Heritage Centre','https://whc.unesco.org/en/list/524/','Official UNESCO description identifies the grand structure as Stupa 1 and summarizes its phases, gateways, and significance.','{description,history,cultural_significance,architecture,historical_period}'),
  ('amer-fort','Rajasthan Tourism','Amber Palace / Amer Fort','Government of Rajasthan','https://www.tourism.rajasthan.gov.in/amber-palace.html','Official Rajasthan tourism source for Amer location, construction history, materials, and palace layout.','{description,history,cultural_significance,architecture,location,historical_period}')
)
INSERT INTO heritage_sources (
  heritage_id, source_name, source_title, publisher, source_url, source_note,
  accessed_on, claims_supported, review_status
)
SELECT h.id, e.source_name, e.source_title, e.publisher, e.source_url,
       e.source_note, CURRENT_DATE, e.claims_supported::TEXT[], 'pending'
  FROM evidence e
  JOIN heritage h ON h.slug=e.slug
ON CONFLICT (heritage_id, source_url) DO NOTHING;

-- The previously imported UNESCO list-page citation carried the old Konark
-- point. Remove only that known coordinate claim, keep the source row and its
-- review decision, and retain all of its non-coordinate claims.
UPDATE heritage_sources
   SET claims_supported=array_remove(claims_supported, 'coordinates'),
       source_note=CONCAT_WS(' ', source_note, 'Its former coordinate claim was removed after comparison with UNESCO geographic data; the source row is retained.')
   WHERE heritage_id=(SELECT id FROM heritage WHERE slug='konark-sun-temple')
   AND source_url='https://whc.unesco.org/en/list/246/'
   AND 'coordinates'=ANY(claims_supported);

-- These four new citations are approved because each URL is UNESCO's official
-- point-level map, the DMS value and conversion are documented above, and the
-- insert is gated on exact equality with the stored point. Conflicting rows
-- keep their existing review decision; the final validation then requires the
-- exact map citation to be approved or the transaction fails.
WITH coordinate_evidence (slug, source_title, source_url, latitude, longitude, source_note) AS (VALUES
  ('chhatrapati-shivaji-maharaj-terminus','Chhatrapati Shivaji Terminus - UNESCO geographical data','https://whc.unesco.org/en/list/945/maps/',18.940122::NUMERIC,72.836203::NUMERIC,'UNESCO World Heritage Centre map point for the inscribed railway terminus property, converted from DMS to decimal degrees; this is a property point, not a visitor entrance.'),
  ('elephanta-caves','Elephanta Caves - UNESCO geographical data','https://whc.unesco.org/en/list/244/maps/',18.966670::NUMERIC,72.935830::NUMERIC,'UNESCO World Heritage Centre map point for Elephanta Caves, converted from DMS to decimal degrees; this is a property point, not a ferry terminal.'),
  ('red-fort','Red Fort Complex - UNESCO geographical data','https://whc.unesco.org/en/list/231/maps/',28.655556::NUMERIC,77.240833::NUMERIC,'UNESCO World Heritage Centre map point for the Red Fort property, converted from DMS to decimal degrees.'),
  ('konark-sun-temple','Sun Temple, Konarak - UNESCO geographical data','https://whc.unesco.org/en/list/246/maps/',19.887500::NUMERIC,86.094720::NUMERIC,'UNESCO World Heritage Centre map point N19 53 15, E86 5 40.992, converted from DMS to decimal degrees and rounded to six decimal places.')
)
INSERT INTO heritage_sources (
  heritage_id, source_name, source_title, publisher, source_url, source_note,
  accessed_on, claims_supported, review_status
)
SELECT h.id, 'UNESCO World Heritage Centre', e.source_title,
       'UNESCO World Heritage Centre', e.source_url, e.source_note,
       CURRENT_DATE, ARRAY['coordinates']::TEXT[], 'approved'
  FROM coordinate_evidence e
  JOIN heritage h ON h.slug=e.slug
 WHERE h.latitude=e.latitude AND h.longitude=e.longitude
ON CONFLICT (heritage_id, source_url) DO NOTHING;

-- Keep this new identity reference pending until a reviewer checks the linked
-- NMA/ASI register. Existing source rows are never changed on conflict.
INSERT INTO heritage_sources (
  heritage_id, source_name, source_title, publisher, source_url, source_note,
  accessed_on, claims_supported, review_status
)
SELECT h.id, 'National Monuments Authority / Archaeological Survey of India',
       'Centrally Protected Monuments and Sites list',
       'Government of India',
       'https://www.nma.gov.in/showfile.php?lang=2&level=0&lid=15&ls_id=21&nma_type=0',
       'Used to retain Tala Fort as a distinct protected monument at Tala, Raigad; it is not Vijaydurg Fort.',
       CURRENT_DATE, ARRAY['location','identity']::TEXT[], 'pending'
   FROM heritage h
  WHERE h.slug='asi-tala-fort-vijaydurg-ratnagiri-maharashtra-f9c57be64a'
    AND h.name='Tala Fort'
ON CONFLICT (heritage_id, source_url) DO NOTHING;

CREATE TEMPORARY TABLE selected_catalogue_duplicate_identity (
  canonical_slug TEXT PRIMARY KEY,
  expected_name TEXT NOT NULL,
  expected_state TEXT NOT NULL,
  expected_districts TEXT[] NOT NULL,
  expected_locality TEXT NOT NULL,
  alias_reason TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO selected_catalogue_duplicate_identity VALUES
  ('ajanta-caves','Ajanta Caves','Maharashtra',ARRAY['aurangabad','chhatrapati sambhajinagar'],'ajanta','Sparse ASI duplicate; retain its row and child records while resolving it to Ajanta Caves.'),
  ('ellora-caves','Ellora Caves','Maharashtra',ARRAY['aurangabad','chhatrapati sambhajinagar'],'ellora','Sparse ASI duplicate; retain its row and child records while resolving it to Ellora Caves.');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM selected_catalogue_duplicate_identity expected
    JOIN heritage canonical ON canonical.slug=expected.canonical_slug
    JOIN heritage possible_alias
      ON possible_alias.name=expected.expected_name
     AND possible_alias.state=expected.expected_state
     AND lower(COALESCE(possible_alias.locality,''))=expected.expected_locality
     AND possible_alias.id <> canonical.id
    LEFT JOIN heritage_categories category ON category.id=possible_alias.category_id
    WHERE lower(COALESCE(possible_alias.district,'')) <> ALL(expected.expected_districts)
       OR category.slug <> 'asi-protected'
  ) THEN
    RAISE EXCEPTION 'A possible Ajanta/Ellora duplicate matches its name and locality but fails the reviewed district/category identity checks.';
  END IF;

  IF EXISTS (
    SELECT expected.canonical_slug
    FROM selected_catalogue_duplicate_identity expected
    JOIN heritage canonical ON canonical.slug=expected.canonical_slug
    JOIN heritage possible_alias
      ON possible_alias.name=expected.expected_name
     AND possible_alias.state=expected.expected_state
     AND lower(COALESCE(possible_alias.locality,''))=expected.expected_locality
     AND possible_alias.id <> canonical.id
    GROUP BY expected.canonical_slug
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'More than one Ajanta/Ellora duplicate candidate exists; manual identity review is required.';
  END IF;
END $$;

INSERT INTO heritage_catalog_aliases (alias_heritage_id, canonical_heritage_id, reason)
SELECT possible_alias.id, canonical.id, expected.alias_reason
FROM selected_catalogue_duplicate_identity expected
JOIN heritage canonical ON canonical.slug=expected.canonical_slug
JOIN heritage possible_alias
  ON possible_alias.name=expected.expected_name
 AND possible_alias.state=expected.expected_state
 AND lower(COALESCE(possible_alias.locality,''))=expected.expected_locality
 AND possible_alias.id <> canonical.id
ON CONFLICT (alias_heritage_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM selected_catalogue_duplicate_identity expected
    JOIN heritage canonical ON canonical.slug=expected.canonical_slug
    JOIN heritage possible_alias
      ON possible_alias.name=expected.expected_name
     AND possible_alias.state=expected.expected_state
     AND lower(COALESCE(possible_alias.locality,''))=expected.expected_locality
     AND possible_alias.id <> canonical.id
    LEFT JOIN heritage_catalog_aliases alias ON alias.alias_heritage_id=possible_alias.id
    WHERE alias.canonical_heritage_id IS DISTINCT FROM canonical.id
  ) THEN
    RAISE EXCEPTION 'An Ajanta/Ellora duplicate alias is already mapped to a different canonical record.';
  END IF;
END $$;

CREATE TEMPORARY TABLE selected_catalogue_expected (
  display_order SMALLINT PRIMARY KEY,
  catalogue_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category_slug TEXT NOT NULL,
  state TEXT NOT NULL,
  district TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO selected_catalogue_expected
  (display_order,catalogue_key,name,slug,category_slug,state,district)
VALUES
  (1,'chhatrapati-shivaji-maharaj-terminus','Chhatrapati Shivaji Maharaj Terminus','chhatrapati-shivaji-maharaj-terminus','architectural-landmark','Maharashtra','Mumbai City'),
  (2,'gateway-of-india','Gateway of India','gateway-of-india','architectural-landmark','Maharashtra','Mumbai City'),
  (3,'elephanta-caves','Elephanta Caves','elephanta-caves','cave-rock-cut','Maharashtra','Mumbai Suburban'),
  (4,'kanheri-caves','Kanheri Caves','kanheri-caves','cave-rock-cut','Maharashtra','Mumbai Suburban'),
  (5,'ajanta-caves','Ajanta Caves','ajanta-caves','cave-rock-cut','Maharashtra','Chhatrapati Sambhajinagar'),
  (6,'ellora-caves','Ellora Caves','ellora-caves','cave-rock-cut','Maharashtra','Chhatrapati Sambhajinagar'),
  (7,'daulatabad-fort','Daulatabad Fort','daulatabad-fort','fort-palace','Maharashtra','Chhatrapati Sambhajinagar'),
  (8,'bibi-ka-maqbara','Bibi Ka Maqbara','bibi-ka-maqbara','mausoleum-tomb','Maharashtra','Chhatrapati Sambhajinagar'),
  (9,'raigad-fort','Raigad Fort','raigad-fort','fort-palace','Maharashtra','Raigad'),
  (10,'shivneri-fort','Shivneri Fort','shivneri-fort','fort-palace','Maharashtra','Pune'),
  (11,'sinhagad-fort','Sinhagad Fort','sinhagad-fort','fort-palace','Maharashtra','Pune'),
  (12,'shaniwar-wada','Shaniwar Wada','shaniwar-wada','fort-palace','Maharashtra','Pune'),
  (13,'aga-khan-palace','Aga Khan Palace','aga-khan-palace','fort-palace','Maharashtra','Pune'),
  (14,'pratapgad-fort','Pratapgad Fort','pratapgad-fort','fort-palace','Maharashtra','Satara'),
  (15,'sindhudurg-fort','Sindhudurg Fort','sindhudurg-fort','fort-palace','Maharashtra','Sindhudurg'),
  (16,'vijaydurg-fort','Vijaydurg Fort','vijaydurg-fort','fort-palace','Maharashtra','Sindhudurg'),
  (17,'murud-janjira-fort','Murud-Janjira Fort','murud-janjira-fort','fort-palace','Maharashtra','Raigad'),
  (18,'karla-caves','Karla Caves','karla-caves','cave-rock-cut','Maharashtra','Pune'),
  (19,'bhaja-caves','Bhaja Caves','bhaja-caves','cave-rock-cut','Maharashtra','Pune'),
  (20,'pandavleni-caves','Pandavleni Caves','pandavleni-caves','cave-rock-cut','Maharashtra','Nashik'),
  (21,'kalaram-temple','Kalaram Temple','kalaram-temple','temple-religious','Maharashtra','Nashik'),
  (22,'deekshabhoomi','Deekshabhoomi','deekshabhoomi','buddhist-monument','Maharashtra','Nagpur'),
  (23,'taj-mahal','Taj Mahal','taj-mahal','mausoleum-tomb','Uttar Pradesh','Agra'),
  (24,'red-fort','Red Fort','red-fort','fort-palace','Delhi','Central Delhi'),
  (25,'qutub-minar','Qutub Minar','qutub-minar-tower','architectural-landmark','Delhi','South Delhi'),
  (26,'hampi-group-of-monuments','Hampi Group of Monuments','hampi','archaeological','Karnataka','Vijayanagara'),
  (27,'konark-sun-temple','Konark Sun Temple','konark-sun-temple','temple-religious','Odisha','Puri'),
  (28,'khajuraho-group-of-monuments','Khajuraho Group of Monuments','khajuraho-monuments','temple-religious','Madhya Pradesh','Chhatarpur'),
  (29,'sanchi-stupa','Sanchi Stupa','sanchi-stupa-1','buddhist-monument','Madhya Pradesh','Raisen'),
  (30,'amer-fort','Amer Fort','amer-fort','fort-palace','Rajasthan','Jaipur');

DO $$
DECLARE mismatch_count INTEGER;
BEGIN
  IF (SELECT COUNT(*) FROM selected_catalogue_expected) <> 30 THEN
    RAISE EXCEPTION 'Selected catalogue manifest must contain exactly 30 places.';
  END IF;
  SELECT COUNT(*) INTO mismatch_count
    FROM selected_catalogue_expected expected
    LEFT JOIN heritage h ON h.slug=expected.slug
    LEFT JOIN heritage_categories c ON c.id=h.category_id
   WHERE h.id IS NULL
      OR h.name IS DISTINCT FROM expected.name
      OR h.state IS DISTINCT FROM expected.state
      OR h.district IS DISTINCT FROM expected.district
      OR c.slug IS DISTINCT FROM expected.category_slug
      OR NOT EXISTS (
        SELECT 1 FROM heritage_sources source
        WHERE source.heritage_id=h.id
          AND NULLIF(BTRIM(source.source_name),'') IS NOT NULL
          AND NULLIF(BTRIM(source.source_url),'') IS NOT NULL
      );
  IF mismatch_count <> 0 THEN
    RAISE EXCEPTION 'Selected record identities did not match the reviewed manifest (% mismatches).', mismatch_count;
  END IF;
END $$;

INSERT INTO heritage_catalog_membership (heritage_id, catalogue_key, display_order)
SELECT h.id, expected.catalogue_key, expected.display_order
  FROM selected_catalogue_expected expected
  JOIN heritage h ON h.slug=expected.slug
ON CONFLICT (heritage_id) DO NOTHING;

DO $$
DECLARE member_count INTEGER;
DECLARE mismatch_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO member_count FROM heritage_catalog_membership;
  SELECT COUNT(*) INTO mismatch_count
    FROM selected_catalogue_expected expected
    LEFT JOIN heritage h ON h.slug=expected.slug
    LEFT JOIN heritage_catalog_membership member ON member.heritage_id=h.id
   WHERE member.heritage_id IS NULL
      OR member.catalogue_key IS DISTINCT FROM expected.catalogue_key
      OR member.display_order IS DISTINCT FROM expected.display_order;
  IF member_count <> 30 OR mismatch_count <> 0 THEN
    RAISE EXCEPTION 'Public catalogue membership must be exactly the selected 30 (found %, mismatches %).', member_count, mismatch_count;
  END IF;
  IF EXISTS (
    SELECT 1 FROM heritage_catalog_aliases alias
    JOIN heritage_catalog_membership member ON member.heritage_id=alias.alias_heritage_id
  ) THEN
    RAISE EXCEPTION 'A duplicate alias record cannot also be a public catalogue member.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM heritage_catalog_aliases alias
    JOIN heritage_catalog_membership canonical_member ON canonical_member.heritage_id=alias.canonical_heritage_id
    LEFT JOIN heritage_catalog_membership alias_member ON alias_member.heritage_id=alias.alias_heritage_id
    WHERE alias_member.heritage_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A catalogue alias and its canonical record cannot both be public members.';
  END IF;
  IF EXISTS (
    WITH expected_coordinate_evidence(slug, source_url, latitude, longitude) AS (VALUES
      ('chhatrapati-shivaji-maharaj-terminus','https://whc.unesco.org/en/list/945/maps/',18.940122::NUMERIC,72.836203::NUMERIC),
      ('elephanta-caves','https://whc.unesco.org/en/list/244/maps/',18.966670::NUMERIC,72.935830::NUMERIC),
      ('red-fort','https://whc.unesco.org/en/list/231/maps/',28.655556::NUMERIC,77.240833::NUMERIC),
      ('konark-sun-temple','https://whc.unesco.org/en/list/246/maps/',19.887500::NUMERIC,86.094720::NUMERIC)
    )
    SELECT 1
      FROM expected_coordinate_evidence expected
      JOIN heritage h ON h.slug=expected.slug
     WHERE h.latitude IS DISTINCT FROM expected.latitude
        OR h.longitude IS DISTINCT FROM expected.longitude
        OR NOT EXISTS (
        SELECT 1 FROM heritage_sources s WHERE s.heritage_id=h.id
          AND s.source_url=expected.source_url
          AND 'coordinates'=ANY(s.claims_supported)
          AND s.review_status='approved'
        )
  ) THEN
    RAISE EXCEPTION 'A migrated UNESCO point is missing its expected coordinate pair or approved point-level map citation.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM heritage h
    WHERE h.slug IN (
      'mumbai-victorian-art-deco','mumbai-heritage-ensemble',
      'sanchi-buddhist-monuments','qutb-minar',
      'asi-fort-at-pratapgad-ghogra-nagpur-maharashtra-fdf3d71f08',
      'asi-tala-fort-vijaydurg-ratnagiri-maharashtra-f9c57be64a'
    )
      AND EXISTS (SELECT 1 FROM heritage_catalog_membership m WHERE m.heritage_id=h.id)
  ) THEN
    RAISE EXCEPTION 'A non-selected ensemble, feature parent, Tala, or ambiguous Pratapgad record was included.';
  END IF;
END $$;

COMMIT;
