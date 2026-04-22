begin;

create temporary table seed_templates (
  code text primary key,
  name text not null,
  post_type_code text not null,
  channel text not null,
  format text not null,
  preview_storage_path text not null,
  base_prompt text not null,
  template_family text not null,
  notes jsonb not null,
  text_zones jsonb not null
) on commit drop;

insert into seed_templates (code, name, post_type_code, channel, format, preview_storage_path, base_prompt, template_family, notes, text_zones)
values
  (
    'launch-portrait',
    'Project launch portrait',
    'project-launch',
    'instagram-feed',
    'portrait',
    'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/references/cdaacf97-81a2-466d-91c7-94109dbb16b2/1280w-xf-qstxv154.webp',
    'Use the project building image as the hero with premium hierarchy, restrained typography, and generous breathing space.',
    'project-launch-editorial',
    '["Strong hero image with disciplined copy hierarchy","Designed for premium residential project reveal posts"]'::jsonb,
    '[{"name":"headline","guidance":"Large hero headline zone"},{"name":"footer","guidance":"Small brand and CTA footer"}]'::jsonb
  ),
  (
    'site-visit-invite',
    'Site visit invite portrait',
    'site-visit-invite',
    'instagram-feed',
    'portrait',
    'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/outputs/851cf511-b022-45e9-920d-e8a5db3b83d1/6696890a-1644-44d0-a29a-60c93dccadfb.png',
    'Use the project image as a trust anchor and reserve a strong call-to-action block for visit information.',
    'site-visit-premium',
    '["Hero image first, invite copy second","Protect space for a prominent CTA panel"]'::jsonb,
    '[{"name":"eyebrow","guidance":"Small timing or invite label"},{"name":"cta","guidance":"Large readable invitation block"}]'::jsonb
  ),
  (
    'amenity-spotlight',
    'Amenity spotlight portrait',
    'amenity-spotlight',
    'instagram-feed',
    'portrait',
    'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/references/9388c864-d05b-45ff-99bb-62d2f12486f1/template2.png',
    'Highlight a single amenity with editorial typography and calm premium spacing.',
    'amenity-editorial',
    '["One amenity per post","Avoid collage-heavy layouts"]'::jsonb,
    '[{"name":"amenity-name","guidance":"Primary amenity headline"},{"name":"supporting-copy","guidance":"Short premium support line"}]'::jsonb
  ),
  (
    'construction-update',
    'Construction update portrait',
    'construction-update',
    'instagram-feed',
    'portrait',
    'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/project-images/2caafc00-563a-41f1-ab5d-a38ecb488a1a/luxovert.jpg',
    'Use a real project construction image with a premium data panel and a calm, progress-led hierarchy.',
    'construction-progress-panel',
    '["Real project image as the hero","Premium progress panel with clear metrics"]'::jsonb,
    '[{"name":"headline","guidance":"Progress update headline on upper left"},{"name":"metrics","guidance":"Bottom progress panel"}]'::jsonb
  ),
  (
    'festive-square',
    'Festive greeting square',
    'festive-greeting',
    'instagram-feed',
    'square',
    'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/outputs/5457483b-796d-4843-a48a-396342754e5a/1c245ad4-084a-498c-854f-a1464697e934.png',
    'Create a premium festive greeting with lots of negative space, tasteful symbolism, and a small brand signature.',
    'festive-poster-square',
    '["Brand name in text only","No logos or emblem marks"]'::jsonb,
    '[{"name":"festival-name","guidance":"Primary festive word mark"},{"name":"brand-signature","guidance":"Small footer attribution"}]'::jsonb
  ),
  (
    'festive-story',
    'Festive greeting story',
    'festive-greeting',
    'instagram-story',
    'story',
    'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/outputs/ba1179d5-7dcb-415e-9f47-addcd8b95536/00437320-27c3-48bd-902c-37c8873a4f6f.png',
    'Create a premium vertical festive greeting story with one central cultural cue and minimal copy.',
    'festive-story-poster',
    '["Vertical festive storytelling","Text-only brand signature in footer"]'::jsonb,
    '[{"name":"festival-title","guidance":"Large central festive word"},{"name":"message","guidance":"Compact blessing line"}]'::jsonb
  );

create temporary table seed_campaigns (
  code text primary key,
  name text not null,
  status public.campaign_status not null,
  objective_code public.objective_code not null,
  target_persona_name text,
  primary_project_name text,
  project_names text[] not null,
  key_message text not null,
  cta_text text,
  start_at timestamptz,
  end_at timestamptz,
  kpi_goal_json jsonb not null,
  notes_json jsonb not null
) on commit drop;

insert into seed_campaigns
  (code, name, status, objective_code, target_persona_name, primary_project_name, project_names, key_message, cta_text, start_at, end_at, kpi_goal_json, notes_json)
values
  (
    'zoy-launch-momentum',
    'Zoy+ Launch Momentum',
    'active',
    'footfall',
    'Investors',
    'Zoy+',
    array['Zoy+'],
    'Drive premium awareness and site visits for Zoy+ by pairing the tower image with launch, amenity, and visit-led posts.',
    'Book a site visit',
    '2026-04-07 09:00:00+05:30',
    '2026-04-20 20:00:00+05:30',
    '{"footfallTarget":"35 site visits","leadGoal":"50 qualified enquiries"}'::jsonb,
    '{"seededDemo":true,"theme":"launch"}'::jsonb
  ),
  (
    'aventis-site-visit-push',
    'Aventis Weekend Site Visit Push',
    'active',
    'footfall',
    'Young families',
    'Aventis',
    array['Aventis'],
    'Turn Aventis into a strong weekend visit contender with one clear hero, one invite, and one amenity-driven proof point.',
    'Schedule your visit',
    '2026-04-08 09:00:00+05:30',
    '2026-04-22 20:00:00+05:30',
    '{"footfallTarget":"24 weekend visits","engagementGoal":"Save and DM growth"}'::jsonb,
    '{"seededDemo":true,"theme":"site-visit"}'::jsonb
  ),
  (
    'luxovert-awareness-burst',
    '41 Luxovert Premium Awareness Burst',
    'completed',
    'awareness',
    'Luxury buyers',
    '41 Luxovert',
    array['41 Luxovert'],
    'Position 41 Luxovert as a design-led premium address with a stronger luxury and amenity story.',
    'Explore the project',
    '2026-03-12 09:00:00+05:30',
    '2026-03-26 20:00:00+05:30',
    '{"reachGoal":"125000 impressions","saveGoal":"600 saves"}'::jsonb,
    '{"seededDemo":true,"theme":"awareness"}'::jsonb
  );

create temporary table seed_campaign_plans (
  code text primary key,
  campaign_code text not null,
  name text not null,
  post_type_code text not null,
  template_code text not null,
  placement_code public.placement_code not null,
  content_format public.content_format not null,
  objective_override public.objective_code,
  cta_override text,
  brief_override text,
  scheduled_offset_days integer,
  sort_order integer not null
) on commit drop;

insert into seed_campaign_plans
  (code, campaign_code, name, post_type_code, template_code, placement_code, content_format, objective_override, cta_override, brief_override, scheduled_offset_days, sort_order)
