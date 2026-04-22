do $$
declare
  target_brand_id uuid;
  target_workspace_id uuid;
  rec record;
  current_project_id uuid;
  project_profile_id uuid;
  project_profile_version integer;
begin
  select b.id, b.workspace_id
  into target_brand_id, target_workspace_id
  from public.brands b
  where lower(b.name) = lower('Asteria Developers')
  limit 1;

  if target_brand_id is null then
    raise exception 'Asteria Developers brand not found';
  end if;

  for rec in
    select *
    from (
      values
        (
          'Aventis',
          'aventis',
          'Pune',
          'Tathawade',
          '2.25 & 3.25 BHK Homes',
          'launch'::public.project_stage,
          'active'::public.project_status,
          'Spacious premium homes in Tathawade inspired by BigHeartLiving.',
          jsonb_build_object(
            'tagline', 'BigHeartLiving',
            'possessionStatus', 'Current sales phase',
            'reraNumber', 'P52100080336',
            'positioning', 'Premium Tathawade homes that combine spacious layouts, smart living features, and strong West Pune connectivity.',
            'audienceSegments', jsonb_build_array('Upgraders', 'Young families', 'Working professionals'),
            'lifestyleAngle', 'Designed for buyers who want roomier homes, community amenities, and quick access to Pune''s western growth corridor.',
            'configurations', jsonb_build_array('2.25 BHK Homes', '3.25 BHK Homes'),
            'sizeRanges', jsonb_build_array(),
            'towersCount', '',
            'floorsCount', '',
            'totalUnits', '',
            'specialUnitTypes', jsonb_build_array(),
            'parkingFacts', 'Reserved parking for every home.',
            'pricingBand', 'premium',
            'startingPrice', '',
            'priceRangeByConfig', jsonb_build_array(),
            'bookingAmount', '',
            'paymentPlanSummary', '',
            'currentOffers', jsonb_build_array(),
            'financingPartners', jsonb_build_array(),
            'offerValidity', '',
            'amenities', jsonb_build_array(
              'Indoor gym',
              'Zumba / aerobics area',
              'Meditation pods',
              'Lounge area',
              'Library',
              'Creche',
              'Swimming pool at the clubhouse terrace',
              'Party lawn',
              'Garden trail',
              'Jogging track',
              'Futsal court',
              'Gazebo seating'
            ),
            'heroAmenities', jsonb_build_array(
              'Swimming pool at the clubhouse terrace',
              'Party lawn',
              'Garden trail',
              'Futsal court'
            ),
            'nearbyLandmarks', jsonb_build_array(
              'Hinjawadi',
              'Baner',
              'Wakad'
            ),
            'connectivityPoints', jsonb_build_array(
              'Mumbai-Pune Expressway',
              'Mumbai-Pune-Bangalore Highway',
              'West Pune growth corridor'
            ),
            'travelTimes', jsonb_build_array(),
            'locationAdvantages', jsonb_build_array(
              'Located in Tathawade, one of West Pune''s sought-after neighbourhoods',
              'Connects well to Hinjawadi, Baner, Wakad, and the expressway'
            ),
            'constructionStatus', 'Active residential project in Tathawade',
            'milestoneHistory', jsonb_build_array(),
            'latestUpdate', 'Official project page highlights spacious layouts, smart features, and connectivity-led living.',
            'completionWindow', '',
            'approvedClaims', jsonb_build_array(
              '2.25 & 3.25 BHK homes in Tathawade',
              'RERA registered project',
              'Smart home features and community amenities',
              'Close to Hinjawadi, Baner, Wakad, and the Mumbai-Pune Expressway'
            ),
            'bannedClaims', jsonb_build_array(
              'Guaranteed returns',
              'Assured appreciation',
              'Immediate possession'
            ),
            'legalNotes', jsonb_build_array(
              'Use RERA number P52100080336 where required',
              'Verify any pricing, availability, and offers before publishing'
            ),
            'approvalsSummary', 'RERA registered: P52100080336.',
            'credibilityFacts', jsonb_build_array(
              'Residential project by Krisala Developers',
              'Project address beside Shakai on the Mumbai-Pune-Bangalore Highway in Tathawade'
            ),
            'investorAngle', 'Tathawade''s West Pune connectivity story supports long-term buyer and investor interest.',
            'endUserAngle', 'Spacious layouts and community amenities suit families and urban upgraders seeking a better everyday living setup.',
            'keyObjections', jsonb_build_array(),
            'faqs', jsonb_build_array(
              jsonb_build_object('question', 'Where is Aventis located?', 'answer', 'Aventis is in Tathawade, beside Shakai on the Mumbai-Pune-Bangalore Highway.'),
              jsonb_build_object('question', 'What unit types are available?', 'answer', 'Aventis offers 2.25 and 3.25 BHK homes.'),
              jsonb_build_object('question', 'Is the project RERA registered?', 'answer', 'Yes. RERA No: P52100080336.')
            ),
            'actualProjectImageIds', jsonb_build_array(),
            'sampleFlatImageIds', jsonb_build_array()
          )
        ),
        (
          '41 Luxovert',
          '41-luxovert',
          'Pune',
          'Tathawade',
          '2, 3 & 4 Bed Residences',
          'launch'::public.project_stage,
          'active'::public.project_status,
          'Luxury residences in Tathawade under Krisala Classics.',
          jsonb_build_object(
            'tagline', 'IndiasFirstLuxovert',
            'possessionStatus', 'Current sales phase',
            'reraNumber', 'P52100055641',
            'positioning', 'Luxury Tathawade residences designed for ambitious buyers who want refined, design-led living with premium amenities.',
            'audienceSegments', jsonb_build_array('Luxury upgraders', 'Aspirational professionals', 'Premium homebuyers'),
            'lifestyleAngle', 'A premium lifestyle-led residential pitch centred on sophistication, ambition, and elevated daily living.',
            'configurations', jsonb_build_array('2 Bed Residences', '3 Bed Residences', '4 Bed Residences'),
            'sizeRanges', jsonb_build_array(),
            'towersCount', '',
            'floorsCount', '',
            'totalUnits', '',
            'specialUnitTypes', jsonb_build_array(),
            'parkingFacts', '',
            'pricingBand', 'luxury',
            'startingPrice', '',
            'priceRangeByConfig', jsonb_build_array(),
            'bookingAmount', '',
            'paymentPlanSummary', '',
            'currentOffers', jsonb_build_array(),
            'financingPartners', jsonb_build_array(),
            'offerValidity', '',
            'amenities', jsonb_build_array(
              'Spa',
              'Salon',
              'Mini Theatre with Open Mic Stage',
              'Library',
              'Infinity edge semi-covered swimming pool',
              'Infinity lap pool',
              'Jogging track',
              'Senior garden',
              'Multipurpose lawn',
              'Party deck with bar counter',
              'Electric car charging point',
              'Jacuzzi'
            ),
            'heroAmenities', jsonb_build_array(
              'Infinity edge semi-covered swimming pool',
              'Infinity lap pool',
              'Mini Theatre with Open Mic Stage',
              'Jacuzzi'
            ),
            'nearbyLandmarks', jsonb_build_array(
              'Sharayu Toyota',
              'Tathawade'
            ),
            'connectivityPoints', jsonb_build_array(
              'Tathawade growth corridor',
              'West Pune residential belt'
            ),
            'travelTimes', jsonb_build_array(),
            'locationAdvantages', jsonb_build_array(
              'Located in Tathawade, one of Pune''s fast-growing residential corridors',
              'Combines Krisala Classics luxury positioning with premium amenity storytelling'
            ),
            'constructionStatus', 'Active luxury residential project in Tathawade',
            'milestoneHistory', jsonb_build_array(),
            'latestUpdate', 'Official project page positions 41 Luxovert as a luxury lifestyle address under the Krisala Classics collection.',
            'completionWindow', '',
            'approvedClaims', jsonb_build_array(
              '2, 3 and 4 bed residences in Tathawade',
              'Part of the Krisala Classics collection',
              'RERA registered project',
              'Luxury lifestyle amenities including pools, spa, and mini theatre'
            ),
            'bannedClaims', jsonb_build_array(
              'Guaranteed returns',
              'Assured appreciation',
              'Immediate possession'
            ),
            'legalNotes', jsonb_build_array(
              'Use RERA number P52100055641 where required',
              'Verify any pricing, inventory, and launch offers before publishing'
            ),
            'approvalsSummary', 'RERA registered: P52100055641.',
            'credibilityFacts', jsonb_build_array(
              'Residential project by Krisala Developers',
              'Project address near Sharayu Toyota, Jeevan Nagar, Tathawade'
            ),
            'investorAngle', 'Luxury positioning in a fast-growing Tathawade micro-market supports a premium residential narrative.',
            'endUserAngle', 'Built for buyers who prioritise premium amenities, larger formats, and an elevated lifestyle-led community.',
            'keyObjections', jsonb_build_array(),
            'faqs', jsonb_build_array(
              jsonb_build_object('question', 'Where is 41 Luxovert located?', 'answer', '41 Luxovert is near Sharayu Toyota, Jeevan Nagar, Tathawade, Pune.'),
              jsonb_build_object('question', 'What unit types are available?', 'answer', '41 Luxovert offers 2, 3, and 4 bed residences.'),
              jsonb_build_object('question', 'Is the project RERA registered?', 'answer', 'Yes. RERA No: P52100055641.')
            ),
            'actualProjectImageIds', jsonb_build_array(),
            'sampleFlatImageIds', jsonb_build_array()
          )
        ),
        (
          '41 Zillenia',
          '41-zillenia',
          'Pune',
          'Punawale',
          '2 & 3 Bed Residences',
          'launch'::public.project_stage,
          'active'::public.project_status,
          'Smart-living residences in Punawale designed for the Zillenial buyer.',
          jsonb_build_object(
            'tagline', 'LIVTHE41',
            'possessionStatus', 'Current sales phase',
            'reraNumber', 'P52100051790',
            'positioning', 'A smart-living Punawale project built for forward-thinking buyers who want premium amenities, automation, and a youthful lifestyle ecosystem.',
            'audienceSegments', jsonb_build_array('Young professionals', 'First-home buyers', 'Zillenials'),
            'lifestyleAngle', 'Tech-enabled living, youthful community amenities, and a lifestyle that blends Millennial and Gen Z expectations.',
            'configurations', jsonb_build_array('2 Bed Residences', '3 Bed Residences'),
            'sizeRanges', jsonb_build_array(),
            'towersCount', '',
            'floorsCount', '',
            'totalUnits', '',
            'specialUnitTypes', jsonb_build_array(),
            'parkingFacts', 'Exclusive car parking space for every flat.',
            'pricingBand', 'upper mid',
            'startingPrice', '',
            'priceRangeByConfig', jsonb_build_array(),
            'bookingAmount', '',
            'paymentPlanSummary', '',
            'currentOffers', jsonb_build_array(),
            'financingPartners', jsonb_build_array(),
            'offerValidity', '',
            'amenities', jsonb_build_array(
              'Fully functional indoor gym',
              'Private spa',
              'Netflix room / binge watch arena / movie arena',
              'Creche',
              'Senior citizens’ area',
              'Multipurpose court',
              'Yoga and meditation zone',
              'Sky lounge bar arena',
              'Children & toddlers’ play area',
              'Kids’ pool',
              'Aroma garden',
              'Working pods',
              'Multipurpose hall'
            ),
            'heroAmenities', jsonb_build_array(
              'Sky lounge bar arena',
              'Private spa',
              'Netflix room / binge watch arena / movie arena',
              'Multipurpose court'
            ),
            'nearbyLandmarks', jsonb_build_array(
              'Punawale',
              'Cambridge International School'
            ),
            'connectivityPoints', jsonb_build_array(
              'Punawale growth corridor'
            ),
            'travelTimes', jsonb_build_array(),
            'locationAdvantages', jsonb_build_array(
              'Located in the heart of Punawale',
              'Built for a modern, tech-savvy lifestyle with strong amenity differentiation'
            ),
            'constructionStatus', 'Active residential project in Punawale',
            'milestoneHistory', jsonb_build_array(),
            'latestUpdate', 'Official project page highlights 41 Zillenia as a premium smart-living address for Zillenial buyers.',
            'completionWindow', '',
            'approvedClaims', jsonb_build_array(
              '2 & 3 bed residences in Punawale',
              'RERA registered project',
              'Smart-home inspired amenity proposition',
              'Premium apartments in Punawale designed for modern buyers'
            ),
            'bannedClaims', jsonb_build_array(
              'Guaranteed returns',
              'Assured appreciation',
              'Immediate possession'
            ),
            'legalNotes', jsonb_build_array(
              'Use RERA number P52100051790 where required',
              'Verify any pricing, inventory, and offers before publishing'
            ),
            'approvalsSummary', 'RERA registered: P52100051790.',
            'credibilityFacts', jsonb_build_array(
              'Residential project by Krisala Developers',
              'Project address on Kate Wasti Road beside Cambridge International School, Punawale'
            ),
            'investorAngle', 'Punawale''s residential growth story and smart-living differentiation support investor conversations.',
            'endUserAngle', 'Strong fit for young buyers seeking a modern, amenity-rich community with a youthful tone.',
            'keyObjections', jsonb_build_array(),
            'faqs', jsonb_build_array(
              jsonb_build_object('question', 'Where is 41 Zillenia located?', 'answer', '41 Zillenia is on Kate Wasti Road, beside Cambridge International School in Punawale, Pune.'),
              jsonb_build_object('question', 'What unit types are available?', 'answer', '41 Zillenia offers 2 and 3 bed residences.'),
              jsonb_build_object('question', 'Is the project RERA registered?', 'answer', 'Yes. RERA No: P52100051790.')
            ),
            'actualProjectImageIds', jsonb_build_array(),
            'sampleFlatImageIds', jsonb_build_array()
          )
        ),
        (
          '41 Zillenia Phase 2',
          '41-zillenia-phase-2',
          'Pune',
          'Punawale',
          'Smart Residences',
          'launch'::public.project_stage,
          'active'::public.project_status,
          'A smart residential community in Punawale focused on convenience, automation, and family-friendly living.',
          jsonb_build_object(
            'tagline', 'LIVTHE41',
            'possessionStatus', 'Current sales phase',
            'reraNumber', 'P52100078925',
            'positioning', 'A smart-living Punawale community designed for modern families and individuals who want automation, safety, and everyday convenience.',
            'audienceSegments', jsonb_build_array('Young families', 'Working professionals', 'First-home buyers'),
            'lifestyleAngle', 'Balances home automation, safety, and everyday convenience in a fast-growing Pune suburb.',
            'configurations', jsonb_build_array('Smart residences'),
            'sizeRanges', jsonb_build_array(),
            'towersCount', '',
            'floorsCount', '',
            'totalUnits', '',
            'specialUnitTypes', jsonb_build_array(),
            'parkingFacts', 'Dedicated parking for every flat.',
            'pricingBand', 'upper mid',
            'startingPrice', '',
            'priceRangeByConfig', jsonb_build_array(),
            'bookingAmount', '',
            'paymentPlanSummary', '',
            'currentOffers', jsonb_build_array(),
            'financingPartners', jsonb_build_array(),
            'offerValidity', '',
            'amenities', jsonb_build_array(
              'Clubhouse',
              'Indoor games room',
              'Multipurpose hall',
              'Yoga & meditation deck',
              'Reading corner',
              'Party lawn',
              'Gazebo seating',
              'Grand entrance plaza',
              'Kids’ play area',
              'Rainwater harvesting system',
              'Solar water heater in master bathroom',
              'Dedicated parking for every flat'
            ),
            'heroAmenities', jsonb_build_array(
              'Clubhouse',
              'Party lawn',
              'Grand entrance plaza',
              'Kids’ play area'
            ),
            'nearbyLandmarks', jsonb_build_array(
              'Punawale',
              'Cambridge International School'
            ),
            'connectivityPoints', jsonb_build_array(
              'Business hubs',
              'Educational institutions',
              'Recreational spaces around Punawale'
            ),
            'travelTimes', jsonb_build_array(),
            'locationAdvantages', jsonb_build_array(
              'Located in Punawale, a fast-growing suburb of Pune',
              'Built around smart living, safety, and convenience for families and individuals'
            ),
            'constructionStatus', 'Active residential project in Punawale',
            'milestoneHistory', jsonb_build_array(),
            'latestUpdate', 'Official project page frames 41 Zillenia Phase 2 as a smart urban community with safety-focused features and modern amenities.',
            'completionWindow', '',
            'approvedClaims', jsonb_build_array(
              'Smart residences in Punawale',
              'RERA registered project',
              'Home automation and safety-led feature set',
              'Excellent connectivity to business hubs and educational institutions'
            ),
            'bannedClaims', jsonb_build_array(
              'Guaranteed returns',
              'Assured appreciation',
              'Immediate possession'
            ),
            'legalNotes', jsonb_build_array(
              'Use RERA number P52100078925 where required',
              'Verify any pricing, inventory, and offers before publishing'
            ),
            'approvalsSummary', 'RERA registered: P52100078925.',
            'credibilityFacts', jsonb_build_array(
              'Residential project by Krisala Developers',
              'Project address on Kate Wasti Road beside Cambridge International School, Punawale'
            ),
            'investorAngle', 'Punawale''s growth corridor plus family-oriented smart-living positioning can support investor-facing narratives.',
            'endUserAngle', 'Strong fit for practical buyers who prioritise home automation, safety features, and a functional amenity mix.',
            'keyObjections', jsonb_build_array(),
            'faqs', jsonb_build_array(
              jsonb_build_object('question', 'Where is 41 Zillenia Phase 2 located?', 'answer', '41 Zillenia Phase 2 is on Kate Wasti Road, beside Cambridge International School in Punawale, Pune.'),
              jsonb_build_object('question', 'What is the project positioned around?', 'answer', 'The project is positioned around smart living, safety features, and convenient family-friendly community amenities.'),
              jsonb_build_object('question', 'Is the project RERA registered?', 'answer', 'Yes. RERA No: P52100078925.')
            ),
            'actualProjectImageIds', jsonb_build_array(),
            'sampleFlatImageIds', jsonb_build_array()
          )
        ),
        (
          '41 Cosmo NXT',
          '41-cosmo-nxt',
          'Pune',
          'Tathawade',
          '2, 2.25 & 2.75 BHK NeoCosmo Homes',
          'launch'::public.project_stage,
          'active'::public.project_status,
          'Neo-cosmopolitan residences in Tathawade built around flexible living and a +0.25 BHK proposition.',
          jsonb_build_object(
            'tagline', 'NeoCosmoHomes',
            'possessionStatus', 'Current sales phase',
            'reraNumber', 'P52100045292',
            'positioning', 'A Tathawade project for modern urban buyers who want flexible layouts, lifestyle amenities, and a neo-cosmopolitan identity.',
            'audienceSegments', jsonb_build_array('Young professionals', 'Small families', 'First-home buyers'),
            'lifestyleAngle', 'Centres on flexible everyday living, the +0.25 room story, and amenity-led community life.',
            'configurations', jsonb_build_array('2 BHK NeoCosmo Homes', '2.25 BHK NeoCosmo Homes', '2.75 BHK NeoCosmo Homes'),
            'sizeRanges', jsonb_build_array(),
            'towersCount', '',
            'floorsCount', '',
            'totalUnits', '',
            'specialUnitTypes', jsonb_build_array('+0.25 flexible room concept'),
            'parkingFacts', '',
            'pricingBand', 'upper mid',
            'startingPrice', '',
            'priceRangeByConfig', jsonb_build_array(),
            'bookingAmount', '',
            'paymentPlanSummary', '',
            'currentOffers', jsonb_build_array(),
            'financingPartners', jsonb_build_array(),
            'offerValidity', '',
            'amenities', jsonb_build_array(
              'Musical garden',
              '41 Sky Lounge Yoga',
              'Meditation zone',
              'Pet park',
              'Sky-track',
              'Pathway for walking',
              'Swimming pool with jacuzzi',
              'Outdoor exercise zone',
              'Multipurpose court',
              'Indoor games',
              'Fully functional indoor gym'
            ),
            'heroAmenities', jsonb_build_array(
              'Sky-track',
              'Swimming pool with jacuzzi',
              'Musical garden',
              'Multipurpose court'
            ),
            'nearbyLandmarks', jsonb_build_array(
              'Tathawade'
            ),
            'connectivityPoints', jsonb_build_array(
              'Hinjawadi access',
              'Wakad access',
              'West Pune residential belt'
            ),
            'travelTimes', jsonb_build_array(),
            'locationAdvantages', jsonb_build_array(
              'Located in Tathawade''s prime residential belt',
              'Designed for modern urban living with easy access toward Hinjawadi and Wakad'
            ),
            'constructionStatus', 'Active residential project in Tathawade',
            'milestoneHistory', jsonb_build_array(),
            'latestUpdate', 'Official project page highlights the +0.25 BHK concept and neo-cosmopolitan community features.',
            'completionWindow', '',
            'approvedClaims', jsonb_build_array(
              '2, 2.25 & 2.75 BHK NeoCosmo homes in Tathawade',
              'RERA registered project',
              'Flexible +0.25 room concept',
              'Lifestyle amenities including sky-track and pool with jacuzzi'
            ),
            'bannedClaims', jsonb_build_array(
              'Guaranteed returns',
              'Assured appreciation',
              'Immediate possession'
            ),
            'legalNotes', jsonb_build_array(
              'Use RERA number P52100045292 where required',
              'Verify any pricing, inventory, and offers before publishing'
            ),
            'approvalsSummary', 'RERA registered: P52100045292.',
            'credibilityFacts', jsonb_build_array(
              'Residential project by Krisala Developers',
              'Official Krisala article positions 41 Cosmo NXT in the Tathawade growth corridor with access toward Hinjawadi and Wakad'
            ),
            'investorAngle', 'Tathawade''s growth corridor and the differentiated +0.25 layout story create a sharper positioning for investor and marketing narratives.',
            'endUserAngle', 'Strong fit for buyers who want flexible extra-use space, lifestyle amenities, and a contemporary community setup.',
            'keyObjections', jsonb_build_array(),
            'faqs', jsonb_build_array(
              jsonb_build_object('question', 'Where is 41 Cosmo NXT located?', 'answer', '41 Cosmo NXT is in Tathawade, Pune.'),
              jsonb_build_object('question', 'What makes 41 Cosmo NXT different?', 'answer', 'The project is centred on a +0.25 BHK flexible-space concept for modern urban living.'),
              jsonb_build_object('question', 'Is the project RERA registered?', 'answer', 'Yes. RERA No: P52100045292.')
            ),
            'actualProjectImageIds', jsonb_build_array(),
            'sampleFlatImageIds', jsonb_build_array()
          )
        )
    ) as seed(
      name,
      slug,
      city,
      micro_location,
      project_type,
      stage,
      status,
      description,
      profile_json
    )
  loop
    select p.id
    into current_project_id
    from public.projects p
    where p.brand_id = target_brand_id
      and lower(p.name) = lower(rec.name)
    limit 1;

    if current_project_id is null then
      current_project_id := gen_random_uuid();

      insert into public.projects (
        id,
        workspace_id,
        brand_id,
        name,
        slug,
        city,
        micro_location,
        project_type,
        stage,
        status,
        description,
        current_profile_version_id,
        created_by
      ) values (
        current_project_id,
        target_workspace_id,
        target_brand_id,
        rec.name,
        rec.slug,
        rec.city,
        rec.micro_location,
        rec.project_type,
        rec.stage,
        rec.status,
        rec.description,
        null,
        null
      );
    end if;

    select coalesce(max(version_number), 0) + 1
    into project_profile_version
    from public.project_profile_versions
    where project_profile_versions.project_id = current_project_id;

    project_profile_id := gen_random_uuid();

    insert into public.project_profile_versions (
      id,
      workspace_id,
      project_id,
      version_number,
      profile_json,
      created_by
    ) values (
      project_profile_id,
      target_workspace_id,
      current_project_id,
      project_profile_version,
      rec.profile_json,
      null
    );

    update public.projects
    set
      city = rec.city,
      micro_location = rec.micro_location,
      project_type = rec.project_type,
      stage = rec.stage,
      status = rec.status,
      description = rec.description,
      current_profile_version_id = project_profile_id
    where id = current_project_id;
  end loop;
end $$;
