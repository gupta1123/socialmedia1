do $$
begin
  if not exists (select 1 from pg_type where typname = 'objective_code') then
    create type public.objective_code as enum ('awareness', 'engagement', 'lead_gen', 'trust', 'footfall');
  end if;

  if not exists (select 1 from pg_type where typname = 'deliverable_status') then
    create type public.deliverable_status as enum (
      'planned',
      'brief_ready',
      'generating',
      'review',
      'approved',
      'scheduled',
      'published',
      'archived',
      'blocked'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'deliverable_priority') then
    create type public.deliverable_priority as enum ('low', 'normal', 'high', 'urgent');
  end if;

  if not exists (select 1 from pg_type where typname = 'post_version_status') then
    create type public.post_version_status as enum ('draft', 'in_review', 'approved', 'rejected', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'approval_action') then
    create type public.approval_action as enum ('approve', 'request_changes', 'reject', 'close');
  end if;

  if not exists (select 1 from pg_type where typname = 'publication_status') then
    create type public.publication_status as enum ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'channel_platform') then
    create type public.channel_platform as enum ('instagram', 'facebook', 'linkedin', 'x', 'whatsapp', 'ads');
  end if;

  if not exists (select 1 from pg_type where typname = 'content_format') then
    create type public.content_format as enum ('static', 'carousel', 'video', 'story');
  end if;

  if not exists (select 1 from pg_type where typname = 'placement_code') then
    create type public.placement_code as enum (
      'instagram-feed',
      'instagram-story',
      'linkedin-feed',
      'x-post',
      'tiktok-cover',
      'ad-creative'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'campaign_status') then
    create type public.campaign_status as enum ('draft', 'active', 'paused', 'completed', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'post_version_asset_role') then
    create type public.post_version_asset_role as enum ('primary', 'supporting', 'logo', 'source');
  end if;
end
$$;

create table if not exists public.brand_personas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  description text,
  attributes_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.content_pillars (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (brand_id, code)
);

create table if not exists public.channel_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  platform public.channel_platform not null,
  handle text not null,
  display_name text,
  timezone text,
  external_account_id text,
  config_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  objective_code public.objective_code not null default 'awareness',
  target_persona_id uuid references public.brand_personas(id) on delete set null,
  primary_project_id uuid references public.projects(id) on delete set null,
  key_message text not null default '',
  cta_text text,
  start_at timestamptz,
  end_at timestamptz,
  owner_user_id uuid references public.profiles(id) on delete set null,
  kpi_goal_json jsonb not null default '{}'::jsonb,
  status public.campaign_status not null default 'draft',
  notes_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.campaign_projects (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (campaign_id, project_id)
);

