create table if not exists public.creative_v3_brand_presets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  preset_key text not null,
  name text not null,
  description text,
  preset_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, brand_id, preset_key)
);

create table if not exists public.creative_v3_visual_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  post_type_id uuid references public.post_types(id) on delete set null,
  template_key text not null,
  name text not null,
  description text,
  content_job_id text,
  allowed_formats text[] not null default '{}'::text[],
  lever_signature jsonb not null default '{}'::jsonb,
  template_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, template_key),
  constraint creative_v3_visual_templates_status_check
    check (status in ('draft', 'approved', 'archived'))
);

create table if not exists public.creative_v3_compile_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  post_type_id uuid references public.post_types(id) on delete set null,
  status text not null,
  request_json jsonb not null default '{}'::jsonb,
  response_json jsonb not null default '{}'::jsonb,
  engine_url text,
  error_message text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint creative_v3_compile_runs_status_check
    check (status in ('ready', 'blocked', 'needs_input', 'failed'))
);

drop trigger if exists set_creative_v3_brand_presets_updated_at on public.creative_v3_brand_presets;
create trigger set_creative_v3_brand_presets_updated_at
before update on public.creative_v3_brand_presets
for each row execute procedure public.set_updated_at();

drop trigger if exists set_creative_v3_visual_templates_updated_at on public.creative_v3_visual_templates;
create trigger set_creative_v3_visual_templates_updated_at
before update on public.creative_v3_visual_templates
for each row execute procedure public.set_updated_at();

create index if not exists creative_v3_brand_presets_brand_idx
  on public.creative_v3_brand_presets (brand_id, active);

create index if not exists creative_v3_visual_templates_lookup_idx
  on public.creative_v3_visual_templates (workspace_id, brand_id, content_job_id, status);

create index if not exists creative_v3_compile_runs_brand_created_idx
  on public.creative_v3_compile_runs (brand_id, created_at desc);

alter table public.creative_v3_brand_presets enable row level security;
alter table public.creative_v3_visual_templates enable row level security;
alter table public.creative_v3_compile_runs enable row level security;

drop policy if exists "workspace members read creative v3 brand presets" on public.creative_v3_brand_presets;
create policy "workspace members read creative v3 brand presets" on public.creative_v3_brand_presets
for select using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor', 'viewer']));

drop policy if exists "editors manage creative v3 brand presets" on public.creative_v3_brand_presets;
create policy "editors manage creative v3 brand presets" on public.creative_v3_brand_presets
for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

drop policy if exists "workspace members read creative v3 visual templates" on public.creative_v3_visual_templates;
create policy "workspace members read creative v3 visual templates" on public.creative_v3_visual_templates
for select using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor', 'viewer']));

drop policy if exists "editors manage creative v3 visual templates" on public.creative_v3_visual_templates;
create policy "editors manage creative v3 visual templates" on public.creative_v3_visual_templates
for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

drop policy if exists "workspace members read creative v3 compile runs" on public.creative_v3_compile_runs;
create policy "workspace members read creative v3 compile runs" on public.creative_v3_compile_runs
for select using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor', 'viewer']));

drop policy if exists "editors create creative v3 compile runs" on public.creative_v3_compile_runs;
create policy "editors create creative v3 compile runs" on public.creative_v3_compile_runs
for insert with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));
