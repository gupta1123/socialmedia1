do $$
declare
  asteria_brand_id uuid;
  krisala_brand_id uuid;
  zoy_project_id uuid;
begin
  select id into asteria_brand_id from public.brands where name = 'Asteria Developers' limit 1;
  select id into krisala_brand_id from public.brands where name = 'Krisala Developers' limit 1;
  select id into zoy_project_id from public.projects where name = 'Zoy+' limit 1;

  update public.projects
  set brand_id = asteria_brand_id
  where id = zoy_project_id;

  update public.brand_assets
  set brand_id = asteria_brand_id,
      project_id = zoy_project_id
  where id = 'f81a56bf-81d2-42c1-b9ba-6491cb6992b9';

  delete from public.brand_profile_versions where brand_id = krisala_brand_id;
  delete from public.brands where id = krisala_brand_id;
end $$;
