with prescon_target as (
  select
    b.id as brand_id,
    p.id as project_id
  from public.brands b
  join public.projects p on p.brand_id = b.id
  where b.slug = 'prescon'
    and p.slug = 'prescon-midtown-bay'
)
update public.creative_v3_brand_presets preset
set
  name = 'Prescon Dual Logo + Phone Contact',
  description = 'Main/project logo top-left at height ratio 0.055, second brand logo bottom-left, contact number bottom-right when available.',
  preset_json = jsonb_build_object(
    'logo', jsonb_build_object(
      'required', true,
      'brand_mark', 'project_logo',
      'position', 'top_left',
      'source', 'exact_asset_only',
      'size_mode', 'height_ratio',
      'height_ratio', 0.055,
      'max_instances', 1,
      'margin_top_ratio', 0.04,
      'margin_left_ratio', 0.05,
      'preserve_identity', true
    ),
    'secondary_logo', jsonb_build_object(
      'required', true,
      'brand_mark', 'brand_logo',
      'position', 'bottom_left',
      'source', 'exact_asset_only',
      'size_mode', 'height_ratio',
      'height_ratio', 0.045,
      'max_instances', 1,
      'margin_left_ratio', 0.05,
      'margin_bottom_ratio', 0.04,
      'preserve_identity', true
    ),
    'contact', jsonb_build_object(
      'required', false,
      'include_if_grounded', true,
      'position', 'bottom_right',
      'items', jsonb_build_array('phone'),
      'margin_right_ratio', 0.05,
      'margin_bottom_ratio', 0.04
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
    ),
    'spacing', jsonb_build_object(
      'safe_margin', 'adequate',
      'safe_margin_ratio', 0.04,
      'avoid_edge_crowding', true,
      'notes', 'Keep both logos and contact number comfortably inside safe margins.'
    ),
    'client_rules', jsonb_build_array(
      'Main/project logo must be placed at the top-left corner.',
      'Main/project logo uses height_ratio 0.055 with 5% left margin and 4% top margin.',
      'Second/brand logo must be placed at the bottom-left corner.',
      'Second/brand logo uses height_ratio 0.045 with 5% left margin and 4% bottom margin.',
      'Contact number should be placed at the bottom-right corner when grounded.',
      'Contact number uses 5% right margin and 4% bottom margin.'
    )
  ),
  active = true,
  updated_at = timezone('utc', now())
from prescon_target target
where preset.brand_id = target.brand_id
  and preset.project_id = target.project_id
  and preset.preset_key = 'prescon_logo_left_rera_right_contact_footer';
