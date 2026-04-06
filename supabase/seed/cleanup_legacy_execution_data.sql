begin;

-- Remove legacy generated direction rows that were created before the
-- deliverable-centric model and never attached to a deliverable.
delete from public.style_templates
where deliverable_id is null;

-- Remove ad hoc legacy runs at the request layer. This cascades to
-- prompt_packages, creative_jobs, creative_outputs, and feedback_events.
delete from public.creative_requests
where deliverable_id is null;

-- Defensive cleanup in case any legacy rows survived outside the main cascade path.
delete from public.prompt_packages
where deliverable_id is null;

delete from public.creative_jobs
where deliverable_id is null;

delete from public.creative_outputs
where deliverable_id is null;

commit;
