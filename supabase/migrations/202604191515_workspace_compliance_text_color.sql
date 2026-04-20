alter table public.workspace_compliance_settings
add column if not exists rera_text_color text not null default '#111111';
