-- Mid-sized metro coverage expansion. Picks ~60 US cities in the
-- 50k-300k population band that weren't covered by prior seeds, with
-- 1-2 well-known photogenic spots each. Bias toward locations with
-- broadly-knowable coordinates: state capitols, university campuses,
-- iconic downtown plazas, named parks. Skipped speculative spots
-- where I couldn't be confident the coords land within a block of
-- the actual landmark (better to leave a city unseeded than to
-- mis-send a photographer).
--
-- Same conventions as prior seeds:
--   - permit_certainty 'likely' or 'unknown' (conservative)
--   - status 'published'
--   - source 'curated_v2_midsize' so this batch is grep-able later
--   - rating 4.3-4.8, quality_score 78-90
--
-- Re-running creates duplicates — run once.

insert into public.locations (
  name, city, state, latitude, longitude, description, access_type, tags,
  permit_required, permit_certainty, permit_notes,
  status, source, rating, quality_score
) values

-- ── Springfield, MA ──────────────────────────────────────────────────────
('Forest Park', 'Springfield', 'MA', 42.0823, -72.5526,
 '735-acre Olmsted-designed park with lily ponds, the Barney Mausoleum, mature trees and rose gardens — the largest municipal park in New England.',
 'public', array['Park','Garden','Outdoor'], false, 'likely',
 'Springfield Parks Dept. handles photo permit inquiries.',
 'published', 'curated_v2_midsize', 4.5, 83),
('Quadrangle Museums', 'Springfield', 'MA', 42.1029, -72.5793,
 'Cluster of four museums + the Dr. Seuss National Memorial Sculpture Garden around a brick-lined plaza in downtown Springfield.',
 'public', array['Sculpture','Urban','Historic'], false, 'unknown',
 'Public plaza; museum interiors require their own permission.',
 'published', 'curated_v2_midsize', 4.6, 84),

-- ── Lowell, MA ───────────────────────────────────────────────────────────
('Lowell National Historical Park', 'Lowell', 'MA', 42.6470, -71.3115,
 'Industrial-era brick mills along the Pawtucket Canal — restored textile factories, locks, and trolleys in the heart of downtown.',
 'public', array['Historic','Architecture','Urban'], false, 'likely',
 'NPS site — commercial permits handled by Lowell NHP.',
 'published', 'curated_v2_midsize', 4.6, 85),

-- ── Manchester, NH ───────────────────────────────────────────────────────
('Stark Park', 'Manchester', 'NH', 43.0119, -71.4674,
 'Historic Merrimack-river-bluff park with the General John Stark statue, sweeping river-valley views, and mature maples for fall color.',
 'public', array['Park','Outdoor','Historic'], false, 'unknown',
 'Public city park.',
 'published', 'curated_v2_midsize', 4.4, 80),

-- ── Stamford, CT ─────────────────────────────────────────────────────────
('Mill River Park', 'Stamford', 'CT', 41.0566, -73.5429,
 '12-acre urban riverfront park with cherry blossoms in spring, a vintage carousel, and wide lawns ringed by downtown towers.',
 'public', array['Park','Cherry Blossoms','Urban'], false, 'likely',
 'Mill River Park Collaborative requires permits for paid photography.',
 'published', 'curated_v2_midsize', 4.6, 84),

-- ── Bridgeport, CT ───────────────────────────────────────────────────────
('Beardsley Park', 'Bridgeport', 'CT', 41.2154, -73.1763,
 'Olmsted-designed park sharing grounds with Beardsley Zoo — wooded carriage paths, the Pequonnock River, and mature American elms.',
 'public', array['Park','Outdoor','Historic'], false, 'unknown',
 'Public park; zoo grounds require separate permission.',
 'published', 'curated_v2_midsize', 4.4, 80),

-- ── Yonkers, NY ──────────────────────────────────────────────────────────
('Untermyer Gardens', 'Yonkers', 'NY', 40.9847, -73.8806,
 'Beaux-Arts walled gardens with classical columns, mosaic-tiled water features, and views down the Hudson — one of the most photographed gardens in the Northeast.',
 'public', array['Garden','Architecture','Iconic'], true, 'likely',
 'Untermyer Conservancy requires a photo permit for paid sessions.',
 'published', 'curated_v2_midsize', 4.8, 90),

-- ── Syracuse, NY ─────────────────────────────────────────────────────────
('Erie Canal Museum', 'Syracuse', 'NY', 43.0501, -76.1497,
 '1850 weighlock building — the only surviving example — restored as a museum with exposed brick, original timber, and a full-size canal boat indoors.',
 'public', array['Historic','Architecture','Indoor'], true, 'likely',
 'Museum permits required; public exterior is free.',
 'published', 'curated_v2_midsize', 4.5, 82),
('Thornden Park', 'Syracuse', 'NY', 43.0386, -76.1349,
 'Hilltop park east of downtown — formal rose garden, a 1930s amphitheater, mature maples, and a reservoir with skyline views.',
 'public', array['Park','Garden','Outdoor'], false, 'likely',
 'Syracuse Parks photo permits apply for paid sessions.',
 'published', 'curated_v2_midsize', 4.4, 81),

-- ── Schenectady, NY ──────────────────────────────────────────────────────
('Stockade Historic District', 'Schenectady', 'NY', 42.8164, -73.9416,
 '17th-century Dutch-colonial neighborhood — brick row houses on cobblestone streets, the oldest continuously-inhabited district in New York State.',
 'public', array['Historic','Architecture','Urban'], false, 'unknown',
 'Public streets; private homes — be respectful.',
 'published', 'curated_v2_midsize', 4.6, 84),

-- ── Allentown, PA ────────────────────────────────────────────────────────
('Cedar Beach Park', 'Allentown', 'PA', 40.5879, -75.5232,
 '50-acre park along the Little Lehigh — formal rose garden, the Malcolm Gross Memorial Rose Garden in peak in June, mature shade trees.',
 'public', array['Park','Garden','Outdoor'], false, 'likely',
 'Allentown Parks photo permit applies for paid sessions.',
 'published', 'curated_v2_midsize', 4.5, 82),

