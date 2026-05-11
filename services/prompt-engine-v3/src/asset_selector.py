from __future__ import annotations

import re
from copy import deepcopy
from typing import Any, Dict, List, Optional, Tuple

from .asset_indexer import asset_haystack, asset_semantic, is_renderable_image_asset, role_hint_for_semantic, visual_analysis, profile_asset
from .creative_levers import CONTENT_JOB_ASSET_SEMANTICS
from .planning_schemas import AssetDecision, AssetProfile, CreativeIntent
from .schemas import CompileRequest


def shortlist_assets(
    request: CompileRequest,
    context: Dict[str, Any],
    content_job_id: str,
    limit: int = 12,
    intent: Optional[CreativeIntent] = None,
) -> List[Dict[str, Any]]:
    assets = context.get("assets") if isinstance(context.get("assets"), list) else []
    renderable = [asset for asset in assets if isinstance(asset, dict) and is_renderable_image_asset(asset)]
    selected_ids = set(request.selected_asset_ids or [])
    if selected_ids:
        selected = []
        for asset in renderable:
            if asset.get("asset_id") in selected_ids:
                keep, reason = hard_filter_asset(asset, request, content_job_id, intent=intent, ignore_semantic=True)
                if keep:
                    selected.append(score_asset(asset, request.brief, content_job_id, request, locked=True, intent=intent))
        if selected:
            return assign_ranks(selected)[:limit]
    if content_job_id == "festive_greeting" and not request.project_id:
        return []
    eligible = []
    for asset in renderable:
        keep, _reason = hard_filter_asset(asset, request, content_job_id, intent=intent)
        if keep:
            eligible.append(asset)
    pool = eligible or renderable
    scored = sorted(
        [score_asset(asset, request.brief, content_job_id, request, intent=intent) for asset in pool],
        key=lambda asset: asset.get("_score", 0),
        reverse=True,
    )
    return assign_ranks(scored)[:limit]


def select_registry_asset(request: CompileRequest, context: Dict[str, Any], content_job_id: str, intent: Optional[CreativeIntent] = None) -> Dict[str, Any]:
    candidates = shortlist_assets(request, context, content_job_id, limit=20, intent=intent)
    return candidates[0] if candidates else {}


def build_asset_decision(asset: Dict[str, Any], selection: Optional[Dict[str, Any]] = None, intent: Optional[CreativeIntent] = None) -> AssetDecision:
    profile = profile_asset(asset) if asset else AssetProfile()
    semantic = profile.semantic_type
    visual = profile.visual_analysis or {}
    unsupported = []
    unsupported.extend(profile.do_not_claim or [])
    if isinstance(visual.get("not_visible_or_not_supported"), list):
        unsupported.extend(str(item) for item in visual.get("not_visible_or_not_supported") if str(item).strip())
    reference_role = _reference_role_for_intent(intent, asset)
    constraints = truth_constraints_for_semantic(semantic, asset, reference_role=reference_role)
    return AssetDecision(
        selected_asset_id=asset.get("asset_id"),
        semantic_type=semantic,
        confidence=float((selection or asset.get("selection") or {}).get("confidence") or 0.8),
        reason=str((selection or asset.get("selection") or {}).get("selection_reason") or (selection or asset.get("selection") or {}).get("source") or "deterministic_asset_selection"),
        asset_use_plan=asset_use_plan_for_semantic(semantic, asset, reference_role=reference_role, intent=intent),
        truth_constraints=constraints,
        unsupported_details=_dedupe(unsupported),
        profile=profile,
        selection=selection or asset.get("selection") or {},
        reference_role=reference_role,
    )


def coerce_selected_asset(selection: Dict[str, Any], candidates: List[Dict[str, Any]], fallback: Dict[str, Any]) -> Dict[str, Any]:
    selected_id = selection.get("selected_asset_id") if isinstance(selection, dict) else None
    if selected_id:
        for asset in candidates:
            if asset.get("asset_id") == selected_id:
                return asset
    return fallback


