do $$
declare
  v_brand_id uuid;
  v_workspace_id uuid;
  v_owner_user_id uuid;
  v_now timestamptz := timezone('utc', now());

  v_project_launch_post_type_id uuid;
  v_site_visit_post_type_id uuid;
  v_amenity_post_type_id uuid;
  v_location_post_type_id uuid;
  v_construction_post_type_id uuid;
  v_festive_post_type_id uuid;

  v_project_residences_id uuid;
  v_project_residences_profile_id uuid;
  v_project_heights_id uuid;
  v_project_heights_profile_id uuid;
begin
  select id, workspace_id
  into v_brand_id, v_workspace_id
  from public.brands
  where name = 'Asteria Developers'
  order by created_at asc
  limit 1;

  if v_brand_id is null then
    raise exception 'Asteria Developers brand not found. Seed the demo brand first.';
  end if;

  select user_id
  into v_owner_user_id
  from public.workspace_memberships
  where workspace_id = v_workspace_id
  order by created_at asc
  limit 1;

  select id into v_project_launch_post_type_id
  from public.post_types
  where code = 'project-launch' and (workspace_id is null or workspace_id = v_workspace_id)
  order by workspace_id nulls first
  limit 1;

  select id into v_site_visit_post_type_id
  from public.post_types
  where code = 'site-visit-invite' and (workspace_id is null or workspace_id = v_workspace_id)
  order by workspace_id nulls first
  limit 1;

  select id into v_amenity_post_type_id
  from public.post_types
  where code = 'amenity-spotlight' and (workspace_id is null or workspace_id = v_workspace_id)
  order by workspace_id nulls first
  limit 1;

  select id into v_location_post_type_id
  from public.post_types
  where code = 'location-advantage' and (workspace_id is null or workspace_id = v_workspace_id)
  order by workspace_id nulls first
  limit 1;

  select id into v_construction_post_type_id
  from public.post_types
  where code = 'construction-update' and (workspace_id is null or workspace_id = v_workspace_id)
  order by workspace_id nulls first
  limit 1;

  select id into v_festive_post_type_id
  from public.post_types
  where code = 'festive-greeting' and (workspace_id is null or workspace_id = v_workspace_id)
  order by workspace_id nulls first
  limit 1;

  if v_project_launch_post_type_id is null
    or v_site_visit_post_type_id is null
    or v_amenity_post_type_id is null
    or v_location_post_type_id is null
    or v_construction_post_type_id is null
    or v_festive_post_type_id is null then
    raise exception 'One or more system post types are missing. Seed post types before demo planning data.';
  end if;

  insert into public.brand_personas (
    id, workspace_id, brand_id, name, description, attributes_json, active, created_by
  ) values
    (
      '11111111-1111-4111-8111-111111111111',
      v_workspace_id,
      v_brand_id,
      'Luxury buyers',
      'Affluent homebuyers looking for design, exclusivity, and long-term address value.',
      jsonb_build_object('segment', 'homebuyer', 'budget', 'premium', 'priority', jsonb_build_array('design', 'location', 'brand trust')),
      true,
      v_owner_user_id
    ),
    (
      '11111111-1111-4111-8111-111111111112',
      v_workspace_id,
      v_brand_id,
      'Young families',
      'Upgrade buyers prioritizing community, amenities, safety, and long-term livability.',
      jsonb_build_object('segment', 'family', 'budget', 'upper_mid_to_premium', 'priority', jsonb_build_array('amenities', 'community', 'schools')),
      true,
      v_owner_user_id
    ),
    (
      '11111111-1111-4111-8111-111111111113',
      v_workspace_id,
      v_brand_id,
      'Investors',
      'Buyers focused on appreciation, rental demand, future infrastructure, and exit potential.',
      jsonb_build_object('segment', 'investor', 'budget', 'premium', 'priority', jsonb_build_array('micro-market growth', 'connectivity', 'brand credibility')),
      true,
      v_owner_user_id
    ),
    (
      '11111111-1111-4111-8111-111111111114',
      v_workspace_id,
      v_brand_id,
      'Channel partners',
      'Broker and partner audience that needs concise sales-ready creatives and conversion hooks.',
      jsonb_build_object('segment', 'broker', 'priority', jsonb_build_array('inventory', 'cta clarity', 'event invites')),
      true,
      v_owner_user_id
    )
  on conflict (id) do update
    set name = excluded.name,
        description = excluded.description,
        attributes_json = excluded.attributes_json,
        active = excluded.active,
        updated_at = timezone('utc', now());

  insert into public.content_pillars (
    id, workspace_id, brand_id, code, name, description, active, created_by
  ) values
    (
      '22222222-2222-4222-8222-222222222221',
      v_workspace_id,
      v_brand_id,
      'project-promotion',
      'Project promotion',
      'Project-led content focused on launch, positioning, visits, and conversion.',
      true,
      v_owner_user_id
    ),
    (
      '22222222-2222-4222-8222-222222222222',
      v_workspace_id,
      v_brand_id,
      'lifestyle-amenities',
      'Lifestyle & amenities',
      'Creative highlighting amenities, daily life, and community quality.',
      true,
      v_owner_user_id
    ),
    (
      '22222222-2222-4222-8222-222222222223',
      v_workspace_id,
      v_brand_id,
      'trust-credibility',
      'Trust & credibility',
      'Construction updates, delivery proof, and trust-building communication.',
      true,
      v_owner_user_id
    ),
    (
      '22222222-2222-4222-8222-222222222224',
      v_workspace_id,
      v_brand_id,
      'buyer-education',
      'Buyer education',
      'Guidance-led content on localities, buying decisions, and market understanding.',
      true,
      v_owner_user_id
    ),
    (
      '22222222-2222-4222-8222-222222222225',
      v_workspace_id,
      v_brand_id,
      'festive-moments',
      'Festive moments',
      'Calendar-led creative with brand warmth and seasonal relevance.',
      true,
      v_owner_user_id
    )
  on conflict (brand_id, code) do update
    set name = excluded.name,
        description = excluded.description,
        active = excluded.active,
        updated_at = timezone('utc', now());

  insert into public.channel_accounts (
    id, workspace_id, brand_id, platform, handle, display_name, timezone, external_account_id, config_json, active, created_by
  ) values
    (
      '33333333-3333-4333-8333-333333333331',
      v_workspace_id,
      v_brand_id,
      'instagram',
      '@asteria.developers',
      'Asteria Developers Instagram',
      'Asia/Kolkata',
      null,
      jsonb_build_object('defaultPlacement', 'instagram-feed', 'defaultFormats', jsonb_build_array('square', 'portrait', 'story')),
      true,
      v_owner_user_id
    ),
    (
      '33333333-3333-4333-8333-333333333332',
      v_workspace_id,
      v_brand_id,
      'facebook',
      'Asteria Developers',
      'Asteria Developers Facebook',
      'Asia/Kolkata',
      null,
      jsonb_build_object('defaultPlacement', 'ad-creative', 'defaultFormats', jsonb_build_array('square', 'portrait')),
      true,
      v_owner_user_id
    ),
    (
      '33333333-3333-4333-8333-333333333333',
      v_workspace_id,
      v_brand_id,
      'linkedin',
      'asteria-developers',
      'Asteria Developers LinkedIn',
      'Asia/Kolkata',
      null,
      jsonb_build_object('defaultPlacement', 'linkedin-feed', 'defaultFormats', jsonb_build_array('landscape', 'square')),
      true,
      v_owner_user_id
    )
  on conflict (id) do update
    set platform = excluded.platform,
        handle = excluded.handle,
        display_name = excluded.display_name,
        timezone = excluded.timezone,
        config_json = excluded.config_json,
        active = excluded.active,
        updated_at = timezone('utc', now());

  insert into public.projects (
    id, workspace_id, brand_id, name, slug, city, micro_location, project_type, stage, status, description, created_by
  )
  values (
    '44444444-4444-4444-8444-444444444441',
    v_workspace_id,
    v_brand_id,
    'Asteria Residences',
    'asteria-residences',
    'Ahmedabad',
    'South Bopal',
    'Luxury residences',
    'launch',
    'active',
    'Flagship premium residential development positioned around architecture, clubhouse lifestyle, and site-visit conversion.',
    v_owner_user_id
  )
  on conflict (workspace_id, slug) do update
    set name = excluded.name,
        city = excluded.city,
        micro_location = excluded.micro_location,
        project_type = excluded.project_type,
        stage = excluded.stage,
        status = excluded.status,
        description = excluded.description,
        updated_at = timezone('utc', now())
  returning id into v_project_residences_id;

  insert into public.project_profile_versions (
    id, workspace_id, project_id, version_number, profile_json, created_by
  )
  values (
    '55555555-5555-4555-8555-555555555551',
    v_workspace_id,
    v_project_residences_id,
    1,
    jsonb_build_object(
      'positioning', 'A landmark premium residential address for buyers who care about architecture, calm luxury, and long-term credibility.',
      'audience', jsonb_build_array('Luxury buyers', 'Young families', 'Investors'),
      'amenities', jsonb_build_array('clubhouse', 'landscape garden', 'fitness studio', 'kids play zone', 'business lounge'),
      'approvedClaims', jsonb_build_array('premium residences', 'thoughtful amenities', 'strong micro-market location', 'site visits open'),
      'bannedClaims', jsonb_build_array('guaranteed returns', 'lowest price in the city', 'instant possession'),
      'pricingBand', 'premium',
      'ctaStyle', 'Concise, premium, site-visit-led',
      'legalNotes', jsonb_build_array('Avoid absolute investment claims', 'Do not imply guaranteed approvals or returns'),
      'visualKeywords', jsonb_build_array('sunlit architecture', 'warm neutrals', 'premium facade', 'clean overlays'),
      'referenceAssetIds', jsonb_build_array()
    ),
    v_owner_user_id
  )
  on conflict (project_id, version_number) do update
    set profile_json = excluded.profile_json,
        updated_at = timezone('utc', now())
  returning id into v_project_residences_profile_id;

  update public.projects
  set current_profile_version_id = v_project_residences_profile_id,
      updated_at = timezone('utc', now())
  where id = v_project_residences_id;

  insert into public.projects (
    id, workspace_id, brand_id, name, slug, city, micro_location, project_type, stage, status, description, created_by
  )
  values (
    '44444444-4444-4444-8444-444444444442',
    v_workspace_id,
    v_brand_id,
    'Asteria Heights',
    'asteria-heights',
    'Ahmedabad',
    'Thaltej',
    'Premium family residences',
    'under_construction',
    'active',
    'Family-led premium community focused on open space, daily convenience, and construction credibility.',
    v_owner_user_id
  )
  on conflict (workspace_id, slug) do update
    set name = excluded.name,
        city = excluded.city,
        micro_location = excluded.micro_location,
        project_type = excluded.project_type,
        stage = excluded.stage,
        status = excluded.status,
        description = excluded.description,
        updated_at = timezone('utc', now())
  returning id into v_project_heights_id;

  insert into public.project_profile_versions (
    id, workspace_id, project_id, version_number, profile_json, created_by
  )
  values (
    '55555555-5555-4555-8555-555555555552',
    v_workspace_id,
    v_project_heights_id,
    1,
    jsonb_build_object(
      'positioning', 'A premium family community with strong livability cues, warm amenities, and construction trust.',
      'audience', jsonb_build_array('Young families', 'Investors'),
      'amenities', jsonb_build_array('podium garden', 'indoor games', 'multipurpose hall', 'jogging track'),
      'approvedClaims', jsonb_build_array('family-led planning', 'construction progress updates', 'premium community living'),
      'bannedClaims', jsonb_build_array('guaranteed handover dates', 'best returns in the market'),
      'pricingBand', 'upper_mid_to_premium',
      'ctaStyle', 'Grounded and reassuring',
      'legalNotes', jsonb_build_array('Keep timeline statements factual', 'Avoid over-committing on approvals'),
      'visualKeywords', jsonb_build_array('construction details', 'warm dusk', 'family amenity cues', 'clean progress storytelling'),
      'referenceAssetIds', jsonb_build_array()
    ),
    v_owner_user_id
  )
  on conflict (project_id, version_number) do update
    set profile_json = excluded.profile_json,
        updated_at = timezone('utc', now())
  returning id into v_project_heights_profile_id;

  update public.projects
  set current_profile_version_id = v_project_heights_profile_id,
      updated_at = timezone('utc', now())
  where id = v_project_heights_id;

  insert into public.creative_templates (
    id, workspace_id, brand_id, project_id, post_type_id, name, status, channel, format, base_prompt, template_json, preview_storage_path, created_from_output_id, created_by
  ) values
    (
      '66666666-6666-4666-8666-666666666661',
      v_workspace_id,
      v_brand_id,
      v_project_residences_id,
      v_project_launch_post_type_id,
      'Project launch · editorial static',
      'approved',
      'instagram-feed',
      'square',
      'Create a premium editorial launch creative for a landmark residential project. Highlight facade geometry, warm natural light, and a poised headline area.',
      jsonb_build_object(
        'promptScaffold', 'Premium launch post for {project_name}. Focus on architecture, clarity, and an aspirational tone without looking like a generic brochure.',
        'safeZoneNotes', jsonb_build_array('Reserve the upper third for project name and headline', 'Keep CTA in a slim lower strip'),
        'approvedUseCases', jsonb_build_array('Project launch', 'Launch countdown', 'Launch burst creative'),
        'notes', jsonb_build_array('Avoid cluttered brochure layouts', 'Keep overlay count low'),
        'textZones', jsonb_build_array(
          jsonb_build_object('name', 'project-name', 'guidance', 'Slim top strip'),
          jsonb_build_object('name', 'headline', 'guidance', 'Main central copy block'),
          jsonb_build_object('name', 'cta', 'guidance', 'Lower edge or corner')
        )
      ),
      null,
      null,
      v_owner_user_id
    ),
    (
      '66666666-6666-4666-8666-666666666662',
      v_workspace_id,
      v_brand_id,
      v_project_residences_id,
      v_site_visit_post_type_id,
      'Site visit invite · warm conversion frame',
      'approved',
      'instagram-feed',
      'square',
      'Design a site-visit invitation creative with premium warmth, controlled urgency, and clean CTA visibility.',
      jsonb_build_object(
        'promptScaffold', 'Invite buyers to book a site visit for {project_name}. Use warm architecture-led visuals, simple CTA hierarchy, and one decisive action line.',
        'safeZoneNotes', jsonb_build_array('Keep site visit CTA prominent in lower third', 'Do not let text compete with the building frame'),
        'approvedUseCases', jsonb_build_array('Weekend site visit push', 'Site visit invite'),
        'notes', jsonb_build_array('Keep urgency elegant, not salesy'),
        'textZones', jsonb_build_array(
          jsonb_build_object('name', 'headline', 'guidance', 'Centered or upper-middle'),
          jsonb_build_object('name', 'cta', 'guidance', 'Lower third button or strip')
        )
      ),
      null,
      null,
      v_owner_user_id
    ),
    (
      '66666666-6666-4666-8666-666666666663',
      v_workspace_id,
      v_brand_id,
      v_project_residences_id,
      v_amenity_post_type_id,
      'Amenities spotlight · lifestyle editorial',
      'approved',
      'instagram-feed',
      'square',
      'Create an amenities spotlight card that feels calm, premium, and lived-in rather than brochure-heavy.',
      jsonb_build_object(
        'promptScaffold', 'Showcase one signature amenity for {project_name}. Let the visual feel spacious, warm, and lifestyle-led with restrained copy.',
        'safeZoneNotes', jsonb_build_array('Keep copy to one headline and one support line', 'Avoid dense amenity lists'),
        'approvedUseCases', jsonb_build_array('Amenities spotlight', 'Lifestyle series'),
        'notes', jsonb_build_array('Use warm human presence sparingly'),
        'textZones', jsonb_build_array(
          jsonb_build_object('name', 'headline', 'guidance', 'Upper-left or centered'),
          jsonb_build_object('name', 'support-copy', 'guidance', 'Small secondary line')
        )
      ),
      null,
      null,
      v_owner_user_id
    ),
    (
      '66666666-6666-4666-8666-666666666664',
      v_workspace_id,
      v_brand_id,
      v_project_residences_id,
      v_location_post_type_id,
      'Location advantage · trust-led landscape',
      'approved',
      'linkedin-feed',
      'landscape',
      'Build a location advantage graphic with premium restraint, clear hierarchy, and a trust-led business tone.',
      jsonb_build_object(
        'promptScaffold', 'Explain why the micro-market matters for {project_name}. Favor clarity, credibility, and compositional calm over hype.',
        'safeZoneNotes', jsonb_build_array('Keep the message inside the center band for landscape previews'),
        'approvedUseCases', jsonb_build_array('Location advantage', 'Micro-market credibility'),
        'notes', jsonb_build_array('Works well for LinkedIn and investor-facing updates'),
        'textZones', jsonb_build_array(
          jsonb_build_object('name', 'headline', 'guidance', 'Center-left'),
          jsonb_build_object('name', 'support-copy', 'guidance', 'One short proof line')
        )
      ),
      null,
      null,
      v_owner_user_id
    ),
    (
      '66666666-6666-4666-8666-666666666665',
      v_workspace_id,
      v_brand_id,
      null,
      v_festive_post_type_id,
      'Festive greeting · warm brand frame',
      'approved',
      'instagram-feed',
      'square',
      'Create a warm festive greeting rooted in premium brand tone, not loud seasonal clutter.',
      jsonb_build_object(
        'promptScaffold', 'Craft a festive greeting from Asteria Developers with warmth, elegance, and restrained seasonal cues.',
        'safeZoneNotes', jsonb_build_array('Keep the greeting central and uncluttered'),
        'approvedUseCases', jsonb_build_array('Festive greeting', 'Brand warmth moment'),
        'notes', jsonb_build_array('Use seasonal motifs sparingly'),
        'textZones', jsonb_build_array(
          jsonb_build_object('name', 'greeting', 'guidance', 'Central focal line'),
          jsonb_build_object('name', 'brand-mark', 'guidance', 'Top strip or corner')
        )
      ),
      null,
      null,
      v_owner_user_id
    )
  on conflict (id) do update
    set project_id = excluded.project_id,
        post_type_id = excluded.post_type_id,
        name = excluded.name,
        status = excluded.status,
        channel = excluded.channel,
        format = excluded.format,
        base_prompt = excluded.base_prompt,
        template_json = excluded.template_json,
        updated_at = timezone('utc', now());

  insert into public.campaigns (
    id, workspace_id, brand_id, name, objective_code, target_persona_id, primary_project_id, key_message, cta_text, start_at, end_at, owner_user_id, kpi_goal_json, status, notes_json, created_by
  ) values
    (
      '77777777-7777-4777-8777-777777777771',
      v_workspace_id,
      v_brand_id,
      'Asteria Residences Launch Burst',
      'lead_gen',
      '11111111-1111-4111-8111-111111111111',
      v_project_residences_id,
      'Position Asteria Residences as the premium architecture-led address in South Bopal and convert launch attention into qualified enquiries.',
      'Book a site visit',
      v_now + interval '1 day',
      v_now + interval '21 days',
      v_owner_user_id,
      jsonb_build_object('targetLeads', 120),
      'active',
      jsonb_build_object('seed', true, 'seedPack', 'asteria_v1'),
      v_owner_user_id
    ),
    (
      '77777777-7777-4777-8777-777777777772',
      v_workspace_id,
      v_brand_id,
      'Weekend Site Visit Push',
      'footfall',
      '11111111-1111-4111-8111-111111111112',
      v_project_residences_id,
      'Drive weekend site visits with a sharper invitation-led push across feed, stories, and paid support.',
      'Schedule your site visit',
      v_now + interval '2 days',
      v_now + interval '14 days',
      v_owner_user_id,
      jsonb_build_object('targetVisits', 40),
      'active',
      jsonb_build_object('seed', true, 'seedPack', 'asteria_v1'),
      v_owner_user_id
    )
  on conflict (id) do update
    set name = excluded.name,
        objective_code = excluded.objective_code,
        target_persona_id = excluded.target_persona_id,
        primary_project_id = excluded.primary_project_id,
        key_message = excluded.key_message,
        cta_text = excluded.cta_text,
        start_at = excluded.start_at,
        end_at = excluded.end_at,
        owner_user_id = excluded.owner_user_id,
        kpi_goal_json = excluded.kpi_goal_json,
        status = excluded.status,
        notes_json = excluded.notes_json,
        updated_at = timezone('utc', now());

  insert into public.campaign_projects (campaign_id, project_id)
  values
    ('77777777-7777-4777-8777-777777777771', v_project_residences_id),
    ('77777777-7777-4777-8777-777777777772', v_project_residences_id)
  on conflict do nothing;

  insert into public.campaign_deliverable_plans (
    id, campaign_id, name, post_type_id, template_id, channel_account_id, placement_code, content_format, objective_override, cta_override, brief_override, scheduled_offset_days, sort_order, active
  ) values
    (
      '88888888-8888-4888-8888-888888888881',
      '77777777-7777-4777-8777-777777777771',
      'Instagram launch static',
      v_project_launch_post_type_id,
      '66666666-6666-4666-8666-666666666661',
      '33333333-3333-4333-8333-333333333331',
      'instagram-feed',
      'static',
      'lead_gen',
      'Book a site visit',
      'Launch creative highlighting architecture, project name, and first site-visit invitation.',
      0,
      0,
      true
    ),
    (
      '88888888-8888-4888-8888-888888888882',
      '77777777-7777-4777-8777-777777777771',
      'Instagram story launch reminder',
      v_site_visit_post_type_id,
      '66666666-6666-4666-8666-666666666662',
      '33333333-3333-4333-8333-333333333331',
      'instagram-story',
      'story',
      'lead_gen',
      'Swipe for site visits',
      'Story-sized reminder that keeps the launch push warm and concise.',
      1,
      1,
      true
    ),
    (
      '88888888-8888-4888-8888-888888888883',
      '77777777-7777-4777-8777-777777777771',
      'LinkedIn location credibility post',
      v_location_post_type_id,
      '66666666-6666-4666-8666-666666666664',
      '33333333-3333-4333-8333-333333333333',
      'linkedin-feed',
      'static',
      'trust',
      null,
      'Professional landscape post explaining the micro-market and why the location matters.',
      2,
      2,
      true
    ),
    (
      '88888888-8888-4888-8888-888888888884',
      '77777777-7777-4777-8777-777777777772',
      'Instagram site visit invite',
      v_site_visit_post_type_id,
      '66666666-6666-4666-8666-666666666662',
      '33333333-3333-4333-8333-333333333331',
      'instagram-feed',
      'static',
      'footfall',
      'Schedule your site visit',
      'Weekend invite with premium urgency and a clear visit CTA.',
      0,
      0,
      true
    ),
    (
      '88888888-8888-4888-8888-888888888885',
      '77777777-7777-4777-8777-777777777772',
      'Instagram story weekend reminder',
      v_site_visit_post_type_id,
      '66666666-6666-4666-8666-666666666662',
      '33333333-3333-4333-8333-333333333331',
      'instagram-story',
      'story',
      'footfall',
      'Visit this weekend',
      'Short story reminder built for quick action.',
      0,
      1,
      true
    ),
    (
      '88888888-8888-4888-8888-888888888886',
      '77777777-7777-4777-8777-777777777772',
      'Paid ad creative for site visits',
      v_site_visit_post_type_id,
      '66666666-6666-4666-8666-666666666662',
      '33333333-3333-4333-8333-333333333332',
      'ad-creative',
      'static',
      'lead_gen',
      'Book your visit',
      'Paid social variation optimized for mobile-first lead generation.',
      1,
      2,
      true
    )
  on conflict (id) do update
    set name = excluded.name,
        post_type_id = excluded.post_type_id,
        template_id = excluded.template_id,
        channel_account_id = excluded.channel_account_id,
        placement_code = excluded.placement_code,
        content_format = excluded.content_format,
        objective_override = excluded.objective_override,
        cta_override = excluded.cta_override,
        brief_override = excluded.brief_override,
        scheduled_offset_days = excluded.scheduled_offset_days,
        sort_order = excluded.sort_order,
        active = excluded.active,
        updated_at = timezone('utc', now());

  insert into public.deliverables (
    id, workspace_id, brand_id, project_id, campaign_id, persona_id, content_pillar_id, post_type_id, creative_template_id, channel_account_id, objective_code, placement_code, content_format, title, brief_text, cta_text, scheduled_for, due_at, owner_user_id, priority, status, source_json, created_by
  ) values
    (
      '99999999-9999-4999-8999-999999999991',
      v_workspace_id,
      v_brand_id,
      v_project_residences_id,
      '77777777-7777-4777-8777-777777777771',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222221',
      v_project_launch_post_type_id,
      '66666666-6666-4666-8666-666666666661',
      '33333333-3333-4333-8333-333333333331',
      'lead_gen',
      'instagram-feed',
      'static',
      'Asteria Residences launch hero',
      'Launch creative focused on facade quality, premium materials, and a clear site-visit invitation for the flagship project.',
      'Book a site visit',
      v_now + interval '1 day',
      v_now + interval '2 days',
      v_owner_user_id,
      'high',
      'brief_ready',
      jsonb_build_object('seed', true, 'seedPack', 'asteria_v1', 'creativeFormat', 'square', 'origin', 'campaign-materialized'),
      v_owner_user_id
    ),
    (
      '99999999-9999-4999-8999-999999999992',
      v_workspace_id,
      v_brand_id,
      v_project_residences_id,
      '77777777-7777-4777-8777-777777777772',
      '11111111-1111-4111-8111-111111111112',
      '22222222-2222-4222-8222-222222222221',
      v_site_visit_post_type_id,
      '66666666-6666-4666-8666-666666666662',
      '33333333-3333-4333-8333-333333333331',
      'footfall',
      'instagram-feed',
      'static',
      'Weekend site visit invite',
      'Use a premium invitation-led frame to drive qualified weekend walk-ins without feeling like a discount ad.',
      'Schedule your site visit',
      v_now + interval '2 days',
      v_now + interval '3 days',
      v_owner_user_id,
      'urgent',
      'planned',
      jsonb_build_object('seed', true, 'seedPack', 'asteria_v1', 'creativeFormat', 'square', 'origin', 'campaign-materialized'),
      v_owner_user_id
    ),
    (
      '99999999-9999-4999-8999-999999999993',
      v_workspace_id,
      v_brand_id,
      v_project_residences_id,
      '77777777-7777-4777-8777-777777777772',
      '11111111-1111-4111-8111-111111111112',
      '22222222-2222-4222-8222-222222222221',
      v_site_visit_post_type_id,
      '66666666-6666-4666-8666-666666666662',
      '33333333-3333-4333-8333-333333333331',
      'footfall',
      'instagram-story',
      'story',
      'Weekend story reminder',
      'Create a full-screen vertical reminder with a single action line and clean booking prompt for weekend visits.',
      'Visit this weekend',
      v_now + interval '2 days' + interval '3 hours',
      v_now + interval '3 days',
      v_owner_user_id,
      'high',
      'planned',
      jsonb_build_object('seed', true, 'seedPack', 'asteria_v1', 'creativeFormat', 'story', 'origin', 'campaign-materialized'),
      v_owner_user_id
    ),
    (
      '99999999-9999-4999-8999-999999999994',
      v_workspace_id,
      v_brand_id,
      v_project_residences_id,
      null,
      '11111111-1111-4111-8111-111111111112',
      '22222222-2222-4222-8222-222222222222',
      v_amenity_post_type_id,
      '66666666-6666-4666-8666-666666666663',
      '33333333-3333-4333-8333-333333333331',
      'awareness',
      'instagram-feed',
      'static',
      'Clubhouse amenities spotlight',
      'Spotlight the clubhouse as the social heart of the project with a warm, premium, family-friendly composition.',
      'Explore the amenities',
      v_now + interval '4 days',
      v_now + interval '5 days',
      v_owner_user_id,
      'normal',
      'brief_ready',
      jsonb_build_object('seed', true, 'seedPack', 'asteria_v1', 'creativeFormat', 'square', 'origin', 'editorial-series'),
      v_owner_user_id
    ),
    (
      '99999999-9999-4999-8999-999999999995',
      v_workspace_id,
      v_brand_id,
      v_project_residences_id,
      '77777777-7777-4777-8777-777777777771',
      '11111111-1111-4111-8111-111111111113',
      '22222222-2222-4222-8222-222222222224',
      v_location_post_type_id,
      '66666666-6666-4666-8666-666666666664',
      '33333333-3333-4333-8333-333333333333',
      'trust',
      'linkedin-feed',
      'static',
      'South Bopal location advantage',
      'Explain why the micro-market matters for both end-users and investors using a clean, credibility-led landscape layout.',
      null,
      v_now + interval '5 days',
      v_now + interval '6 days',
      v_owner_user_id,
      'normal',
      'planned',
      jsonb_build_object('seed', true, 'seedPack', 'asteria_v1', 'creativeFormat', 'landscape', 'origin', 'campaign-materialized'),
      v_owner_user_id
    ),
    (
      '99999999-9999-4999-8999-999999999996',
      v_workspace_id,
      v_brand_id,
      v_project_heights_id,
      null,
      '11111111-1111-4111-8111-111111111113',
      '22222222-2222-4222-8222-222222222223',
      v_construction_post_type_id,
      null,
      '33333333-3333-4333-8333-333333333331',
      'trust',
      'instagram-feed',
      'static',
      'Asteria Heights construction update',
      'Show factual construction progress with reassuring tone, clean architecture framing, and no exaggerated completion claims.',
      'Track the progress',
      v_now + interval '6 days',
      v_now + interval '7 days',
      v_owner_user_id,
      'normal',
      'brief_ready',
      jsonb_build_object('seed', true, 'seedPack', 'asteria_v1', 'creativeFormat', 'square', 'origin', 'trust-layer'),
      v_owner_user_id
    ),
    (
      '99999999-9999-4999-8999-999999999997',
      v_workspace_id,
      v_brand_id,
      v_project_residences_id,
      null,
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222225',
      v_festive_post_type_id,
      '66666666-6666-4666-8666-666666666665',
      '33333333-3333-4333-8333-333333333331',
      'engagement',
      'instagram-feed',
      'static',
      'Festive greeting from Asteria Developers',
      'Create a warm seasonal greeting that stays elegant and brand-led rather than loud or cluttered.',
      null,
      v_now + interval '7 days',
      v_now + interval '8 days',
      v_owner_user_id,
      'low',
      'planned',
      jsonb_build_object('seed', true, 'seedPack', 'asteria_v1', 'creativeFormat', 'square', 'origin', 'brand-calendar'),
      v_owner_user_id
    ),
    (
      '99999999-9999-4999-8999-999999999998',
      v_workspace_id,
      v_brand_id,
      v_project_residences_id,
      '77777777-7777-4777-8777-777777777771',
      '11111111-1111-4111-8111-111111111113',
      '22222222-2222-4222-8222-222222222221',
      v_site_visit_post_type_id,
      '66666666-6666-4666-8666-666666666662',
      '33333333-3333-4333-8333-333333333332',
      'lead_gen',
      'ad-creative',
      'static',
      'Launch burst paid creative',
      'Paid-mobile variation of the launch push with concise headline hierarchy and a strong enquiry-led CTA.',
      'Book a site visit',
      v_now + interval '3 days',
      v_now + interval '4 days',
      v_owner_user_id,
      'high',
      'planned',
      jsonb_build_object('seed', true, 'seedPack', 'asteria_v1', 'creativeFormat', 'portrait', 'origin', 'campaign-materialized'),
      v_owner_user_id
    )
  on conflict (id) do update
    set project_id = excluded.project_id,
        campaign_id = excluded.campaign_id,
        persona_id = excluded.persona_id,
        content_pillar_id = excluded.content_pillar_id,
        post_type_id = excluded.post_type_id,
        creative_template_id = excluded.creative_template_id,
        channel_account_id = excluded.channel_account_id,
        objective_code = excluded.objective_code,
        placement_code = excluded.placement_code,
        content_format = excluded.content_format,
        title = excluded.title,
        brief_text = excluded.brief_text,
        cta_text = excluded.cta_text,
        scheduled_for = excluded.scheduled_for,
        due_at = excluded.due_at,
        owner_user_id = excluded.owner_user_id,
        priority = excluded.priority,
        status = excluded.status,
        source_json = excluded.source_json,
        updated_at = timezone('utc', now());
end
$$;
