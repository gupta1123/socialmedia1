-- Series are concept-first. Exact publish time now comes from posting windows
-- when an actual post task is scheduled, not from the series definition itself.

update public.series
set source_brief_json = coalesce(source_brief_json, '{}'::jsonb) || jsonb_strip_nulls(
  jsonb_build_object(
    'legacyPostingTimeHint', nullif(cadence_json ->> 'localTime', ''),
    'legacyTimezoneHint', nullif(cadence_json ->> 'timezone', '')
  )
),
cadence_json = (coalesce(cadence_json, '{}'::jsonb) - 'localTime' - 'timezone')
where cadence_json ? 'localTime'
   or cadence_json ? 'timezone';