values
  ('zoy-launch-hero', 'zoy-launch-momentum', 'Launch reveal', 'project-launch', 'launch-portrait', 'instagram-feed', 'static', 'awareness', 'Book a site visit', 'Lead with the tower image, launch-phase energy, and premium Hinjawadi positioning.', 0, 1),
  ('zoy-site-visit', 'zoy-launch-momentum', 'Weekend site visit invite', 'site-visit-invite', 'site-visit-invite', 'instagram-feed', 'static', 'footfall', 'Book a site visit', 'Invite prospects to experience the project in person with a calm premium CTA.', 3, 2),
  ('zoy-amenity', 'zoy-launch-momentum', 'Grand entrance lobby spotlight', 'amenity-spotlight', 'amenity-spotlight', 'instagram-feed', 'static', 'engagement', 'Explore the amenity', 'Spotlight one hero amenity and keep the copy crisp and aspirational.', 5, 3),
  ('zoy-progress', 'zoy-launch-momentum', 'Launch-phase progress update', 'construction-update', 'construction-update', 'instagram-feed', 'static', 'trust', 'Track project progress', 'Use the project image and communicate calm, steady progress without exaggeration.', 8, 4),
  ('aventis-launch', 'aventis-site-visit-push', 'Project introduction', 'project-launch', 'launch-portrait', 'instagram-feed', 'static', 'awareness', 'Explore Aventis', 'Introduce Aventis with its spacious-layout and West Pune connectivity story.', 0, 1),
  ('aventis-invite', 'aventis-site-visit-push', 'Weekend site visit invite', 'site-visit-invite', 'site-visit-invite', 'instagram-feed', 'static', 'footfall', 'Schedule your visit', 'Show the building and create a strong site-visit hook for the upcoming weekend.', 2, 2),
  ('aventis-pool', 'aventis-site-visit-push', 'Clubhouse terrace pool spotlight', 'amenity-spotlight', 'amenity-spotlight', 'instagram-feed', 'static', 'engagement', 'Save this post', 'Spotlight the pool terrace as a premium lifestyle proof point.', 4, 3),
  ('aventis-reminder', 'aventis-site-visit-push', 'Sunday visit reminder', 'site-visit-invite', 'site-visit-invite', 'instagram-story', 'story', 'footfall', 'Reply to book your slot', 'Use a lighter reminder tone with one strong booking action.', 5, 4),
  ('luxovert-launch', 'luxovert-awareness-burst', 'Luxury launch hero', 'project-launch', 'launch-portrait', 'linkedin-feed', 'static', 'awareness', 'Discover the address', 'Use the building image to establish 41 Luxovert as a premium residential address.', 0, 1),
  ('luxovert-amenity', 'luxovert-awareness-burst', 'Infinity pool spotlight', 'amenity-spotlight', 'amenity-spotlight', 'instagram-feed', 'static', 'engagement', 'Explore the amenity', 'Make the infinity pool feel premium, calm, and design-forward.', 3, 2),
  ('luxovert-invite', 'luxovert-awareness-burst', 'Private site visit invite', 'site-visit-invite', 'site-visit-invite', 'instagram-feed', 'static', 'footfall', 'Book a private visit', 'Invite premium buyers to experience the project in person.', 6, 3);

create temporary table seed_series (
  code text primary key,
  name text not null,
  status public.series_status not null,
  project_name text,
  content_pillar_code text,
  post_type_code text,
  template_code text,
  placement_code public.placement_code,
  content_format public.content_format,
  description text,
  start_at timestamptz,
  end_at timestamptz,
  cadence_json jsonb not null,
  source_brief_json jsonb not null
) on commit drop;

insert into seed_series
  (code, name, status, project_name, content_pillar_code, post_type_code, template_code, placement_code, content_format, description, start_at, end_at, cadence_json, source_brief_json)
values
  (
    'zoy-construction-journal',
    'Zoy+ Construction Journal',
    'active',
    'Zoy+',
    'trust-credibility',
    'construction-update',
    'construction-update',
    'instagram-feed',
    'static',
    'A recurring truthful update series that shows progress milestones for Zoy+ without over-claiming.',
    '2026-04-13 09:00:00+05:30',
    null,
    '{"frequency":"weekly","interval":1,"weekdays":["monday"],"occurrencesAhead":21}'::jsonb,
    '{"angle":"Construction updates should feel factual, premium, and steady.","copyStyle":"Use real progress language and avoid hype."}'::jsonb
  ),
  (
    'aventis-amenity-spotlight',
    'Aventis Amenity Spotlight',
    'active',
    'Aventis',
    'lifestyle-amenities',
    'amenity-spotlight',
    'amenity-spotlight',
    'instagram-feed',
    'static',
    'A recurring series that turns one Aventis amenity at a time into a premium lifestyle proof point.',
    '2026-04-15 09:00:00+05:30',
    null,
    '{"frequency":"weekly","interval":1,"weekdays":["wednesday"],"occurrencesAhead":21}'::jsonb,
    '{"angle":"Choose one amenity per post and keep the layout editorial.","copyStyle":"Short, premium, and benefit-led."}'::jsonb
  ),
  (
    'festive-greetings',
    'Festive Greetings',
    'active',
    null,
    'festive-moments',
    'festive-greeting',
    'festive-square',
    'instagram-feed',
    'static',
    'Brand-safe festive greetings across key Indian occasions with restrained, premium visual language.',
    '2026-04-06 09:00:00+05:30',
    null,
    '{"frequency":"weekly","interval":1,"weekdays":["friday"],"occurrencesAhead":35}'::jsonb,
    '{"angle":"Keep festive posts premium, respectful, and minimal.","brandAttribution":"Use Krisala Developers as text only."}'::jsonb
  );

create temporary table seed_deliverables (
  code text primary key,
  title text not null,
  project_name text,
  campaign_code text,
  plan_code text,
  series_code text,
  content_pillar_code text,
  persona_name text,
  post_type_code text not null,
  planning_mode public.planning_mode not null,
  objective_code public.objective_code not null,
  placement_code public.placement_code not null,
  content_format public.content_format not null,
  status public.deliverable_status not null,
  scheduled_for timestamptz not null,
  due_at timestamptz,
  priority public.deliverable_priority not null,
  cta_text text,
  brief_text text,
  preview_storage_path text,
  post_version_status public.post_version_status,
  publication_status public.publication_status,
  published_at timestamptz,
  review_state public.output_review_state,
  latest_feedback_verdict public.feedback_verdict,
  approval_action public.approval_action,
  series_occurrence_date date
) on commit drop;

insert into seed_deliverables
  (code, title, project_name, campaign_code, plan_code, series_code, content_pillar_code, persona_name, post_type_code, planning_mode, objective_code, placement_code, content_format, status, scheduled_for, due_at, priority, cta_text, brief_text, preview_storage_path, post_version_status, publication_status, published_at, review_state, latest_feedback_verdict, approval_action, series_occurrence_date)
