do $$
declare
  target_brand record;
  current_profile record;
  next_profile_id uuid := gen_random_uuid();
  next_version_number integer;
  next_profile_json jsonb;
begin
  select b.id, b.workspace_id, b.name, b.slug, b.created_by, b.current_profile_version_id
  into target_brand
  from public.brands b
  where lower(b.name) = lower('Krisala Developers')
     or lower(b.slug) = lower('krisala-developers')
  order by b.created_at asc
  limit 1;

  if target_brand is null then
    raise notice 'Krisala Developers brand not found. Skipping typography migration.';
    return;
  end if;

  if target_brand.current_profile_version_id is null then
    raise notice 'Krisala Developers has no active profile. Skipping typography migration.';
    return;
  end if;

  select bpv.id, bpv.version_number, bpv.profile_json, bpv.created_by
  into current_profile
  from public.brand_profile_versions bpv
  where bpv.id = target_brand.current_profile_version_id;

  if current_profile is null then
    raise notice 'Active profile version % not found for Krisala Developers. Skipping typography migration.', target_brand.current_profile_version_id;
    return;
  end if;

  if coalesce(current_profile.profile_json #>> '{visualSystem,headlineFontFamily}', '') = 'Gotham'
     and coalesce(current_profile.profile_json #>> '{visualSystem,bodyFontFamily}', '') = 'Gotham Book' then
    raise notice 'Krisala Developers active profile already has Gotham typography configured. Skipping.';
    return;
  end if;

  select coalesce(max(version_number), 0) + 1
  into next_version_number
  from public.brand_profile_versions
  where brand_id = target_brand.id;

  next_profile_json :=
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            coalesce(current_profile.profile_json, '{}'::jsonb),
            '{visualSystem,typographyMood}',
            to_jsonb('Gotham-led contemporary premium sans-serif hierarchy with disciplined restraint.'::text),
            true
          ),
          '{visualSystem,headlineFontFamily}',
          to_jsonb('Gotham'::text),
          true
        ),
        '{visualSystem,bodyFontFamily}',
        to_jsonb('Gotham Book'::text),
        true
      ),
      '{visualSystem,typographyNotes}',
      to_jsonb(
        array[
          'Use Gotham-led sans-serif typography for brand-led post layouts.',
          'Keep headline hierarchy bold, clean, and premium rather than decorative.',
          'Use slightly open tracking for metadata, eyebrow labels, and small supporting text.',
          'Avoid decorative serif or script styling in standard project-launch, construction-update, and amenity post layouts.'
        ]::text[]
      ),
      true
    );

  insert into public.brand_profile_versions (
    id,
    workspace_id,
    brand_id,
    version_number,
    profile_json,
    created_by
  ) values (
    next_profile_id,
    target_brand.workspace_id,
    target_brand.id,
    next_version_number,
    next_profile_json,
    coalesce(current_profile.created_by, target_brand.created_by)
  );

  update public.brands
  set current_profile_version_id = next_profile_id
  where id = target_brand.id;

  raise notice 'Krisala Developers typography updated to Gotham in profile version %.', next_version_number;
end
$$;
