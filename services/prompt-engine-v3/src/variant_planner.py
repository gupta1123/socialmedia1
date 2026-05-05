from __future__ import annotations

from typing import Any, Dict, List

from .creative_levers import (
    VARIANT_LEVER_PROFILES,
    merge_variant_levers,
    sanitize_creative_direction,
)
from .schemas import CompileRequest


JOB_FALLBACK_DIRECTIONS: Dict[str, Dict[str, Any]] = {
    "construction_update": {
        "style_family": "editorial_catalog",
        "hero_presentation": "subtle_architecture_presence",
        "layout_geometry": "swiss_grid",
        "graphic_layer": ["thin_frame", "divider_lines", "caption_rule"],
        "type_voice": "builder_readable",
        "text_architecture": "proof_second",
        "mood_mode": "crisp_daylight",
        "density": "medium",
        "brand_visibility": "elegant_signature",
        "visual_mode": "asset_faithful",
    },
    "educational_buyer_guide": {
        "style_family": "swiss_grid_premium",
        "hero_presentation": "proposition_box",
        "layout_geometry": "layered_cards",
        "graphic_layer": ["divider_lines", "caption_grid", "micro_badges"],
        "type_voice": "builder_readable",
        "text_architecture": "proof_second",
        "mood_mode": "ivory_studio_neutral",
        "density": "information_rich",
        "brand_visibility": "elegant_signature",
        "visual_mode": "graphic_led",
    },
    "testimonial_story": {
        "style_family": "editorial_catalog",
        "hero_presentation": "subtle_architecture_presence",
        "layout_geometry": "magazine_spread",
        "graphic_layer": ["thin_frame", "caption_strip", "paper_depth"],
        "type_voice": "quiet_premium",
        "text_architecture": "one_statement",
        "mood_mode": "ivory_studio_neutral",
        "density": "lean",
        "brand_visibility": "whisper",
        "visual_mode": "editorialized_truth",
    },
}


