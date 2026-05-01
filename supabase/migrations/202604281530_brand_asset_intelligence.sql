alter table public.brand_assets
  add column if not exists asset_description text,
  add column if not exists truth_status text,
  add column if not exists scene_type text,
  add column if not exists visual_use text,
  add column if not exists safe_claims text[] not null default '{}'::text[],
  add column if not exists do_not_claim text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'brand_assets_truth_status_check'
      and conrelid = 'public.brand_assets'::regclass
  ) then
    alter table public.brand_assets
      add constraint brand_assets_truth_status_check
      check (
        truth_status is null
        or truth_status in (
          'render',
          'photograph',
          'floor_plan',
          'map',
          'logo',
          'qr',
          'brochure',
          'video',
          'unknown'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'brand_assets_visual_use_check'
      and conrelid = 'public.brand_assets'::regclass
  ) then
    alter table public.brand_assets
      add constraint brand_assets_visual_use_check
      check (
        visual_use is null
        or visual_use in (
          'hero_anchor',
          'support_anchor',
          'background_context',
          'truth_anchor',
          'amenity_anchor',
          'supporting_ref',
          'supporting_reference',
          'exact_asset',
          'compliance_asset',
          'compliance',
          'brand_mark',
          'video_reference',
          'do_not_use'
        )
      );
  end if;
end
$$;

update public.brand_assets
set
  asset_description = coalesce(
    asset_description,
    nullif(metadata_json ->> 'assetDescription', ''),
    nullif(metadata_json ->> 'description', ''),
    nullif(metadata_json ->> 'notes', '')
  ),
  truth_status = coalesce(
    truth_status,
    nullif(metadata_json ->> 'truthStatus', '')
  ),
  scene_type = coalesce(
    scene_type,
    nullif(metadata_json ->> 'sceneType', ''),
    nullif(metadata_json ->> 'subjectType', '')
  ),
  visual_use = coalesce(
    visual_use,
    nullif(metadata_json ->> 'visualUse', ''),
    nullif(metadata_json ->> 'usageIntent', '')
  ),
  safe_claims = case
    when safe_claims <> '{}'::text[] then safe_claims
    when jsonb_typeof(metadata_json -> 'safeClaims') = 'array' then (
      select coalesce(array_agg(value), '{}'::text[])
      from jsonb_array_elements_text(metadata_json -> 'safeClaims') as values(value)
    )
    else safe_claims
  end,
  do_not_claim = case
    when do_not_claim <> '{}'::text[] then do_not_claim
    when jsonb_typeof(metadata_json -> 'doNotClaim') = 'array' then (
      select coalesce(array_agg(value), '{}'::text[])
      from jsonb_array_elements_text(metadata_json -> 'doNotClaim') as values(value)
    )
    else do_not_claim
  end;

create index if not exists brand_assets_truth_status_idx
  on public.brand_assets (truth_status)
  where truth_status is not null;

create index if not exists brand_assets_scene_type_idx
  on public.brand_assets (scene_type)
  where scene_type is not null;

create index if not exists brand_assets_visual_use_idx
  on public.brand_assets (visual_use)
  where visual_use is not null;
