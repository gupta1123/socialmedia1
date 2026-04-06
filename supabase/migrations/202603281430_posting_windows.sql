do $$
begin
  if not exists (select 1 from pg_type where typname = 'weekday_code') then
    create type public.weekday_code as enum ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');
  end if;
end
$$;

create table if not exists public.posting_windows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  channel public.placement_code not null,
  weekday public.weekday_code not null,
  local_time time not null,
  timezone text,
  label text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists posting_windows_workspace_brand_idx
  on public.posting_windows (workspace_id, brand_id, active, channel, weekday, local_time);

create trigger set_posting_windows_updated_at
before update on public.posting_windows
for each row execute procedure public.set_updated_at();
