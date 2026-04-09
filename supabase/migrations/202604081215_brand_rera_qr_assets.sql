do $$
begin
  if not exists (
    select 1
    from pg_enum enum_values
    join pg_type enum_types on enum_types.oid = enum_values.enumtypid
    join pg_namespace namespaces on namespaces.oid = enum_types.typnamespace
    where namespaces.nspname = 'public'
      and enum_types.typname = 'asset_kind'
      and enum_values.enumlabel = 'rera_qr'
  ) then
    alter type public.asset_kind add value 'rera_qr';
  end if;
end
$$;
