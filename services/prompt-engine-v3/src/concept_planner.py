from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, List, Optional

from .creative_levers import VARIANT_LEVER_PROFILES, merge_variant_levers, sanitize_creative_direction
from .planning_schemas import AssetDecision, CreativeIntent, CreativeStrategy, TemplateConstraint, VariantConcept
from .schemas import CompileRequest

FESTIVE_CONCEPT_BANK = [
    {
        "label": "Elegant Festival Symbol",
        "metaphor": "the festival greeting as a refined cultural symbol poster",
        "devices": ["festive centerpiece", "kolam-inspired linework", "warm gold accent", "wide negative space"],
        "layout": "centered symbolic festive art with clean greeting typography and small brand signature",
    },
    {
        "label": "Quiet Brand Greeting",
        "metaphor": "a premium brand greeting card built around restraint and occasion warmth",
        "devices": ["soft gradient", "thin frame", "minimal motif", "bottom signature"],
        "layout": "minimal greeting-card composition with large calm field and elegant type hierarchy",
    },
]

CONSTRUCTION_CONCEPT_BANK = [
    {
        "label": "Architecture In Formation",
        "metaphor": "the approved architecture taking shape through a clean mid-construction visualization",
        "devices": ["scaffold bands", "safety netting", "partial facade", "controlled site foreground"],
        "layout": "project architecture remains hero while construction-state cues frame the visual honestly",
    },
    {
        "label": "Progress Plate",
        "metaphor": "a premium progress plate showing the future building in formation",
        "devices": ["construction grid", "partial facade reveal", "thin progress marker", "editorial frame"],
        "layout": "architectural visualization with reserved update copy zones and careful truth notes",
    },
]

CONCEPT_BANK = [
    {
        "label": "Gallery Plate",
        "metaphor": "architecture or space as a curated gallery exhibit",
        "devices": ["wide margins", "fine rule", "museum label", "paper depth"],
        "layout": "large curated image plate with quiet surrounding typography zones",
    },
    {
        "label": "Campaign Seal",
        "metaphor": "a premium launch announcement anchored by one restrained campaign device",
        "devices": ["single seal", "thin frame", "caption strip", "negative space"],
        "layout": "hero visual balanced by one decisive headline and compact footer",
    },
    {
        "label": "Architectural Index",
        "metaphor": "a precise design index of the project, like a premium architecture catalogue",
        "devices": ["grid modules", "micro captions", "divider lines", "small proof blocks"],
        "layout": "structured grid with the asset as proof and copy as editorial labels",
    },
    {
        "label": "Quiet Monolith",
        "metaphor": "the project as a calm premium object with strong silence around it",
        "devices": ["centered object", "soft shadow", "ivory field", "minimal headline"],
        "layout": "center-weighted visual with very sparse supporting text",
    },
    {
        "label": "Lifestyle Window",
        "metaphor": "a warm glimpse into the lived experience of the project",
        "devices": ["image window", "soft gradient", "warm caption", "small CTA"],
        "layout": "image-led lifestyle composition with minimal premium copy",
    },
    {
        "label": "Proof Orbit",
        "metaphor": "verified advantages orbit around a calm central visual",
        "devices": ["orbit lines", "micro badges", "map-like marks", "thin frame"],
        "layout": "graphic proof-led composition with verified text zones",
    },
]


