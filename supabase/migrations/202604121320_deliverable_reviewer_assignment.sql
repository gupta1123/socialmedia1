alter table public.deliverables
  add column if not exists reviewer_user_id uuid references public.profiles(id) on delete set null;

update public.deliverables
set reviewer_user_id = owner_user_id
where reviewer_user_id is null
  and owner_user_id is not null
  and status = 'review';

create index if not exists deliverables_workspace_reviewer_status_schedule_idx
  on public.deliverables (workspace_id, reviewer_user_id, status, due_at, scheduled_for);

