alter table public.creative_outputs
  add column if not exists thumbnail_storage_path text null,
  add column if not exists thumbnail_width integer null,
  add column if not exists thumbnail_height integer null,
  add column if not exists thumbnail_bytes bigint null;

alter table public.brand_assets
  add column if not exists thumbnail_storage_path text null,
  add column if not exists thumbnail_width integer null,
  add column if not exists thumbnail_height integer null,
  add column if not exists thumbnail_bytes bigint null;