values
  ('zoy-launch-hero-live', 'Zoy+ launch hero · portrait', 'Zoy+', 'zoy-launch-momentum', 'zoy-launch-hero', null, 'project-promotion', 'Investors', 'project-launch', 'campaign', 'awareness', 'instagram-feed', 'static', 'scheduled', '2026-04-08 11:00:00+05:30', '2026-04-07 17:00:00+05:30', 'high', 'Book a site visit', 'Lead with the Zoy+ tower image and launch-phase confidence for Hinjawadi Phase 1.', 'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/references/f81a56bf-81d2-42c1-b9ba-6491cb6992b9/zoy.jpg', 'approved', 'scheduled', null, 'approved', 'approved', 'approve', null),
  ('zoy-weekend-visit', 'Zoy+ weekend site visit invite', 'Zoy+', 'zoy-launch-momentum', 'zoy-site-visit', null, 'project-promotion', 'Young families', 'site-visit-invite', 'campaign', 'footfall', 'instagram-feed', 'static', 'approved', '2026-04-10 18:30:00+05:30', '2026-04-09 17:00:00+05:30', 'high', 'Book a site visit', 'Invite prospects to experience Zoy+ in person with a clean premium site-visit CTA.', 'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/outputs/851cf511-b022-45e9-920d-e8a5db3b83d1/6696890a-1644-44d0-a29a-60c93dccadfb.png', 'approved', null, null, 'approved', 'approved', 'approve', null),
  ('zoy-lobby-spotlight', 'Zoy+ grand entrance lobby spotlight', 'Zoy+', 'zoy-launch-momentum', 'zoy-amenity', null, 'lifestyle-amenities', 'Young families', 'amenity-spotlight', 'campaign', 'engagement', 'instagram-feed', 'static', 'review', '2026-04-12 11:30:00+05:30', '2026-04-11 15:00:00+05:30', 'normal', 'Explore the amenity', 'Spotlight the grand entrance lobby as the first premium experience buyers encounter at Zoy+.', 'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/outputs/611869cc-625b-4fee-8336-a9f23360398b/a499470b-e852-4dcb-b0c7-15036830e590.png', 'in_review', null, null, 'pending_review', null, null, null),
  ('zoy-progress-brief', 'Zoy+ launch-phase progress update', 'Zoy+', 'zoy-launch-momentum', 'zoy-progress', null, 'trust-credibility', 'Investors', 'construction-update', 'campaign', 'trust', 'instagram-feed', 'static', 'brief_ready', '2026-04-14 11:00:00+05:30', '2026-04-13 17:00:00+05:30', 'normal', 'Track project progress', 'Use the tower image and a premium progress panel to communicate steady launch-phase progress without hype.', null, null, null, null, null, null, null, null),
  ('aventis-launch-live', 'Aventis launch hero · portrait', 'Aventis', 'aventis-site-visit-push', 'aventis-launch', null, 'project-promotion', 'Young families', 'project-launch', 'campaign', 'awareness', 'instagram-feed', 'static', 'published', '2026-04-02 11:00:00+05:30', '2026-04-01 17:00:00+05:30', 'high', 'Explore Aventis', 'Introduce Aventis as a spacious premium Tathawade address with strong West Pune connectivity.', 'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/project-images/e4b52db7-5d86-4dbf-b046-34ccdef9c174/aventis-view-05-straight-view-scaled.jpg', 'approved', 'published', '2026-04-02 11:05:00+05:30', 'approved', 'approved', 'approve', null),
  ('aventis-weekend-visit', 'Aventis Saturday site visit invite', 'Aventis', 'aventis-site-visit-push', 'aventis-invite', null, 'project-promotion', 'Young families', 'site-visit-invite', 'campaign', 'footfall', 'instagram-feed', 'static', 'scheduled', '2026-04-09 18:30:00+05:30', '2026-04-08 16:00:00+05:30', 'high', 'Schedule your visit', 'Use the building image and a premium invitation block for the next site-visit weekend.', 'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/outputs/34aecbdc-d231-4e24-8cc3-105f59547c32/ae441919-09ba-4035-b0d2-719ae3dde848.png', 'approved', 'scheduled', null, 'approved', 'approved', 'approve', null),
  ('aventis-pool-review', 'Aventis clubhouse terrace pool spotlight', 'Aventis', 'aventis-site-visit-push', 'aventis-pool', null, 'lifestyle-amenities', 'Young families', 'amenity-spotlight', 'campaign', 'engagement', 'instagram-feed', 'static', 'review', '2026-04-11 11:30:00+05:30', '2026-04-10 17:00:00+05:30', 'normal', 'Save this post', 'Spotlight the pool terrace as the premium lifestyle hook for Aventis.', 'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/outputs/468362af-5e81-4f80-9e6d-096ede907e68/c17f992c-653c-48c9-96b9-d0386f89a9fa.png', 'in_review', null, null, 'pending_review', null, null, null),
  ('aventis-sunday-reminder', 'Aventis Sunday visit reminder', 'Aventis', 'aventis-site-visit-push', 'aventis-reminder', null, 'project-promotion', 'Young families', 'site-visit-invite', 'campaign', 'footfall', 'instagram-story', 'story', 'approved', '2026-04-13 19:00:00+05:30', '2026-04-12 15:00:00+05:30', 'normal', 'Reply to book your slot', 'Use a simple reminder story to convert late-intent audiences into visit bookings.', 'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/outputs/851cf511-b022-45e9-920d-e8a5db3b83d1/2f8c71db-733c-47f3-8ff7-66d674781c97.png', 'approved', null, null, 'approved', 'approved', 'approve', null),
  ('luxovert-launch-published', '41 Luxovert luxury launch hero', '41 Luxovert', 'luxovert-awareness-burst', 'luxovert-launch', null, 'project-promotion', 'Luxury buyers', 'project-launch', 'campaign', 'awareness', 'linkedin-feed', 'static', 'published', '2026-03-18 10:30:00+05:30', '2026-03-17 17:00:00+05:30', 'high', 'Discover the address', 'Position 41 Luxovert as a premium design-led address for ambitious buyers in Tathawade.', 'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/project-images/2caafc00-563a-41f1-ab5d-a38ecb488a1a/luxovert.jpg', 'approved', 'published', '2026-03-18 10:40:00+05:30', 'approved', 'approved', 'approve', null),
  ('luxovert-pool-published', '41 Luxovert infinity pool spotlight', '41 Luxovert', 'luxovert-awareness-burst', 'luxovert-amenity', null, 'lifestyle-amenities', 'Luxury buyers', 'amenity-spotlight', 'campaign', 'engagement', 'instagram-feed', 'static', 'published', '2026-03-21 18:00:00+05:30', '2026-03-20 16:00:00+05:30', 'normal', 'Explore the amenity', 'Make the infinity pool feel calm, premium, and distinctly lifestyle-led.', 'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/outputs/504fe128-b03d-43c6-b371-6de296236199/a147e968-93ef-490b-9691-5668920c4e0a.png', 'approved', 'published', '2026-03-21 18:05:00+05:30', 'approved', 'approved', 'approve', null),
  ('luxovert-private-invite', '41 Luxovert private site visit invite', '41 Luxovert', 'luxovert-awareness-burst', 'luxovert-invite', null, 'project-promotion', 'Luxury buyers', 'site-visit-invite', 'campaign', 'footfall', 'instagram-feed', 'static', 'published', '2026-03-24 18:30:00+05:30', '2026-03-23 16:00:00+05:30', 'normal', 'Book a private visit', 'Invite premium-intent buyers to book a private visit for 41 Luxovert.', 'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/outputs/504fe128-b03d-43c6-b371-6de296236199/da6782d9-ec91-47bf-aade-0df4472c23e5.png', 'approved', 'published', '2026-03-24 18:40:00+05:30', 'approved', 'approved', 'approve', null),
  ('zoy-journal-week1', 'Zoy+ construction journal · week 1', 'Zoy+', null, null, 'zoy-construction-journal', 'trust-credibility', 'Investors', 'construction-update', 'series', 'trust', 'instagram-feed', 'static', 'approved', '2026-04-13 11:00:00+05:30', '2026-04-12 16:00:00+05:30', 'normal', 'Track project progress', 'Show a premium, factual progress update using the Zoy+ construction image and restrained metrics.', 'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/outputs/0d4a15cb-01f8-43c5-8a09-931a35f0feb3/0e308531-c250-48be-8c9e-740223b6c266.png', 'approved', null, null, 'approved', 'approved', 'approve', '2026-04-13'),
  ('zoy-journal-week2', 'Zoy+ construction journal · week 2', 'Zoy+', null, null, 'zoy-construction-journal', 'trust-credibility', 'Investors', 'construction-update', 'series', 'trust', 'instagram-feed', 'static', 'blocked', '2026-04-20 11:00:00+05:30', '2026-04-19 16:00:00+05:30', 'normal', 'Track project progress', 'A construction-progress option that did not meet brand quality and should stay blocked until revised.', 'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/outputs/0d4a15cb-01f8-43c5-8a09-931a35f0feb3/258a1ced-eb66-467e-9115-776164ee6d30.png', 'rejected', null, null, 'needs_revision', 'off-brand', 'reject', '2026-04-20'),
  ('zoy-journal-week3', 'Zoy+ construction journal · week 3', 'Zoy+', null, null, 'zoy-construction-journal', 'trust-credibility', 'Investors', 'construction-update', 'series', 'trust', 'instagram-feed', 'static', 'planned', '2026-04-27 11:00:00+05:30', '2026-04-26 16:00:00+05:30', 'normal', 'Track project progress', 'Prepare the next truthful construction update for the third April installment.', null, null, null, null, null, null, null, '2026-04-27'),
  ('aventis-party-lawn', 'Aventis amenity spotlight · party lawn', 'Aventis', null, null, 'aventis-amenity-spotlight', 'lifestyle-amenities', 'Young families', 'amenity-spotlight', 'series', 'engagement', 'instagram-feed', 'static', 'scheduled', '2026-04-15 11:30:00+05:30', '2026-04-14 17:00:00+05:30', 'normal', 'Save this post', 'Turn the party lawn into one clear premium lifestyle proof point for Aventis.', 'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/outputs/611869cc-625b-4fee-8336-a9f23360398b/435b3713-0cc4-4e16-b88c-4c74c471e201.png', 'approved', 'scheduled', null, 'approved', 'approved', 'approve', '2026-04-15'),
  ('aventis-garden-trail', 'Aventis amenity spotlight · garden trail', 'Aventis', null, null, 'aventis-amenity-spotlight', 'lifestyle-amenities', 'Young families', 'amenity-spotlight', 'series', 'engagement', 'instagram-feed', 'static', 'brief_ready', '2026-04-22 11:30:00+05:30', '2026-04-21 17:00:00+05:30', 'normal', 'Save this post', 'Build a clean premium spotlight around the garden trail and its calm everyday value.', null, null, null, null, null, null, null, '2026-04-22'),
  ('aventis-futsal', 'Aventis amenity spotlight · futsal court', 'Aventis', null, null, 'aventis-amenity-spotlight', 'lifestyle-amenities', 'Young families', 'amenity-spotlight', 'series', 'engagement', 'instagram-feed', 'static', 'planned', '2026-04-29 11:30:00+05:30', '2026-04-28 17:00:00+05:30', 'normal', 'Save this post', 'Prepare a one-amenity spotlight around the futsal court for the next week of the series.', null, null, null, null, null, null, null, '2026-04-29'),
  ('ram-navami-greeting', 'Ram Navami greeting', null, null, null, 'festive-greetings', 'festive-moments', null, 'festive-greeting', 'series', 'awareness', 'instagram-feed', 'static', 'published', '2026-04-06 09:30:00+05:30', '2026-04-05 18:00:00+05:30', 'normal', null, 'Create a premium Ram Navami greeting with restrained festive symbolism and Krisala Developers as text only.', 'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/outputs/5457483b-796d-4843-a48a-396342754e5a/1c245ad4-084a-498c-854f-a1464697e934.png', 'approved', 'published', '2026-04-06 09:35:00+05:30', 'approved', 'approved', 'approve', '2026-04-06'),
  ('ambedkar-jayanti-greeting', 'Ambedkar Jayanti greeting', null, null, null, 'festive-greetings', 'festive-moments', null, 'festive-greeting', 'series', 'awareness', 'instagram-feed', 'static', 'approved', '2026-04-14 10:30:00+05:30', '2026-04-13 18:00:00+05:30', 'normal', null, 'Create a respectful Ambedkar Jayanti greeting with a clean premium poster composition and no logo marks.', 'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/outputs/ba1179d5-7dcb-415e-9f47-addcd8b95536/00437320-27c3-48bd-902c-37c8873a4f6f.png', 'approved', null, null, 'approved', 'approved', 'approve', '2026-04-14'),
  ('akshaya-tritiya-greeting', 'Akshaya Tritiya greeting', null, null, null, 'festive-greetings', 'festive-moments', null, 'festive-greeting', 'series', 'awareness', 'instagram-feed', 'static', 'review', '2026-05-09 10:30:00+05:30', '2026-05-08 18:00:00+05:30', 'normal', null, 'Create a clean premium Akshaya Tritiya greeting with positive gold and cream accents and Krisala Developers as text only.', 'f35bc759-576f-430a-92fa-47f27def1105/e9afb6df-b957-4d94-b48f-447cb67140b0/outputs/5457483b-796d-4843-a48a-396342754e5a/2ac8fcc1-fc80-4736-bc90-6890eb4d708a.png', 'in_review', null, null, 'pending_review', null, null, '2026-05-09'),
  ('maharashtra-day-greeting', 'Maharashtra Day greeting', null, null, null, 'festive-greetings', 'festive-moments', null, 'festive-greeting', 'series', 'awareness', 'instagram-feed', 'static', 'brief_ready', '2026-05-01 10:30:00+05:30', '2026-04-30 18:00:00+05:30', 'normal', null, 'Prepare a premium Maharashtra Day greeting with a restrained civic and regional tone.', null, null, null, null, null, null, null, '2026-05-01'),
  ('zillenia-phase2-teaser', '41 Zillenia Phase 2 launch teaser', '41 Zillenia Phase 2', null, null, null, 'project-promotion', 'Young families', 'project-launch', 'one_off', 'awareness', 'instagram-feed', 'static', 'generating', '2026-04-16 11:00:00+05:30', '2026-04-15 17:00:00+05:30', 'normal', 'Explore the project', 'A one-off teaser to bring 41 Zillenia Phase 2 into the active content mix with its building image.', null, null, null, null, null, null, null, null);