def validate_ai_asset_selection(selection: Dict[str, Any], request: CompileRequest, candidates: List[Dict[str, Any]], fallback: Dict[str, Any], min_confidence: float = 0.60) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Accept only candidate IDs and user locks; otherwise return deterministic rank #1."""

    selected_ids = [str(value) for value in (request.selected_asset_ids or []) if str(value).strip()]
    candidate_by_id = {str(asset.get("asset_id")): asset for asset in candidates if asset.get("asset_id")}
    selected_id = str(selection.get("selected_asset_id") or "").strip() if isinstance(selection, dict) else ""
    try:
        confidence = float(selection.get("confidence", 0)) if isinstance(selection, dict) else 0.0
    except Exception:
        confidence = 0.0

    reason = "accepted_dspy_selection"
    if selected_ids:
        selected_id = selected_ids[0]
        reason = "user_locked_asset"
    elif not selected_id or selected_id not in candidate_by_id or confidence < min_confidence:
        selected_id = str(fallback.get("asset_id") or "")
        reason = "deterministic_fallback"

    asset = candidate_by_id.get(selected_id) or fallback or {}
    normalized = dict(selection or {})
    normalized.update({
        "selected_asset_id": asset.get("asset_id"),
        "confidence": confidence,
        "source": reason,
        "fallback_asset_id": fallback.get("asset_id"),
    })
    return asset, normalized


def build_asset_selection_context(request: CompileRequest, content_job_id: str, candidates: List[Dict[str, Any]], intent: Optional[CreativeIntent] = None) -> Dict[str, Any]:
    compact_assets = []
    for asset in candidates[:12]:
        visual = visual_analysis(asset)
        compact_assets.append({
            "asset_id": asset.get("asset_id"),
            "label": asset.get("label"),
            "semantic_type": asset_semantic(asset),
            "scene_type": asset.get("scene_type"),
            "visual_use": asset.get("visual_use"),
            "truth_status": asset.get("truth_status"),
            "description": asset.get("description"),
            "safe_claims": asset.get("safe_claims") or [],
            "do_not_claim": asset.get("do_not_claim") or [],
            "visual_analysis": {
                "summary": visual.get("summary"),
                "composition": visual.get("composition"),
                "visual_traits": visual.get("visual_traits"),
                "prompt_adaptation_guidance": visual.get("prompt_adaptation_guidance"),
                "not_visible_or_not_supported": visual.get("not_visible_or_not_supported"),
            },
            "selection": asset.get("selection") or {},
        })
    return {
        "content_job_id": content_job_id,
        "format": request.format,
        "brief": request.brief,
        "brief_asset_intent": (intent.requested_asset_semantics if intent else []),
        "locked_project_asset_ids": request.selected_asset_ids or [],
        "candidate_assets": compact_assets,
        "policy": {
            "choose_only_candidate_assets": True,
            "locked_user_project_assets_win": bool(request.selected_asset_ids),
            "brief_asset_intent_can_override_post_type_default": True,
            "fallback_to_rank_1_below_confidence": 0.60,
        },
    }


def hard_filter_asset(
    asset: Dict[str, Any],
    request: CompileRequest,
    content_job_id: str,
    *,
    intent: Optional[CreativeIntent] = None,
    ignore_semantic: bool = False,
) -> Tuple[bool, Optional[str]]:
    if request.project_id and asset.get("project_id") and asset.get("project_id") != request.project_id:
        return False, "wrong_project"
    semantic = asset_semantic(asset)
    explicit_semantics = set(intent.requested_asset_semantics) if intent else set()
    if ignore_semantic or (semantic and semantic in explicit_semantics):
        return True, None
    allowed = CONTENT_JOB_ASSET_SEMANTICS.get(content_job_id, set())
    if allowed and semantic and semantic not in allowed:
        # Do not globally kill semantically unusual but user-requested launch routes.
        return False, "semantic_type_not_suitable_for_job"
    if content_job_id == "project_launch" and semantic in {"floor_plan", "unit_plan", "location_map"}:
        return False, "not_project_launch_hero"
    if content_job_id == "amenity_spotlight" and semantic in {"floor_plan", "unit_plan", "location_map"}:
        return False, "not_amenity_visual"
    return True, None


