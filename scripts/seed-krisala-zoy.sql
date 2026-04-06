do $$
declare
  target_workspace_id uuid := 'f35bc759-576f-430a-92fa-47f27def1105';
  tower_asset_id uuid := 'f81a56bf-81d2-42c1-b9ba-6491cb6992b9';
  krisala_brand_id uuid;
  brand_profile_id uuid;
  brand_profile_version integer;
  zoy_project_id uuid;
  project_profile_id uuid;
  project_profile_version integer;
begin
  select id
  into krisala_brand_id
  from public.brands
  where workspace_id = target_workspace_id
    and lower(name) = lower('Krisala Developers')
  limit 1;

  select coalesce(max(version_number), 0) + 1
  into brand_profile_version
  from public.brand_profile_versions
  where brand_id = krisala_brand_id;

  if krisala_brand_id is null then
    krisala_brand_id := gen_random_uuid();
    brand_profile_version := 1;

    insert into public.brands (
      id,
      workspace_id,
      name,
      slug,
      description,
      current_profile_version_id,
      created_by
    ) values (
      krisala_brand_id,
      target_workspace_id,
      'Krisala Developers',
      'krisala-developers',
      'Design-led residential developer in Pune creating contemporary communities in growth corridors.',
      null,
      null
    );
  end if;

  brand_profile_id := gen_random_uuid();

  insert into public.brand_profile_versions (
    id,
    workspace_id,
    brand_id,
    version_number,
    profile_json,
    created_by
  ) values (
    brand_profile_id,
    target_workspace_id,
    krisala_brand_id,
    brand_profile_version,
    jsonb_build_object(
      'identity', jsonb_build_object(
        'positioning', 'Design-led Pune developer creating premium, connected residential communities in growth corridors.',
        'promise', 'Grounded, credible communication that balances aspiration with real project truth.',
        'audienceSummary', 'Urban homebuyers, upgraders, and investors evaluating premium Pune locations.'
      ),
      'voice', jsonb_build_object(
        'summary', 'Contemporary, confident, grounded',
        'adjectives', jsonb_build_array('contemporary', 'confident', 'credible'),
        'approvedVocabulary', jsonb_build_array('connected', 'elevated', 'urban', 'lifestyle-led', 'design-led'),
        'bannedPhrases', jsonb_build_array('guaranteed returns', 'assured appreciation', 'cheap deal')
      ),
      'palette', jsonb_build_object(
        'primary', '#2f2925',
        'secondary', '#f1e7da',
        'accent', '#c9833c',
        'neutrals', jsonb_build_array('#d8c6b3', '#a69383')
      ),
      'styleDescriptors', jsonb_build_array('architectural', 'urban', 'elevated', 'warm'),
      'visualSystem', jsonb_build_object(
        'typographyMood', 'Contemporary editorial hierarchy with disciplined premium restraint.',
        'compositionPrinciples', jsonb_build_array(
          'Let architecture or context lead the frame',
          'Keep copy blocks disciplined and breathable'
        ),
        'imageTreatment', jsonb_build_array(
          'Warm urban light',
          'Premium realism',
          'Minimal brochure clutter'
        ),
        'textDensity', 'balanced',
        'realismLevel', 'elevated_real'
      ),
      'doRules', jsonb_build_array(
        'Ground every visual in project truth',
        'Show connected urban lifestyle without shouting',
        'Keep layouts premium and uncluttered'
      ),
      'dontRules', jsonb_build_array(
        'No pushy discount-led tone',
        'No generic SaaS style visuals'
      ),
      'bannedPatterns', jsonb_build_array(
        'cheap brochure clutter',
        'neon tech gradients',
        'meme-like layouts'
      ),
      'compliance', jsonb_build_object(
        'bannedClaims', jsonb_build_array('guaranteed returns', 'assured appreciation'),
        'reviewChecks', jsonb_build_array(
          'Verify all project facts before publishing',
          'Keep tone premium and credible'
        )
      ),
      'referenceAssetIds', jsonb_build_array(),
      'referenceCanon', jsonb_build_object(
        'antiReferenceNotes', jsonb_build_array(
          'Avoid low-trust brochure density',
          'Avoid loud discount-first visuals'
        ),
        'usageNotes', jsonb_build_array(
          'Prefer real project imagery before generic architecture',
          'Use lifestyle cues to support project truth, not replace it'
        )
      )
    ),
    null
  );

  update public.brands
  set
    description = 'Design-led residential developer in Pune creating contemporary communities in growth corridors.',
    current_profile_version_id = brand_profile_id
  where id = krisala_brand_id;

  select id
  into zoy_project_id
  from public.projects
  where brand_id = krisala_brand_id
    and lower(name) = lower('Zoy+')
  limit 1;

  if zoy_project_id is null then
    zoy_project_id := gen_random_uuid();

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
      zoy_project_id,
      target_workspace_id,
      krisala_brand_id,
      'Zoy+',
      'zoy-plus',
      'Pune',
      'Hinjawadi Phase 1',
      '2 & 3 Bed Residences',
      'launch',
      'active',
      'Premium residential address in Hinjawadi Phase 1 by Krisala Developers.',
      null,
      null
    );
  end if;

  select coalesce(max(version_number), 0) + 1
  into project_profile_version
  from public.project_profile_versions
  where project_id = zoy_project_id;

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
    zoy_project_id,
    project_profile_version,
    jsonb_build_object(
      'tagline', 'Experience a Plus Side Of Life',
      'possessionStatus', 'Launch phase',
      'reraNumber', 'PR1260002500133',
      'positioning', 'Premium Hinjawadi Phase 1 address for ambitious residents who want cosmopolitan energy, connected urban convenience, and refined design.',
      'audienceSegments', jsonb_build_array('Young professionals', 'Upgraders', 'Investors'),
      'lifestyleAngle', 'Work-life balance with urban convenience, youthful energy, and a cosmopolitan lifestyle in Pune''s IT corridor.',
      'configurations', jsonb_build_array('2 Bed Residences', '3 Bed Residences'),
      'sizeRanges', jsonb_build_array('Approx. 735 to 1195 sq ft (verify final sanctioned carpet areas)'),
      'towersCount', '2 towers',
      'floorsCount', 'G + 6P + 30 floors',
      'totalUnits', '',
      'specialUnitTypes', jsonb_build_array(),
      'parkingFacts', '',
      'pricingBand', 'premium',
      'startingPrice', 'Starts from ₹85 lakh onwards (verify current inventory)',
      'priceRangeByConfig', jsonb_build_array(),
      'bookingAmount', '',
      'paymentPlanSummary', '',
      'currentOffers', jsonb_build_array(),
      'financingPartners', jsonb_build_array(),
      'offerValidity', '',
      'amenities', jsonb_build_array(
        'Temple',
        'Multipurpose Court',
        'Box Cricket',
        '41 Pick-Up & Drop Zone',
        'Grand Entrance Lobby',
        'Digital door lock',
        'Automation / Smart Features',
        '3-tier security system with video door phone',
        'DG backups for lifts and common areas',
        'Rainwater harvesting',
        'Sewage treatment plant',
        'Solar system',
        'Garbage chute'
      ),
      'heroAmenities', jsonb_build_array(
        'Grand Entrance Lobby',
        'Multipurpose Court',
        'Box Cricket',
        '3-tier security system with video door phone'
      ),
      'nearbyLandmarks', jsonb_build_array(
        'Pall Corporation',
        'Rajiv Gandhi Info-tech Park',
        'Phoenix Mall of the Millennium',
        'Grand High Street',
        'Radisson Blu',
        'Hilton Garden Inn'
      ),
      'connectivityPoints', jsonb_build_array(
        'Upcoming Hinjawadi Metro Station on Line 3',
        'Mumbai-Pune Expressway',
        'Pune-Bengaluru Highway',
        'Proposed Ring Road',
        'Access route toward Navi Mumbai Airport via new road'
      ),
      'travelTimes', jsonb_build_array(
        '5 minutes from the upcoming Hinjawadi Metro Station on Line 3',
        'Minutes away from Wakad, Baner, and PCMC'
      ),
      'locationAdvantages', jsonb_build_array(
        'Located in Hinjawadi Phase 1 near major educational and IT hubs',
        'Built for a glocal, cosmopolitan lifestyle',
        'Strong infrastructure story through metro and ring-road proximity'
      ),
      'constructionStatus', 'Launch phase',
      'milestoneHistory', jsonb_build_array(
        'Krisala''s inaugural residential launch in Hinjawadi Phase 1'
      ),
      'latestUpdate', 'Residential launch now open in Hinjawadi Phase 1.',
      'completionWindow', '',
      'approvedClaims', jsonb_build_array(
        'Premium address in Hinjawadi Phase 1',
        '5 minutes from the upcoming Hinjawadi Metro Station on Line 3',
        '2 & 3 bed residences by Krisala Developers',
        'Designed for work-life balance and cosmopolitan living'
      ),
      'bannedClaims', jsonb_build_array(
        'Guaranteed returns',
        'Assured appreciation',
        'Immediate possession'
      ),
      'legalNotes', jsonb_build_array(
        'Verify current pricing and inventory before using commercial copy',
        'Use RERA number PR1260002500133 where regulated communication requires it'
      ),
      'approvalsSummary', 'RERA registered: PR1260002500133.',
      'credibilityFacts', jsonb_build_array(
        'By Krisala Developers, a Pune and PCMC residential developer',
        'Project address beside Pall Corporation on Hinjawadi Phase 1 Road'
      ),
      'investorAngle', 'Metro-led connectivity and IT-corridor demand support the project''s growth-corridor narrative.',
      'endUserAngle', 'Built for buyers seeking work-life balance, urban convenience, and a contemporary residential community in Hinjawadi.',
      'keyObjections', jsonb_build_array(
        'Peak-hour traffic around Hinjawadi',
        'Need clarity on current pricing and possession timeline'
      ),
      'faqs', jsonb_build_array(
        jsonb_build_object(
          'question', 'Where is Zoy+ located?',
          'answer', 'Beside Pall Corporation on Hinjawadi Phase 1 Road, Rajiv Gandhi Info-tech Park, Pune 411057.'
        ),
        jsonb_build_object(
          'question', 'What unit types are available?',
          'answer', 'Zoy+ offers 2 and 3 bed residences.'
        ),
        jsonb_build_object(
          'question', 'Is the project RERA registered?',
          'answer', 'Yes. RERA No: PR1260002500133.'
        ),
        jsonb_build_object(
          'question', 'What is the strongest connectivity fact?',
          'answer', 'The project is about 5 minutes from the upcoming Hinjawadi Metro Station on Line 3.'
        )
      ),
      'actualProjectImageIds', jsonb_build_array(tower_asset_id::text),
      'sampleFlatImageIds', jsonb_build_array()
    ),
    null
  );

  update public.projects
  set
    city = 'Pune',
    micro_location = 'Hinjawadi Phase 1',
    project_type = '2 & 3 Bed Residences',
    stage = 'launch',
    status = 'active',
    description = 'Premium residential address in Hinjawadi Phase 1 by Krisala Developers.',
    current_profile_version_id = project_profile_id
  where id = zoy_project_id;

  update public.brand_assets
  set
    brand_id = krisala_brand_id,
    project_id = zoy_project_id
  where id = tower_asset_id;
end $$;