def coerce_variant_plan(
    plan: Dict[str, Any],
    request: CompileRequest,
    content_job_id: str,
    templates: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    count = max(1, min(3, int(request.variant_count or 1)))
    raw = plan.get("variants") if isinstance(plan, dict) else None
    planned = raw if isinstance(raw, list) else []
    out: List[Dict[str, Any]] = []
    eligible_template_ids = {template.get("template_id") for template in templates if template.get("template_id")}
    locked_templates = [tid for tid in [request.visual_template_id, *request.visual_template_ids] if tid]
    run_offset = generation_run_offset(request)

    for index, item in enumerate(planned[:count]):
        if not isinstance(item, dict):
            continue
        out.append(_normalize_spec(index, item, request, content_job_id, templates, eligible_template_ids, locked_templates, run_offset))

    while len(out) < count:
        index = len(out)
        out.append(_fallback_spec(index, request, content_job_id, templates, locked_templates, run_offset))

    return out[:count]


def registry_variant_plan(request: CompileRequest, content_job_id: str, templates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return coerce_variant_plan({}, request, content_job_id, templates)


def _normalize_spec(
    index: int,
    item: Dict[str, Any],
    request: CompileRequest,
    content_job_id: str,
    templates: List[Dict[str, Any]],
    eligible_template_ids: set,
    locked_templates: List[str],
    run_offset: int,
) -> Dict[str, Any]:
    requested_template_id = item.get("selected_template_id")
    if locked_templates:
        selected_template_id = locked_templates[index % len(locked_templates)]
    elif requested_template_id in eligible_template_ids:
        selected_template_id = requested_template_id
    elif templates:
        selected_template_id = templates[(index + run_offset) % len(templates)].get("template_id")
    else:
        selected_template_id = None
    template = _template_by_id(templates, selected_template_id)
    base_direction = template.get("lever_signature") if isinstance(template.get("lever_signature"), dict) else JOB_FALLBACK_DIRECTIONS.get(content_job_id, {})
    profile = VARIANT_LEVER_PROFILES[(index + run_offset) % len(VARIANT_LEVER_PROFILES)]
    if locked_templates:
        creative_direction = sanitize_creative_direction(base_direction, base_direction)
    else:
        item_direction = item.get("creative_direction") if isinstance(item.get("creative_direction"), dict) else {}
        creative_direction = sanitize_creative_direction({**merge_variant_levers(base_direction, profile), **item_direction}, base_direction)
    return {
        "variant_id": _variant_id(item.get("variant_id"), index),
        "label": str(item.get("label") or item.get("variation_label") or profile.get("label") or "Creative Option %d" % (index + 1)),
        "variation_axis": str(item.get("variation_axis") or profile.get("variation_axis") or request.variation_strategy or "auto"),
        "selected_template_id": selected_template_id,
        "creative_direction": creative_direction,
        "copy_angle": item.get("copy_angle") or profile.get("copy_angle"),
        "preferred_asset_id": item.get("preferred_asset_id"),
        "allow_template_lever_variation": not bool(locked_templates),
        "why_distinct": item.get("why_distinct") or "Distinct creative lever mix from the notebook registry and this generation run.",
        "creative_big_idea": item.get("creative_big_idea"),
        "visual_metaphor": item.get("visual_metaphor"),
        "asset_treatment": item.get("asset_treatment"),
        "layout_plan": item.get("layout_plan"),
        "graphic_devices": item.get("graphic_devices") if isinstance(item.get("graphic_devices"), list) else None,
        "copy_strategy": item.get("copy_strategy"),
        "content_job_id": content_job_id,
        "generation_run_offset": run_offset,
    }


def _fallback_spec(
    index: int,
    request: CompileRequest,
    content_job_id: str,
    templates: List[Dict[str, Any]],
    locked_templates: List[str],
    run_offset: int,
) -> Dict[str, Any]:
    profile = VARIANT_LEVER_PROFILES[(index + run_offset) % len(VARIANT_LEVER_PROFILES)]
    selected_template_id = None
    if locked_templates:
        selected_template_id = locked_templates[index % len(locked_templates)]
    elif templates:
        selected_template_id = templates[(index + run_offset) % len(templates)].get("template_id")
    template = _template_by_id(templates, selected_template_id)
    base_direction = template.get("lever_signature") if isinstance(template.get("lever_signature"), dict) else JOB_FALLBACK_DIRECTIONS.get(content_job_id, {})
    if locked_templates:
        creative_direction = sanitize_creative_direction(base_direction, base_direction)
    else:
        creative_direction = merge_variant_levers(base_direction, profile)
    return {
        "variant_id": "variant_%d" % (index + 1),
        "label": str(template.get("name") or profile.get("label") or "Creative Option %d" % (index + 1)),
        "variation_axis": str(profile.get("variation_axis") or request.variation_strategy or "mood"),
        "selected_template_id": selected_template_id,
        "creative_direction": creative_direction,
        "copy_angle": profile.get("copy_angle"),
        "preferred_asset_id": None,
        "allow_template_lever_variation": not bool(locked_templates),
        "why_distinct": "Registry-planned notebook-style variant for this generation run.",
        "creative_big_idea": None,
        "visual_metaphor": None,
        "asset_treatment": None,
        "layout_plan": None,
        "graphic_devices": None,
        "copy_strategy": None,
        "content_job_id": content_job_id,
        "generation_run_offset": run_offset,
    }


def _template_by_id(templates: List[Dict[str, Any]], template_id: Any) -> Dict[str, Any]:
    for template in templates:
        if template.get("template_id") == template_id:
            return template
    return {}


def _variant_id(value: Any, index: int) -> str:
    text = str(value or "").strip()
    return text if text.startswith("variant_") else "variant_%d" % (index + 1)


def generation_run_offset(request: CompileRequest) -> int:
    options = request.options if isinstance(request.options, dict) else {}
    seed = str(options.get("generation_run_id") or options.get("generationRunId") or options.get("run_seed") or "").strip()
    if not seed:
        return 0
    return sum((index + 1) * ord(char) for index, char in enumerate(seed)) % 997
