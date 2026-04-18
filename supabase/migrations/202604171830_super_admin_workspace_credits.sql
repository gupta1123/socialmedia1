create extension if not exists pgcrypto;

-- Super-admin identity table (platform-level, outside workspace roles)
create table if not exists public.platform_admin_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'super_admin',
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint platform_admin_roles_role_check check (role in ('super_admin'))
);

-- Credit enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'credit_ledger_direction') THEN
    CREATE TYPE public.credit_ledger_direction AS ENUM ('credit', 'debit');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'credit_ledger_entry_kind') THEN
    CREATE TYPE public.credit_ledger_entry_kind AS ENUM (
      'grant',
      'adjustment',
      'usage_reserve',
      'usage_release'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'credit_reservation_status') THEN
    CREATE TYPE public.credit_reservation_status AS ENUM ('reserved', 'settled', 'released');
  END IF;
END
$$;

-- Per-workspace wallet
create table if not exists public.workspace_credit_wallets (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  balance bigint not null default 0,
  lifetime_credited bigint not null default 0,
  lifetime_debited bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workspace_credit_wallets_balance_non_negative check (balance >= 0),
  constraint workspace_credit_wallets_lifetime_credited_non_negative check (lifetime_credited >= 0),
  constraint workspace_credit_wallets_lifetime_debited_non_negative check (lifetime_debited >= 0)
);

-- Reservation records used by async generation/edit flows
create table if not exists public.workspace_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  amount bigint not null,
  status public.credit_reservation_status not null default 'reserved',
  source text not null,
  source_ref text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  settled_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workspace_credit_reservations_amount_positive check (amount > 0),
  unique (workspace_id, source, source_ref)
);

-- Immutable ledger
create table if not exists public.workspace_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  direction public.credit_ledger_direction not null,
  entry_kind public.credit_ledger_entry_kind not null,
  amount bigint not null,
  balance_after bigint not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  reservation_id uuid,
  source text,
  source_ref text,
  note text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint workspace_credit_ledger_amount_positive check (amount > 0),
  constraint workspace_credit_ledger_balance_after_non_negative check (balance_after >= 0)
);

-- Link generation jobs to a reservation for settle/release handling
alter table public.creative_jobs
  add column if not exists credit_reservation_id uuid references public.workspace_credit_reservations(id) on delete set null;

create index if not exists idx_workspace_credit_ledger_workspace_created_at
  on public.workspace_credit_ledger (workspace_id, created_at desc);

create index if not exists idx_workspace_credit_reservations_workspace_status
  on public.workspace_credit_reservations (workspace_id, status, created_at desc);

create index if not exists idx_workspace_credit_reservations_source
  on public.workspace_credit_reservations (source, source_ref);

create index if not exists idx_creative_jobs_credit_reservation_id
  on public.creative_jobs (credit_reservation_id);

-- updated_at hooks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'workspace_credit_wallets_set_updated_at'
  ) THEN
    CREATE TRIGGER workspace_credit_wallets_set_updated_at
    BEFORE UPDATE ON public.workspace_credit_wallets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'workspace_credit_reservations_set_updated_at'
  ) THEN
    CREATE TRIGGER workspace_credit_reservations_set_updated_at
    BEFORE UPDATE ON public.workspace_credit_reservations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END
$$;

-- Helper: platform-level admin check
create or replace function public.is_platform_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.platform_admin_roles par
    where par.user_id = p_user_id
      and par.active = true
      and par.role = 'super_admin'
  );
$$;

-- Helper: make sure wallet row exists
create or replace function public.ensure_workspace_credit_wallet(p_workspace_id uuid)
returns public.workspace_credit_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_row public.workspace_credit_wallets;
begin
  insert into public.workspace_credit_wallets (workspace_id)
  values (p_workspace_id)
  on conflict (workspace_id) do nothing;

  select *
  into wallet_row
  from public.workspace_credit_wallets
  where workspace_id = p_workspace_id;

  return wallet_row;
