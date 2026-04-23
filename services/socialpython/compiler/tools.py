from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from agno.run import RunContext
from agno.tools import tool


def compact_json(value: Any) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False)


def take_top(values: list[str] | None, count: int) -> list[str]:
    if not values:
        return []
    return [value for value in values[:count] if value]


def choose_image_model() -> str:
    provider = os.getenv("IMAGE_GENERATION_PROVIDER", "fal")
    if provider == "openrouter":
        return os.getenv("OPENROUTER_FINAL_MODEL", "google/gemini-2.5-flash-image")
    if provider == "openai":
        return os.getenv("OPENAI_FINAL_MODEL", "gpt-image-2")
    return os.getenv("FAL_FINAL_MODEL", "fal-ai/nano-banana-pro/edit")


def derive_aspect_ratio(fmt: str | None) -> str:
    mapping = {
        "square": "1:1",
        "portrait": "4:5",
        "landscape": "16:9",
        "story": "9:16",
        "cover": "16:9",
    }
    return mapping.get((fmt or "").strip().lower(), "1:1")


def normalize_external_truth_bundle(bundle: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(bundle, dict):
        return {}
    return bundle


def truth_bundle_from_payload(payload: dict[str, Any]) -> dict[str, Any]:
    bundle = payload.get("truthBundle")
    if not isinstance(bundle, dict):
        raise RuntimeError("No truth bundle is bound for the current request")
    return bundle


def truth_bundle_from_context(run_context: RunContext) -> dict[str, Any]:
    dependencies = run_context.dependencies or {}
    bundle = dependencies.get("truthBundle")
    if not isinstance(bundle, dict):
        raise RuntimeError("No truthBundle in run_context.dependencies")
    return bundle


def resolve_variation_count(payload: dict[str, Any]) -> int:
    request_context = truth_bundle_from_payload(payload).get("requestContext") or {}
    raw = request_context.get("variationCount", 3)
    try:
        count = int(raw)
    except (TypeError, ValueError):
        count = 3
    return max(1, min(count, 6))


def resolve_reference_strategy(payload: dict[str, Any]) -> str:
    bundle = truth_bundle_from_payload(payload)
    has_template = bundle.get("templateTruth") is not None
    candidate_assets = bundle.get("candidateAssets") or []
    exact_asset_contract = bundle.get("exactAssetContract") or {}
    has_refs = any(
        not asset.get("eligibility", {}).get("isExactLogo")
        and not asset.get("eligibility", {}).get("isExactReraQr")
        for asset in candidate_assets
    )
    has_exact_assets = bool(exact_asset_contract.get("logoAssetId")) or bool(
        exact_asset_contract.get("reraQrAssetId")
    )
    if has_template and (has_refs or has_exact_assets):
        return "hybrid"
    if has_template:
        return "generated-template"
    if has_refs or has_exact_assets:
        return "uploaded-references"
    return "generated-template"


def resolve_template_type(payload: dict[str, Any]) -> str | None:
    bundle = truth_bundle_from_payload(payload)
    request_context = bundle.get("requestContext") or {}
    template_truth = bundle.get("templateTruth") or {}
    template_type = request_context.get("templateType")
    if isinstance(template_type, str) and template_type:
        return template_type

    config = (bundle.get("postTypeContract") or {}).get("config") or {}
    recommended = config.get("recommendedTemplateTypes") or []
    if isinstance(recommended, list) and recommended:
        first = recommended[0]
        if isinstance(first, str) and first:
            return first
    prompt_scaffold = template_truth.get("promptScaffold")
    if isinstance(prompt_scaffold, str) and prompt_scaffold.strip():
        return "hero"
    return None


def compact_brand_truth(brand: dict[str, Any]) -> dict[str, Any]:
    visual_system = brand.get("visualSystem") or {}
    voice = brand.get("voice") or {}
    compliance = brand.get("compliance") or {}
    return {
        "name": brand.get("name"),
        "palette": brand.get("palette"),
        "styleDescriptors": take_top(brand.get("styleDescriptors"), 5),
        "visualSystem": {
            "typographyMood": visual_system.get("typographyMood"),
            "headlineFontFamily": visual_system.get("headlineFontFamily"),
            "bodyFontFamily": visual_system.get("bodyFontFamily"),
            "textDensity": visual_system.get("textDensity"),
            "realismLevel": visual_system.get("realismLevel"),
            "imageTreatment": take_top(visual_system.get("imageTreatment"), 3),
            "compositionPrinciples": take_top(visual_system.get("compositionPrinciples"), 3),
        },
        "voice": {
            "summary": voice.get("summary"),
            "approvedVocabulary": take_top(voice.get("approvedVocabulary"), 6),
            "bannedPhrases": take_top(voice.get("bannedPhrases"), 6),
        },
        "doRules": take_top(brand.get("doRules"), 4),
        "dontRules": take_top(brand.get("dontRules"), 4),
        "bannedPatterns": take_top(brand.get("bannedPatterns"), 6),
        "compliance": {
            "bannedClaims": take_top(compliance.get("bannedClaims"), 6),
            "reviewChecks": take_top(compliance.get("reviewChecks"), 4),
        },
    }


def compact_project_truth(project: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": project.get("id"),
        "name": project.get("name"),
        "stage": project.get("stage"),
        "tagline": project.get("tagline"),
        "positioning": project.get("positioning"),
        "lifestyleAngle": project.get("lifestyleAngle"),
        "audienceSegments": take_top(project.get("audienceSegments"), 4),
        "heroAmenities": take_top(project.get("heroAmenities"), 4),
        "amenities": take_top(project.get("amenities"), 10),
        "locationAdvantages": take_top(project.get("locationAdvantages"), 3),
        "nearbyLandmarks": take_top(project.get("nearbyLandmarks"), 3),
        "constructionStatus": project.get("constructionStatus"),
        "latestUpdate": project.get("latestUpdate"),
        "approvedClaims": take_top(project.get("approvedClaims"), 5),
        "bannedClaims": take_top(project.get("bannedClaims"), 5),
        "legalNotes": take_top(project.get("legalNotes"), 4),
        "credibilityFacts": take_top(project.get("credibilityFacts"), 4),
        "reraNumber": project.get("reraNumber"),
        "actualProjectImageIds": take_top(project.get("actualProjectImageIds"), 4),
        "sampleFlatImageIds": take_top(project.get("sampleFlatImageIds"), 4),
    }


def compact_generation_contract(contract: dict[str, Any]) -> dict[str, Any]:
    return {
        "aspectRatio": contract.get("aspectRatio"),
        "variationCount": contract.get("variationCount"),
        "maxSupportingRefs": contract.get("maxSupportingRefs"),
        "hardGuardrails": take_top(contract.get("hardGuardrails"), 8),
    }


def compact_candidate_assets(assets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    compacted: list[dict[str, Any]] = []
    for asset in assets[:8]:
        metadata = asset.get("normalizedMetadata") or {}
        compacted.append(
            {
                "id": asset.get("id"),
                "label": asset.get("label"),
                "subjectType": metadata.get("subjectType"),
                "viewType": metadata.get("viewType"),
                "qualityTier": metadata.get("qualityTier"),
                "amenityName": metadata.get("amenityName"),
                "templateRoles": asset.get("templateRoles") or [],
                "eligibility": {
                    "isProjectScoped": (asset.get("eligibility") or {}).get("isProjectScoped"),
                    "isTemplateLinked": (asset.get("eligibility") or {}).get("isTemplateLinked"),
                    "isSelectedReference": (asset.get("eligibility") or {}).get("isSelectedReference"),
                    "isExactLogo": (asset.get("eligibility") or {}).get("isExactLogo"),
                    "isExactReraQr": (asset.get("eligibility") or {}).get("isExactReraQr"),
                    "isProjectTruthAnchor": (asset.get("eligibility") or {}).get("isProjectTruthAnchor"),
                },
            }
        )
    return compacted


def candidate_assets_for_notebook(bundle: dict[str, Any]) -> list[dict[str, Any]]:
    assets = bundle.get("candidateAssets") or []
    output: list[dict[str, Any]] = []
    for asset in assets:
        metadata = asset.get("normalizedMetadata") or {}
        output.append(
            {
                "id": asset.get("id"),
                "label": asset.get("label"),
                "category": metadata.get("subjectType"),
                "filename": asset.get("fileName"),
                "filepath": asset.get("storagePath"),
                "reference_tag": asset.get("id"),
                "subject_type": metadata.get("subjectType"),
                "view_type": metadata.get("viewType"),
                "quality_tier": metadata.get("qualityTier"),
                "amenity_name": metadata.get("amenityName"),
                "usage_intent": metadata.get("usageIntent"),
                "preserve_identity": metadata.get("preserveIdentity"),
                "template_roles": asset.get("templateRoles") or [],
                "eligibility": asset.get("eligibility") or {},
            }
        )
    return output


def resolve_template_image_path(bundle: dict[str, Any]) -> str | None:
    template = bundle.get("templateTruth") or {}
    preview_path = template.get("previewStoragePath")
    if isinstance(preview_path, str) and preview_path:
        return preview_path

    for asset in bundle.get("candidateAssets") or []:
        eligibility = asset.get("eligibility") or {}
        if eligibility.get("isTemplateLinked") and isinstance(asset.get("storagePath"), str):
            return asset["storagePath"]
    return None


def resolve_logo_image_path(bundle: dict[str, Any]) -> str | None:
    logo_asset_id = (bundle.get("exactAssetContract") or {}).get("logoAssetId")
    if not isinstance(logo_asset_id, str) or not logo_asset_id:
        return None
    for asset in bundle.get("candidateAssets") or []:
        if asset.get("id") == logo_asset_id and isinstance(asset.get("storagePath"), str):
            return asset["storagePath"]
    return None


def resolve_reference_image_paths(bundle: dict[str, Any]) -> list[str]:
    exact = bundle.get("exactAssetContract") or {}
    selected: list[str] = []
    candidate_assets = bundle.get("candidateAssets") or []
    preferred_ids = [
        exact.get("requiredProjectAnchorAssetId"),
        *[
            asset.get("id")
            for asset in candidate_assets
            if (asset.get("eligibility") or {}).get("isSelectedReference")
        ],
    ]
    seen = set()
    for asset_id in preferred_ids:
        if not isinstance(asset_id, str) or not asset_id or asset_id in seen:
            continue
        seen.add(asset_id)
        match = next((asset for asset in candidate_assets if asset.get("id") == asset_id), None)
        storage_path = match.get("storagePath") if isinstance(match, dict) else None
        if isinstance(storage_path, str) and storage_path:
            selected.append(storage_path)

    return selected


def select_assets_for_amenity(bundle: dict[str, Any], amenity_name: str) -> dict[str, Any]:
    resolution = bundle.get("amenityResolution") or {}
    available = resolution.get("availableAmenities") or []
    all_assets = bundle.get("candidateAssets") or []

    selected_option = None
    normalized_target = str(amenity_name or "").strip().lower()
    for option in available:
        option_name = str(option.get("name") or "").strip()
        if option_name.lower() == normalized_target:
            selected_option = option
            break

    asset_ids = selected_option.get("assetIds") if isinstance(selected_option, dict) else []
    assets = [asset for asset in all_assets if asset.get("id") in asset_ids]
    return {
        "amenityName": amenity_name,
        "matchedAmenity": selected_option,
        "assets": assets,
        "hasExactAssetMatch": bool(assets),
    }


def select_assets_for_post_type(bundle: dict[str, Any], post_type_code: str) -> dict[str, Any]:
    all_assets = bundle.get("candidateAssets") or []
    post_type_contract = bundle.get("postTypeContract") or {}
    amenity_focus = post_type_contract.get("amenityFocus")
    exact_contract = bundle.get("exactAssetContract") or {}
    logo_asset_id = exact_contract.get("logoAssetId")
    rera_qr_asset_id = exact_contract.get("reraQrAssetId")

    subject_type_priority = {
        "amenity-spotlight": ["amenity", "interior"],
        "construction-update": ["construction_progress", "project_exterior", "facade"],
        "project-launch": ["project_exterior", "facade", "aerial"],
        "site-visit-invite": ["project_exterior", "facade", "aerial"],
        "location-advantage": ["aerial", "street", "facade"],
        "testimonial": ["interior", "sample_flat", "amenity"],
        "festive-greeting": ["generic_reference", "interior", "lifestyle"],
    }
    preferred_types = subject_type_priority.get(post_type_code, ["generic_reference", "project_exterior"])

    logo_asset = None
    if logo_asset_id:
        for asset in all_assets:
            if asset.get("id") == logo_asset_id:
                logo_asset = asset
                break

    scored_assets = []
    for asset in all_assets:
        if asset.get("id") in {logo_asset_id, rera_qr_asset_id}:
            continue

        metadata = asset.get("normalizedMetadata") or {}
        subject_type = metadata.get("subjectType", "")
        score = 0.0
        if subject_type in preferred_types:
            score = float(len(preferred_types) - preferred_types.index(subject_type))

        quality_tier = metadata.get("qualityTier", "usable")
        if quality_tier == "hero":
            score += 1.0
        elif quality_tier == "high":
            score += 0.5
        elif quality_tier in {"medium", "usable"}:
            score += 0.25

        if post_type_code == "amenity-spotlight" and isinstance(amenity_focus, str) and amenity_focus.strip():
            asset_amenity = metadata.get("amenityName") or ""
            asset_search_text = f"{asset.get('label', '')} {asset_amenity}".lower()
            normalized_focus = amenity_focus.strip().lower()
            focus_tokens = [token for token in normalized_focus.split() if len(token) > 2]
            if normalized_focus in asset_search_text:
                score += 5.0
            elif any(token in asset_search_text for token in focus_tokens):
                score += 1.0
            else:
                score -= 5.0

        if score > 0:
            scored_assets.append(
                {
                    "score": score,
                    "asset": asset,
                    "matchReason": f"subjectType={subject_type}, quality={quality_tier}",
                }
            )

    scored_assets.sort(key=lambda item: item["score"], reverse=True)
    hero_asset = scored_assets[0]["asset"] if scored_assets else None
    fallback_assets = [item["asset"] for item in scored_assets[1:3]]
    return {
        "postTypeCode": post_type_code,
        "preferredSubjectTypes": preferred_types,
        "amenityFocus": amenity_focus if isinstance(amenity_focus, str) and amenity_focus.strip() else None,
        "heroAsset": hero_asset,
        "fallbackAssets": fallback_assets,
        "logoAsset": logo_asset,
        "availableAssetCount": len(scored_assets),
    }


@tool()
def get_request_brief(run_context: RunContext) -> str:
    return compact_json(truth_bundle_from_context(run_context).get("requestContext") or {})


@tool()
def get_brand_truth(run_context: RunContext) -> str:
    return compact_json(compact_brand_truth(truth_bundle_from_context(run_context).get("brandTruth") or {}))


@tool()
def get_project_truth(run_context: RunContext) -> str:
    return compact_json(compact_project_truth(truth_bundle_from_context(run_context).get("projectTruth") or {}))


@tool()
def get_post_type_contract(run_context: RunContext) -> str:
    return compact_json(truth_bundle_from_context(run_context).get("postTypeContract") or {})


@tool()
def get_festival_truth(run_context: RunContext) -> str:
    return compact_json((truth_bundle_from_context(run_context).get("festivalTruth") or {"festival": None}))


@tool()
def get_template_truth(run_context: RunContext) -> str:
    return compact_json((truth_bundle_from_context(run_context).get("templateTruth") or {"template": None}))


@tool()
def list_candidate_assets(run_context: RunContext) -> str:
    return compact_json(compact_candidate_assets(truth_bundle_from_context(run_context).get("candidateAssets") or []))


@tool()
def get_available_project_amenities(run_context: RunContext) -> str:
    resolution = truth_bundle_from_context(run_context).get("amenityResolution") or {}
    return compact_json(resolution.get("availableAmenities") or [])


@tool()
def get_assets_for_amenity(amenity_name: str, run_context: RunContext) -> str:
    return compact_json(select_assets_for_amenity(truth_bundle_from_context(run_context), amenity_name))


@tool()
def get_assets_for_post_type(post_type_code: str, run_context: RunContext) -> str:
    return compact_json(select_assets_for_post_type(truth_bundle_from_context(run_context), post_type_code))


@tool()
def get_exact_asset_contract(run_context: RunContext) -> str:
    return compact_json(truth_bundle_from_context(run_context).get("exactAssetContract") or {})


@tool()
def get_generation_contract(run_context: RunContext) -> str:
    return compact_json(
        compact_generation_contract(truth_bundle_from_context(run_context).get("generationContract") or {})
    )


@tool()
def get_brand_guidelines(run_context: RunContext) -> str:
    return compact_json(truth_bundle_from_context(run_context).get("brandTruth") or {})


@tool()
def get_project_details(project_slug: str, run_context: RunContext) -> str:
    bundle = truth_bundle_from_context(run_context)
    project = bundle.get("projectTruth") or {}
    return compact_json(
        {
            **project,
            "project_slug": project_slug,
        }
    )


@tool()
def get_template_details(template_id: str, run_context: RunContext) -> str:
    bundle = truth_bundle_from_context(run_context)
    template = bundle.get("templateTruth") or {}
    return compact_json(
        {
            **template,
            "template_id": template_id,
            "template_image_path": resolve_template_image_path(bundle),
        }
    )


@tool()
def list_asset_candidates(
    project_slug: str,
    post_type: str,
    specific_amenity: str | None = None,
    occasion: str | None = None,
    no_building_image: bool = False,
    brief_text: str = "",
    run_context: RunContext | None = None,
) -> str:
    bundle = truth_bundle_from_context(run_context) if run_context is not None else {}
    project = bundle.get("projectTruth") or {}
    post_type_code = post_type.strip() if isinstance(post_type, str) and post_type.strip() else (
        (bundle.get("postTypeContract") or {}).get("code") or "project-launch"
    )

    all_assets = candidate_assets_for_notebook(bundle)
    exact_contract = bundle.get("exactAssetContract") or {}
    logo_asset_id = exact_contract.get("logoAssetId")
    logo_filename = None
    for asset in all_assets:
        if asset.get("id") == logo_asset_id:
            logo_filename = asset.get("filename")
            break

    forbidden_categories: list[str] = []
    hard_constraints: list[str] = []
    if no_building_image:
        forbidden_categories = [
            "project_exterior",
            "facade",
            "aerial",
            "entrance_arrival",
            "entrance_gate",
            "township_overview",
        ]
        hard_constraints.append(
            "Brief explicitly avoids building imagery. Exclude all building-led categories."
        )

    available_assets: list[dict[str, Any]] = []
    for asset in all_assets:
        category = asset.get("category")
        if isinstance(category, str) and category in forbidden_categories:
            continue
        available_assets.append(
            {
                "category": category,
                "filename": asset.get("filename"),
                "filepath": asset.get("filepath"),
                "reference_tag": asset.get("reference_tag"),
                "description": asset.get("label"),
                "asset_id": asset.get("id"),
                "subject_type": asset.get("subject_type"),
                "view_type": asset.get("view_type"),
                "quality_tier": asset.get("quality_tier"),
                "amenity_name": asset.get("amenity_name"),
            }
        )

    if post_type_code == "amenity-spotlight" and specific_amenity:
        hard_constraints.append(
            f"Amenity spotlight MUST prioritize the exact amenity or the closest truthful asset for '{specific_amenity}'."
        )

    semantic_guidance = {
        "project-launch": (
            "Pick the asset that best anchors a finished launch poster. "
            "Prefer a recognisable hero over a broad aerial unless township-scale is the message."
        ),
        "construction-update": (
            "Only a truthful construction_progress asset is valid unless the caller supplies an uploaded reference image."
        ),
        "festive-greeting": (
            "Symbolic or lifestyle assets may outperform building hero shots."
        ),
        "amenity-spotlight": (
            "Pick the exact amenity asset if it exists; otherwise pick the closest truthful lifestyle analogue."
        ),
        "site-visit-invite": (
            "Prefer assets that imply real on-ground presence, such as sales-gallery or entrance assets."
        ),
    }.get(post_type_code, "Pick the asset that best serves the communication job.")

    return compact_json(
        {
            "project_slug": project_slug,
            "project_name": project.get("name"),
            "project_type": project.get("projectType") or project.get("type"),
            "post_type": post_type_code,
            "specific_amenity": specific_amenity,
            "occasion": occasion,
            "no_building_image": no_building_image,
            "brief_text": brief_text,
            "logo_asset_filename": logo_filename,
            "hard_constraints": hard_constraints,
            "forbidden_categories": forbidden_categories,
            "unavailable_categories": [],
            "semantic_guidance": semantic_guidance,
            "available_assets": available_assets,
            "allowed_categories": [
                asset.get("category") for asset in available_assets if asset.get("category")
            ],
            "allowed_filenames": [
                asset.get("filename") for asset in available_assets if asset.get("filename")
            ],
            "allowed_reference_tags": [
                asset.get("reference_tag")
                for asset in available_assets
                if asset.get("reference_tag")
            ],
        }
    )


def _notebook_asset_summary(asset: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(asset, dict):
        return None
    metadata = asset.get("normalizedMetadata") or {}
    storage_path = asset.get("storagePath")
    return {
        "id": asset.get("id"),
        "label": asset.get("label"),
        "category": metadata.get("subjectType"),
        "filename": asset.get("fileName") or (Path(storage_path).name if isinstance(storage_path, str) and storage_path else None),
        "filepath": storage_path,
        "reference_tag": asset.get("id"),
        "subject_type": metadata.get("subjectType"),
        "view_type": metadata.get("viewType"),
        "quality_tier": metadata.get("qualityTier"),
        "amenity_name": metadata.get("amenityName"),
    }