def plan_variant_concepts(
    *,
    request: CompileRequest,
    intent: CreativeIntent,
    strategy: CreativeStrategy,
    asset_decision: AssetDecision,
    template_constraint: Optional[TemplateConstraint],
    variant_specs: List[Dict[str, Any]],
) -> List[VariantConcept]:
    out: List[VariantConcept] = []
    count = max(1, min(request.variant_count, len(variant_specs) or request.variant_count))
    offset = _run_offset(request)
    for index in range(count):
        spec = variant_specs[index] if index < len(variant_specs) else {}
        if intent.content_job_id == "festive_greeting" and intent.festival_visual_scope == "brand_only":
            bank = FESTIVE_CONCEPT_BANK[(index + offset) % len(FESTIVE_CONCEPT_BANK)]
        elif intent.content_job_id == "construction_update" and intent.construction_visual_mode == "visualized_progress_from_project_truth":
            bank = CONSTRUCTION_CONCEPT_BANK[(index + offset) % len(CONSTRUCTION_CONCEPT_BANK)]
        else:
            bank = CONCEPT_BANK[(index + offset) % len(CONCEPT_BANK)]
        if asset_decision.semantic_type in {"interior", "lobby", "entrance"} and index == 0:
            bank = next(item for item in CONCEPT_BANK if item["label"] == "Lifestyle Window")
        if strategy.creative_mode == "proof_led" and intent.content_job_id != "construction_update":
            bank = next(item for item in CONCEPT_BANK if item["label"] in {"Proof Orbit", "Architectural Index"})
        if strategy.creative_mode == "copy_led":
            bank = next(item for item in CONCEPT_BANK if item["label"] == "Campaign Seal")
        direction = spec.get("creative_direction") if isinstance(spec.get("creative_direction"), dict) else {}
        if not direction and template_constraint:
            direction = deepcopy(template_constraint.lever_signature)
        profile = VARIANT_LEVER_PROFILES[(index + offset) % len(VARIANT_LEVER_PROFILES)]
        structured = sanitize_creative_direction({**merge_variant_levers(direction, profile), **direction}, direction)
        semantic = (asset_decision.semantic_type or "visual asset").replace("_", " ")
        label = str(spec.get("label") or f"{bank['label']} {index + 1}")
        big_idea = _safe_spec_text(spec.get("creative_big_idea"), asset_decision.semantic_type) or _big_idea(bank, semantic, intent, strategy)
        asset_treatment = _safe_spec_text(spec.get("asset_treatment"), asset_decision.semantic_type) or _asset_treatment(asset_decision, bank)
        visual_metaphor = _safe_spec_text(spec.get("visual_metaphor"), asset_decision.semantic_type) or bank["metaphor"]
        graphic_devices = spec.get("graphic_devices") if isinstance(spec.get("graphic_devices"), list) and spec.get("graphic_devices") else list(bank["devices"])
        graphic_devices = _filter_devices_for_job(graphic_devices, intent, asset_decision.semantic_type)
        out.append(
            VariantConcept(
                variant_id=str(spec.get("variant_id") or f"variant_{index + 1}"),
                label=label,
                variation_axis=str(spec.get("variation_axis") or request.variation_strategy or "concept"),
                selected_template_id=spec.get("selected_template_id") or (template_constraint.template_id if template_constraint else None),
                creative_big_idea=big_idea,
                why_distinct=str(spec.get("why_distinct") or f"This concept uses a {bank['metaphor']} route with distinct crop, hierarchy, and graphic devices."),
                visual_metaphor=visual_metaphor,
                asset_treatment=asset_treatment,
                layout_plan=str(_safe_spec_text(spec.get("layout_plan"), asset_decision.semantic_type) or bank["layout"]),
                graphic_devices=list(graphic_devices),
                copy_strategy=str(spec.get("copy_strategy") or strategy.copy_strategy),
                structured_levers=structured,
                preferred_asset_id=spec.get("preferred_asset_id") or asset_decision.selected_asset_id,
            )
        )
    return out



def _filter_devices_for_job(devices: List[Any], intent: CreativeIntent, semantic: Optional[str]) -> List[str]:
    cleaned = [str(item).strip() for item in devices if str(item).strip()]
    if intent.content_job_id == "festive_greeting" and intent.festival_visual_scope == "brand_only":
        banned = {"micro badges", "proof blocks", "map-like marks", "orbit lines", "facade crop", "tower cutout", "grid modules"}
        fallback = ["festive centerpiece", "kolam-inspired linework", "warm gold accent", "wide negative space"]
        out = [item for item in cleaned if item.lower() not in banned]
        return out or fallback
    if intent.content_job_id == "site_visit":
        banned = {"museum label", "map-like marks", "orbit lines"}
        out = [item for item in cleaned if item.lower() not in banned]
        return out + ["appointment cue"] if "appointment cue" not in [x.lower() for x in out] else out
    if intent.content_job_id == "construction_update":
        banned = {"museum label", "map-like marks", "micro badges"}
        out = [item for item in cleaned if item.lower() not in banned]
        return out or ["scaffold bands", "partial facade", "editorial progress frame"]
    return cleaned


