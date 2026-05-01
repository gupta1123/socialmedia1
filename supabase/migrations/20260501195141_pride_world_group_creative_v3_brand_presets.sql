with pride_brands as (
  select b.id, b.workspace_id
  from public.brands b
  where b.slug in (
    'pride-world-group',
    'pride-group',
    'pride-world-city',
    'pwc'
  )
  or lower(b.name) in (
    'pride world group',
    'pride group',
    'pride world city',
    'pwc'
  )
),
preset_rows as (
  select
    pb.workspace_id,
    pb.id as brand_id,
    null::uuid as project_id,
    preset_key,
    name,
    description,
    preset_json,
    true as active
  from pride_brands pb
  cross join (
    values
      (
        'pwc_standard_logo_right_location_contact',
        'PWC Standard',
        'For creatives without RERA: PWC logo top-right, location bottom-left, contact bottom-right when used.',
        jsonb_build_object(
          'logo', jsonb_build_object(
            'required', true,
            'brand_mark', 'pwc_logo',
            'position', 'top_right',
            'max_instances', 1,
            'source', 'exact_asset_only'
          ),
          'rera_qr', jsonb_build_object(
            'required', false,
            'trigger_required_when_fact_types', jsonb_build_array('project', 'typology', 'pricing'),
            'source', 'exact_asset_only',
            'render_mode', 'composite_rera_block',
            'never_generate_qr', true
          ),
          'location', jsonb_build_object(
            'required', true,
            'position', 'bottom_left',
            'fallback_position_without_contact', 'bottom_center',
            'include_pin_icon', true,
            'source', 'project_location_only'
          ),
          'contact', jsonb_build_object(
            'required', false,
            'include_if_grounded', true,
            'position', 'bottom_right',
            'items', jsonb_build_array('phone')
          ),
          'spacing', jsonb_build_object(
            'safe_margin', 'adequate',
            'avoid_edge_crowding', true,
            'notes', 'Maintain adequate spacing from borders for logo, location, contact, and any compliance elements.'
          ),
          'client_rules', jsonb_build_array(
            'Pride World City logo is mandatory on all creatives.',
            'If RERA details are not used, place PWC logo at the top-right corner.',
            'Location must be displayed at the bottom-left corner with a location pin icon.',
            'Contact number should be placed at the bottom-right corner.',
            'If contact number is not used, location can be centered at the bottom.',
            'Maintain adequate spacing from borders for all elements.'
          )
        )
      ),
      (
        'pwc_with_rera_logo_left_rera_right_location_contact',
        'PWC With RERA',
        'For project, typology, or pricing creatives: RERA top-right, PWC logo top-left, location/contact at bottom.',
        jsonb_build_object(
          'logo', jsonb_build_object(
            'required', true,
            'brand_mark', 'pwc_logo',
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
            'never_generate_qr', true,
            'required_when_fact_types', jsonb_build_array('project', 'typology', 'pricing')
          ),
          'location', jsonb_build_object(
            'required', true,
            'position', 'bottom_left',
            'fallback_position_without_contact', 'bottom_center',
            'include_pin_icon', true,
            'source', 'project_location_only'
          ),
          'contact', jsonb_build_object(
            'required', false,
            'include_if_grounded', true,
            'position', 'bottom_right',
            'items', jsonb_build_array('phone')
          ),
          'spacing', jsonb_build_object(
            'safe_margin', 'adequate',
            'avoid_edge_crowding', true,
            'notes', 'Maintain adequate spacing from borders for logo, RERA, location, and contact.'
          ),
          'client_rules', jsonb_build_array(
            'Pride World City logo is mandatory on all creatives.',
            'If RERA details are used, place RERA at the top-right corner and PWC logo at the top-left corner.',
            'RERA details are compulsory when mentioning project, typology, or pricing.',
            'Location must be displayed at the bottom-left corner with a location pin icon.',
            'Contact number should be placed at the bottom-right corner.',
            'If contact number is not used, location can be centered at the bottom.',
            'Maintain adequate spacing from borders for all elements.'
          )
        )
      ),
      (
        'pwc_township_standard_dual_logo_location_contact',
        'Township Standard',
        'For township-level creatives without RERA: include Pride Group logo and PWC logo, plus location/contact rules.',
        jsonb_build_object(
          'logo', jsonb_build_object(
            'required', true,
            'brand_mark', 'pwc_logo',
            'position', 'top_right',
            'max_instances', 1,
            'source', 'exact_asset_only'
          ),
          'secondary_logo', jsonb_build_object(
            'required', true,
            'brand_mark', 'pride_group_logo',
            'position', 'top_left',
            'max_instances', 1,
            'source', 'exact_asset_only'
          ),
          'rera_qr', jsonb_build_object(
            'required', false,
            'trigger_required_when_fact_types', jsonb_build_array('project', 'typology', 'pricing'),
            'source', 'exact_asset_only',
            'render_mode', 'composite_rera_block',
            'never_generate_qr', true
          ),
          'location', jsonb_build_object(
            'required', true,
            'position', 'bottom_left',
            'fallback_position_without_contact', 'bottom_center',
            'include_pin_icon', true,
            'source', 'project_location_only'
          ),
          'contact', jsonb_build_object(
            'required', false,
            'include_if_grounded', true,
            'position', 'bottom_right',
            'items', jsonb_build_array('phone')
          ),
          'spacing', jsonb_build_object(
            'safe_margin', 'adequate',
            'avoid_edge_crowding', true,
            'notes', 'Maintain adequate spacing from borders for both logos, location, and contact.'
          ),
          'client_rules', jsonb_build_array(
            'For township-level creatives, include both Pride Group logo and PWC logo.',
            'If RERA details are not used, place PWC logo at the top-right corner.',
            'Location must be displayed at the bottom-left corner with a location pin icon.',
            'Contact number should be placed at the bottom-right corner.',
            'If contact number is not used, location can be centered at the bottom.',
            'Maintain adequate spacing from borders for all elements.'
          )
        )
      ),
      (
        'pwc_township_with_rera_dual_logo_rera_right_location_contact',
        'Township With RERA',
        'For township-level creatives with RERA: RERA top-right, PWC logo top-left, Pride Group secondary logo, location/contact rules.',
        jsonb_build_object(
          'logo', jsonb_build_object(
            'required', true,
            'brand_mark', 'pwc_logo',
            'position', 'top_left',
            'max_instances', 1,
            'source', 'exact_asset_only'
          ),
          'secondary_logo', jsonb_build_object(
            'required', true,
            'brand_mark', 'pride_group_logo',
            'position', 'top_left_near_primary',
            'max_instances', 1,
            'source', 'exact_asset_only',
            'notes', 'Place as a secondary brand mark without crowding the PWC logo or RERA block.'
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
            'never_generate_qr', true,
            'required_when_fact_types', jsonb_build_array('project', 'typology', 'pricing')
          ),
          'location', jsonb_build_object(
            'required', true,
            'position', 'bottom_left',
            'fallback_position_without_contact', 'bottom_center',
            'include_pin_icon', true,
            'source', 'project_location_only'
          ),
          'contact', jsonb_build_object(
            'required', false,
            'include_if_grounded', true,
            'position', 'bottom_right',
            'items', jsonb_build_array('phone')
          ),
          'spacing', jsonb_build_object(
            'safe_margin', 'adequate',
            'avoid_edge_crowding', true,
            'notes', 'Maintain adequate spacing from borders for RERA, both logos, location, and contact.'
          ),
          'client_rules', jsonb_build_array(
            'For township-level creatives, include both Pride Group logo and PWC logo.',
            'If RERA details are used, place RERA at the top-right corner and PWC logo at the top-left corner.',
            'RERA details are compulsory when mentioning project, typology, or pricing.',
            'Location must be displayed at the bottom-left corner with a location pin icon.',
            'Contact number should be placed at the bottom-right corner.',
            'If contact number is not used, location can be centered at the bottom.',
            'Maintain adequate spacing from borders for all elements.'
          )
        )
      )
  ) as presets(preset_key, name, description, preset_json)
)
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
  workspace_id,
  brand_id,
  project_id,
  preset_key,
  name,
  description,
  preset_json,
  active
from preset_rows
on conflict (workspace_id, brand_id, preset_key)
do update set
  project_id = excluded.project_id,
  name = excluded.name,
  description = excluded.description,
  preset_json = excluded.preset_json,
  active = true,
  updated_at = timezone('utc', now());
