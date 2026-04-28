create index if not exists post_versions_deliverable_status_created_idx
  on public.post_versions (deliverable_id, status, created_at desc);

create index if not exists deliverables_workspace_status_reviewer_idx
  on public.deliverables (workspace_id, status, reviewer_user_id)
  where status in ('review', 'planned', 'brief_ready', 'generating', 'blocked');

create index if not exists deliverables_workspace_brand_status_idx
  on public.deliverables (workspace_id, brand_id, status)
  where status in ('review', 'planned', 'brief_ready', 'generating', 'blocked');

create index if not exists creative_outputs_post_version_kind_idx
  on public.creative_outputs (post_version_id, kind, created_at desc)
  where kind = 'final';