def concept_to_spec(concept: VariantConcept) -> Dict[str, Any]:
    return {
        "variant_id": concept.variant_id,
        "label": concept.label,
        "variation_axis": concept.variation_axis,
        "selected_template_id": concept.selected_template_id,
        "creative_direction": concept.structured_levers,
        "copy_angle": concept.copy_strategy,
        "preferred_asset_id": concept.preferred_asset_id,
        "why_distinct": concept.why_distinct,
        "creative_big_idea": concept.creative_big_idea,
        "visual_metaphor": concept.visual_metaphor,
        "asset_treatment": concept.asset_treatment,
        "layout_plan": concept.layout_plan,
        "graphic_devices": concept.graphic_devices,
        "copy_strategy": concept.copy_strategy,
    }


def _big_idea(bank: Dict[str, Any], semantic: str, intent: CreativeIntent, strategy: CreativeStrategy) -> str:
    audience = f" for {intent.audience}" if intent.audience else ""
    if intent.content_job_id == "festive_greeting" and intent.festival_visual_scope == "brand_only":
        return f"Create an occasion-led festive greeting{audience}: treat the poster as {bank['metaphor']} with no project building unless explicitly requested."
    if intent.content_job_id == "construction_update" and intent.construction_visual_mode == "visualized_progress_from_project_truth":
        return f"Create a construction-stage visualization{audience}: treat the approved project architecture as {bank['metaphor']} at approximately {intent.construction_progress_percent}% progress, without claiming verified current progress."
    route = semantic
    if semantic in {"entrance", "lobby"}:
        route = "arrival/lobby moment"
    elif semantic == "building exterior":
        route = "architecture"
    return f"Create a {strategy.creative_mode.replace('_', '-')} {intent.content_job_id.replace('_', ' ')}{audience}: treat the supplied {route} as {bank['metaphor']}, not as a generic real-estate flyer."


def _asset_treatment(asset_decision: AssetDecision, bank: Dict[str, Any]) -> str:
    semantic = (asset_decision.semantic_type or "visual asset").replace("_", " ")
    if not asset_decision.selected_asset_id:
        return f"Use symbolic visual elements only; compose the poster with {', '.join(bank['devices'][:3])}. Do not introduce a building, facade, tower, project render, or real-estate claim unless explicitly requested."
    if asset_decision.semantic_type in {"entrance", "lobby"}:
        return f"Use the supplied arrival/lobby visual as the truthful anchor; preserve glass doors, frontage, lighting, entry geometry, and material palette while composing it with {', '.join(bank['devices'][:3])}."
    if asset_decision.semantic_type == "interior":
        return f"Use the supplied interior as the truthful lifestyle anchor; preserve room layout, furniture placement, window geometry, materials, and lighting while composing it with {', '.join(bank['devices'][:3])}."
    return f"Use the supplied {semantic} as the truthful visual anchor; preserve its real visual content while composing it with {', '.join(bank['devices'][:3])}."


def _run_offset(request: CompileRequest) -> int:
    options = request.options if isinstance(request.options, dict) else {}
    seed = str(options.get("generation_run_id") or options.get("generationRunId") or options.get("run_seed") or "").strip()
    if not seed:
        return 0
    return sum((index + 1) * ord(char) for index, char in enumerate(seed)) % len(CONCEPT_BANK)


def _safe_spec_text(value: Any, semantic: Optional[str]) -> Optional[str]:
    text = str(value or "").strip()
    if not text:
        return None
    lower = text.lower()
    if semantic in {"entrance", "lobby"} and any(term in lower for term in ["tower cutout", "facade crop", "full building exterior", "tower hero"]):
        return None
    if semantic == "interior" and any(term in lower for term in ["tower cutout", "facade crop", "building exterior", "tower hero"]):
        return None
    if semantic == "amenity" and any(term in lower for term in ["tower cutout", "facade crop", "building exterior"]):
        return None
    return text
