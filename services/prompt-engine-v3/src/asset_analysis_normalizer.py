from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

VISUAL_ANALYSIS_KEYS = [
    "visualAnalysis",
    "visual_analysis",
    "assetAnalysis",
    "asset_analysis",
    "imageAnalysis",
    "image_analysis",
    "aiAnalysis",
    "ai_analysis",
    "vision",
    "analysis",
]

SEMANTIC_ALIASES = {
    "building": "building_exterior",
    "building exterior": "building_exterior",
    "project_exterior": "building_exterior",
    "project exterior": "building_exterior",
    "exterior": "building_exterior",
    "facade": "building_exterior",
    "façade": "building_exterior",
    "tower": "building_exterior",
    "lobby": "lobby",
    "site_presence": "lobby",
    "site presence": "lobby",
    "reception": "lobby",
    "entrance": "entrance",
    "arrival": "entrance",
    "interior": "interior",
    "sample_flat": "interior",
    "sample flat": "interior",
    "amenity": "amenity",
    "location_map": "location_map",
    "location map": "location_map",
    "map": "location_map",
    "floor_plan": "floor_plan",
    "floor plan": "floor_plan",
    "unit_plan": "unit_plan",
    "unit plan": "unit_plan",
    "site_plan": "site_plan",
    "site plan": "site_plan",
    "masterplan": "masterplan",
    "construction": "construction",
    "construction_progress": "construction",
    "construction progress": "construction",
    "progress": "construction",
    "aerial": "aerial",
}


def metadata_for_asset(asset: Dict[str, Any]) -> Dict[str, Any]:
    for key in ["metadata", "metadata_json", "metadataJson"]:
        value = asset.get(key)
        if isinstance(value, dict):
            return value
    return {}


def get_visual_analysis(asset: Dict[str, Any]) -> Dict[str, Any]:
    metadata = metadata_for_asset(asset)
    candidates: List[Any] = []
    for key in VISUAL_ANALYSIS_KEYS:
        candidates.append(asset.get(key))
        candidates.append(metadata.get(key))
    for value in candidates:
        if isinstance(value, dict) and value:
            return normalize_visual_analysis(value)
    return {}


def normalize_visual_analysis(value: Dict[str, Any]) -> Dict[str, Any]:
    raw = dict(value)
    semantic = first_string(
        raw,
        [
            "semantic_type",
            "semanticType",
            "assetSemantic",
            "asset_semantic",
            "scene_type",
            "sceneType",
            "subjectType",
            "subject_type",
            "dominantSubjectType",
            "dominant_subject_type",
        ],
    )
    normalized = {
        "semantic_type": normalize_semantic(semantic),
        "dominant_subject": first_string(raw, ["dominant_subject", "dominantSubject", "subject", "mainSubject", "main_subject"]),
        "scene_type": normalize_semantic(first_string(raw, ["scene_type", "sceneType", "scene", "environment"])),
        "composition": first_string(raw, ["composition", "compositionSummary", "composition_summary", "layout"]),
        "prompt_guidance": first_string(raw, ["promptGuidance", "prompt_guidance", "prompt_adaptation_guidance", "promptAdaptationGuidance", "guidance"]),
        "text_safe_zones": first_list(raw, ["textSafeZones", "text_safe_zones", "safeTextZones", "safe_text_zones"]),
        "identity_features": first_list(raw, ["identityFeatures", "identity_features", "mustPreserve", "must_preserve", "preserve"]),
        "must_preserve": first_list(raw, ["mustPreserve", "must_preserve", "identityFeatures", "identity_features"]),
        "allowed_transformations": first_list(raw, ["allowedTransformations", "allowed_transformations", "allowedChanges", "allowed_changes"]),
        "forbidden_transformations": first_list(raw, ["forbiddenTransformations", "forbidden_transformations", "forbidden", "avoid", "not_visible_or_not_supported", "notVisibleOrNotSupported"]),
        "not_visible_or_not_supported": first_list(raw, ["not_visible_or_not_supported", "notVisibleOrNotSupported", "unsupportedDetails", "unsupported_details"]),
        "best_use_cases": first_list(raw, ["bestUseCases", "best_use_cases", "bestFor", "best_for", "useCases", "use_cases"]),
        "bad_use_cases": first_list(raw, ["badUseCases", "bad_use_cases", "badFor", "bad_for"]),
        "construction_guidance": first_dict(raw, ["constructionGuidance", "construction_guidance", "construction"]),
        "raw": raw,
    }
    # Promote semantic hints from best-use or dominant subject if explicit semantic is missing.
    if not normalized["semantic_type"]:
        text = " ".join(str(x) for x in [normalized["dominant_subject"], normalized["scene_type"], *normalized["best_use_cases"]] if x).lower()
        normalized["semantic_type"] = semantic_from_text(text)
    return normalized


