do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'series_status'
  ) then
    create type public.series_status as enum ('draft', 'active', 'paused', 'archived');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'planning_mode'
  ) then
    create type public.planning_mode as enum ('campaign', 'series', 'one_off', 'always_on', 'ad_hoc');
  end if;
end
$$;

create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  content_pillar_id uuid references public.content_pillars(id) on delete set null,
  name text not null,
  description text,
  objective_code public.objective_code,
  post_type_id uuid references public.post_types(id) on delete set null,
  creative_template_id uuid references public.creative_templates(id) on delete set null,
  channel_account_id uuid references public.channel_accounts(id) on delete set null,
  placement_code public.placement_code,
  content_format public.content_format,
  owner_user_id uuid references public.profiles(id) on delete set null,
  cadence_json jsonb not null default '{}'::jsonb,
  start_at timestamptz,
  end_at timestamptz,
  status public.series_status not null default 'draft',
  source_brief_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.deliverables
  add column if not exists series_id uuid references public.series(id) on delete set null,
  add column if not exists planning_mode public.planning_mode,
  add column if not exists series_occurrence_date date;

update public.deliverables
set planning_mode = case
  when campaign_id is not null then 'campaign'::public.planning_mode
  when legacy_creative_request_id is not null then 'ad_hoc'::public.planning_mode
  else 'one_off'::public.planning_mode
end
where planning_mode is null;

alter table public.deliverables
  alter column planning_mode set default 'one_off',
  alter column planning_mode set not null;

alter table public.series enable row level security;

create policy "workspace members read series" on public.series
  for select using (public.is_workspace_member(workspace_id));

create policy "editors manage series" on public.series
  for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

drop trigger if exists set_series_updated_at on public.series;
create trigger set_series_updated_at
before update on public.series
for each row execute procedure public.set_updated_at();

create index if not exists series_workspace_brand_status_idx
  on public.series (workspace_id, brand_id, status, start_at desc);

create index if not exists deliverables_workspace_owner_status_schedule_idx
  on public.deliverables (workspace_id, owner_user_id, status, due_at, scheduled_for);

create unique index if not exists deliverables_series_occurrence_uidx
  on public.deliverables (series_id, series_occurrence_date)
  where series_id is not null and series_occurrence_date is not null;

create index if not exists deliverables_workspace_planning_mode_schedule_idx
  on public.deliverables (workspace_id, planning_mode, status, scheduled_for);
