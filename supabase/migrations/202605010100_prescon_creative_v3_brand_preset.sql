insert into public.creative_v3_brand_presets (
  workspace_id,
  brand_id,
  project_id,
  preset_key,
  name,
  description,
  preset_json,
  active
)
select
  b.workspace_id,
  b.id,
  p.id,
  'prescon_logo_left_rera_right_contact_footer',
  'Prescon Compliance Header + Contact Footer',
  'Logo top-left, RERA compliance block top-right, grounded phone/email/website footer when available.',
  jsonb_build_object(
    'logo', jsonb_build_object(
      'required', true,
      'position', 'top_left',
      'max_instances', 1,
      'source', 'exact_asset_only'
    ),
    'rera_qr', jsonb_build_object(
      'required', true,
      'position', 'top_right',
      'max_instances', 1,
      'source', 'exact_asset_only',
      'render_mode', 'composite_rera_block',
      'size', 'compact_badge',
      'height_match', 'logo_height',
      'max_width_ratio', 0.25,
      'avoid_full_width_banner', true,
      'avoid_footer_placement', true,
      'never_generate_qr', true
    ),
    'contact', jsonb_build_object(
      'required', false,
      'include_if_grounded', true,
      'position', 'bottom_footer',
      'items', jsonb_build_array('phone', 'email', 'website')
    ),
    'typography', jsonb_build_object(
      'source', 'brand_profile',
      'fallback_mood', 'Elegant premium editorial'
    ),
    'palette', jsonb_build_object(
      'source', 'brand_profile',
      'fallback', jsonb_build_object(
        'primary', '#16254A',
        'secondary', '#D5B16A',
        'accent', '#F4F0E7',
        'neutrals', jsonb_build_array('#FFFFFF', '#F6F6F3', '#1F2937')
      )
    )
  ),
  true
from public.brands b
join public.projects p on p.brand_id = b.id
where b.slug = 'prescon'
  and p.slug = 'prescon-midtown-bay'
on conflict (workspace_id, brand_id, preset_key)
do update set
  project_id = excluded.project_id,
  name = excluded.name,
  description = excluded.description,
  preset_json = excluded.preset_json,
  active = true,
  updated_at = timezone('utc', now());
