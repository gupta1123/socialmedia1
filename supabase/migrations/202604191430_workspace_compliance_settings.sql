create table if not exists public.workspace_compliance_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  rera_authority_label text not null default 'MahaRERA',
  rera_website_url text not null default 'https://maharera.maharashtra.gov.in',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_workspace_compliance_settings_updated_at on public.workspace_compliance_settings;
create trigger set_workspace_compliance_settings_updated_at
before update on public.workspace_compliance_settings
for each row execute procedure public.set_updated_at();

alter table public.workspace_compliance_settings enable row level security;

drop policy if exists "workspace members read compliance settings" on public.workspace_compliance_settings;
create policy "workspace members read compliance settings" on public.workspace_compliance_settings
for select using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor', 'viewer']));

drop policy if exists "workspace admins manage compliance settings" on public.workspace_compliance_settings;
create policy "workspace admins manage compliance settings" on public.workspace_compliance_settings
for all using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));