create table if not exists public.campaign_deliverable_plans (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  post_type_id uuid not null references public.post_types(id) on delete cascade,
  template_id uuid references public.creative_templates(id) on delete set null,
  channel_account_id uuid references public.channel_accounts(id) on delete set null,
  placement_code public.placement_code not null,
  content_format public.content_format not null default 'static',
  objective_override public.objective_code,
  cta_override text,
  brief_override text,
  scheduled_offset_days integer,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.deliverables (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  persona_id uuid references public.brand_personas(id) on delete set null,
  content_pillar_id uuid references public.content_pillars(id) on delete set null,
  post_type_id uuid not null references public.post_types(id) on delete cascade,
  creative_template_id uuid references public.creative_templates(id) on delete set null,
  channel_account_id uuid references public.channel_accounts(id) on delete set null,
  objective_code public.objective_code not null default 'awareness',
  placement_code public.placement_code not null,
  content_format public.content_format not null default 'static',
  title text not null,
  brief_text text,
  cta_text text,
  scheduled_for timestamptz not null default timezone('utc', now()),
  due_at timestamptz,
  owner_user_id uuid references public.profiles(id) on delete set null,
  priority public.deliverable_priority not null default 'normal',
  status public.deliverable_status not null default 'planned',
  approved_post_version_id uuid,
  latest_post_version_id uuid,
  source_json jsonb not null default '{}'::jsonb,
  legacy_calendar_item_id uuid unique,
  legacy_creative_request_id uuid unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.post_versions (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  version_number integer not null,
  status public.post_version_status not null default 'draft',
  headline text,
  caption text,
  body_json jsonb not null default '{}'::jsonb,
  cta_text text,
  hashtags text[] not null default '{}',
  notes_json jsonb not null default '{}'::jsonb,
  created_from_prompt_package_id uuid references public.prompt_packages(id) on delete set null,
  created_from_template_id uuid references public.creative_templates(id) on delete set null,
  created_from_output_id uuid unique references public.creative_outputs(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (deliverable_id, version_number)
);

alter table public.deliverables
  add constraint deliverables_approved_post_version_fk
  foreign key (approved_post_version_id) references public.post_versions(id) on delete set null;

alter table public.deliverables
  add constraint deliverables_latest_post_version_fk
  foreign key (latest_post_version_id) references public.post_versions(id) on delete set null;

create table if not exists public.post_version_assets (
  id uuid primary key default gen_random_uuid(),
  post_version_id uuid not null references public.post_versions(id) on delete cascade,
  creative_output_id uuid references public.creative_outputs(id) on delete set null,
  brand_asset_id uuid references public.brand_assets(id) on delete set null,
  asset_role public.post_version_asset_role not null default 'primary',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.approval_events (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  post_version_id uuid references public.post_versions(id) on delete set null,
  reviewer_user_id uuid references public.profiles(id) on delete set null,
  action public.approval_action not null,
  comment text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.publications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  post_version_id uuid not null references public.post_versions(id) on delete cascade,
  channel_account_id uuid references public.channel_accounts(id) on delete set null,
  scheduled_for timestamptz,
  published_at timestamptz,
  status public.publication_status not null default 'draft',
  provider text,
  provider_publication_id text,
  provider_payload_json jsonb not null default '{}'::jsonb,
  error_json jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.creative_requests
  add column if not exists deliverable_id uuid references public.deliverables(id) on delete set null;

alter table public.prompt_packages
  add column if not exists deliverable_id uuid references public.deliverables(id) on delete set null;

alter table public.creative_jobs
  add column if not exists deliverable_id uuid references public.deliverables(id) on delete set null;

alter table public.creative_outputs
  add column if not exists deliverable_id uuid references public.deliverables(id) on delete set null,
  add column if not exists post_version_id uuid references public.post_versions(id) on delete set null;

alter table public.style_templates
  add column if not exists deliverable_id uuid references public.deliverables(id) on delete set null;

alter table public.feedback_events
  add column if not exists post_version_id uuid references public.post_versions(id) on delete set null;

alter table public.brand_personas enable row level security;
alter table public.content_pillars enable row level security;
alter table public.channel_accounts enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_projects enable row level security;
alter table public.campaign_deliverable_plans enable row level security;
alter table public.deliverables enable row level security;
alter table public.post_versions enable row level security;
alter table public.post_version_assets enable row level security;
alter table public.approval_events enable row level security;
alter table public.publications enable row level security;

create policy "workspace members read brand personas" on public.brand_personas
  for select using (public.is_workspace_member(workspace_id));

create policy "editors manage brand personas" on public.brand_personas
  for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "workspace members read content pillars" on public.content_pillars
  for select using (public.is_workspace_member(workspace_id));

create policy "editors manage content pillars" on public.content_pillars
  for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "workspace members read channel accounts" on public.channel_accounts
  for select using (public.is_workspace_member(workspace_id));

create policy "editors manage channel accounts" on public.channel_accounts
  for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "workspace members read campaigns" on public.campaigns
  for select using (public.is_workspace_member(workspace_id));

create policy "editors manage campaigns" on public.campaigns
  for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "workspace members read campaign projects" on public.campaign_projects
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_projects.campaign_id
        and public.is_workspace_member(c.workspace_id)
    )
  );

create policy "editors manage campaign projects" on public.campaign_projects
  for all using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_projects.campaign_id
        and public.has_workspace_role(c.workspace_id, array['owner', 'admin', 'editor'])
    )
  );

create policy "workspace members read campaign plans" on public.campaign_deliverable_plans
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_deliverable_plans.campaign_id
        and public.is_workspace_member(c.workspace_id)
    )
  );

create policy "editors manage campaign plans" on public.campaign_deliverable_plans
  for all using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_deliverable_plans.campaign_id
        and public.has_workspace_role(c.workspace_id, array['owner', 'admin', 'editor'])
    )
  );

create policy "workspace members read deliverables" on public.deliverables
  for select using (public.is_workspace_member(workspace_id));

create policy "editors manage deliverables" on public.deliverables
  for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "workspace members read post versions" on public.post_versions
  for select using (
    exists (
      select 1 from public.deliverables d
      where d.id = post_versions.deliverable_id
        and public.is_workspace_member(d.workspace_id)
    )
  );

