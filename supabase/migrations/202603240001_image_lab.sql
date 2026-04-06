create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.slugify(value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g'));
$$;

create type public.workspace_role as enum ('owner', 'admin', 'editor', 'viewer');
create type public.asset_kind as enum ('reference', 'logo', 'product', 'inspiration');
create type public.job_type as enum ('style_seed', 'final');
create type public.job_status as enum ('queued', 'processing', 'completed', 'failed', 'cancelled');
create type public.template_source as enum ('generated', 'uploaded');
create type public.feedback_verdict as enum ('approved', 'close', 'off-brand', 'wrong-layout', 'wrong-text');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.workspace_role not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, user_id)
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  current_profile_version_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, slug)
);

create table if not exists public.brand_profile_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  version_number integer not null,
  profile_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (brand_id, version_number)
);

alter table public.brands
  add constraint brands_current_profile_version_fk
  foreign key (current_profile_version_id) references public.brand_profile_versions(id) on delete set null;

create table if not exists public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  kind public.asset_kind not null,
  label text not null,
  file_name text not null,
  mime_type text not null,
  storage_path text not null unique,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.style_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  source public.template_source not null,
  label text not null,
  storage_path text not null unique,
  creative_output_id uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.creative_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  brief_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.prompt_packages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  creative_request_id uuid not null references public.creative_requests(id) on delete cascade,
  brand_profile_version_id uuid not null references public.brand_profile_versions(id) on delete cascade,
  prompt_summary text not null,
  seed_prompt text not null,
  final_prompt text not null,
  aspect_ratio text not null,
  chosen_model text not null,
  template_type text,
  reference_strategy text not null,
  reference_asset_ids uuid[] not null default '{}',
  resolved_constraints jsonb not null default '{}'::jsonb,
  compiler_trace jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.creative_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  prompt_package_id uuid not null references public.prompt_packages(id) on delete cascade,
  selected_template_id uuid references public.style_templates(id) on delete set null,
  job_type public.job_type not null,
  status public.job_status not null default 'queued',
  provider text not null,
  provider_model text not null,
  provider_request_id text unique,
  requested_count integer not null default 1,
  request_payload jsonb not null default '{}'::jsonb,
  webhook_payload jsonb not null default '{}'::jsonb,
  error_json jsonb,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.creative_outputs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  job_id uuid not null references public.creative_jobs(id) on delete cascade,
  kind public.job_type not null,
  storage_path text not null unique,
  provider_url text,
  output_index integer not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (job_id, output_index)
);

alter table public.style_templates
  add constraint style_templates_creative_output_fk
  foreign key (creative_output_id) references public.creative_outputs(id) on delete set null;