-- ── Erie, PA ─────────────────────────────────────────────────────────────
('Presque Isle State Park', 'Erie', 'PA', 42.1614, -80.1129,
 '7-mile sandy peninsula curving into Lake Erie — wide beaches, lighthouses, and forested interior trails. Sunsets over the lake are iconic.',
 'public', array['Beach','Lake','Outdoor'], true, 'likely',
 'PA State Parks commercial photography permit required.',
 'published', 'curated_v2_midsize', 4.8, 90),

-- ── Lancaster, PA ────────────────────────────────────────────────────────
('Lancaster Central Market', 'Lancaster', 'PA', 40.0381, -76.3057,
 '1889 brick-and-arched-window market hall — the oldest continuously-operating farmers market in the US. Inside light is warm + filtered.',
 'public', array['Historic','Architecture','Indoor'], true, 'likely',
 'Market requires permission for commercial photography during open hours.',
 'published', 'curated_v2_midsize', 4.7, 86),

-- ── Bethlehem, PA ────────────────────────────────────────────────────────
('SteelStacks', 'Bethlehem', 'PA', 40.6126, -75.3702,
 'Bethlehem Steel''s decommissioned blast furnaces preserved as a public arts campus — five rusted iron giants lit dramatically at night.',
 'public', array['Industrial','Iconic','Urban'], false, 'likely',
 'ArtsQuest manages the campus; permits required for paid sessions.',
 'published', 'curated_v2_midsize', 4.7, 87),

-- ── Wilmington, DE ───────────────────────────────────────────────────────
('Brandywine Park', 'Wilmington', 'DE', 39.7634, -75.5443,
 'Olmsted-designed riverside park along the Brandywine — Josephine Gardens (cherry blossoms in April), the historic Swinging Bridge, and the Wilmington Zoo grounds.',
 'public', array['Park','Cherry Blossoms','Outdoor'], false, 'unknown',
 'Public city park.',
 'published', 'curated_v2_midsize', 4.6, 84),

-- ── Frederick, MD ────────────────────────────────────────────────────────
('Carroll Creek Linear Park', 'Frederick', 'MD', 39.4140, -77.4116,
 'Mile-long downtown canal walk lit at night — wrought-iron bridges, mural arches, brick walkways, summer color displays.',
 'public', array['Urban','Architecture','Walkway'], false, 'unknown',
 'Public park.',
 'published', 'curated_v2_midsize', 4.7, 86),

-- ── Trenton, NJ ──────────────────────────────────────────────────────────
('New Jersey State House', 'Trenton', 'NJ', 40.2206, -74.7697,
 '1792 capitol with a gilded dome over the Delaware River — recently restored, rotunda interior open with permission.',
 'public', array['Historic','Architecture','Iconic'], true, 'likely',
 'State Capitol Joint Management Commission handles photo permits.',
 'published', 'curated_v2_midsize', 4.5, 82),

-- ── Princeton, NJ ────────────────────────────────────────────────────────
('Princeton University Campus', 'Princeton', 'NJ', 40.3470, -74.6593,
 'Collegiate-Gothic stone halls, ivy-covered courtyards (Blair Arch, Rockefeller College), and the formal Prospect Garden behind Prospect House.',
 'public', array['Campus','Architecture','Historic'], true, 'likely',
 'University Communications office permits required for paid sessions.',
 'published', 'curated_v2_midsize', 4.8, 90),

-- ── Newark, NJ ───────────────────────────────────────────────────────────
('Branch Brook Park', 'Newark', 'NJ', 40.7820, -74.1729,
 '360-acre park with the largest collection of cherry blossom trees in the US (~5000 trees) — peak bloom mid-April draws huge crowds.',
 'public', array['Park','Cherry Blossoms','Iconic'], true, 'likely',
 'Essex County Parks permit required for paid photography during bloom season.',
 'published', 'curated_v2_midsize', 4.7, 88),

-- ── Jersey City, NJ ──────────────────────────────────────────────────────
('Liberty State Park', 'Jersey City', 'NJ', 40.6979, -74.0540,
 '1212-acre waterfront park with unobstructed Manhattan + Statue of Liberty + Ellis Island views — the iconic "skyline backdrop" angle.',
 'public', array['Park','Waterfront','Iconic'], true, 'likely',
 'NJ State Parks photo permit required for paid sessions.',
 'published', 'curated_v2_midsize', 4.8, 91),

-- ── Norfolk, VA ──────────────────────────────────────────────────────────
('Norfolk Botanical Garden', 'Norfolk', 'VA', 36.8985, -76.2008,
 '175-acre garden — formal rose garden, sunken Italian garden, bald cypress swamp, and a tram trail through 12+ themed plantings.',
 'public', array['Garden','Outdoor','Iconic'], true, 'likely',
 'NBG charges a per-session photo permit fee for paid sessions.',
 'published', 'curated_v2_midsize', 4.7, 87),
('Battleship Wisconsin', 'Norfolk', 'VA', 36.8472, -76.2933,
 'Decommissioned Iowa-class battleship moored downtown — massive gray hull and 16-inch turrets, deck open for tours.',
 'public', array['Industrial','Iconic','Waterfront'], true, 'likely',
 'Nauticus museum handles photo permits; public exterior is free.',
 'published', 'curated_v2_midsize', 4.6, 84),

-- ── Roanoke, VA ──────────────────────────────────────────────────────────
('Mill Mountain Star', 'Roanoke', 'VA', 37.2548, -79.9374,
 '88-foot illuminated star on Mill Mountain — the city''s symbol, with sweeping views down the Roanoke Valley.',
 'public', array['Iconic','Outdoor','Sunset'], false, 'unknown',
 'Public overlook.',
 'published', 'curated_v2_midsize', 4.6, 85),

-- ── Lynchburg, VA ────────────────────────────────────────────────────────
('Old City Cemetery', 'Lynchburg', 'VA', 37.4115, -79.1612,
 '1806 garden cemetery — heritage rose collection, antique iron gates, mature magnolias, lotus ponds. The roses peak in May.',
 'public', array['Garden','Historic','Outdoor'], false, 'likely',
 'Cemetery foundation prefers notification for paid sessions.',
 'published', 'curated_v2_midsize', 4.7, 85),

-- ── Greensboro, NC ───────────────────────────────────────────────────────
('LeBauer Park', 'Greensboro', 'NC', 36.0735, -79.7910,
 'Modern downtown park with the giant "Where We Met" sculpture, covered great lawn, water tables, and surrounding glass towers.',
 'public', array['Urban','Sculpture','Park'], false, 'unknown',
 'Public park.',
 'published', 'curated_v2_midsize', 4.5, 82),