def score_asset(
    asset: Dict[str, Any],
    brief: str,
    content_job_id: str,
    request: Optional[CompileRequest] = None,
    locked: bool = False,
    intent: Optional[CreativeIntent] = None,
) -> Dict[str, Any]:
    scored = deepcopy(asset)
    text = asset_haystack(asset)
    brief_text = (brief or "").lower()
    semantic = asset_semantic(asset)
    score = 0.0
    reasons: List[str] = []
    penalties: List[str] = []
    requested_semantics = set(intent.requested_asset_semantics) if intent else set()
    if locked:
        score += 1000
        reasons.append("user-selected locked asset")
    if requested_semantics:
        if semantic in requested_semantics:
            boost = 160 if (intent and intent.asset_intent_strength == "hard") else 100
            score += boost
            reasons.append("brief explicitly requests %s visual route" % semantic)
        elif semantic:
            score -= 45
            penalties.append("brief asks for %s but asset is %s" % (", ".join(sorted(requested_semantics)), semantic))
    if "hero" in text:
        score += 50
        reasons.append("hero cue")
    if "truth_anchor" in text:
        score += 35
        reasons.append("truth anchor cue")
    if "project_exterior" in text:
        score += 30
        reasons.append("project exterior metadata")
    if "facade" in text or "façade" in text:
        score += 25
        reasons.append("facade cue")
    if "tower" in text:
        score += 20
        reasons.append("tower cue")
    if "amenity" in text:
        score += 15
        reasons.append("amenity cue")
    if semantic in CONTENT_JOB_ASSET_SEMANTICS.get(content_job_id, set()):
        score += 35
        reasons.append("semantic fits content job")
    if content_job_id == "site_visit" and semantic in {"entrance", "lobby"}:
        score += 95
        reasons.append("site visit prefers real arrival/lobby/site-presence assets")
    if content_job_id == "site_visit" and semantic == "building_exterior" and not requested_semantics:
        score -= 10
        penalties.append("facade/tower is secondary for site visit when arrival assets exist")
    if content_job_id == "construction_update" and semantic == "building_exterior" and intent and intent.construction_visual_mode == "visualized_progress_from_project_truth":
        score += 85
        reasons.append("exterior truth asset supports construction-stage visualization")
    if content_job_id == "location_advantage" and semantic == "location_map":
        score += 35
    if content_job_id == "location_advantage" and semantic == "aerial":
        score += 20
    if content_job_id == "pricing_ad" and semantic in {"floor_plan", "unit_plan"}:
        score += 15
    for token in ["pool", "clubhouse", "gym", "yoga", "kids", "basketball", "entrance", "lobby", "map", "aerial", "day", "night", "interior", "living room", "bedroom"]:
        if token in brief_text and token in text:
            score += 25
            reasons.append("brief matches %s" % token)
    visual = visual_analysis(asset)
    if visual.get("summary"):
        score += 8
        reasons.append("has visual analysis summary")
    if visual.get("prompt_adaptation_guidance"):
        score += 6
        reasons.append("has prompt adaptation guidance")
    score_delta, brief_reasons, brief_penalties = score_brief_visual_constraints(asset, brief)
    score += score_delta
    reasons.extend(brief_reasons)
    penalties.extend(brief_penalties)
    if content_job_id == "amenity_spotlight" and "amenity" not in text:
        score -= 20
        penalties.append("not an amenity asset")
    if content_job_id == "project_launch" and any(term in text for term in ["floor_plan", "floor plan", "document"]):
        score -= 50
        penalties.append("document or floor plan is weak for project launch")
    if content_job_id == "project_launch" and not requested_semantics:
        if semantic == "building_exterior":
            score += 80
            reasons.append("building exterior preferred for project launch")
        if any(term in text for term in ["model display", "scale model", "lobby", "interior", "sample flat"]):
            score -= 55
            penalties.append("interior/model display is weak for launch hero by default")
    scored["_score"] = round(score, 3)
    scored["selection"] = {
        "score": round(score, 3),
        "reasons": reasons,
        "penalties": penalties,
        "role_hint": role_hint_for_semantic(semantic),
        "semantic_type": semantic,
    }
    return scored