create policy "editors manage post versions" on public.post_versions
  for all using (
    exists (
      select 1 from public.deliverables d
      where d.id = post_versions.deliverable_id
        and public.has_workspace_role(d.workspace_id, array['owner', 'admin', 'editor'])
    )
  );

create policy "workspace members read post version assets" on public.post_version_assets
  for select using (
    exists (
      select 1
      from public.post_versions pv
      join public.deliverables d on d.id = pv.deliverable_id
      where pv.id = post_version_assets.post_version_id
        and public.is_workspace_member(d.workspace_id)
    )
  );

create policy "editors manage post version assets" on public.post_version_assets
  for all using (
    exists (
      select 1
      from public.post_versions pv
      join public.deliverables d on d.id = pv.deliverable_id
      where pv.id = post_version_assets.post_version_id
        and public.has_workspace_role(d.workspace_id, array['owner', 'admin', 'editor'])
    )
  );

create policy "workspace members read approval events" on public.approval_events
  for select using (
    exists (
      select 1 from public.deliverables d
      where d.id = approval_events.deliverable_id
        and public.is_workspace_member(d.workspace_id)
    )
  );

create policy "editors manage approval events" on public.approval_events
  for all using (
    exists (
      select 1 from public.deliverables d
      where d.id = approval_events.deliverable_id
        and public.has_workspace_role(d.workspace_id, array['owner', 'admin', 'editor'])
    )
  );

create policy "workspace members read publications" on public.publications
  for select using (public.is_workspace_member(workspace_id));

create policy "editors manage publications" on public.publications
  for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create trigger set_brand_personas_updated_at
before update on public.brand_personas
for each row execute procedure public.set_updated_at();

create trigger set_content_pillars_updated_at
before update on public.content_pillars
for each row execute procedure public.set_updated_at();

create trigger set_channel_accounts_updated_at
before update on public.channel_accounts
for each row execute procedure public.set_updated_at();

create trigger set_campaigns_updated_at
before update on public.campaigns
for each row execute procedure public.set_updated_at();

create trigger set_campaign_deliverable_plans_updated_at
before update on public.campaign_deliverable_plans
for each row execute procedure public.set_updated_at();

create trigger set_deliverables_updated_at
before update on public.deliverables
for each row execute procedure public.set_updated_at();

create trigger set_post_versions_updated_at
before update on public.post_versions
for each row execute procedure public.set_updated_at();

create trigger set_post_version_assets_updated_at
before update on public.post_version_assets
for each row execute procedure public.set_updated_at();

create trigger set_publications_updated_at
before update on public.publications
for each row execute procedure public.set_updated_at();

create index if not exists brand_personas_brand_active_idx
  on public.brand_personas (brand_id, active, created_at desc);

create index if not exists content_pillars_brand_active_idx
  on public.content_pillars (brand_id, active, created_at desc);

create index if not exists channel_accounts_brand_platform_idx
  on public.channel_accounts (brand_id, platform, active);

create index if not exists campaigns_brand_status_idx
  on public.campaigns (brand_id, status, start_at desc);

create index if not exists campaign_projects_project_idx
  on public.campaign_projects (project_id, campaign_id);

create index if not exists campaign_deliverable_plans_campaign_sort_idx
  on public.campaign_deliverable_plans (campaign_id, sort_order);

create index if not exists deliverables_workspace_schedule_idx
  on public.deliverables (workspace_id, scheduled_for);

create index if not exists deliverables_workspace_status_schedule_idx
  on public.deliverables (workspace_id, status, scheduled_for);

create index if not exists deliverables_brand_project_idx
  on public.deliverables (brand_id, project_id, created_at desc);

create index if not exists post_versions_deliverable_status_idx
  on public.post_versions (deliverable_id, status, created_at desc);

create index if not exists post_version_assets_post_version_idx
  on public.post_version_assets (post_version_id, sort_order);

create index if not exists approval_events_deliverable_created_idx
  on public.approval_events (deliverable_id, created_at desc);

create index if not exists publications_workspace_status_schedule_idx
  on public.publications (workspace_id, status, scheduled_for);

create index if not exists creative_requests_deliverable_idx
  on public.creative_requests (deliverable_id);

create index if not exists prompt_packages_deliverable_idx
  on public.prompt_packages (deliverable_id);

