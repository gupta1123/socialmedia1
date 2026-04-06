begin;

insert into public.campaign_deliverable_plans (
  id,
  campaign_id,
  name,
  post_type_id,
  template_id,
  channel_account_id,
  placement_code,
  content_format,
  objective_override,
  cta_override,
  brief_override,
  scheduled_offset_days,
  sort_order,
  active
)
values (
  '88888888-8888-4888-8888-888888888887',
  '77777777-7777-4777-8777-777777777771',
  'Paid launch creative',
  '50db8f49-c735-4a91-83d0-f0ef96644a7d',
  'fa2fb875-cee6-40de-ad3f-b0d34bf878bd',
  '33333333-3333-4333-8333-333333333332',
  'ad-creative',
  'static',
  'lead_gen',
  'Book a site visit',
  'Paid-mobile variation of the launch push with concise headline hierarchy and a strong enquiry-led CTA.',
  2,
  3,
  true
)
on conflict (id) do update
set
  name = excluded.name,
  post_type_id = excluded.post_type_id,
  template_id = excluded.template_id,
  channel_account_id = excluded.channel_account_id,
  placement_code = excluded.placement_code,
  content_format = excluded.content_format,
  objective_override = excluded.objective_override,
  cta_override = excluded.cta_override,
  brief_override = excluded.brief_override,
  scheduled_offset_days = excluded.scheduled_offset_days,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = timezone('utc', now());

update public.deliverables
set source_json = coalesce(source_json, '{}'::jsonb) || jsonb_build_object(
  'campaignPlanId', '88888888-8888-4888-8888-888888888883',
  'campaignId', '77777777-7777-4777-8777-777777777771',
  'campaignName', 'Asteria Residences Launch Burst',
  'source', 'campaign_plan'
)
where id = '99999999-9999-4999-8999-999999999995';

update public.deliverables
set source_json = coalesce(source_json, '{}'::jsonb) || jsonb_build_object(
  'campaignPlanId', '88888888-8888-4888-8888-888888888887',
  'campaignId', '77777777-7777-4777-8777-777777777771',
  'campaignName', 'Asteria Residences Launch Burst',
  'source', 'campaign_plan'
)
where id = '99999999-9999-4999-8999-999999999998';

commit;