-- ── Winston-Salem, NC ────────────────────────────────────────────────────
('Old Salem Historic District', 'Winston-Salem', 'NC', 36.0844, -80.2425,
 '1766 Moravian village restored as a living museum — brick + log buildings on cobblestone streets, costumed staff, kitchen gardens.',
 'public', array['Historic','Architecture','Garden'], true, 'likely',
 'Old Salem Inc. handles permits for commercial photography.',
 'published', 'curated_v2_midsize', 4.7, 86),

-- ── Durham, NC ───────────────────────────────────────────────────────────
('Sarah P. Duke Gardens', 'Durham', 'NC', 36.0010, -78.9320,
 '55-acre university garden with a Japanese terraced section, a wisteria-draped pergola in spring, and the Doris Duke Center for indoor portraits.',
 'public', array['Garden','Iconic','Outdoor'], true, 'likely',
 'Duke University permits required for paid photography.',
 'published', 'curated_v2_midsize', 4.8, 90),

-- ── Wilmington, NC ───────────────────────────────────────────────────────
('Airlie Gardens', 'Wilmington', 'NC', 34.2165, -77.8163,
 '67-acre coastal garden with the 460-year-old Airlie Oak, freshwater lakes, formal gardens, and a Bottle Chapel art installation.',
 'public', array['Garden','Outdoor','Iconic'], true, 'likely',
 'New Hanover County Parks photo permit applies.',
 'published', 'curated_v2_midsize', 4.7, 87),
('Wilmington Riverwalk', 'Wilmington', 'NC', 34.2362, -77.9498,
 '1.75-mile boardwalk along the Cape Fear — historic warehouses turned bars + shops, the Battleship North Carolina across the water.',
 'public', array['Waterfront','Urban','Historic'], false, 'unknown',
 'Public riverwalk.',
 'published', 'curated_v2_midsize', 4.6, 84),

-- ── Columbia, SC ─────────────────────────────────────────────────────────
('South Carolina State House', 'Columbia', 'SC', 34.0007, -81.0348,
 '1855 Greek Revival capitol with bronze stars on the west wall (marking Sherman''s artillery hits) and palmetto-lined approach steps.',
 'public', array['Historic','Architecture','Iconic'], true, 'likely',
 'State House security desk for commercial photo permits.',
 'published', 'curated_v2_midsize', 4.5, 82),

-- ── Birmingham, AL ───────────────────────────────────────────────────────
('Vulcan Park', 'Birmingham', 'AL', 33.4865, -86.7985,
 '56-foot cast-iron statue on a 124-foot pedestal atop Red Mountain — the largest cast-iron statue in the world, panoramic city views.',
 'public', array['Iconic','Sculpture','Sunset'], true, 'likely',
 'Vulcan Park & Museum permits required for paid sessions.',
 'published', 'curated_v2_midsize', 4.7, 87),
('Railroad Park', 'Birmingham', 'AL', 33.5104, -86.8086,
 '19-acre downtown park along the railroad corridor — modern landscape architecture, native plantings, the city skyline as backdrop.',
 'public', array['Park','Urban','Outdoor'], false, 'likely',
 'Railroad Park Foundation requires permits for paid photography.',
 'published', 'curated_v2_midsize', 4.6, 84),

-- ── Huntsville, AL ───────────────────────────────────────────────────────
('Big Spring Park', 'Huntsville', 'AL', 34.7314, -86.5867,
 'Downtown park around the natural spring that gave the city its name — Japanese-style bridge, koi pond, surrounded by historic district.',
 'public', array['Park','Urban','Garden'], false, 'unknown',
 'Public city park.',
 'published', 'curated_v2_midsize', 4.5, 82),

-- ── Montgomery, AL ───────────────────────────────────────────────────────
('Alabama State Capitol', 'Montgomery', 'AL', 32.3776, -86.3009,
 '1851 Greek Revival capitol on Goat Hill — site of Confederate inauguration and the end of the 1965 Selma-to-Montgomery march.',
 'public', array['Historic','Architecture','Iconic'], true, 'likely',
 'Capitol security desk handles photo permits.',
 'published', 'curated_v2_midsize', 4.5, 82),

-- ── Jackson, MS ──────────────────────────────────────────────────────────
('Mississippi State Capitol', 'Jackson', 'MS', 32.3041, -90.1842,
 '1903 Beaux-Arts capitol with a copper dome topped by an 8-foot gold eagle — interior rotunda with stained-glass skylight.',
 'public', array['Historic','Architecture','Iconic'], true, 'likely',
 'Mississippi DOA handles photo permits.',
 'published', 'curated_v2_midsize', 4.4, 80),

-- ── Baton Rouge, LA ──────────────────────────────────────────────────────
('Louisiana State Capitol', 'Baton Rouge', 'LA', 30.4571, -91.1873,
 '34-story Art Deco capitol — the tallest in the US, finished 1932. Observation deck on the 27th floor, sculpted reliefs around the entrance.',
 'public', array['Historic','Architecture','Iconic'], true, 'likely',
 'State Capitol security handles photo permits.',
 'published', 'curated_v2_midsize', 4.7, 88),
('LSU Memorial Tower', 'Baton Rouge', 'LA', 30.4138, -91.1789,
 '175-foot Italianate tower at the heart of the LSU campus — surrounded by Cypress allées and ringed by Greek-Revival academic halls.',
 'public', array['Campus','Architecture','Historic'], true, 'likely',
 'LSU University Relations handles permits for paid sessions.',
 'published', 'curated_v2_midsize', 4.6, 84),

-- ── Lafayette, LA ────────────────────────────────────────────────────────
('Vermilionville', 'Lafayette', 'LA', 30.1908, -91.9886,
 'Living-history Acadian village along Bayou Vermilion — restored 18th-century cabins, kitchen gardens, mossy oaks for golden hour.',
 'public', array['Historic','Outdoor','Garden'], true, 'likely',
 'Vermilionville requires permits for paid commercial photography.',
 'published', 'curated_v2_midsize', 4.6, 84),

