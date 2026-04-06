do $$
begin
  if not exists (select 1 from pg_type where typname = 'project_stage') then
    create type public.project_stage as enum ('pre_launch', 'launch', 'under_construction', 'near_possession', 'delivered');
  end if;

  if not exists (select 1 from pg_type where typname = 'project_status') then
    create type public.project_status as enum ('active', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'template_status') then
    create type public.template_status as enum ('draft', 'approved', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'template_asset_role') then
    create type public.template_asset_role as enum ('primary_ref', 'secondary_ref', 'logo_ref', 'overlay_ref');
  end if;

  if not exists (select 1 from pg_type where typname = 'calendar_item_status') then
    create type public.calendar_item_status as enum ('planned', 'brief_ready', 'generating', 'review', 'approved', 'scheduled', 'published', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'creative_request_status') then
    create type public.creative_request_status as enum ('draft', 'compiled', 'directions_ready', 'finals_ready', 'approved', 'closed');
  end if;
end
$$;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  slug text not null,
  city text,
  micro_location text,
  project_type text,
  stage public.project_stage not null default 'launch',
  status public.project_status not null default 'active',
  description text,
  current_profile_version_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, slug)
);

create table if not exists public.project_profile_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version_number integer not null,
  profile_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (project_id, version_number)
);

alter table public.projects
  add constraint projects_current_profile_version_fk
  foreign key (current_profile_version_id) references public.project_profile_versions(id) on delete set null;

create table if not exists public.post_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  config_json jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists post_types_system_code_idx
  on public.post_types (code)
  where workspace_id is null;

create unique index if not exists post_types_workspace_code_idx
  on public.post_types (workspace_id, code)
  where workspace_id is not null;

