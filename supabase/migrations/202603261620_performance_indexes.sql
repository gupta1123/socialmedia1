create index if not exists workspace_memberships_user_created_idx
  on public.workspace_memberships (user_id, created_at asc);

create index if not exists brands_workspace_created_idx
  on public.brands (workspace_id, created_at asc);

create index if not exists brand_assets_brand_created_idx
  on public.brand_assets (brand_id, created_at desc);

create index if not exists brand_assets_workspace_created_idx
  on public.brand_assets (workspace_id, created_at desc);

create index if not exists style_templates_workspace_created_idx
  on public.style_templates (workspace_id, created_at desc);

create index if not exists style_templates_output_idx
  on public.style_templates (creative_output_id);

create index if not exists prompt_packages_workspace_created_idx
  on public.prompt_packages (workspace_id, created_at desc);

create index if not exists creative_jobs_workspace_created_idx
  on public.creative_jobs (workspace_id, created_at desc);

create index if not exists creative_jobs_prompt_package_created_idx
  on public.creative_jobs (prompt_package_id, created_at desc);

create index if not exists creative_outputs_workspace_created_idx
  on public.creative_outputs (workspace_id, created_at desc);

create index if not exists feedback_events_output_created_idx
  on public.feedback_events (creative_output_id, created_at desc);