create table if not exists public.feedback_events (
  id uuid primary key default gen_random_uuid(),
  creative_output_id uuid not null references public.creative_outputs(id) on delete cascade,
  verdict public.feedback_verdict not null,
  reason text not null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace_id uuid := gen_random_uuid();
  local_part text := split_part(coalesce(new.email, 'workspace'), '@', 1);
  workspace_slug text := public.slugify(local_part || '-' || left(new.id::text, 8));
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''));

  insert into public.workspaces (id, name, slug, created_by)
  values (
    new_workspace_id,
    initcap(replace(local_part, '.', ' ')) || '''s Workspace',
    workspace_slug,
    new.id
  );

  insert into public.workspace_memberships (workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.workspace_memberships wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.has_workspace_role(target_workspace_id uuid, allowed_roles text[])
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.workspace_memberships wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.role::text = any(allowed_roles)
  );
$$;

create or replace function public.storage_workspace_id(path text)
returns uuid
language sql
stable
as $$
  select case
    when split_part(path, '/', 1) ~* '^[0-9a-f-]{36}$' then split_part(path, '/', 1)::uuid
    else null
  end;
$$;

insert into storage.buckets (id, name, public)
values ('creative-assets', 'creative-assets', false)
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.brands enable row level security;
alter table public.brand_profile_versions enable row level security;
alter table public.brand_assets enable row level security;
alter table public.style_templates enable row level security;
alter table public.creative_requests enable row level security;
alter table public.prompt_packages enable row level security;
alter table public.creative_jobs enable row level security;
alter table public.creative_outputs enable row level security;
alter table public.feedback_events enable row level security;

create policy "profiles self read" on public.profiles
for select using (id = auth.uid());

create policy "profiles self update" on public.profiles
for update using (id = auth.uid());

create policy "workspace members read workspaces" on public.workspaces
for select using (public.is_workspace_member(id));

create policy "workspace members read memberships" on public.workspace_memberships
for select using (public.is_workspace_member(workspace_id));

create policy "owners admins manage memberships" on public.workspace_memberships
for all using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "workspace members read brands" on public.brands
for select using (public.is_workspace_member(workspace_id));

create policy "editors manage brands" on public.brands
for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "workspace members read brand profiles" on public.brand_profile_versions
for select using (public.is_workspace_member(workspace_id));

create policy "editors manage brand profiles" on public.brand_profile_versions
for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "workspace members read assets" on public.brand_assets
for select using (public.is_workspace_member(workspace_id));

create policy "editors manage assets" on public.brand_assets
for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "workspace members read templates" on public.style_templates
for select using (public.is_workspace_member(workspace_id));

create policy "editors manage templates" on public.style_templates
for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "workspace members read creative requests" on public.creative_requests
for select using (public.is_workspace_member(workspace_id));

create policy "editors manage creative requests" on public.creative_requests
for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "workspace members read prompt packages" on public.prompt_packages
for select using (public.is_workspace_member(workspace_id));

create policy "editors manage prompt packages" on public.prompt_packages
for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "workspace members read creative jobs" on public.creative_jobs
for select using (public.is_workspace_member(workspace_id));

create policy "editors manage creative jobs" on public.creative_jobs
for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "workspace members read creative outputs" on public.creative_outputs
for select using (public.is_workspace_member(workspace_id));

create policy "editors manage creative outputs" on public.creative_outputs
for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));

create policy "workspace members read feedback" on public.feedback_events
for select using (
  exists (
    select 1
    from public.creative_outputs co
    where co.id = feedback_events.creative_output_id
      and public.is_workspace_member(co.workspace_id)
  )
);

create policy "workspace members write feedback" on public.feedback_events
for insert with check (
  exists (
    select 1
    from public.creative_outputs co
    where co.id = feedback_events.creative_output_id
      and public.has_workspace_role(co.workspace_id, array['owner', 'admin', 'editor', 'viewer'])
  )
);

create policy "workspace members read storage" on storage.objects
for select using (
  bucket_id = 'creative-assets'
  and public.is_workspace_member(public.storage_workspace_id(name))
);

create policy "editors write storage" on storage.objects
for insert with check (
  bucket_id = 'creative-assets'
  and public.has_workspace_role(public.storage_workspace_id(name), array['owner', 'admin', 'editor'])
);

create policy "editors update storage" on storage.objects
for update using (
  bucket_id = 'creative-assets'
  and public.has_workspace_role(public.storage_workspace_id(name), array['owner', 'admin', 'editor'])
);

create policy "editors delete storage" on storage.objects
for delete using (
  bucket_id = 'creative-assets'
  and public.has_workspace_role(public.storage_workspace_id(name), array['owner', 'admin', 'editor'])
);

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

create trigger set_workspaces_updated_at
before update on public.workspaces
for each row execute procedure public.set_updated_at();

create trigger set_workspace_memberships_updated_at
before update on public.workspace_memberships
for each row execute procedure public.set_updated_at();

create trigger set_brands_updated_at
before update on public.brands
for each row execute procedure public.set_updated_at();

create trigger set_brand_profile_versions_updated_at
before update on public.brand_profile_versions
for each row execute procedure public.set_updated_at();

create trigger set_brand_assets_updated_at
before update on public.brand_assets
for each row execute procedure public.set_updated_at();

create trigger set_style_templates_updated_at
before update on public.style_templates
for each row execute procedure public.set_updated_at();

create trigger set_creative_requests_updated_at
before update on public.creative_requests
for each row execute procedure public.set_updated_at();

create trigger set_prompt_packages_updated_at
before update on public.prompt_packages
for each row execute procedure public.set_updated_at();

create trigger set_creative_jobs_updated_at
before update on public.creative_jobs
for each row execute procedure public.set_updated_at();

create trigger set_creative_outputs_updated_at
before update on public.creative_outputs
for each row execute procedure public.set_updated_at();