create table if not exists public.creative_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  post_type_id uuid references public.post_types(id) on delete set null,
  name text not null,
  status public.template_status not null default 'draft',
  channel text not null,
  format text not null,
  base_prompt text not null default '',
  template_json jsonb not null default '{}'::jsonb,
  preview_storage_path text,
  created_from_output_id uuid references public.creative_outputs(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.creative_template_assets (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.creative_templates(id) on delete cascade,
  asset_id uuid not null references public.brand_assets(id) on delete cascade,
  role public.template_asset_role not null default 'primary_ref',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (template_id, asset_id, role)
);

create table if not exists public.calendar_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  post_type_id uuid not null references public.post_types(id) on delete cascade,
  creative_template_id uuid references public.creative_templates(id) on delete set null,
  approved_output_id uuid references public.creative_outputs(id) on delete set null,
  title text not null,
  objective text,
  channel text not null,
  format text not null,
  scheduled_for timestamptz not null,
  status public.calendar_item_status not null default 'planned',
  owner_user_id uuid references public.profiles(id) on delete set null,
  notes_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.brand_assets
  add column if not exists project_id uuid references public.projects(id) on delete set null;

alter table public.creative_requests
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists post_type_id uuid references public.post_types(id) on delete set null,
  add column if not exists creative_template_id uuid references public.creative_templates(id) on delete set null,
  add column if not exists calendar_item_id uuid references public.calendar_items(id) on delete set null,
  add column if not exists approved_output_id uuid references public.creative_outputs(id) on delete set null,
  add column if not exists status public.creative_request_status not null default 'draft';

alter table public.prompt_packages
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists post_type_id uuid references public.post_types(id) on delete set null,
  add column if not exists creative_template_id uuid references public.creative_templates(id) on delete set null,
  add column if not exists calendar_item_id uuid references public.calendar_items(id) on delete set null;

alter table public.creative_jobs
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists post_type_id uuid references public.post_types(id) on delete set null,
  add column if not exists creative_template_id uuid references public.creative_templates(id) on delete set null,
  add column if not exists calendar_item_id uuid references public.calendar_items(id) on delete set null;

alter table public.creative_outputs
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists post_type_id uuid references public.post_types(id) on delete set null,
  add column if not exists creative_template_id uuid references public.creative_templates(id) on delete set null,
  add column if not exists calendar_item_id uuid references public.calendar_items(id) on delete set null;

alter table public.style_templates
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists post_type_id uuid references public.post_types(id) on delete set null,
  add column if not exists creative_template_id uuid references public.creative_templates(id) on delete set null,
  add column if not exists calendar_item_id uuid references public.calendar_items(id) on delete set null;

alter table public.projects enable row level security;
alter table public.project_profile_versions enable row level security;
alter table public.post_types enable row level security;
alter table public.creative_templates enable row level security;
alter table public.creative_template_assets enable row level security;
alter table public.calendar_items enable row level security;

create policy "workspace members read projects" on public.projects
  for select using (public.is_workspace_member(workspace_id));

create policy "editors manage projects" on public.projects
  for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "workspace members read project profiles" on public.project_profile_versions
  for select using (public.is_workspace_member(workspace_id));

create policy "editors manage project profiles" on public.project_profile_versions
  for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "workspace members read post types" on public.post_types
  for select using (
    workspace_id is null or public.is_workspace_member(workspace_id)
  );

create policy "editors manage post types" on public.post_types
  for all using (
    workspace_id is not null and public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor'])
  );

create policy "workspace members read creative templates" on public.creative_templates
  for select using (public.is_workspace_member(workspace_id));

create policy "editors manage creative templates" on public.creative_templates
  for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "workspace members read template assets" on public.creative_template_assets
  for select using (
    exists (
      select 1
      from public.creative_templates ct
      where ct.id = creative_template_assets.template_id
        and public.is_workspace_member(ct.workspace_id)
    )
  );

create policy "editors manage template assets" on public.creative_template_assets
  for all using (
    exists (
      select 1
      from public.creative_templates ct
      where ct.id = creative_template_assets.template_id
        and public.has_workspace_role(ct.workspace_id, array['owner', 'admin', 'editor'])
    )
  );

create policy "workspace members read calendar items" on public.calendar_items
  for select using (public.is_workspace_member(workspace_id));

create policy "editors manage calendar items" on public.calendar_items
  for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create trigger set_projects_updated_at
before update on public.projects
for each row execute procedure public.set_updated_at();

create trigger set_project_profile_versions_updated_at
before update on public.project_profile_versions
for each row execute procedure public.set_updated_at();

create trigger set_post_types_updated_at
before update on public.post_types
for each row execute procedure public.set_updated_at();

create trigger set_creative_templates_updated_at
before update on public.creative_templates
for each row execute procedure public.set_updated_at();

create trigger set_creative_template_assets_updated_at
before update on public.creative_template_assets
for each row execute procedure public.set_updated_at();

create trigger set_calendar_items_updated_at
before update on public.calendar_items
for each row execute procedure public.set_updated_at();

create index if not exists projects_workspace_brand_created_idx
  on public.projects (workspace_id, brand_id, created_at desc);

create index if not exists project_profiles_project_version_idx
  on public.project_profile_versions (project_id, version_number desc);

create index if not exists post_types_workspace_active_idx
  on public.post_types (workspace_id, active, created_at desc);

create index if not exists creative_templates_lookup_idx
  on public.creative_templates (workspace_id, brand_id, project_id, post_type_id, status);

create index if not exists creative_template_assets_template_idx
  on public.creative_template_assets (template_id, sort_order);

create index if not exists calendar_items_schedule_idx
  on public.calendar_items (workspace_id, scheduled_for);

create index if not exists calendar_items_status_schedule_idx
  on public.calendar_items (workspace_id, status, scheduled_for);

create index if not exists brand_assets_project_created_idx
  on public.brand_assets (project_id, created_at desc);

create index if not exists creative_requests_calendar_idx
  on public.creative_requests (calendar_item_id);

create index if not exists creative_outputs_calendar_review_idx
  on public.creative_outputs (calendar_item_id, review_state);

insert into public.post_types (workspace_id, code, name, description, config_json, is_system, active)
select
  null,
  seed.code,
  seed.name,
  seed.description,
  seed.config_json,
  true,
  true
from (
  values
    (
      'project-launch',
      'Project launch',
      'Announce a new project or phase with a premium reveal.',
      jsonb_build_object(
        'defaultChannels', jsonb_build_array('instagram-feed', 'linkedin-feed'),
        'allowedFormats', jsonb_build_array('square', 'portrait', 'landscape'),
        'recommendedTemplateTypes', jsonb_build_array('hero', 'announcement'),
        'requiredBriefFields', jsonb_build_array('goal', 'prompt'),
        'safeZoneGuidance', jsonb_build_array('Reserve top and lower thirds for name and CTA'),
        'ctaStyle', 'site-visit',
        'copyDensity', 'balanced'
      )
    ),
    (
      'amenity-spotlight',
      'Amenity spotlight',
      'Highlight one or more amenities with elevated lifestyle framing.',
      jsonb_build_object(
        'defaultChannels', jsonb_build_array('instagram-feed', 'instagram-story'),
        'allowedFormats', jsonb_build_array('square', 'portrait', 'story'),
        'recommendedTemplateTypes', jsonb_build_array('product-focus', 'hero'),
        'requiredBriefFields', jsonb_build_array('goal', 'prompt'),
        'safeZoneGuidance', jsonb_build_array('Keep amenity title and CTA readable without blocking architecture'),
        'ctaStyle', 'soft-enquiry',
        'copyDensity', 'minimal'
      )
    ),
    (
      'location-advantage',
      'Location advantage',
      'Showcase neighborhood connectivity, landmarks, and accessibility.',
      jsonb_build_object(
        'defaultChannels', jsonb_build_array('instagram-feed', 'linkedin-feed'),
        'allowedFormats', jsonb_build_array('square', 'landscape'),
        'recommendedTemplateTypes', jsonb_build_array('announcement', 'hero'),
        'requiredBriefFields', jsonb_build_array('goal', 'prompt'),
        'safeZoneGuidance', jsonb_build_array('Leave room for directional copy and project mark'),
        'ctaStyle', 'discover-location',
        'copyDensity', 'balanced'
      )
    ),
    (
      'site-visit-invite',
      'Site visit invite',
      'Drive scheduled site visits with a clear invitation and CTA.',
      jsonb_build_object(
        'defaultChannels', jsonb_build_array('instagram-feed', 'instagram-story', 'ad-creative'),
        'allowedFormats', jsonb_build_array('square', 'portrait', 'story'),
        'recommendedTemplateTypes', jsonb_build_array('offer', 'announcement'),
        'requiredBriefFields', jsonb_build_array('goal', 'offer', 'exactText'),
        'safeZoneGuidance', jsonb_build_array('Keep CTA and contact area unobstructed'),
        'ctaStyle', 'site-visit',
        'copyDensity', 'balanced'
      )
    ),
    (
      'construction-update',
      'Construction update',
      'Share progress milestones, build updates, or possession readiness.',
      jsonb_build_object(
        'defaultChannels', jsonb_build_array('instagram-feed', 'linkedin-feed'),
        'allowedFormats', jsonb_build_array('square', 'landscape'),
        'recommendedTemplateTypes', jsonb_build_array('announcement', 'hero'),
        'requiredBriefFields', jsonb_build_array('goal', 'prompt'),
        'safeZoneGuidance', jsonb_build_array('Keep progress headline and date visible'),
        'ctaStyle', 'trust-building',
        'copyDensity', 'balanced'
      )
    ),
    (
      'testimonial',
      'Testimonial',
      'Use resident or buyer trust signals with a polished editorial layout.',
      jsonb_build_object(
        'defaultChannels', jsonb_build_array('instagram-feed', 'linkedin-feed'),
        'allowedFormats', jsonb_build_array('square', 'portrait'),
        'recommendedTemplateTypes', jsonb_build_array('testimonial', 'quote'),
        'requiredBriefFields', jsonb_build_array('goal', 'exactText'),
        'safeZoneGuidance', jsonb_build_array('Protect quote readability and attribution area'),
        'ctaStyle', 'credibility',
        'copyDensity', 'dense'
      )
    ),
    (
      'festive-greeting',
      'Festive greeting',
      'Create seasonal or festive greetings without breaking the brand system.',
      jsonb_build_object(
        'defaultChannels', jsonb_build_array('instagram-feed', 'instagram-story'),
        'allowedFormats', jsonb_build_array('square', 'story'),
        'recommendedTemplateTypes', jsonb_build_array('quote', 'hero'),
        'requiredBriefFields', jsonb_build_array('goal', 'exactText'),
        'safeZoneGuidance', jsonb_build_array('Maintain celebratory hierarchy with clear logo lockup'),
        'ctaStyle', 'soft-brand',
        'copyDensity', 'minimal'
      )
    )
) as seed(code, name, description, config_json)
where not exists (
  select 1
  from public.post_types existing
  where existing.workspace_id is null
    and existing.code = seed.code
);