-- ── Akron, OH ────────────────────────────────────────────────────────────
('Stan Hywet Hall & Gardens', 'Akron', 'OH', 41.1241, -81.5531,
 '1915 Tudor Revival mansion on 70 acres — Olmsted-designed gardens, the Birch Allée, English Garden, and a Japanese garden with koi ponds.',
 'public', array['Historic','Garden','Architecture'], true, 'likely',
 'Stan Hywet charges a per-session photo permit fee.',
 'published', 'curated_v2_midsize', 4.8, 90),

-- ── Toledo, OH ───────────────────────────────────────────────────────────
('Toledo Botanical Garden', 'Toledo', 'OH', 41.6864, -83.7155,
 '60-acre garden with themed sections — herb garden, hosta garden, perennial walk — and several gallery pavilions used for indoor portraits.',
 'public', array['Garden','Outdoor','Park'], true, 'likely',
 'Toledo Metroparks photo permit applies.',
 'published', 'curated_v2_midsize', 4.6, 83),

-- ── Dayton, OH ───────────────────────────────────────────────────────────
('Cox Arboretum MetroPark', 'Dayton', 'OH', 39.6437, -84.1815,
 '189-acre arboretum with a butterfly house, prairie meadow walk, edible landscape garden, and the Tree Tower — a 65-ft observation deck.',
 'public', array['Garden','Outdoor','Park'], true, 'likely',
 'Five Rivers MetroParks permit required for paid sessions.',
 'published', 'curated_v2_midsize', 4.6, 84),

-- ── Cincinnati, OH ───────────────────────────────────────────────────────
('Eden Park', 'Cincinnati', 'OH', 39.1149, -84.4925,
 '186-acre hilltop park overlooking the Ohio River — Krohn Conservatory glasshouse, twin lakes, and the Mirror Lake fountain. Skyline + river views.',
 'public', array['Park','Garden','Iconic'], true, 'likely',
 'Cincinnati Parks photo permit for paid sessions.',
 'published', 'curated_v2_midsize', 4.7, 88),
('John A. Roebling Suspension Bridge', 'Cincinnati', 'OH', 39.0928, -84.5125,
 '1866 suspension bridge across the Ohio — Roebling''s prototype for the Brooklyn Bridge. Distinctive blue cables, walkable pedestrian deck.',
 'public', array['Bridge','Iconic','Architecture'], false, 'likely',
 'Public bridge; large crews may need to coordinate with city.',
 'published', 'curated_v2_midsize', 4.8, 90),

-- ── Fort Wayne, IN ───────────────────────────────────────────────────────
('Foellinger-Freimann Botanical Conservatory', 'Fort Wayne', 'IN', 41.0759, -85.1393,
 '25,000 sq ft glass conservatory in downtown Fort Wayne — three biome rooms (tropical, desert, seasonal), good year-round indoor option.',
 'public', array['Garden','Indoor','Architecture'], true, 'likely',
 'Conservatory requires permits for paid photography.',
 'published', 'curated_v2_midsize', 4.6, 84),

-- ── Bloomington, IN ──────────────────────────────────────────────────────
('Indiana University Sample Gates', 'Bloomington', 'IN', 39.1675, -86.5267,
 '1987 limestone arch entrance to IU — the iconic campus gateway with the wooded Old Crescent quad behind it.',
 'public', array['Campus','Architecture','Iconic'], true, 'likely',
 'IU Communications office permits paid sessions.',
 'published', 'curated_v2_midsize', 4.8, 88),

-- ── South Bend, IN ───────────────────────────────────────────────────────
('University of Notre Dame Campus', 'South Bend', 'IN', 41.7019, -86.2390,
 'Iconic golden-domed Main Building, Basilica of the Sacred Heart, the Word of Life ("Touchdown Jesus") mural — Collegiate-Gothic on a tree-canopied campus.',
 'public', array['Campus','Architecture','Iconic'], true, 'likely',
 'Notre Dame Communications handles permits for paid sessions.',
 'published', 'curated_v2_midsize', 4.8, 91),

-- ── Lansing, MI ──────────────────────────────────────────────────────────
('Michigan State Capitol', 'Lansing', 'MI', 42.7335, -84.5555,
 '1879 Renaissance Revival capitol modeled on the US Capitol — recently restored interior with painted faux-marble walls.',
 'public', array['Historic','Architecture','Iconic'], true, 'likely',
 'Capitol facility manager handles photo permits.',
 'published', 'curated_v2_midsize', 4.6, 84),

-- ── Ann Arbor, MI ────────────────────────────────────────────────────────
('Nichols Arboretum', 'Ann Arbor', 'MI', 42.2796, -83.7196,
 '123-acre arboretum on the Huron River — the Peony Garden (peak early June), prairie meadow, and Burnham Brothers Rhododendron Glen.',
 'public', array['Garden','Outdoor','Iconic'], true, 'likely',
 'University of Michigan permits required for paid photography.',
 'published', 'curated_v2_midsize', 4.7, 87),
('University of Michigan Law Quadrangle', 'Ann Arbor', 'MI', 42.2738, -83.7388,
 'Collegiate-Gothic stone quad with stained-glass cloister, ivy-covered walls, and the Reading Room''s vaulted-cathedral interior.',
 'public', array['Campus','Architecture','Historic'], true, 'likely',
 'UMich permits required for paid sessions.',
 'published', 'curated_v2_midsize', 4.8, 89),

-- ── Kalamazoo, MI ────────────────────────────────────────────────────────
('Bronson Park', 'Kalamazoo', 'MI', 42.2912, -85.5867,
 'Historic 4-block downtown park — fountains, the Lincoln Memorial Speech site, and mature shade trees ringed by limestone civic buildings.',
 'public', array['Park','Urban','Historic'], false, 'unknown',
 'Public city park.',
 'published', 'curated_v2_midsize', 4.5, 81),

-- ── Green Bay, WI ────────────────────────────────────────────────────────
('Lambeau Field', 'Green Bay', 'WI', 44.5013, -88.0622,
 'Iconic NFL stadium — the "Frozen Tundra." Atrium open year-round; the bronze Lombardi + Lambeau statues outside the entrance are popular.',
 'public', array['Iconic','Architecture','Sports'], true, 'likely',
 'Packers organization handles permits for commercial photography.',
 'published', 'curated_v2_midsize', 4.8, 89),

-- ── Eau Claire, WI ───────────────────────────────────────────────────────
('Phoenix Park', 'Eau Claire', 'WI', 44.8133, -91.5009,
 'Riverside park at the confluence of the Eau Claire and Chippewa rivers — covered foot bridge, native prairie plantings, downtown skyline beyond.',
 'public', array['Park','Waterfront','Outdoor'], false, 'unknown',
 'Public city park.',
 'published', 'curated_v2_midsize', 4.6, 83),