create temporary table template_map (
  code text primary key,
  id uuid not null
) on commit drop;

create temporary table campaign_map (
  code text primary key,
  id uuid not null
) on commit drop;

create temporary table plan_map (
  code text primary key,
  id uuid not null
) on commit drop;

create temporary table series_map (
  code text primary key,
  id uuid not null
) on commit drop;

create temporary table deliverable_map (
  code text primary key,
  id uuid not null
) on commit drop;

do $$
declare
  target_workspace_id constant uuid := 'f35bc759-576f-430a-92fa-47f27def1105';
  target_brand_id constant uuid := 'e9afb6df-b957-4d94-b48f-447cb67140b0';
  brand_profile_id uuid := gen_random_uuid();
  brand_profile_version integer := 1;
  instagram_id uuid;
  facebook_id uuid;
  linkedin_id uuid;
  zoy_project_id uuid;
  aventis_project_id uuid;
  luxovert_project_id uuid;
  zillenia_phase_2_project_id uuid;
  rec record;
  post_type_id uuid;
  template_id uuid;
  campaign_id uuid;
  plan_id uuid;
  series_id uuid;
  project_id uuid;
  pillar_id uuid;
  persona_id uuid;
  deliverable_id uuid;
  channel_account_id uuid;
  creative_request_id uuid;
  prompt_package_id uuid;
  creative_job_id uuid;
  post_version_id uuid;
  creative_output_id uuid;
