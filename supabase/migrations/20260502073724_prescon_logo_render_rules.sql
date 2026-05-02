update public.creative_v3_brand_presets
set
  preset_json = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            coalesce(preset_json, '{}'::jsonb),
            '{logo,size_mode}',
            to_jsonb('height_ratio'::text),
            true
          ),
          '{logo,height_ratio}',
          to_jsonb(0.055),
          true
        ),
        '{logo,margin_left_ratio}',
        to_jsonb(0.05),
        true
      ),
      '{logo,margin_top_ratio}',
      to_jsonb(0.04),
      true
    ),
    '{logo,preserve_identity}',
    to_jsonb(true),
    true
  ),
  updated_at = timezone('utc', now())
where preset_key = 'prescon_logo_left_rera_right_contact_footer'
  and exists (
    select 1
    from public.brands b
    where b.id = creative_v3_brand_presets.brand_id
      and b.slug = 'prescon'
  );