create index if not exists creative_jobs_deliverable_idx
  on public.creative_jobs (deliverable_id);

create index if not exists creative_outputs_deliverable_idx
  on public.creative_outputs (deliverable_id);

create index if not exists creative_outputs_post_version_idx
  on public.creative_outputs (post_version_id);

create index if not exists style_templates_deliverable_idx
  on public.style_templates (deliverable_id);

with mapped_calendar_items as (
  select
    ci.id as calendar_item_id,
    ci.workspace_id,
    ci.brand_id,
    ci.project_id,
    ci.post_type_id,
    ci.creative_template_id,
    ci.title,
    ci.objective,
    ci.channel,
    ci.format,
    ci.scheduled_for,
    ci.owner_user_id,
    ci.status,
    ci.approved_output_id,
    ci.notes_json,
    ci.created_by,
    ci.created_at
  from public.calendar_items ci
  left join public.deliverables d on d.legacy_calendar_item_id = ci.id
  where d.id is null
)
insert into public.deliverables (
  id,
  workspace_id,
  brand_id,
  project_id,
  post_type_id,
  creative_template_id,
  objective_code,
  placement_code,
  content_format,
  title,
  brief_text,
  cta_text,
  scheduled_for,
  owner_user_id,
  priority,
  status,
  source_json,
  legacy_calendar_item_id,
  created_by,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  m.workspace_id,
  m.brand_id,
  m.project_id,
  m.post_type_id,
  m.creative_template_id,
  'awareness'::public.objective_code,
  m.channel::public.placement_code,
  case
    when m.format = 'story' then 'story'::public.content_format
    else 'static'::public.content_format
  end,
  m.title,
  m.objective,
  null,
  m.scheduled_for,
  m.owner_user_id,
  'normal'::public.deliverable_priority,
  case
    when m.status::text in ('planned', 'brief_ready', 'generating', 'review', 'approved', 'scheduled', 'published', 'archived')
      then m.status::text::public.deliverable_status
    else 'planned'::public.deliverable_status
  end,
  jsonb_build_object(
    'source', 'calendar_item',
    'legacy_calendar_item_id', m.calendar_item_id,
    'legacy_status', m.status,
    'notes', coalesce(m.notes_json, '{}'::jsonb)
  ),
  m.calendar_item_id,
  m.created_by,
  coalesce(m.created_at, timezone('utc', now())),
  timezone('utc', now())
from mapped_calendar_items m;

with orphan_requests as (
  select
    cr.id as creative_request_id,
    cr.workspace_id,
    cr.brand_id,
    coalesce(cr.project_id, (
      select p.id
      from public.projects p
      where p.brand_id = cr.brand_id
      order by p.created_at asc
      limit 1
    )) as project_id,
    coalesce(cr.post_type_id, (
      select pt.id
      from public.post_types pt
      where pt.workspace_id = cr.workspace_id or pt.workspace_id is null
      order by pt.is_system desc, pt.created_at asc
      limit 1
    )) as post_type_id,
    cr.creative_template_id,
    cr.brief_json,
    cr.created_by,
    cr.created_at
  from public.creative_requests cr
  left join public.deliverables d on d.legacy_creative_request_id = cr.id
  where d.id is null
)
insert into public.deliverables (
  id,
  workspace_id,
  brand_id,
  project_id,
  post_type_id,
  creative_template_id,
  objective_code,
  placement_code,
  content_format,
  title,
  brief_text,
  cta_text,
  scheduled_for,
  owner_user_id,
  priority,
  status,
  source_json,
  legacy_creative_request_id,
  created_by,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  o.workspace_id,
  o.brand_id,
  o.project_id,
  o.post_type_id,
  o.creative_template_id,
  'awareness'::public.objective_code,
  case
    when coalesce(o.brief_json ->> 'channel', '') in ('instagram-feed', 'instagram-story', 'linkedin-feed', 'x-post', 'tiktok-cover', 'ad-creative')
      then (o.brief_json ->> 'channel')::public.placement_code
    else 'instagram-feed'::public.placement_code
  end,
  case
    when coalesce(o.brief_json ->> 'format', '') = 'story' then 'story'::public.content_format
    else 'static'::public.content_format
  end,
  coalesce(nullif(o.brief_json ->> 'goal', ''), 'Ad hoc deliverable'),
  nullif(o.brief_json ->> 'prompt', ''),
  nullif(o.brief_json ->> 'offer', ''),
  coalesce(o.created_at, timezone('utc', now())),
  null,
  'normal'::public.deliverable_priority,
  'planned'::public.deliverable_status,
  jsonb_build_object(
    'source', 'legacy_ad_hoc',
    'legacy_creative_request_id', o.creative_request_id
  ),
  o.creative_request_id,
  o.created_by,
  coalesce(o.created_at, timezone('utc', now())),
  timezone('utc', now())
from orphan_requests o
where o.project_id is not null and o.post_type_id is not null;

update public.creative_requests cr
set deliverable_id = d.id
from public.deliverables d
where cr.deliverable_id is null
  and (
    d.legacy_creative_request_id = cr.id
    or d.legacy_calendar_item_id = cr.calendar_item_id
  );

update public.prompt_packages pp
set deliverable_id = cr.deliverable_id
from public.creative_requests cr
where pp.deliverable_id is null
  and cr.id = pp.creative_request_id
  and cr.deliverable_id is not null;

update public.creative_jobs cj
set deliverable_id = pp.deliverable_id
from public.prompt_packages pp
where cj.deliverable_id is null
  and pp.id = cj.prompt_package_id
  and pp.deliverable_id is not null;

update public.creative_outputs co
set deliverable_id = cj.deliverable_id
from public.creative_jobs cj
where co.deliverable_id is null
  and cj.id = co.job_id
  and cj.deliverable_id is not null;

update public.style_templates st
set deliverable_id = co.deliverable_id
from public.creative_outputs co
where st.deliverable_id is null
  and st.creative_output_id = co.id
  and co.deliverable_id is not null;

with approved_output_candidates as (
  select
    co.id as creative_output_id,
    co.deliverable_id,
    cj.prompt_package_id,
    co.creative_template_id,
    co.created_by,
    row_number() over (partition by co.deliverable_id order by co.created_at asc, co.output_index asc) as version_number
  from public.creative_outputs co
  join public.creative_jobs cj on cj.id = co.job_id
  left join public.post_versions pv on pv.created_from_output_id = co.id
  where co.kind = 'final'
    and co.review_state = 'approved'
    and co.deliverable_id is not null
    and pv.id is null
)
insert into public.post_versions (
  id,
  deliverable_id,
  version_number,
  status,
  headline,
  caption,
  cta_text,
  created_from_prompt_package_id,
  created_from_template_id,
  created_from_output_id,
  created_by,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  c.deliverable_id,
  c.version_number,
  'approved'::public.post_version_status,
  null,
  null,
  null,
  c.prompt_package_id,
  c.creative_template_id,
  c.creative_output_id,
  c.created_by,
  timezone('utc', now()),
  timezone('utc', now())
from approved_output_candidates c;

insert into public.post_version_assets (
  id,
  post_version_id,
  creative_output_id,
  asset_role,
  sort_order,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  pv.id,
  pv.created_from_output_id,
  'primary'::public.post_version_asset_role,
  0,
  timezone('utc', now()),
  timezone('utc', now())
from public.post_versions pv
left join public.post_version_assets pva on pva.post_version_id = pv.id and pva.creative_output_id = pv.created_from_output_id
where pv.created_from_output_id is not null
  and pva.id is null;

update public.creative_outputs co
set post_version_id = pv.id
from public.post_versions pv
where co.post_version_id is null
  and pv.created_from_output_id = co.id;

update public.feedback_events fe
set post_version_id = co.post_version_id
from public.creative_outputs co
where fe.post_version_id is null
  and fe.creative_output_id = co.id
  and co.post_version_id is not null;

with approved_versions as (
  select distinct on (pv.deliverable_id)
    pv.deliverable_id,
    pv.id
  from public.post_versions pv
  where pv.status = 'approved'
  order by pv.deliverable_id, pv.version_number desc, pv.created_at desc
),
latest_versions as (
  select distinct on (pv.deliverable_id)
    pv.deliverable_id,
    pv.id
  from public.post_versions pv
  order by pv.deliverable_id, pv.version_number desc, pv.created_at desc
)
update public.deliverables d
set
  approved_post_version_id = av.id,
  latest_post_version_id = lv.id,
  status = case
    when av.id is not null then 'approved'::public.deliverable_status
    else d.status
  end
from approved_versions av
full outer join latest_versions lv on lv.deliverable_id = av.deliverable_id
where d.id = coalesce(av.deliverable_id, lv.deliverable_id);