begin
  select coalesce(max(version_number), 0) + 1
  into brand_profile_version
  from public.brand_profile_versions
  where brand_id = target_brand_id;

  update public.workspaces
  set
    name = 'Krisala Demo Workspace',
    slug = 'krisala-demo-workspace'
  where id = target_workspace_id;

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
    target_brand_id,
    brand_profile_version,
    jsonb_build_object(
      'identity', jsonb_build_object(
        'positioning', 'Design-led Pune and PCMC developer building premium residential communities in growth corridors.',
        'promise', 'Make aspirational homebuying communication feel premium, grounded, and credible.',
        'audienceSummary', 'Urban homebuyers, upgraders, and investors evaluating premium Pune addresses and modern community living.'
      ),
      'voice', jsonb_build_object(
        'summary', 'Premium, contemporary, and quietly confident. Speaks with polish without sounding inflated.',
        'adjectives', jsonb_build_array('premium', 'credible', 'contemporary', 'refined'),
        'approvedVocabulary', jsonb_build_array('design-led', 'premium', 'connected', 'elevated', 'refined', 'credible'),
        'bannedPhrases', jsonb_build_array('guaranteed returns', 'assured appreciation', 'cheap deal', 'flash sale')
      ),
      'palette', jsonb_build_object(
        'primary', '#27211d',
        'secondary', '#f3ebe1',
        'accent', '#c58a43',
        'neutrals', jsonb_build_array('#d5c6b7', '#a79687', '#faf5ef')
      ),
      'styleDescriptors', jsonb_build_array('architectural', 'urban', 'premium', 'warm', 'crafted'),
      'visualSystem', jsonb_build_object(
        'typographyMood', 'Contemporary editorial hierarchy with premium serif-sans restraint.',
        'compositionPrinciples', jsonb_build_array(
          'Let architecture or one visual anchor carry the frame',
          'Keep copy blocks disciplined and breathable',
          'Avoid brochure clutter and leave clean footer space'
        ),
        'imageTreatment', jsonb_build_array(
          'Warm natural light',
          'Premium realism',
          'Crisp but not overprocessed contrast'
        ),
        'textDensity', 'balanced',
        'realismLevel', 'elevated_real'
      ),
      'doRules', jsonb_build_array(
        'Ground visuals in real project truth',
        'Keep compositions premium, calm, and uncluttered',
        'Use the brand name as text rather than a generated logo',
        'Let architecture, amenities, or one festive cue lead each post'
      ),
      'dontRules', jsonb_build_array(
        'Do not use pushy discount-led copy',
        'Do not make layouts feel cheap or crowded',
        'Do not invent returns or exaggerated commercial claims',
        'Do not generate random logo marks or house icons'
      ),
      'bannedPatterns', jsonb_build_array(
        'cheap brochure clutter',
        'neon gradients',
        'generic SaaS aesthetics',
        'cartoonish iconography'
      ),
      'compliance', jsonb_build_object(
        'bannedClaims', jsonb_build_array(
          'guaranteed returns',
          'assured appreciation',
          'risk-free investment'
        ),
        'reviewChecks', jsonb_build_array(
          'Verify all project facts against approved source data',
          'Keep tone premium and non-pushy',
          'Preserve clean safe zones for brand and CTA'
        )
      ),
      'referenceAssetIds', jsonb_build_array('f81a56bf-81d2-42c1-b9ba-6491cb6992b9'::uuid),
      'referenceCanon', jsonb_build_object(
        'usageNotes', jsonb_build_array(
          'Prefer real project imagery before generic architecture',
          'Use light, materiality, and clean layout to communicate premium value'
        ),
        'antiReferenceNotes', jsonb_build_array(
          'Avoid clutter-heavy low-trust brochures',
          'Avoid loud festive kitsch or gimmicky real estate ads'
        )
      )
    ),
    null
  );

  update public.brands
  set
    name = 'Krisala Developers',
    slug = 'krisala-developers',
    description = 'Innovating lifespaces across Pune and PCMC with design-led residential communities.',
    current_profile_version_id = brand_profile_id
  where id = target_brand_id;

  update public.channel_accounts
  set
    handle = '@krisaladevelopers',
    display_name = 'Krisala Developers Instagram',
    timezone = 'Asia/Kolkata'
  where brand_id = target_brand_id
    and platform = 'instagram';

  update public.channel_accounts
  set
    handle = 'Krisala Developers',
    display_name = 'Krisala Developers Facebook',
    timezone = 'Asia/Kolkata'
  where brand_id = target_brand_id
    and platform = 'facebook';

  update public.channel_accounts
  set
    handle = 'krisala-developers',
    display_name = 'Krisala Developers LinkedIn',
    timezone = 'Asia/Kolkata'
  where brand_id = target_brand_id
    and platform = 'linkedin';

  delete from public.publications
  where brand_id = target_brand_id;

  delete from public.approval_events
  where public.approval_events.deliverable_id in (
    select id from public.deliverables where brand_id = target_brand_id
  );

  delete from public.post_version_assets
  where public.post_version_assets.post_version_id in (
    select pv.id
    from public.post_versions pv
    join public.deliverables d on d.id = pv.deliverable_id
    where d.brand_id = target_brand_id
  );

  delete from public.post_versions
  where public.post_versions.deliverable_id in (
    select id from public.deliverables where brand_id = target_brand_id
  );

  delete from public.deliverables
  where brand_id = target_brand_id;

  delete from public.calendar_items
  where brand_id = target_brand_id;

  delete from public.campaign_deliverable_plans
  where public.campaign_deliverable_plans.campaign_id in (
    select id from public.campaigns where brand_id = target_brand_id
  );

  delete from public.campaign_projects
  where public.campaign_projects.campaign_id in (
    select id from public.campaigns where brand_id = target_brand_id
  );

  delete from public.campaigns
  where brand_id = target_brand_id;

  delete from public.series
  where brand_id = target_brand_id;

  delete from public.creative_template_assets
  where public.creative_template_assets.template_id in (
    select id from public.creative_templates where brand_id = target_brand_id
  );

  delete from public.creative_templates
  where brand_id = target_brand_id;

  delete from public.style_templates
  where brand_id = target_brand_id;

  delete from public.creative_requests
  where brand_id = target_brand_id;

  delete from public.project_profile_versions
  where public.project_profile_versions.project_id in (
    select id
    from public.projects
    where brand_id = target_brand_id
      and name in ('Asteria Heights', 'Asteria Residences')
  );

  delete from public.projects
  where brand_id = target_brand_id
    and name in ('Asteria Heights', 'Asteria Residences');

  select id into instagram_id
  from public.channel_accounts
  where brand_id = target_brand_id
    and platform = 'instagram'
  limit 1;

  select id into facebook_id
  from public.channel_accounts
  where brand_id = target_brand_id
    and platform = 'facebook'
  limit 1;

  select id into linkedin_id
  from public.channel_accounts
  where brand_id = target_brand_id
    and platform = 'linkedin'
  limit 1;

  delete from public.posting_windows
  where brand_id = target_brand_id;

  insert into public.posting_windows (
    id,
    workspace_id,
    brand_id,
    channel,
    weekday,
    local_time,
    timezone,
    label,
    active,
    sort_order,
    created_by
  ) values
    (gen_random_uuid(), target_workspace_id, target_brand_id, 'instagram-feed', 'monday', '11:00:00', 'Asia/Kolkata', 'Late morning momentum', true, 1, null),
    (gen_random_uuid(), target_workspace_id, target_brand_id, 'linkedin-feed', 'tuesday', '10:00:00', 'Asia/Kolkata', 'Professional feed slot', true, 2, null),
    (gen_random_uuid(), target_workspace_id, target_brand_id, 'instagram-feed', 'thursday', '18:30:00', 'Asia/Kolkata', 'Evening discovery', true, 3, null),
    (gen_random_uuid(), target_workspace_id, target_brand_id, 'instagram-story', 'friday', '19:00:00', 'Asia/Kolkata', 'Story reminder window', true, 4, null),
    (gen_random_uuid(), target_workspace_id, target_brand_id, 'instagram-feed', 'saturday', '11:30:00', 'Asia/Kolkata', 'Weekend browse slot', true, 5, null);

  select id into zoy_project_id
  from public.projects
  where brand_id = target_brand_id and name = 'Zoy+'
  limit 1;

  select id into aventis_project_id
  from public.projects
  where brand_id = target_brand_id and name = 'Aventis'
  limit 1;

  select id into luxovert_project_id
  from public.projects
  where brand_id = target_brand_id and name = '41 Luxovert'
  limit 1;

  select id into zillenia_phase_2_project_id
  from public.projects
  where brand_id = target_brand_id and name = '41 Zillenia Phase 2'
  limit 1;

  update public.project_profile_versions
  set profile_json = jsonb_set(
    jsonb_set(profile_json, '{actualProjectImageIds}', to_jsonb(array['f81a56bf-81d2-42c1-b9ba-6491cb6992b9'::uuid]), true),
    '{sampleFlatImageIds}',
    '[]'::jsonb,
    true
  )
  where id = (
    select current_profile_version_id from public.projects where id = zoy_project_id
  );

  update public.project_profile_versions
  set profile_json = jsonb_set(
    jsonb_set(profile_json, '{actualProjectImageIds}', to_jsonb(array['e4b52db7-5d86-4dbf-b046-34ccdef9c174'::uuid]), true),
    '{sampleFlatImageIds}',
    '[]'::jsonb,
    true
  )
  where id = (
    select current_profile_version_id from public.projects where id = aventis_project_id
  );

  update public.project_profile_versions
  set profile_json = jsonb_set(
    jsonb_set(profile_json, '{actualProjectImageIds}', to_jsonb(array['2caafc00-563a-41f1-ab5d-a38ecb488a1a'::uuid]), true),
    '{sampleFlatImageIds}',
    '[]'::jsonb,
    true
  )
  where id = (
    select current_profile_version_id from public.projects where id = luxovert_project_id
  );

  update public.project_profile_versions
  set profile_json = jsonb_set(
    jsonb_set(profile_json, '{actualProjectImageIds}', to_jsonb(array['29fdad0c-135d-40a9-ad6a-6bfe15482db8'::uuid]), true),
    '{sampleFlatImageIds}',
    '[]'::jsonb,
    true
  )
  where id = (
    select current_profile_version_id from public.projects where id = zillenia_phase_2_project_id
  );

  for rec in select * from seed_templates order by name loop
    select id into post_type_id
    from public.post_types
    where code = rec.post_type_code
      and active = true
    limit 1;

    insert into public.creative_templates (
      id,
      workspace_id,
      brand_id,
      project_id,
      post_type_id,
      name,
      status,
      channel,
      format,
      base_prompt,
      preview_storage_path,
      created_from_output_id,
      template_json,
      created_by
    ) values (
      gen_random_uuid(),
      target_workspace_id,
      target_brand_id,
      null,
      post_type_id,
      rec.name,
      'approved',
      rec.channel,
      rec.format,
      rec.base_prompt,
      rec.preview_storage_path,
      null,
      jsonb_build_object(
        'promptScaffold', rec.base_prompt,
        'safeZoneNotes', jsonb_build_array('Keep footer attribution clean', 'Preserve clear CTA space when needed'),
        'approvedUseCases', jsonb_build_array(rec.name),
        'templateFamily', rec.template_family,
        'outputKinds', jsonb_build_array('single_image'),
        'defaultSlideCount', null,
        'allowedSlideCounts', jsonb_build_array(),
        'seriesUseCases', jsonb_build_array(),
        'carouselRecipe', jsonb_build_array(),
        'notes', rec.notes,
        'textZones', rec.text_zones
      ),
      null
    )
    returning id into template_id;

    insert into template_map (code, id)
    values (rec.code, template_id);
  end loop;

  for rec in select * from seed_campaigns order by start_at loop
    select id into project_id
    from public.projects
    where brand_id = target_brand_id
      and name = rec.primary_project_name
    limit 1;

    select id into persona_id
    from public.brand_personas
    where brand_id = target_brand_id
      and name = rec.target_persona_name
    limit 1;

    insert into public.campaigns (
      id,
      workspace_id,
      brand_id,
      name,
      objective_code,
      target_persona_id,
      primary_project_id,
      key_message,
      cta_text,
      start_at,
      end_at,
      owner_user_id,
      kpi_goal_json,
      status,
      notes_json,
      created_by
    ) values (
      gen_random_uuid(),
      target_workspace_id,
      target_brand_id,
      rec.name,
      rec.objective_code,
      persona_id,
      project_id,
      rec.key_message,
      rec.cta_text,
      rec.start_at,
      rec.end_at,
      null,
      rec.kpi_goal_json,
      rec.status,
      rec.notes_json,
      null
    )
    returning id into campaign_id;

    insert into campaign_map (code, id)
    values (rec.code, campaign_id);

    insert into public.campaign_projects (campaign_id, project_id)
    select campaign_id, p.id
    from public.projects p
    where p.brand_id = target_brand_id
      and p.name = any(rec.project_names);
  end loop;

  for rec in select * from seed_campaign_plans order by campaign_code, sort_order loop
    select id into campaign_id
    from campaign_map
    where code = rec.campaign_code;

    select id into post_type_id
    from public.post_types
    where code = rec.post_type_code
      and active = true
    limit 1;

    select id into template_id
    from template_map
    where code = rec.template_code;

    channel_account_id := case
      when rec.placement_code = 'linkedin-feed' then linkedin_id
      when rec.placement_code = 'instagram-story' then instagram_id
      else instagram_id
    end;

    insert into public.campaign_deliverable_plans (
      id,
      campaign_id,
      name,
      post_type_id,
      template_id,
      channel_account_id,
      placement_code,
      content_format,
      objective_override,
      cta_override,
      brief_override,
      scheduled_offset_days,
      sort_order,
      active
    ) values (
      gen_random_uuid(),
      campaign_id,
      rec.name,
      post_type_id,
      template_id,
      channel_account_id,
      rec.placement_code,
      rec.content_format,
      rec.objective_override,
      rec.cta_override,
      rec.brief_override,
      rec.scheduled_offset_days,
      rec.sort_order,
      true
    )
    returning id into plan_id;

    insert into plan_map (code, id)
    values (rec.code, plan_id);
  end loop;

  for rec in select * from seed_series order by name loop
    if rec.project_name is not null then
      select id into project_id
      from public.projects
      where brand_id = target_brand_id
        and name = rec.project_name
      limit 1;
    else
      project_id := null;
    end if;

    if rec.content_pillar_code is not null then
      select id into pillar_id
      from public.content_pillars
      where brand_id = target_brand_id
        and code = rec.content_pillar_code
      limit 1;
    else
      pillar_id := null;
    end if;

    if rec.post_type_code is not null then
      select id into post_type_id
      from public.post_types
      where code = rec.post_type_code
        and active = true
      limit 1;
    else
      post_type_id := null;
    end if;

    if rec.template_code is not null then
      select id into template_id
      from template_map
      where code = rec.template_code;
    else
      template_id := null;
    end if;

    channel_account_id := case
      when rec.placement_code = 'linkedin-feed' then linkedin_id
      when rec.placement_code = 'instagram-story' then instagram_id
      else instagram_id
    end;

    insert into public.series (
      id,
      workspace_id,
      brand_id,
      project_id,
      content_pillar_id,
      name,
      description,
      objective_code,
      post_type_id,
      creative_template_id,
      channel_account_id,
      placement_code,
      content_format,
      owner_user_id,
      cadence_json,
      start_at,
      end_at,
      status,
      source_brief_json,
      created_by
    ) values (
      gen_random_uuid(),
      target_workspace_id,
      target_brand_id,
      project_id,
      pillar_id,
      rec.name,
      rec.description,
      (
        case rec.content_pillar_code
        when 'trust-credibility' then 'trust'
        when 'lifestyle-amenities' then 'engagement'
        else 'awareness'
        end
      )::public.objective_code,
      post_type_id,
      template_id,
      channel_account_id,
      rec.placement_code,
      rec.content_format,
      null,
      rec.cadence_json,
      rec.start_at,
      rec.end_at,
      rec.status,
      rec.source_brief_json,
      null
    )
    returning id into series_id;

    insert into series_map (code, id)
    values (rec.code, series_id);
  end loop;

  for rec in select * from seed_deliverables order by scheduled_for loop
    if rec.project_name is not null then
      select id into project_id
      from public.projects
      where brand_id = target_brand_id
        and name = rec.project_name
      limit 1;
    else
      project_id := null;
    end if;

    if rec.persona_name is not null then
      select id into persona_id
      from public.brand_personas
      where brand_id = target_brand_id
        and name = rec.persona_name
      limit 1;
    else
      persona_id := null;
    end if;

    if rec.content_pillar_code is not null then
      select id into pillar_id
      from public.content_pillars
      where brand_id = target_brand_id
        and code = rec.content_pillar_code
      limit 1;
    else
      pillar_id := null;
    end if;

    select id into post_type_id
    from public.post_types
    where code = rec.post_type_code
      and active = true
    limit 1;

    if rec.campaign_code is not null then
      select id into campaign_id
      from campaign_map
      where code = rec.campaign_code;
    else
      campaign_id := null;
    end if;

    if rec.plan_code is not null then
      select id into plan_id
      from plan_map
      where code = rec.plan_code;
    else
      plan_id := null;
    end if;

    if rec.series_code is not null then
      select id into series_id
      from series_map
      where code = rec.series_code;
    else
      series_id := null;
    end if;

    channel_account_id := case
      when rec.placement_code = 'linkedin-feed' then linkedin_id
      when rec.placement_code = 'instagram-story' then instagram_id
      else instagram_id
    end;

    if rec.plan_code is not null then
      select t.id into template_id
      from template_map t
      join seed_campaign_plans p on p.template_code = t.code
      where p.code = rec.plan_code;
    elsif rec.series_code is not null then
      select s.id into template_id
      from template_map s
      join seed_series sr on sr.template_code = s.code
      where sr.code = rec.series_code;
    else
      template_id := null;
    end if;

    insert into public.deliverables (
      id,
      workspace_id,
      brand_id,
      project_id,
      campaign_id,
      series_id,
      persona_id,
      content_pillar_id,
      post_type_id,
      creative_template_id,
      channel_account_id,
      planning_mode,
      objective_code,
      placement_code,
      content_format,
      title,
      brief_text,
      cta_text,
      scheduled_for,
      due_at,
      owner_user_id,
      priority,
      status,
      approved_post_version_id,
      latest_post_version_id,
      series_occurrence_date,
      source_json,
      created_by
    ) values (
      gen_random_uuid(),
      target_workspace_id,
      target_brand_id,
      project_id,
      campaign_id,
      series_id,
      persona_id,
      pillar_id,
      post_type_id,
      template_id,
      channel_account_id,
      rec.planning_mode,
      rec.objective_code,
      rec.placement_code,
      rec.content_format,
      rec.title,
      rec.brief_text,
      rec.cta_text,
      rec.scheduled_for,
      rec.due_at,
      null,
      rec.priority,
      rec.status,
      null,
      null,
      rec.series_occurrence_date,
      jsonb_strip_nulls(
        jsonb_build_object(
          'seededDemo', true,
          'campaignPlanId', plan_id,
          'campaignPlanCode', rec.plan_code,
          'seriesCode', rec.series_code
        )
      ),
      null
    )
    returning id into deliverable_id;

    insert into deliverable_map (code, id)
    values (rec.code, deliverable_id);

    if rec.post_version_status is not null and rec.preview_storage_path is not null then
      creative_request_id := gen_random_uuid();
      prompt_package_id := gen_random_uuid();
      creative_job_id := gen_random_uuid();
      post_version_id := gen_random_uuid();
      creative_output_id := gen_random_uuid();

      insert into public.creative_requests (
        id,
        workspace_id,
        brand_id,
        brief_json,
        created_by,
        project_id,
        post_type_id,
        creative_template_id,
        calendar_item_id,
        approved_output_id,
        status,
        deliverable_id
      ) values (
        creative_request_id,
        target_workspace_id,
        target_brand_id,
        jsonb_build_object(
          'seededDemo', true,
          'title', rec.title,
          'brief', rec.brief_text,
          'placementCode', rec.placement_code,
          'contentFormat', rec.content_format
        ),
        null,
        project_id,
        post_type_id,
        template_id,
        null,
        null,
        case
          when rec.status = 'review' then 'finals_ready'::public.creative_request_status
          when rec.status = 'blocked' then 'closed'::public.creative_request_status
          else 'approved'::public.creative_request_status
        end,
        deliverable_id
      );

      insert into public.prompt_packages (
        id,
        workspace_id,
        brand_id,
        creative_request_id,
        brand_profile_version_id,
        prompt_summary,
        seed_prompt,
        final_prompt,
        aspect_ratio,
        chosen_model,
        template_type,
        reference_strategy,
        reference_asset_ids,
        resolved_constraints,
        compiler_trace,
        created_by,
        project_id,
        post_type_id,
        creative_template_id,
        calendar_item_id,
        deliverable_id
      ) values (
        prompt_package_id,
        target_workspace_id,
        target_brand_id,
        creative_request_id,
        brand_profile_id,
        rec.title,
        coalesce(rec.brief_text, rec.title),
        coalesce(rec.brief_text, rec.title),
        case
          when rec.placement_code = 'instagram-story' then '9:16'
          when rec.post_type_code = 'festive-greeting' then '1:1'
          else '4:5'
        end,
        'premium_visual_model',
        case rec.post_type_code
          when 'festive-greeting' then 'quote'
          when 'site-visit-invite' then 'announcement'
          when 'construction-update' then 'announcement'
          when 'amenity-spotlight' then 'product-focus'
          else 'hero'
        end,
        'uploaded-references',
        case
          when project_id = zoy_project_id then array['f81a56bf-81d2-42c1-b9ba-6491cb6992b9'::uuid]
          when project_id = aventis_project_id then array['e4b52db7-5d86-4dbf-b046-34ccdef9c174'::uuid]
          when project_id = luxovert_project_id then array['2caafc00-563a-41f1-ab5d-a38ecb488a1a'::uuid]
          when project_id = zillenia_phase_2_project_id then array['29fdad0c-135d-40a9-ad6a-6bfe15482db8'::uuid]
          else array[]::uuid[]
        end,
        jsonb_build_object('seededDemo', true),
        jsonb_build_object('seededDemo', true),
        null,
        project_id,
        post_type_id,
        template_id,
        null,
        deliverable_id
      );

      insert into public.creative_jobs (
        id,
        workspace_id,
        brand_id,
        prompt_package_id,
        selected_template_id,
        job_type,
        status,
        provider,
        provider_model,
        provider_request_id,
        requested_count,
        request_payload,
        webhook_payload,
        error_json,
        submitted_at,
        completed_at,
        created_by,
        project_id,
        post_type_id,
        creative_template_id,
        calendar_item_id,
        deliverable_id
      ) values (
        creative_job_id,
        target_workspace_id,
        target_brand_id,
        prompt_package_id,
        null,
        'final',
        'completed',
        'demo-seed',
        'seeded-preview',
        'demo-' || rec.code,
        1,
        jsonb_build_object('seededDemo', true),
        '{}'::jsonb,
        null,
        rec.scheduled_for - interval '2 days',
        rec.scheduled_for - interval '2 days' + interval '8 minutes',
        null,
        project_id,
        post_type_id,
        template_id,
        null,
        deliverable_id
      );

      insert into public.post_versions (
        id,
        deliverable_id,
        version_number,
        status,
        headline,
        caption,
        body_json,
        cta_text,
        hashtags,
        notes_json,
        created_from_prompt_package_id,
        created_from_template_id,
        created_from_output_id,
        created_by
      ) values (
        post_version_id,
        deliverable_id,
        1,
        rec.post_version_status,
        rec.title,
        rec.brief_text,
        jsonb_build_object(
          'summary', rec.brief_text,
          'seededDemo', true,
          'postTypeCode', rec.post_type_code
        ),
        rec.cta_text,
        array['#KrisalaDevelopers', '#PuneRealEstate'],
        jsonb_build_object('seededDemo', true),
        prompt_package_id,
        template_id,
        null,
        null
      );

      insert into public.creative_outputs (
        id,
        workspace_id,
        brand_id,
        job_id,
        kind,
        storage_path,
        provider_url,
        output_index,
        metadata_json,
        created_by,
        review_state,
        latest_feedback_verdict,
        reviewed_at,
        project_id,
        post_type_id,
        creative_template_id,
        calendar_item_id,
        deliverable_id,
        post_version_id
      ) values (
        creative_output_id,
        target_workspace_id,
        target_brand_id,
        creative_job_id,
        'final',
        rec.preview_storage_path,
        null,
        1,
        jsonb_build_object('seededDemo', true),
        null,
        rec.review_state,
        rec.latest_feedback_verdict,
        case when rec.approval_action is not null then rec.scheduled_for - interval '1 day' else null end,
        project_id,
        post_type_id,
        template_id,
        null,
        deliverable_id,
        post_version_id
      );

      update public.post_versions
      set created_from_output_id = creative_output_id
      where id = post_version_id;

      update public.deliverables
      set
        latest_post_version_id = post_version_id,
        approved_post_version_id = case
          when rec.status in ('approved', 'scheduled', 'published') then post_version_id
          else null
        end
      where id = deliverable_id;

      if rec.approval_action is not null then
        insert into public.approval_events (
          id,
          deliverable_id,
          post_version_id,
          reviewer_user_id,
          action,
          comment,
          metadata_json,
          created_at
        ) values (
          gen_random_uuid(),
          deliverable_id,
          post_version_id,
          null,
          rec.approval_action,
          case
            when rec.approval_action = 'reject' then 'Blocked for demo realism due to off-brand or weak execution.'
            else 'Approved for demo realism.'
          end,
          jsonb_build_object('seededDemo', true),
          rec.scheduled_for - interval '1 day'
        );
      end if;

      if rec.publication_status is not null then
        insert into public.publications (
          id,
          workspace_id,
          brand_id,
          deliverable_id,
          post_version_id,
          channel_account_id,
          scheduled_for,
          published_at,
          status,
          provider,
          provider_publication_id,
          provider_payload_json,
          error_json,
          created_by
        ) values (
          gen_random_uuid(),
          target_workspace_id,
          target_brand_id,
          deliverable_id,
          post_version_id,
          channel_account_id,
          rec.scheduled_for,
          rec.published_at,
          rec.publication_status,
          'demo-seed',
          null,
          jsonb_build_object('seededDemo', true),
          null,
          null
        );
      end if;
    end if;
  end loop;
end $$;

commit;