def assign_ranks(assets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    for index, asset in enumerate(assets, start=1):
        asset.setdefault("selection", {})["rank"] = index
    return assets


def score_brief_visual_constraints(asset: Dict[str, Any], brief: str) -> Tuple[float, List[str], List[str]]:
    text = asset_haystack(asset)
    brief_text = (brief or "").lower()
    reasons: List[str] = []
    penalties: List[str] = []
    score = 0.0
    wants_day = bool(re.search(r"\b(day|daylight|sunlit|bright|morning|afternoon)\b", brief_text))
    wants_dusk = bool(re.search(r"\b(night|evening|dusk|twilight|sunset|cinematic)\b", brief_text))
    has_day = bool(re.search(r"\b(day|daylight|sunlit|bright|morning|afternoon)\b", text))
    has_dusk = bool(re.search(r"\b(night|evening|dusk|twilight|sunset)\b", text))
    if wants_day and has_day:
        score += 10
        reasons.append("brief requests daylight and asset supports it")
    if wants_day and has_dusk and not has_day:
        score -= 8
        penalties.append("brief requests daylight but asset appears dusk/night")
    if wants_dusk and has_dusk:
        score += 10
        reasons.append("brief requests dusk/night mood and asset supports it")
    if wants_dusk and has_day and not has_dusk:
        score -= 4
        penalties.append("brief requests dusk/night but asset appears daylight")
    return score, reasons, penalties


def asset_use_plan_for_semantic(semantic: Optional[str], asset: Dict[str, Any], *, reference_role: str = "hero_truth_anchor", intent: Optional[CreativeIntent] = None) -> str:
    label = asset.get("label") or "selected reference"
    description = asset.get("description") or ""
    if reference_role == "context_grounding":
        plan = getattr(intent, "brief_intent_plan", None) if intent else None
        scene = getattr(plan, "scene_subject", "") or "the lifestyle scene requested in the brief"
        return (
            f"Use '{label}' only as project/context grounding for identity, visual credibility, architecture/township character, and factual constraints. "
            f"Do not recreate it as the main hero visual. The hero visual must be the requested generated lifestyle scene: {scene}. {description}"
        )
    if semantic == "interior":
        return f"Use '{label}' as an interior/lifestyle truth anchor. Preserve room layout, window geometry, furniture placement, material palette, and lighting direction. {description}"
    if semantic == "amenity":
        return f"Use '{label}' as amenity truth. Preserve the amenity geometry, spatial arrangement, materials, and visible equipment/furniture. {description}"
    if semantic == "building_exterior":
        return f"Use '{label}' as architectural truth. Preserve massing, facade rhythm, balcony/window pattern, tower count, height impression, material character, and perspective. {description}"
    if semantic in {"entrance", "lobby"}:
        return f"Use '{label}' as an arrival/lobby truth anchor. Preserve glass doors, frontage, lighting, entrance geometry, visible signage only if already present, material palette, and the actual arrival experience shown. Do not treat it as a tower facade or full building exterior. {description}"
    if semantic == "location_map":
        return f"Use '{label}' as a supporting location/proof visual. Do not invent exact roads, routes, distances, landmarks, or travel times beyond supplied facts. {description}"
    if semantic == "construction":
        return f"Use '{label}' as construction/progress truth. Preserve the visible progress state; do not convert it into a completed building unless explicitly labeled as visualization. {description}"
    if semantic in {"aerial", "masterplan", "site_plan"}:
        return f"Use '{label}' as scale/masterplan truth. Preserve visible geometry, open-space structure, block relationships, and orientation. {description}"
    return f"Use '{label}' as a truthful project reference and adapt the poster around what the image actually shows. {description}"


def truth_constraints_for_semantic(semantic: Optional[str], asset: Dict[str, Any], *, reference_role: str = "hero_truth_anchor") -> List[str]:
    common = ["Do not add facade signage or physical wordmarks unless already visible in the source asset."]
    if reference_role == "context_grounding":
        return common + [
            "Use the selected reference for grounding only; do not force a facade-only, tower-crop, or static asset recreation when the brief asks for a generated lifestyle scene.",
        ]
    if semantic == "interior":
        return common + ["Do not transform the interior into an exterior, lobby, or unrelated room."]
    if semantic == "amenity":
        return common + ["Do not add unsupported amenity equipment, people, or scenery."]
    if semantic == "building_exterior":
        return common + ["Do not change building structure, facade rhythm, tower count, balcony/window pattern, massing, or material character."]
    if semantic in {"entrance", "lobby"}:
        return common + ["Do not describe or transform the entrance/lobby asset as a tower hero, facade crop, aerial view, or full building exterior."]
    if semantic == "location_map":
        return common + ["Do not invent distances, road names, landmarks, routes, or exact map labels."]
    if semantic == "construction":
        return common + ["Do not show a completed state if the selected asset is under construction."]
    return common


def _reference_role_for_intent(intent: Optional[CreativeIntent], asset: Dict[str, Any]) -> str:
    plan = getattr(intent, "brief_intent_plan", None) if intent else None
    if plan and getattr(plan, "reference_role", "") == "context_grounding" and asset.get("asset_id"):
        return "context_grounding"
    return "hero_truth_anchor" if asset.get("asset_id") else "none"


def _dedupe(items: List[Any]) -> List[str]:
    seen = set()
    out = []
    for item in items:
        text = str(item or "").strip()
        key = text.lower()
        if text and key not in seen:
            out.append(text)
            seen.add(key)
    return out
