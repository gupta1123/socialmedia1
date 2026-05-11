with pride_presets as (
  select p.id, p.preset_key
  from public.creative_v3_brand_presets p
  join public.brands b on b.id = p.brand_id
  where b.slug in ('pride-world-group', 'pride-group', 'pride-world-city', 'pwc')
     or lower(b.name) in ('pride world group', 'pride group', 'pride world city', 'pwc')
)
update public.creative_v3_brand_presets p
set
  preset_json =
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            p.preset_json,
            '{rera_qr}',
            coalesce(p.preset_json->'rera_qr', '{}'::jsonb) || jsonb_build_object(
              'position', 'top_right',
              'max_instances', 1,
              'size', 'compact_badge',
              'height_match', 'logo_height',
              'max_width_ratio', 0.25,
              'avoid_full_width_banner', true,
              'avoid_footer_placement', true,
              'never_generate_qr', true,
              'render_mode', 'composite_rera_block',
              'source', 'exact_asset_only'
            ),
            true
          ),
          '{contact}',
          coalesce(p.preset_json->'contact', '{}'::jsonb) || jsonb_build_object(
            'position', 'bottom_right',
            'disallow_sources', jsonb_build_array('rera_compliance_block'),
            'website_source_priority', jsonb_build_array(
              'project.profile.contact.website',
              'project.profile.website',
              'brand.profile.contact.website',
              'brand.profile.website'
            )
          ),
          true
        ),
        '{conditional_layouts}',
        coalesce(p.preset_json->'conditional_layouts', '{}'::jsonb) || jsonb_build_object(
          'when_rera_required',
          case
            when p.preset_key = 'pwc_township_standard_dual_logo_location_contact' then jsonb_build_object(
              'logo', jsonb_build_object('position', 'top_left', 'brand_mark', 'pwc_logo'),
              'secondary_logo', jsonb_build_object('position', 'top_left_near_primary', 'brand_mark', 'pride_group_logo'),
              'rera_qr', jsonb_build_object('position', 'top_right', 'required', true),
              'notes', 'When RERA is triggered, switch to the with-RERA township layout: RERA top-right, PWC top-left, Pride Group as secondary in the top-left logo group.'
            )
            else jsonb_build_object(
              'logo', jsonb_build_object('position', 'top_left', 'brand_mark', 'pwc_logo'),
              'rera_qr', jsonb_build_object('position', 'top_right', 'required', true),
              'notes', 'When RERA is triggered, switch to the with-RERA layout: RERA top-right and PWC top-left.'
            )
          end
        ),
        true
      ),
      '{client_rules}',
      (
        coalesce(p.preset_json->'client_rules', '[]'::jsonb) ||
        case
          when p.preset_key in ('pwc_standard_logo_right_location_contact', 'pwc_township_standard_dual_logo_location_contact')
            and not coalesce(p.preset_json->'client_rules', '[]'::jsonb) @> jsonb_build_array('If RERA becomes required due to project, typology, or pricing, switch to the with-RERA layout: RERA top-right and PWC logo top-left; do not place PWC logo and RERA in the same corner.') then
            jsonb_build_array('If RERA becomes required due to project, typology, or pricing, switch to the with-RERA layout: RERA top-right and PWC logo top-left; do not place PWC logo and RERA in the same corner.')
          else '[]'::jsonb
        end
      ),
      true
    ),
  description = case
    when p.preset_key = 'pwc_standard_logo_right_location_contact' then
      'For creatives without RERA: PWC logo top-right. If RERA is triggered, switch to RERA top-right and PWC logo top-left.'
    when p.preset_key = 'pwc_township_standard_dual_logo_location_contact' then
      'For township-level creatives without RERA: include Pride Group logo and PWC logo. If RERA is triggered, switch to the township with-RERA layout.'
    else p.description
  end,
  updated_at = timezone('utc', now())
from pride_presets pp
where p.id = pp.id
  and p.preset_key in (
    'pwc_standard_logo_right_location_contact',
    'pwc_with_rera_logo_left_rera_right_location_contact',
    'pwc_township_standard_dual_logo_location_contact',
    'pwc_township_with_rera_dual_logo_rera_right_location_contact'
  );
