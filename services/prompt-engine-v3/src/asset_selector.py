from __future__ import annotations

from typing import Any, Dict, List, Optional

from .creative_levers import CONTENT_JOB_ASSET_SEMANTICS
from .schemas import CompileRequest


BLOCKED_PRIMARY_EXTENSIONS = (".mp4", ".mov", ".avi", ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx")
IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")


def shortlist_assets(request: CompileRequest, context: Dict[str, Any], content_job_id: str, limit: int = 12) -> List[Dict[str, Any]]:
    assets = context.get("assets") if isinstance(context.get("assets"), list) else []
    renderable = [asset for asset in assets if isinstance(asset, dict) and is_renderable_image_asset(asset)]
    selected_ids = set(request.selected_asset_ids or [])
    if selected_ids:
        selected = [asset for asset in renderable if asset.get("asset_id") in selected_ids]
        if selected:
            return selected[:limit]
    if content_job_id == "festive_greeting" and not request.project_id:
        return []
    eligible = [asset for asset in renderable if asset_semantic(asset) in CONTENT_JOB_ASSET_SEMANTICS.get(content_job_id, set())]
    pool = eligible or renderable
    scored = sorted(pool, key=lambda asset: score_asset(asset, request.brief, content_job_id), reverse=True)
    return scored[:limit]


def select_registry_asset(request: CompileRequest, context: Dict[str, Any], content_job_id: str) -> Dict[str, Any]:
    candidates = shortlist_assets(request, context, content_job_id, limit=20)
    return candidates[0] if candidates else {}


def coerce_selected_asset(selection: Dict[str, Any], candidates: List[Dict[str, Any]], fallback: Dict[str, Any]) -> Dict[str, Any]:
    selected_id = selection.get("selected_asset_id") if isinstance(selection, dict) else None
    if selected_id:
        for asset in candidates:
            if asset.get("asset_id") == selected_id:
                return asset
    return fallback


def is_renderable_image_asset(asset: Dict[str, Any]) -> bool:
    role = str(asset.get("role") or "").lower()
    if role in {"logo", "rera_qr"}:
        return False
    storage_path = str(asset.get("storage_path") or asset.get("url") or "").lower()
    if storage_path.endswith(BLOCKED_PRIMARY_EXTENSIONS):
        return False
    if storage_path.endswith(IMAGE_EXTENSIONS):
        return True
    metadata = asset.get("metadata") if isinstance(asset.get("metadata"), dict) else {}
    asset_class = str(metadata.get("assetClass") or metadata.get("subjectType") or "").lower()
    return asset_class in {"project_exterior", "amenity", "interior", "location_map", "sample_flat"}


def score_asset(asset: Dict[str, Any], brief: str, content_job_id: str) -> int:
    text = asset_haystack(asset)
    brief_text = (brief or "").lower()
    semantic = asset_semantic(asset)
    score = 0
    if "hero" in text:
        score += 50
    if "truth_anchor" in text:
        score += 35
    if "project_exterior" in text:
        score += 30
    if "facade" in text or "façade" in text:
        score += 25
    if "tower" in text:
        score += 20
    if "amenity" in text:
        score += 15
    if "usable" in text:
        score += 5
    if semantic in CONTENT_JOB_ASSET_SEMANTICS.get(content_job_id, set()):
        score += 35
    if content_job_id == "site_visit" and semantic in {"entrance", "lobby"}:
        score += 25
    if content_job_id == "location_advantage" and semantic == "location_map":
        score += 35
    if content_job_id == "location_advantage" and semantic == "aerial":
        score += 20
    if content_job_id == "pricing_ad" and semantic in {"floor_plan", "unit_plan"}:
        score += 15
    for token in ["pool", "clubhouse", "gym", "yoga", "kids", "basketball", "entrance", "lobby", "map", "aerial", "day", "night"]:
        if token in brief_text and token in text:
            score += 25
    if content_job_id == "amenity_spotlight" and "amenity" not in text:
        score -= 20
    if content_job_id == "project_launch" and any(term in text for term in ["floor_plan", "floor plan", "document"]):
        score -= 50
    return score


def asset_semantic(asset: Dict[str, Any]) -> Optional[str]:
    text = asset_haystack(asset)
    metadata = asset.get("metadata") if isinstance(asset.get("metadata"), dict) else {}
    asset_class = str(metadata.get("assetClass") or metadata.get("subjectType") or asset.get("scene_type") or "").lower()

    if "location_map" in text or "location map" in text or asset_class == "location_map":
        return "location_map"
    if "floor_plan" in text or "floor plan" in text:
        return "floor_plan"
    if "unit_plan" in text or "unit plan" in text:
        return "unit_plan"
    if "site_plan" in text or "site plan" in text or "masterplan" in text:
        return "site_plan" if "site" in text else "masterplan"
    if "construction" in text or "progress" in text or "site update" in text:
        return "construction"
    if "entrance" in text or "arrival" in text or "gate" in text:
        return "entrance"
    if "lobby" in text or asset_class == "lobby":
        return "lobby"
    if asset_class in {"amenity"} or "amenity" in text:
        return "amenity"
    if asset_class in {"interior", "sample_flat"} or "interior" in text or "sample flat" in text:
        return "interior"
    if "aerial" in text:
        return "aerial"
    if asset_class in {"project_exterior", "building_exterior"} or any(term in text for term in ["exterior", "facade", "façade", "tower", "building"]):
        return "building_exterior"
    return None


def asset_haystack(asset: Dict[str, Any]) -> str:
    metadata = asset.get("metadata") if isinstance(asset.get("metadata"), dict) else {}
    tags = metadata.get("tags") if isinstance(metadata.get("tags"), list) else []
    values = [
        asset.get("label"),
        asset.get("description"),
        asset.get("scene_type"),
        asset.get("visual_use"),
        asset.get("truth_status"),
        asset.get("role"),
        asset.get("storage_path"),
        metadata.get("assetClass"),
        metadata.get("subjectType"),
        metadata.get("usageIntent"),
        metadata.get("qualityTier"),
        metadata.get("viewType"),
        metadata.get("amenityName"),
        metadata.get("notes"),
        *tags,
    ]
    return " ".join(str(value) for value in values if value).lower()