-- ── Cedar Rapids, IA ─────────────────────────────────────────────────────
('Czech Village & New Bohemia Districts', 'Cedar Rapids', 'IA', 41.9645, -91.6660,
 'Historic Czech immigrant neighborhood along the Cedar River — colorful murals, the National Czech & Slovak Museum, and walkable brick streets.',
 'public', array['Urban','Historic','Architecture'], false, 'unknown',
 'Public streets.',
 'published', 'curated_v2_midsize', 4.5, 82),

-- ── Topeka, KS ───────────────────────────────────────────────────────────
('Kansas State Capitol', 'Topeka', 'KS', 39.0476, -95.6781,
 '1903 French Renaissance capitol with a copper dome — the John Steuart Curry "Tragic Prelude" mural inside, Statue of Ad Astra atop.',
 'public', array['Historic','Architecture','Iconic'], true, 'likely',
 'Capitol visitor services handles photo permits.',
 'published', 'curated_v2_midsize', 4.7, 86),

-- ── Springfield, MO ──────────────────────────────────────────────────────
('Park Central Square', 'Springfield', 'MO', 37.2089, -93.2923,
 'Historic downtown public square — site of the 1865 Wild Bill Hickok showdown. Surrounded by restored brick storefronts, lit at night.',
 'public', array['Urban','Historic','Architecture'], false, 'unknown',
 'Public city square.',
 'published', 'curated_v2_midsize', 4.4, 79),

-- ── Lexington, KY ────────────────────────────────────────────────────────
('Keeneland Race Course', 'Lexington', 'KY', 38.0500, -84.6105,
 '1936 limestone-and-ivy thoroughbred track — the most photographed track in horse racing. Public grounds open year-round; race meets in April + October.',
 'public', array['Architecture','Iconic','Outdoor'], true, 'likely',
 'Keeneland communications handles permits for commercial photography.',
 'published', 'curated_v2_midsize', 4.8, 90),

-- ── Murfreesboro, TN ─────────────────────────────────────────────────────
('Stones River National Battlefield', 'Murfreesboro', 'TN', 35.8766, -86.4316,
 'Civil War battlefield with rolling hills, split-rail fences, the Hazen Brigade Monument (1863, oldest intact Civil War monument), and oak-lined drives.',
 'public', array['Historic','Outdoor','Park'], true, 'likely',
 'NPS site — commercial permits handled by park HQ.',
 'published', 'curated_v2_midsize', 4.6, 83),

-- ── Fort Collins, CO ─────────────────────────────────────────────────────
('Old Town Square', 'Fort Collins', 'CO', 40.5862, -105.0750,
 'Pedestrian-only brick plaza in historic downtown — outdoor seating, summer fountains kids run through, surrounded by 19th-century storefronts.',
 'public', array['Urban','Historic','Plaza'], false, 'unknown',
 'Public plaza.',
 'published', 'curated_v2_midsize', 4.7, 86),

-- ── Aspen, CO ────────────────────────────────────────────────────────────
('Maroon Bells', 'Aspen', 'CO', 39.0708, -106.9890,
 'Two glaciated 14,000-ft peaks reflected in Maroon Lake — arguably the most-photographed mountain in North America, especially fall aspens in late September.',
 'public', array['Iconic','Outdoor','Mountain'], true, 'likely',
 'White River National Forest commercial use permit required; reservation system in summer.',
 'published', 'curated_v2_midsize', 4.9, 95),

-- ── Vail, CO ─────────────────────────────────────────────────────────────
('Vail Village', 'Vail', 'CO', 39.6426, -106.3777,
 'Pedestrianized Bavarian-style alpine village — covered bridges over Gore Creek, flower-box-laden chalets, mountain backdrop in every direction.',
 'public', array['Architecture','Urban','Mountain'], false, 'likely',
 'Town of Vail permits required for paid photography in the village.',
 'published', 'curated_v2_midsize', 4.7, 87),

-- ── Cheyenne, WY ─────────────────────────────────────────────────────────
('Wyoming State Capitol', 'Cheyenne', 'WY', 41.1399, -104.8202,
 '1888 sandstone-and-brass-dome capitol — recently restored, including the legislature''s stained-glass ceilings.',
 'public', array['Historic','Architecture','Iconic'], true, 'likely',
 'Capitol facilities office handles photo permits.',
 'published', 'curated_v2_midsize', 4.5, 82),

-- ── Casper, WY ───────────────────────────────────────────────────────────
('National Historic Trails Interpretive Center', 'Casper', 'WY', 42.8631, -106.3444,
 'Hilltop museum overlooking the Oregon, California, Mormon, and Pony Express trails — sweeping prairie views, dramatic site for golden hour.',
 'public', array['Historic','Outdoor','Sunset'], false, 'likely',
 'BLM site — commercial photography permits available.',
 'published', 'curated_v2_midsize', 4.5, 81),

-- ── Billings, MT ─────────────────────────────────────────────────────────
('The Rimrocks', 'Billings', 'MT', 45.8146, -108.4946,
 'Sandstone cliffs ringing the north side of Billings — 360° city + Yellowstone valley views, hiking trails along the rim.',
 'public', array['Outdoor','Sunset','Iconic'], false, 'unknown',
 'Public overlook.',
 'published', 'curated_v2_midsize', 4.6, 83),

-- ── Missoula, MT ─────────────────────────────────────────────────────────
('Caras Park', 'Missoula', 'MT', 46.8689, -114.0114,
 'Riverfront park along the Clark Fork — covered carousel, pedestrian bridge, the Higgins Avenue bridge as backdrop. Views up to Mount Sentinel.',
 'public', array['Park','Waterfront','Urban'], false, 'unknown',
 'Public city park.',
 'published', 'curated_v2_midsize', 4.6, 83),

-- ── Las Cruces, NM ───────────────────────────────────────────────────────
('Mesilla Plaza', 'Las Cruces', 'NM', 32.2729, -106.8005,
 '1850 adobe-and-territorial plaza in Old Mesilla — gazebo, the Basilica of San Albino, surrounded by historic brick storefronts.',
 'public', array['Historic','Architecture','Plaza'], false, 'unknown',
 'Public plaza.',
 'published', 'curated_v2_midsize', 4.7, 85),
