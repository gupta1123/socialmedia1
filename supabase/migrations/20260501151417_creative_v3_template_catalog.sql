create table if not exists public.creative_v3_visual_template_catalog (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name text not null,
  description text,
  content_job_id text,
  allowed_formats text[] not null default '{}'::text[],
  lever_signature jsonb not null default '{}'::jsonb,
  template_json jsonb not null default '{}'::jsonb,
  status text not null default 'approved',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint creative_v3_visual_template_catalog_status_check
    check (status in ('draft', 'approved', 'archived'))
);

drop trigger if exists set_creative_v3_visual_template_catalog_updated_at on public.creative_v3_visual_template_catalog;
create trigger set_creative_v3_visual_template_catalog_updated_at
before update on public.creative_v3_visual_template_catalog
for each row execute procedure public.set_updated_at();

create index if not exists creative_v3_visual_template_catalog_lookup_idx
  on public.creative_v3_visual_template_catalog (content_job_id, status);

insert into public.creative_v3_visual_template_catalog (
  template_key,
  name,
  description,
  content_job_id,
  allowed_formats,
  lever_signature,
  template_json,
  status,
  created_at,
  updated_at
)
select distinct on (template_key)
  template_key,
  name,
  description,
  content_job_id,
  allowed_formats,
  lever_signature,
  template_json,
  status,
  min(created_at) over (partition by template_key),
  max(updated_at) over (partition by template_key)
from public.creative_v3_visual_templates
where
  brand_id is null
  and project_id is null
  and post_type_id is null
order by template_key, updated_at desc
on conflict (template_key) do update
set
  name = excluded.name,
  description = excluded.description,
  content_job_id = excluded.content_job_id,
  allowed_formats = excluded.allowed_formats,
  lever_signature = excluded.lever_signature,
  template_json = excluded.template_json,
  status = excluded.status,
  updated_at = timezone('utc', now());

delete from public.creative_v3_visual_templates
where
  brand_id is null
  and project_id is null
  and post_type_id is null
  and template_key in (select template_key from public.creative_v3_visual_template_catalog);

alter table public.creative_v3_visual_template_catalog enable row level security;

drop policy if exists "authenticated users read approved creative v3 template catalog" on public.creative_v3_visual_template_catalog;
create policy "authenticated users read approved creative v3 template catalog" on public.creative_v3_visual_template_catalog
for select to authenticated
using (status = 'approved');
