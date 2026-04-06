-- Brand profiles should not carry content recipe families.
-- Remove the key from existing profile_json rows.

update public.brand_profile_versions
set profile_json = profile_json - 'recipeFamilies'
where profile_json ? 'recipeFamilies';