end;
$$;

-- Super-admin grant credits
create or replace function public.grant_workspace_credits(
  p_workspace_id uuid,
  p_amount bigint,
  p_actor_user_id uuid,
  p_note text default null,
  p_source_ref text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  ledger_id uuid,
  balance bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_row public.workspace_credit_wallets;
  next_balance bigint;
  next_ledger_id uuid := gen_random_uuid();
begin
  if p_amount <= 0 then
    raise exception 'Credit amount must be greater than zero';
  end if;

  perform public.ensure_workspace_credit_wallet(p_workspace_id);

  select *
  into wallet_row
  from public.workspace_credit_wallets
  where workspace_id = p_workspace_id
  for update;

  next_balance := wallet_row.balance + p_amount;

  update public.workspace_credit_wallets
  set balance = next_balance,
      lifetime_credited = lifetime_credited + p_amount,
      updated_at = timezone('utc', now())
  where workspace_id = p_workspace_id;

  insert into public.workspace_credit_ledger (
    id,
    workspace_id,
    direction,
    entry_kind,
    amount,
    balance_after,
    actor_user_id,
    source,
    source_ref,
    note,
    metadata_json
  ) values (
    next_ledger_id,
    p_workspace_id,
    'credit',
    'grant',
    p_amount,
    next_balance,
    p_actor_user_id,
    'admin_grant',
    p_source_ref,
    p_note,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return query select next_ledger_id, next_balance;
end;
$$;

-- Super-admin adjustment (positive or negative)
create or replace function public.adjust_workspace_credits(
  p_workspace_id uuid,
  p_delta bigint,
  p_actor_user_id uuid,
  p_note text default null,
  p_source_ref text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  ledger_id uuid,
  balance bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_row public.workspace_credit_wallets;
  direction_value public.credit_ledger_direction;
  amount_value bigint;
  next_balance bigint;
  next_ledger_id uuid := gen_random_uuid();
begin
  if p_delta = 0 then
    raise exception 'Credit adjustment cannot be zero';
  end if;

  perform public.ensure_workspace_credit_wallet(p_workspace_id);

  select *
  into wallet_row
  from public.workspace_credit_wallets
  where workspace_id = p_workspace_id
  for update;

  direction_value := case when p_delta > 0 then 'credit' else 'debit' end;
  amount_value := abs(p_delta);

  if direction_value = 'debit' and wallet_row.balance < amount_value then
    raise exception 'Insufficient credits. Required %, available %', amount_value, wallet_row.balance;
  end if;

  next_balance := wallet_row.balance + p_delta;

  update public.workspace_credit_wallets
  set balance = next_balance,
      lifetime_credited = lifetime_credited + case when p_delta > 0 then amount_value else 0 end,
      lifetime_debited = lifetime_debited + case when p_delta < 0 then amount_value else 0 end,
      updated_at = timezone('utc', now())
  where workspace_id = p_workspace_id;

  insert into public.workspace_credit_ledger (
    id,
    workspace_id,
    direction,
    entry_kind,
    amount,
    balance_after,
    actor_user_id,
    source,
    source_ref,
    note,
    metadata_json
  ) values (
    next_ledger_id,
    p_workspace_id,
    direction_value,
    'adjustment',
    amount_value,
    next_balance,
    p_actor_user_id,
    'admin_adjustment',
    p_source_ref,
    p_note,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return query select next_ledger_id, next_balance;
end;
$$;

-- Reserve credits for async work (idempotent by workspace/source/source_ref)
create or replace function public.reserve_workspace_credits(
  p_workspace_id uuid,
  p_source text,
  p_source_ref text,
  p_amount bigint,
  p_actor_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  reservation_id uuid,
  status public.credit_reservation_status,
  amount bigint,
  balance bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_row public.workspace_credit_wallets;
  reservation_row public.workspace_credit_reservations;
  next_balance bigint;
  next_reservation_id uuid := gen_random_uuid();
  next_ledger_id uuid := gen_random_uuid();
begin
  if p_amount <= 0 then
    raise exception 'Reservation amount must be greater than zero';
  end if;

  perform public.ensure_workspace_credit_wallet(p_workspace_id);

  select *
  into reservation_row
  from public.workspace_credit_reservations
  where workspace_id = p_workspace_id
    and source = p_source
    and source_ref = p_source_ref
  limit 1;

  if found then
    select *
    into wallet_row
    from public.workspace_credit_wallets
    where workspace_id = p_workspace_id;

    return query select reservation_row.id, reservation_row.status, reservation_row.amount, wallet_row.balance;
    return;
  end if;

  select *
  into wallet_row
  from public.workspace_credit_wallets
  where workspace_id = p_workspace_id
  for update;

  if wallet_row.balance < p_amount then
    raise exception 'Insufficient credits. Required %, available %', p_amount, wallet_row.balance;
  end if;

  next_balance := wallet_row.balance - p_amount;

  update public.workspace_credit_wallets
  set balance = next_balance,
      lifetime_debited = lifetime_debited + p_amount,
      updated_at = timezone('utc', now())
  where workspace_id = p_workspace_id;

  insert into public.workspace_credit_reservations (
    id,
    workspace_id,
    amount,
    status,
    source,
    source_ref,
    actor_user_id,
    metadata_json
  ) values (
    next_reservation_id,
    p_workspace_id,
    p_amount,
    'reserved',
    p_source,
    p_source_ref,
    p_actor_user_id,
    coalesce(p_metadata, '{}'::jsonb)
  );

  insert into public.workspace_credit_ledger (
    id,
    workspace_id,
    direction,
    entry_kind,
    amount,
    balance_after,
    actor_user_id,
    reservation_id,
    source,
    source_ref,
    note,
    metadata_json
  ) values (
    next_ledger_id,
    p_workspace_id,
    'debit',
    'usage_reserve',
    p_amount,
    next_balance,
    p_actor_user_id,
    next_reservation_id,
    p_source,
    p_source_ref,
    null,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return query select next_reservation_id, 'reserved'::public.credit_reservation_status, p_amount, next_balance;
end;
$$;

-- Mark reservation consumed (no balance movement; debit already happened at reserve)
create or replace function public.settle_workspace_credit_reservation(
  p_reservation_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  reservation_id uuid,
  status public.credit_reservation_status,
  amount bigint,
  workspace_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_row public.workspace_credit_reservations;
begin
  select *
  into reservation_row
  from public.workspace_credit_reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Credit reservation not found';
  end if;

  if reservation_row.status = 'released' then
    raise exception 'Released reservation cannot be settled';
  end if;

  if reservation_row.status <> 'settled' then
    update public.workspace_credit_reservations
    set status = 'settled',
        settled_at = timezone('utc', now()),
        metadata_json = coalesce(metadata_json, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
        updated_at = timezone('utc', now())
    where id = p_reservation_id;

    reservation_row.status := 'settled';
  end if;

  return query select reservation_row.id, reservation_row.status, reservation_row.amount, reservation_row.workspace_id;
end;
$$;

-- Release a reservation (refund credits)
create or replace function public.release_workspace_credit_reservation(
  p_reservation_id uuid,
  p_actor_user_id uuid default null,
  p_note text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  reservation_id uuid,
  status public.credit_reservation_status,
  amount bigint,
  balance bigint,
  workspace_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_row public.workspace_credit_reservations;
  wallet_row public.workspace_credit_wallets;
  next_balance bigint;
  next_ledger_id uuid := gen_random_uuid();
begin
  select *
  into reservation_row
  from public.workspace_credit_reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Credit reservation not found';
  end if;

  if reservation_row.status = 'released' then
    select *
    into wallet_row
    from public.workspace_credit_wallets
    where workspace_id = reservation_row.workspace_id;

    return query select reservation_row.id, reservation_row.status, reservation_row.amount, wallet_row.balance, reservation_row.workspace_id;
    return;
  end if;

  if reservation_row.status = 'settled' then
    raise exception 'Settled reservation cannot be released';
  end if;

  perform public.ensure_workspace_credit_wallet(reservation_row.workspace_id);

  select *
  into wallet_row
  from public.workspace_credit_wallets
  where workspace_id = reservation_row.workspace_id
  for update;

  next_balance := wallet_row.balance + reservation_row.amount;

  update public.workspace_credit_wallets
  set balance = next_balance,
      lifetime_credited = lifetime_credited + reservation_row.amount,
      updated_at = timezone('utc', now())
  where workspace_id = reservation_row.workspace_id;

  update public.workspace_credit_reservations
  set status = 'released',
      released_at = timezone('utc', now()),
      metadata_json = coalesce(metadata_json, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
      updated_at = timezone('utc', now())
  where id = reservation_row.id;

  insert into public.workspace_credit_ledger (
    id,
    workspace_id,
    direction,
    entry_kind,
    amount,
    balance_after,
    actor_user_id,
    reservation_id,
    source,
    source_ref,
    note,
    metadata_json
  ) values (
    next_ledger_id,
    reservation_row.workspace_id,
    'credit',
    'usage_release',
    reservation_row.amount,
    next_balance,
    coalesce(p_actor_user_id, reservation_row.actor_user_id),
    reservation_row.id,
    reservation_row.source,
    reservation_row.source_ref,
    p_note,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return query select reservation_row.id, 'released'::public.credit_reservation_status, reservation_row.amount, next_balance, reservation_row.workspace_id;
end;
$$;

-- RLS
alter table public.platform_admin_roles enable row level security;
alter table public.workspace_credit_wallets enable row level security;
alter table public.workspace_credit_ledger enable row level security;
alter table public.workspace_credit_reservations enable row level security;

drop policy if exists "platform admins self read" on public.platform_admin_roles;
create policy "platform admins self read" on public.platform_admin_roles
for select using (auth.uid() = user_id or public.is_platform_admin(auth.uid()));

drop policy if exists "platform admins manage roles" on public.platform_admin_roles;
create policy "platform admins manage roles" on public.platform_admin_roles
for all using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));

drop policy if exists "workspace members read credit wallets" on public.workspace_credit_wallets;
create policy "workspace members read credit wallets" on public.workspace_credit_wallets
for select using (public.is_workspace_member(workspace_id) or public.is_platform_admin(auth.uid()));

drop policy if exists "workspace members read credit ledger" on public.workspace_credit_ledger;
create policy "workspace members read credit ledger" on public.workspace_credit_ledger
for select using (public.is_workspace_member(workspace_id) or public.is_platform_admin(auth.uid()));

drop policy if exists "platform admins manage credit wallets" on public.workspace_credit_wallets;
create policy "platform admins manage credit wallets" on public.workspace_credit_wallets
for all using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));

drop policy if exists "platform admins manage credit ledger" on public.workspace_credit_ledger;
create policy "platform admins manage credit ledger" on public.workspace_credit_ledger
for all using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));

drop policy if exists "platform admins manage credit reservations" on public.workspace_credit_reservations;
create policy "platform admins manage credit reservations" on public.workspace_credit_reservations
for all using (public.is_platform_admin(auth.uid()))
with check (public.is_platform_admin(auth.uid()));

-- Allow workspace members to inspect reservation state for their workspace if needed.
drop policy if exists "workspace members read credit reservations" on public.workspace_credit_reservations;
create policy "workspace members read credit reservations" on public.workspace_credit_reservations
for select using (public.is_workspace_member(workspace_id) or public.is_platform_admin(auth.uid()));
