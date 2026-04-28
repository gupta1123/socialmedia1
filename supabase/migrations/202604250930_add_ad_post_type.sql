insert into public.post_types (workspace_id, code, name, description, config_json, is_system, active)
select
  null,
  'ad',
  'Ad',
  'Drive enquiries with one clear premium commercial hook and readable action hierarchy.',
  jsonb_build_object(
    'defaultChannels', jsonb_build_array('instagram-feed', 'instagram-story', 'ad-creative'),
    'allowedFormats', jsonb_build_array('square', 'portrait', 'story', 'landscape'),
    'recommendedTemplateTypes', jsonb_build_array('offer', 'announcement', 'hero'),
    'requiredBriefFields', jsonb_build_array('goal', 'prompt'),
    'safeZoneGuidance', jsonb_build_array('Keep one dominant hook readable at feed size and keep compliance subordinate'),
    'ctaStyle', 'lead-gen',
    'copyDensity', 'balanced'
  ),
  true,
  true
where not exists (
  select 1
  from public.post_types
  where workspace_id is null
    and code = 'ad'
);
