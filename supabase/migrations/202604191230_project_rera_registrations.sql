create table if not exists public.project_rera_registrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  registration_number text,
  label text not null,
  qr_asset_id uuid references public.brand_assets(id) on delete set null,
  is_default boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists project_rera_registrations_workspace_brand_idx
  on public.project_rera_registrations(workspace_id, brand_id);

create index if not exists project_rera_registrations_project_idx
  on public.project_rera_registrations(project_id);

create unique index if not exists project_rera_registrations_one_default_per_project_idx
  on public.project_rera_registrations(project_id)
  where is_default;

drop trigger if exists set_project_rera_registrations_updated_at on public.project_rera_registrations;
create trigger set_project_rera_registrations_updated_at
before update on public.project_rera_registrations
for each row execute procedure public.set_updated_at();

alter table public.project_rera_registrations enable row level security;

drop policy if exists "workspace members read project rera registrations" on public.project_rera_registrations;
create policy "workspace members read project rera registrations" on public.project_rera_registrations
for select using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor', 'viewer']));

drop policy if exists "editors manage project rera registrations" on public.project_rera_registrations;
create policy "editors manage project rera registrations" on public.project_rera_registrations
for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));
