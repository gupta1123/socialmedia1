with ranked_slots as (
  select
    id,
    row_number() over (
      partition by workspace_id, brand_id, channel, weekday, local_time
      order by created_at asc, id asc
    ) as slot_rank
  from public.posting_windows
)
delete from public.posting_windows posting_windows
using ranked_slots
where posting_windows.id = ranked_slots.id
  and ranked_slots.slot_rank > 1;

create unique index if not exists posting_windows_unique_slot_idx
  on public.posting_windows (workspace_id, brand_id, channel, weekday, local_time);
