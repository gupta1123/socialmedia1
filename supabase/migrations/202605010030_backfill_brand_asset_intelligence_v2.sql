update public.brand_assets
set
  asset_description = coalesce(
    nullif(asset_description, ''),
    nullif(metadata_json ->> 'assetDescription', ''),
    nullif(metadata_json ->> 'description', ''),
    nullif(metadata_json ->> 'notes', ''),
    label
  ),
  truth_status = coalesce(
    nullif(truth_status, ''),
    nullif(metadata_json ->> 'truthStatus', ''),
    case
      when kind = 'logo' then 'logo'
      when kind = 'rera_qr' then 'qr'
      when storage_path ~* '\\.(mp4|mov|avi)$' then 'video'
      when storage_path ~* '\\.pdf$' and (label ~* 'floor|plan' or storage_path ~* 'floor|plan') then 'floor_plan'
      when storage_path ~* '\\.pdf$' then 'brochure'
      when storage_path ~* '\\.(png|jpe?g|webp)$'
        and (
          metadata_json::text ~* 'photograph'
          or metadata_json::text ~* 'photo'
          or label ~* 'site|lobby|reception|model display'
        )
        then 'photograph'
      when storage_path ~* '\\.(png|jpe?g|webp)$'
        and (
          metadata_json::text ~* 'render'
          or label ~* 'render|facade|tower|amenity|pool|gym|interior|aerial|exterior'
        )
        then 'render'
      else 'unknown'
    end
  ),
  scene_type = coalesce(
    nullif(scene_type, ''),
    nullif(metadata_json ->> 'sceneType', ''),
    nullif(metadata_json ->> 'subjectType', ''),
    nullif(metadata_json ->> 'assetClass', ''),
    case
      when kind = 'logo' then 'logo'
      when kind = 'rera_qr' then 'rera_qr'
      when label ~* 'floor|plan' or storage_path ~* 'floor|plan' then 'floor_plan'
      when label ~* 'map|location' or metadata_json::text ~* 'location_map' then 'location_map'
      when label ~* 'pool|gym|amenity|clubhouse|kids|basketball|yoga|banquet|cinema|games|terrace|deck' then 'amenity'
      when label ~* 'kitchen|bedroom|living|dining|interior|sample flat' then 'interior'
      when label ~* 'lobby|reception' then 'lobby'
      when label ~* 'facade|tower|exterior|entrance|aerial|masterplan' then 'project_exterior'
      else null
    end
  ),
  visual_use = coalesce(
    nullif(visual_use, ''),
    nullif(metadata_json ->> 'visualUse', ''),
    nullif(metadata_json ->> 'usageIntent', ''),
    case
      when kind in ('logo', 'rera_qr') then 'exact_asset'
      when storage_path ~* '\\.(pdf|mp4|mov|avi)$' then 'supporting_ref'
      when metadata_json::text ~* 'hero' or label ~* 'hero|tower|facade|pool|gym|reception|entrance' then 'hero_anchor'
      when label ~* 'amenity|pool|gym|clubhouse|kids|basketball|yoga|banquet|cinema|games|terrace|deck' then 'amenity_anchor'
      else 'truth_anchor'
    end
  );

update public.brand_assets
set metadata_json = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(coalesce(metadata_json, '{}'::jsonb), '{truthStatus}', to_jsonb(truth_status), true),
        '{sceneType}', to_jsonb(scene_type), true
      ),
      '{visualUse}', to_jsonb(visual_use), true
    ),
    '{assetDescription}', to_jsonb(asset_description), true
  )
where truth_status is not null
  and scene_type is not null
  and visual_use is not null
  and asset_description is not null;