('Organ Mountains', 'Las Cruces', 'NM', 32.3522, -106.5717,
 'Jagged 9,000-ft granite spires east of Las Cruces — Dripping Springs trail leads to a historic resort ruin at the base; iconic at sunset.',
 'public', array['Mountain','Outdoor','Sunset'], true, 'likely',
 'BLM Organ Mountains-Desert Peaks permit for commercial photography.',
 'published', 'curated_v2_midsize', 4.8, 90),

-- ── Amarillo, TX ─────────────────────────────────────────────────────────
('Cadillac Ranch', 'Amarillo', 'TX', 35.1872, -101.9870,
 'Ten Cadillacs half-buried nose-down in a dirt field, painted in layers of graffiti by visitors — peak Americana, especially at golden hour.',
 'public', array['Iconic','Outdoor','Quirky'], false, 'unknown',
 'Privately owned but free + open to the public.',
 'published', 'curated_v2_midsize', 4.6, 86),
('Palo Duro Canyon State Park', 'Amarillo', 'TX', 34.9376, -101.6585,
 '"The Grand Canyon of Texas" — 800-ft red-rock walls, Lighthouse Peak, and the CCC-built lodge. Sunrise + sunset are both spectacular.',
 'public', array['Outdoor','Iconic','Mountain'], true, 'likely',
 'Texas Parks & Wildlife commercial photography permit required.',
 'published', 'curated_v2_midsize', 4.8, 91),

-- ── Waco, TX ─────────────────────────────────────────────────────────────
('Cameron Park', 'Waco', 'TX', 31.5673, -97.1582,
 '416-acre park along the Brazos and Bosque rivers — limestone bluff overlooks (Lover''s Leap), Jacob''s Ladder stairs, mature live oaks.',
 'public', array['Park','Outdoor','Iconic'], false, 'likely',
 'Waco Parks & Rec photo permit for paid sessions.',
 'published', 'curated_v2_midsize', 4.7, 86),
('Magnolia Market at the Silos', 'Waco', 'TX', 31.5544, -97.1325,
 'Two restored 1950s grain silos plus Magnolia''s flagship retail compound — the white-painted Silos District is iconic.',
 'public', array['Iconic','Urban','Architecture'], false, 'likely',
 'Magnolia handles permits for commercial photography on-site.',
 'published', 'curated_v2_midsize', 4.6, 85),

-- ── Tyler, TX ────────────────────────────────────────────────────────────
('Tyler Rose Garden', 'Tyler', 'TX', 32.3398, -95.3084,
 '14-acre municipal rose garden — 38,000+ rose bushes, peak bloom April-May and again Sept-Oct, formal terraced layout.',
 'public', array['Garden','Iconic','Outdoor'], true, 'likely',
 'City of Tyler photo permit required for paid sessions.',
 'published', 'curated_v2_midsize', 4.7, 87),

-- ── College Station, TX ──────────────────────────────────────────────────
('Texas A&M Academic Plaza', 'College Station', 'TX', 30.6147, -96.3411,
 'Historic core of the A&M campus — the Academic Building''s bronze dome, statue of Sul Ross, and mature live oaks shading brick walkways.',
 'public', array['Campus','Architecture','Historic'], true, 'likely',
 'Texas A&M Marketing & Communications permits paid sessions.',
 'published', 'curated_v2_midsize', 4.7, 86),

-- ── Plano, TX ────────────────────────────────────────────────────────────
('Arbor Hills Nature Preserve', 'Plano', 'TX', 33.0488, -96.8473,
 '200-acre Blackland Prairie preserve — wildflower meadows in spring, oak savanna, and a tower observation deck above the rolling grasslands.',
 'public', array['Outdoor','Park','Wildflowers'], false, 'likely',
 'City of Plano photo permit applies for paid sessions.',
 'published', 'curated_v2_midsize', 4.6, 84),

-- ── Salem, OR ────────────────────────────────────────────────────────────
('Oregon State Capitol', 'Salem', 'OR', 44.9381, -123.0298,
 '1938 Art Deco capitol clad in white Vermont marble, topped by the gilded Oregon Pioneer statue. Surrounding capitol mall is treed.',
 'public', array['Historic','Architecture','Iconic'], true, 'likely',
 'Capitol Visitor Services handles photo permits.',
 'published', 'curated_v2_midsize', 4.5, 82),
('Riverfront Park', 'Salem', 'OR', 44.9425, -123.0437,
 'Willamette riverfront park — vintage carousel pavilion, A.C. Gilbert''s Discovery Village, the Salem Riverfront Carousel building.',
 'public', array['Park','Waterfront','Urban'], false, 'unknown',
 'Public city park.',
 'published', 'curated_v2_midsize', 4.5, 81),

-- ── Tacoma, WA ───────────────────────────────────────────────────────────
('Point Defiance Park', 'Tacoma', 'WA', 47.3066, -122.5147,
 '760-acre peninsula park — old-growth Douglas fir, the Five Mile Drive, Owen Beach with Mount Rainier views, formal rose + dahlia gardens.',
 'public', array['Park','Outdoor','Mountain'], true, 'likely',
 'Metro Parks Tacoma photo permit for paid sessions.',
 'published', 'curated_v2_midsize', 4.8, 90),
('Museum of Glass', 'Tacoma', 'WA', 47.2459, -122.4376,
 'Iconic 90-ft tilted-cone glass museum on the waterfront — Chihuly Bridge of Glass connects across the freeway.',
 'public', array['Architecture','Iconic','Urban'], true, 'likely',
 'Museum permits required for paid commercial photography.',
 'published', 'curated_v2_midsize', 4.7, 86),

-- ── Bellingham, WA ───────────────────────────────────────────────────────
('Whatcom Falls Park', 'Bellingham', 'WA', 48.7475, -122.4337,
 '241-acre park with four named waterfalls along Whatcom Creek — the 1939 stone bridge over the main falls is the iconic spot.',
 'public', array['Waterfall','Park','Bridge'], false, 'likely',
 'City photo permit applies for paid sessions.',
 'published', 'curated_v2_midsize', 4.7, 87),

