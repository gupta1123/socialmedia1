from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional

from .planning_schemas import AssetProfile
from .asset_analysis_normalizer import get_visual_analysis, metadata_for_asset, normalize_semantic, semantic_from_visual_analysis, semantic_from_text, terms_from_visual_analysis

BLOCKED_PRIMARY_EXTENSIONS = (".mp4", ".mov", ".avi", ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx")
IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")


def build_asset_index(assets: Iterable[Dict[str, Any]]) -> List[AssetProfile]:
    return [profile_asset(asset) for asset in assets if isinstance(asset, dict)]


def profile_asset(asset: Dict[str, Any]) -> AssetProfile:
    visual = visual_analysis(asset)
    semantic = asset_semantic(asset)
    contains = _terms_from_visual(asset, visual)
    return AssetProfile(
        asset_id=asset.get("asset_id"),
        label=asset.get("label"),
        semantic_type=semantic,
        truth_status=asset.get("truth_status") or asset.get("truthStatus"),
        role=asset.get("role"),
        description=asset.get("description"),
        contains=contains,
        best_for=best_for_semantic(semantic),
        bad_for=bad_for_semantic(semantic),
        safe_claims=list(asset.get("safe_claims") or []),
        do_not_claim=list(asset.get("do_not_claim") or []),
        prompt_guidance=visual.get("prompt_adaptation_guidance") or asset.get("visual_use"),
        visual_analysis=visual,
        raw=dict(asset),
    )


def is_renderable_image_asset(asset: Dict[str, Any]) -> bool:
    role = str(asset.get("role") or "").lower()
    if role in {"logo", "rera_qr"}:
        return False
    storage_path = str(asset.get("storage_path") or asset.get("url") or "").lower()
    if storage_path.endswith(BLOCKED_PRIMARY_EXTENSIONS):
        return False
    if storage_path.endswith(IMAGE_EXTENSIONS):
        return True
    metadata = metadata_for_asset(asset)
    asset_class = str(metadata.get("assetClass") or metadata.get("subjectType") or "").lower()
    return asset_class in {"project_exterior", "building_exterior", "amenity", "interior", "location_map", "sample_flat", "lobby", "entrance"}


def asset_semantic(asset: Dict[str, Any]) -> Optional[str]:
    """Return the best semantic for an asset.

    Priority is model/vision analysis first, explicit DB metadata second, and
    text-search fallback last. This keeps clean DB metadata fast while avoiding
    accepting filename/label string matching as the primary source of truth.
    """
    visual = visual_analysis(asset)
    semantic = semantic_from_visual_analysis(visual)
    if semantic:
        return semantic

    metadata = metadata_for_asset(asset)
    explicit_values = [
        asset.get("scene_type"),
        asset.get("visual_use"),
        metadata.get("assetClass"),
        metadata.get("subjectType"),
        metadata.get("usageIntent"),
        metadata.get("viewType"),
        metadata.get("sceneType"),
    ]
    for value in explicit_values:
        semantic = normalize_semantic(str(value)) if value else None
        if semantic in {"building_exterior", "interior", "amenity", "lobby", "entrance", "construction", "location_map", "floor_plan", "unit_plan", "site_plan", "masterplan", "aerial"}:
            return semantic

    text = asset_haystack(asset)
    return semantic_from_text(text)

def role_hint_for_semantic(semantic: Optional[str]) -> str:
    if semantic == "building_exterior":
        return "primary_project_truth"
    if semantic == "interior":
        return "interior_lifestyle_truth"
    if semantic == "amenity":
        return "amenity_truth"
    if semantic in {"location_map", "floor_plan", "unit_plan", "site_plan", "masterplan"}:
        return "supporting_fact_visual"
    if semantic == "construction":
        return "construction_truth"
    return "supporting_project_asset"


def best_for_semantic(semantic: Optional[str]) -> List[str]:
    return {
        "building_exterior": ["project launch", "brand presence", "location support"],
        "interior": ["lifestyle-led launch", "family audience", "interior spotlight"],
        "amenity": ["amenity spotlight", "lifestyle proof", "family audience"],
        "location_map": ["location advantage", "proof-led post"],
        "construction": ["construction update", "progress post"],
        "aerial": ["township scale", "location advantage", "masterplan reveal"],
        "entrance": ["site visit", "arrival story", "launch support"],
        "lobby": ["site visit", "lifestyle-led launch", "premium arrival"],
    }.get(semantic or "", [])


def bad_for_semantic(semantic: Optional[str]) -> List[str]:
    return {
        "floor_plan": ["pure visual launch hero"],
        "unit_plan": ["pure visual launch hero"],
        "location_map": ["lifestyle interior post"],
        "interior": ["facade-scale launch if user did not request interior"],
    }.get(semantic or "", [])


def visual_analysis(asset: Dict[str, Any]) -> Dict[str, Any]:
    return get_visual_analysis(asset)

def asset_haystack(asset: Dict[str, Any]) -> str:
    metadata = metadata_for_asset(asset)
    tags = metadata.get("tags") if isinstance(metadata.get("tags"), list) else []
    visual = visual_analysis(asset)
    values = [
        asset.get("label"), asset.get("description"), asset.get("scene_type"), asset.get("visual_use"), asset.get("truth_status"), asset.get("role"), asset.get("storage_path"),
        metadata.get("assetClass"), metadata.get("subjectType"), metadata.get("usageIntent"), metadata.get("qualityTier"), metadata.get("viewType"), metadata.get("amenityName"), metadata.get("notes"),
        visual.get("dominant_subject"), visual.get("composition"), visual.get("prompt_guidance"), visual.get("semantic_type"), visual.get("scene_type"), *terms_from_visual_analysis(visual), *tags,
    ]
    return " ".join(str(value) for value in values if value).lower()


def _terms_from_visual(asset: Dict[str, Any], visual: Dict[str, Any]) -> List[str]:
    text = asset_haystack(asset)
    terms = list(dict.fromkeys(terms_from_visual_analysis(visual)))
    for token in ["tower", "facade", "balcony", "living room", "bedroom", "pool", "clubhouse", "gym", "garden", "map", "aerial", "construction", "lobby", "entrance", "daylight", "dusk"]:
        if token in text:
            terms.append(token)
    return terms
