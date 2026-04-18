alter table public.prompt_packages
  add column if not exists variations jsonb not null default '[]'::jsonb;

update public.prompt_packages
set variations = case
  when jsonb_typeof(compiler_trace -> 'variations') = 'array' then compiler_trace -> 'variations'
  else '[]'::jsonb
end
where variations = '[]'::jsonb;