def normalize_semantic(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    key = str(value).strip().lower().replace("-", "_")
    return SEMANTIC_ALIASES.get(key) or SEMANTIC_ALIASES.get(key.replace("_", " ")) or key


def semantic_from_visual_analysis(visual: Dict[str, Any]) -> Optional[str]:
    if not visual:
        return None
    for key in ["semantic_type", "scene_type"]:
        semantic = normalize_semantic(visual.get(key))
        if semantic:
            return semantic
    text = " ".join(str(x) for x in [visual.get("dominant_subject"), visual.get("composition"), visual.get("prompt_guidance"), *(visual.get("best_use_cases") or [])] if x).lower()
    return semantic_from_text(text)


def semantic_from_text(text: str) -> Optional[str]:
    text = str(text or "").lower()
    if any(term in text for term in ["construction", "site progress", "work in progress", "slab", "scaffold"]):
        return "construction"
    if any(term in text for term in ["lobby", "reception", "site presence", "sales office", "model display"]):
        return "lobby"
    if any(term in text for term in ["entrance", "arrival", "gate", "drop off", "drop-off"]):
        return "entrance"
    if any(term in text for term in ["interior", "sample flat", "living room", "bedroom", "kitchen", "home office"]):
        return "interior"
    if any(term in text for term in ["amenity", "pool", "gym", "clubhouse", "garden", "yoga", "kids play", "cinema"]):
        return "amenity"
    if any(term in text for term in ["location map", "connectivity map"]):
        return "location_map"
    if "floor plan" in text:
        return "floor_plan"
    if "unit plan" in text:
        return "unit_plan"
    if "site plan" in text:
        return "site_plan"
    if "masterplan" in text:
        return "masterplan"
    if any(term in text for term in ["aerial", "bird's eye", "birds eye"]):
        return "aerial"
    if any(term in text for term in ["exterior", "facade", "façade", "tower", "building", "elevation"]):
        return "building_exterior"
    return None


def terms_from_visual_analysis(visual: Dict[str, Any]) -> List[str]:
    terms: List[str] = []
    for value in [
        visual.get("semantic_type"),
        visual.get("scene_type"),
        visual.get("dominant_subject"),
        visual.get("composition"),
        visual.get("prompt_guidance"),
        *(visual.get("identity_features") or []),
        *(visual.get("best_use_cases") or []),
    ]:
        if value:
            terms.append(str(value))
    return terms


def first_string(raw: Dict[str, Any], keys: Iterable[str]) -> Optional[str]:
    for key in keys:
        value = raw.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def first_list(raw: Dict[str, Any], keys: Iterable[str]) -> List[str]:
    for key in keys:
        value = raw.get(key)
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str) and value.strip():
            return [value.strip()]
    return []


def first_dict(raw: Dict[str, Any], keys: Iterable[str]) -> Dict[str, Any]:
    for key in keys:
        value = raw.get(key)
        if isinstance(value, dict):
            return value
    return {}
