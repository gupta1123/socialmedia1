do $$
begin
  create type public.output_review_state as enum ('pending_review', 'approved', 'needs_revision', 'closed');
exception
  when duplicate_object then null;
end
$$;

alter table public.creative_outputs
  add column if not exists review_state public.output_review_state not null default 'pending_review',
  add column if not exists latest_feedback_verdict public.feedback_verdict,
  add column if not exists reviewed_at timestamptz;

create index if not exists creative_outputs_review_state_idx
  on public.creative_outputs (workspace_id, review_state, created_at desc);

with latest_feedback as (
  select distinct on (creative_output_id)
    creative_output_id,
    verdict,
    created_at
  from public.feedback_events
  order by creative_output_id, created_at desc
)
update public.creative_outputs as co
set
  review_state = case
    when lf.verdict = 'approved' then 'approved'::public.output_review_state
    when lf.verdict = 'close' then 'closed'::public.output_review_state
    else 'needs_revision'::public.output_review_state
  end,
  latest_feedback_verdict = lf.verdict,
  reviewed_at = lf.created_at
from latest_feedback lf
where co.id = lf.creative_output_id;
