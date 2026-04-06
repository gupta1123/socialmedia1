begin;

-- Remove review/scheduling history tied to generated post versions.
delete from public.feedback_events;
delete from public.approval_events;
delete from public.publications;
delete from public.post_version_assets;
delete from public.post_versions;

-- Remove saved style directions from Explore styles.
delete from public.style_templates;

-- Remove compile / generation runs. This cascades to prompt_packages,
-- creative_jobs, and creative_outputs.
delete from public.creative_requests;

-- Reopen every post task so it can be created again from the frontend.
update public.deliverables
set
  status = 'brief_ready',
  approved_post_version_id = null,
  latest_post_version_id = null;

commit;