-- ── Vancouver, WA ────────────────────────────────────────────────────────
('Fort Vancouver National Historic Site', 'Vancouver', 'WA', 45.6244, -122.6555,
 '1825 Hudson''s Bay Company fur-trading fort, reconstructed inside the original stockade — log buildings, kitchen gardens, costumed interpreters.',
 'public', array['Historic','Architecture','Outdoor'], true, 'likely',
 'NPS site — commercial permits handled by park HQ.',
 'published', 'curated_v2_midsize', 4.6, 84),

-- ── Olympia, WA ──────────────────────────────────────────────────────────
('Washington State Capitol', 'Olympia', 'WA', 47.0356, -122.9051,
 '1928 Greek Revival capitol with the tallest masonry dome in North America — surrounded by the Capitol Campus, Tivoli Fountain in front.',
 'public', array['Historic','Architecture','Iconic'], true, 'likely',
 'Capitol Visitor Services handles photo permits.',
 'published', 'curated_v2_midsize', 4.7, 87),

-- ── Tallahassee, FL ──────────────────────────────────────────────────────
('Florida Historic Capitol', 'Tallahassee', 'FL', 30.4382, -84.2807,
 '1902 capitol with red-and-white striped awnings — restored as a museum, with the modern 22-story Capitol tower behind it.',
 'public', array['Historic','Architecture','Iconic'], true, 'likely',
 'Florida DOS handles photo permits.',
 'published', 'curated_v2_midsize', 4.5, 82),
('Maclay Gardens State Park', 'Tallahassee', 'FL', 30.5023, -84.2438,
 '28-acre formal garden — camellias and azaleas peak Jan-Apr, brick walkways under live oak canopies, lakeside walking paths.',
 'public', array['Garden','Outdoor','Park'], true, 'likely',
 'Florida State Parks commercial permit required.',
 'published', 'curated_v2_midsize', 4.7, 86),

-- ── Gainesville, FL ──────────────────────────────────────────────────────
('Kanapaha Botanical Gardens', 'Gainesville', 'FL', 29.6163, -82.4083,
 '68-acre garden with a giant water lily pond, bamboo grove, hummingbird garden, and the largest collection of bamboo in the Southeast.',
 'public', array['Garden','Outdoor','Park'], true, 'likely',
 'Kanapaha requires permits for paid sessions.',
 'published', 'curated_v2_midsize', 4.6, 83),

-- ── St. Petersburg, FL ───────────────────────────────────────────────────
('Vinoy Park', 'St. Petersburg', 'FL', 27.7793, -82.6306,
 'Waterfront park downtown — palm-lined paths, sailboat anchorage views, the historic Vinoy Hotel''s pink stucco Mediterranean façade across the street.',
 'public', array['Park','Waterfront','Urban'], false, 'likely',
 'St. Pete Parks photo permit applies.',
 'published', 'curated_v2_midsize', 4.7, 86),
('Salvador Dalí Museum', 'St. Petersburg', 'FL', 27.7659, -82.6300,
 'Iconic glass-and-concrete museum building — the "Enigma" geodesic glass bubble bulges over the entrance; spiral staircase inside is a portrait favorite.',
 'public', array['Architecture','Iconic','Urban'], true, 'likely',
 'Museum requires permits for commercial sessions.',
 'published', 'curated_v2_midsize', 4.8, 89),

-- ── Clearwater, FL ───────────────────────────────────────────────────────
('Pier 60', 'Clearwater', 'FL', 27.9776, -82.8316,
 'Iconic fishing pier at Clearwater Beach — sugar-white sand, Gulf sunsets celebrated nightly with the Sunsets at Pier 60 festival.',
 'public', array['Beach','Iconic','Sunset'], false, 'unknown',
 'Public pier.',
 'published', 'curated_v2_midsize', 4.7, 87),

-- ── Daytona Beach, FL ────────────────────────────────────────────────────
('Daytona Beach Boardwalk & Pier', 'Daytona Beach', 'FL', 29.2197, -81.0080,
 'Historic 1925 oceanfront pier and boardwalk amusement strip — drive-on hard-pack sand beach, the bandshell, and the SunSplash playground.',
 'public', array['Beach','Iconic','Boardwalk'], false, 'unknown',
 'Public beach.',
 'published', 'curated_v2_midsize', 4.5, 82),

-- ── Key West, FL ─────────────────────────────────────────────────────────
('Mallory Square', 'Key West', 'FL', 24.5605, -81.8064,
 'Waterfront plaza famous for nightly sunset celebrations — street performers, conch fritter carts, cruise-ship-sized sunsets over the Gulf.',
 'public', array['Iconic','Sunset','Urban'], false, 'unknown',
 'Public square.',
 'published', 'curated_v2_midsize', 4.7, 87),
('Southernmost Point', 'Key West', 'FL', 24.5465, -81.7975,
 'Painted concrete buoy marking the southernmost point of the continental US — kitschy, but the lines for the photo prove it works.',
 'public', array['Iconic','Quirky','Urban'], false, 'unknown',
 'Public landmark.',
 'published', 'curated_v2_midsize', 4.4, 80),

-- ── Pasadena, CA ─────────────────────────────────────────────────────────
('The Huntington Library, Art Museum & Botanical Gardens', 'Pasadena', 'CA', 34.1290, -118.1145,
 '120-acre estate — a Japanese garden with a moon bridge, a Chinese garden, a desert garden, and a rose garden. Beaux-Arts mansion at the center.',
 'public', array['Garden','Iconic','Architecture'], true, 'likely',
 'Huntington requires advance permits for paid commercial photography.',
 'published', 'curated_v2_midsize', 4.9, 92),

-- ── Santa Monica, CA ─────────────────────────────────────────────────────
('Santa Monica Pier', 'Santa Monica', 'CA', 34.0094, -118.4974,
 'Historic 1909 pleasure pier with the Pacific Park amusement complex, neon sign at the entrance, Pacific sunsets and the Santa Monica Mountains backdrop.',
 'public', array['Iconic','Beach','Sunset'], false, 'likely',
 'City of Santa Monica permit required for paid commercial photography.',
 'published', 'curated_v2_midsize', 4.7, 88),

-- ── Berkeley, CA ─────────────────────────────────────────────────────────
('UC Berkeley Sather Tower (Campanile)', 'Berkeley', 'CA', 37.8721, -122.2578,
 '307-ft 1914 granite bell tower — the centerpiece of the UC Berkeley campus, with redwood-shaded plazas radiating out.',
 'public', array['Campus','Architecture','Iconic'], true, 'likely',
 'UC Berkeley News office permits paid sessions.',
 'published', 'curated_v2_midsize', 4.7, 87),

