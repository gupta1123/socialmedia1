alter table public.creative_v3_compile_runs
  drop constraint if exists creative_v3_compile_runs_status_check;

alter table public.creative_v3_compile_runs
  add constraint creative_v3_compile_runs_status_check
  check (status in ('ready', 'ready_with_warnings', 'blocked', 'needs_input', 'failed'));
