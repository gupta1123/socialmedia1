do $$
begin
  if not exists (
    select 1
    from pg_type enum_types
    join pg_enum enum_values on enum_values.enumtypid = enum_types.oid
    join pg_namespace enum_namespace on enum_namespace.oid = enum_types.typnamespace
    where enum_namespace.nspname = 'public'
      and enum_types.typname = 'job_type'
      and enum_values.enumlabel = 'option'
  ) then
    alter type public.job_type add value 'option';
  end if;
end
$$;
