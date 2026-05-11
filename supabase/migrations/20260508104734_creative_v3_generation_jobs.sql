create table if not exists public.creative_v3_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  status text not null default 'pending',
  input_json jsonb not null default '{}'::jsonb,
  result_json jsonb,
  error_json jsonb,
  actor_user_id uuid references public.profiles(id) on delete set null,
  credit_reservation_id uuid references public.workspace_credit_reservations(id) on delete set null,
  locked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint creative_v3_generation_jobs_status_check
    check (status in ('pending', 'processing', 'completed', 'failed'))
);

drop trigger if exists set_creative_v3_generation_jobs_updated_at on public.creative_v3_generation_jobs;
create trigger set_creative_v3_generation_jobs_updated_at
before update on public.creative_v3_generation_jobs
for each row execute procedure public.set_updated_at();

create index if not exists creative_v3_generation_jobs_workspace_status_created_idx
  on public.creative_v3_generation_jobs (workspace_id, status, created_at desc);

create index if not exists creative_v3_generation_jobs_brand_created_idx
  on public.creative_v3_generation_jobs (brand_id, created_at desc);

create index if not exists creative_v3_generation_jobs_credit_reservation_idx
  on public.creative_v3_generation_jobs (credit_reservation_id);

alter table public.creative_v3_generation_jobs enable row level security;

drop policy if exists "workspace members read creative v3 generation jobs" on public.creative_v3_generation_jobs;
create policy "workspace members read creative v3 generation jobs" on public.creative_v3_generation_jobs
for select using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor', 'viewer']));

drop policy if exists "editors manage creative v3 generation jobs" on public.creative_v3_generation_jobs;
create policy "editors manage creative v3 generation jobs" on public.creative_v3_generation_jobs
for all using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'editor']));
