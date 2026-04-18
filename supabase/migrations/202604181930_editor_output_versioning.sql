alter table public.creative_outputs
  add column if not exists parent_output_id uuid references public.creative_outputs(id) on delete set null,
  add column if not exists root_output_id uuid references public.creative_outputs(id) on delete set null,
  add column if not exists edited_from_output_id uuid references public.creative_outputs(id) on delete set null,
  add column if not exists version_number integer not null default 1,
  add column if not exists is_latest_version boolean not null default true;

update public.creative_outputs
set root_output_id = id
where root_output_id is null;

update public.creative_outputs
set version_number = 1
where version_number is null or version_number < 1;

alter table public.creative_outputs
  add constraint creative_outputs_version_number_check
  check (version_number >= 1);

create index if not exists creative_outputs_root_output_id_idx
  on public.creative_outputs(root_output_id);

create index if not exists creative_outputs_parent_output_id_idx
  on public.creative_outputs(parent_output_id);

create index if not exists creative_outputs_edited_from_output_id_idx
  on public.creative_outputs(edited_from_output_id);

create index if not exists creative_outputs_workspace_root_version_idx
  on public.creative_outputs(workspace_id, root_output_id, version_number desc);