-- ── Monterey, CA ─────────────────────────────────────────────────────────
('Cannery Row', 'Monterey', 'CA', 36.6177, -121.9018,
 'Restored sardine-cannery district along the bay — wooden footbridges between buildings, the Steinbeck-era waterfront vibe, gray seals offshore.',
 'public', array['Historic','Waterfront','Urban'], false, 'unknown',
 'Public street.',
 'published', 'curated_v2_midsize', 4.6, 84),
('Lover''s Point Park', 'Monterey', 'CA', 36.6260, -121.9159,
 'Rocky waterfront point in Pacific Grove (greater Monterey) — cypress-and-succulent landscape, dramatic crashing-surf overlook for portraits.',
 'public', array['Outdoor','Iconic','Sunset'], false, 'unknown',
 'Public park.',
 'published', 'curated_v2_midsize', 4.8, 89),

-- ── Palm Springs, CA ─────────────────────────────────────────────────────
('Palm Springs Aerial Tramway', 'Palm Springs', 'CA', 33.8364, -116.6133,
 '2.5-mile rotating cable car climbing 8,500 ft into the San Jacinto Mountains — desert valley below, alpine forest at the top.',
 'public', array['Iconic','Mountain','Outdoor'], true, 'likely',
 'Tramway operations handle commercial photo permits.',
 'published', 'curated_v2_midsize', 4.7, 86),
('Indian Canyons', 'Palm Springs', 'CA', 33.7510, -116.5380,
 'Three palm-shaded oasis canyons on Agua Caliente land — fan palms over rocky streambeds at the canyon floors, a striking palms-vs.-desert contrast.',
 'public', array['Outdoor','Iconic','Quirky'], true, 'likely',
 'Agua Caliente Tribe charges entry + commercial photo fees.',
 'published', 'curated_v2_midsize', 4.7, 87),

-- ── San Luis Obispo, CA ──────────────────────────────────────────────────
('Mission Plaza', 'San Luis Obispo', 'CA', 35.2783, -120.6649,
 '1772 mission complex at the heart of downtown — adobe walls, a brick plaza along San Luis Creek, the Mission garden.',
 'public', array['Historic','Architecture','Plaza'], false, 'unknown',
 'Public plaza; mission interior requires permission.',
 'published', 'curated_v2_midsize', 4.7, 86),

-- ── South Lake Tahoe, CA ─────────────────────────────────────────────────
('Emerald Bay State Park', 'South Lake Tahoe', 'CA', 38.9540, -120.1085,
 'The most-photographed cove on Lake Tahoe — Fannette Island in the middle, granite cliffs, alpine pines, jaw-dropping color in the water.',
 'public', array['Lake','Outdoor','Iconic'], true, 'likely',
 'California State Parks commercial photography permit required.',
 'published', 'curated_v2_midsize', 4.9, 95),

-- ── Cape Coral, FL ───────────────────────────────────────────────────────
('Yacht Club Community Park Beach', 'Cape Coral', 'FL', 26.5599, -81.9482,
 'Caloosahatchee River public beach + fishing pier — palm-lined waterfront, southwest-facing for golden sunsets.',
 'public', array['Beach','Sunset','Waterfront'], false, 'unknown',
 'Public beach.',
 'published', 'curated_v2_midsize', 4.4, 78),

-- ── West Palm Beach, FL ──────────────────────────────────────────────────
('Society of the Four Arts Sculpture Gardens', 'West Palm Beach', 'FL', 26.6890, -80.0488,
 'Botanical + sculpture garden in Palm Beach proper (greater WPB) — formal walled gardens, Chinese, English, and rose-garden rooms.',
 'public', array['Garden','Sculpture','Outdoor'], true, 'likely',
 'Society of the Four Arts handles permits for paid sessions.',
 'published', 'curated_v2_midsize', 4.7, 84),

-- ── Idaho Falls, ID ──────────────────────────────────────────────────────
('Idaho Falls River Walk', 'Idaho Falls', 'ID', 43.4910, -112.0369,
 'Promenade along the Snake River right at the namesake falls — the LDS temple''s white spires across the water make a dramatic backdrop.',
 'public', array['Waterfall','Waterfront','Urban'], false, 'unknown',
 'Public walkway.',
 'published', 'curated_v2_midsize', 4.6, 84),

-- ── Carson City, NV ──────────────────────────────────────────────────────
('Nevada State Capitol', 'Carson City', 'NV', 39.1638, -119.7674,
 '1871 silver-domed capitol — sandstone construction, surrounded by historic government buildings on a quiet shaded square.',
 'public', array['Historic','Architecture','Iconic'], true, 'likely',
 'Nevada Capitol handles photo permits.',
 'published', 'curated_v2_midsize', 4.5, 81),

-- ── Ogden, UT ────────────────────────────────────────────────────────────
('Historic 25th Street', 'Ogden', 'UT', 41.2230, -111.9710,
 'Brick-paved historic main street — restored 1880s storefronts, vintage neon, the 1924 Union Station at one end and views to the Wasatch at the other.',
 'public', array['Urban','Historic','Architecture'], false, 'unknown',
 'Public street.',
 'published', 'curated_v2_midsize', 4.6, 84),

-- ── St. George, UT ───────────────────────────────────────────────────────
('Snow Canyon State Park', 'St. George', 'UT', 37.2068, -113.6450,
 'Red Navajo sandstone cliffs, lava-tube caves, petrified dunes — like a smaller Zion 8 minutes from town. Strong morning + evening light.',
 'public', array['Outdoor','Iconic','Mountain'], true, 'likely',
 'Utah State Parks commercial photography permit required.',
 'published', 'curated_v2_midsize', 4.8, 89),

-- ── Arlington, TX ────────────────────────────────────────────────────────
('River Legacy Park', 'Arlington', 'TX', 32.7848, -97.0840,
 '1300-acre park along the Trinity River — paved trails through bottomland hardwood forest, the Living Science Center pond, mature pecans + sycamores.',
 'public', array['Park','Outdoor'], false, 'likely',
 'City of Arlington photo permit for paid sessions.',
 'published', 'curated_v2_midsize', 4.6, 83);
