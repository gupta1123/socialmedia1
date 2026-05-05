from __future__ import annotations

from typing import Optional

from .planning_schemas import AssetDecision, CreativeIntent, CreativeStrategy, ProductionPlan, TemplateConstraint


def plan_creative_strategy(
    *,
    intent: CreativeIntent,
    production: ProductionPlan,
    asset_decision: AssetDecision,
    template: Optional[TemplateConstraint] = None,
) -> CreativeStrategy:
    mode = production.creative_mode if production.creative_mode != "auto" else intent.creative_mode
    if mode == "auto":
        mode = _infer_mode(intent, asset_decision)
    semantic = (asset_decision.semantic_type or "visual asset").replace("_", " ")
    primary = intent.creative_goal or f"Create a grounded {intent.content_job_id.replace('_', ' ')} post."
    if intent.content_job_id == "festive_greeting" and intent.festival_visual_scope == "brand_only":
        primary = "Create a brand/occasion-led festive greeting poster without project building imagery unless explicitly requested."
    if intent.content_job_id == "construction_update" and intent.construction_visual_mode == "visualized_progress_from_project_truth":
        primary = f"Create a construction-stage visualization from the approved project architecture at approximately {intent.construction_progress_percent}% progress, without implying verified current site progress."
    if mode == "copy_led":
        hierarchy = ["headline", "supporting proof", "asset as credibility", "CTA"]
    elif mode == "image_led":
        hierarchy = ["hero image", "short headline", "minimal CTA"]
    elif mode == "offer_led":
        hierarchy = ["offer/proposition", "project proof", "CTA", "contact"]
    elif mode == "proof_led":
        hierarchy = ["verified fact", "visual proof", "short explanation", "CTA"]
    else:
        hierarchy = ["visual idea", "headline", "support copy", "CTA"]
    asset_strategy = asset_decision.asset_use_plan or f"Use the selected {semantic} as the truthful visual anchor and adapt the design around what it actually contains."
    template_strategy = template.adaptation_rule if template else "No fixed template is required; choose a strong composed poster layout."
    copy_strategy = _copy_strategy(mode, intent)
    novelty = _novelty_requirement(intent, semantic)
    risk_notes = list(asset_decision.truth_constraints)
    return CreativeStrategy(
        creative_mode=mode,  # type: ignore[arg-type]
        primary_goal=primary,
        message_hierarchy=hierarchy,
        asset_strategy=asset_strategy,
        template_strategy=template_strategy,
        copy_strategy=copy_strategy,
        novelty_requirement=novelty,
        visual_risk_notes=risk_notes,
    )


def _infer_mode(intent: CreativeIntent, asset_decision: AssetDecision) -> str:
    if intent.requested_asset_semantics and asset_decision.semantic_type in {"interior", "amenity", "lobby", "entrance"}:
        return "lifestyle_led"
    if intent.content_job_id in {"pricing_ad"}:
        return "offer_led"
    if intent.content_job_id == "festive_greeting" and intent.festival_visual_scope == "brand_only":
        return "brand_led"
    if intent.content_job_id == "construction_update":
        return "image_led"
    if intent.content_job_id in {"location_advantage", "educational_buyer_guide"}:
        return "proof_led"
    if asset_decision.semantic_type in {"entrance", "lobby"}:
        return "image_led"
    if asset_decision.semantic_type in {"building_exterior", "aerial"}:
        return "image_led"
    return "brand_led"


def _copy_strategy(mode: str, intent: CreativeIntent) -> str:
    tone = intent.copy_intent.tone or "premium and clear"
    if mode == "copy_led":
        return f"Make copy the visual hook with a strong, ownable headline in a {tone} tone."
    if mode == "image_led":
        return f"Keep copy minimal so the image carries the post; use a {tone} tone."
    if mode == "proof_led":
        return f"Use concise, verified proof-style copy in a {tone} tone; do not invent facts."
    if mode == "offer_led":
        return f"Use offer/proposition-led copy only with grounded values; keep it premium, not discount-like."
    return f"Use audience-aware copy in a {tone} tone."


def _novelty_requirement(intent: CreativeIntent, semantic: str) -> str:
    if intent.requested_visual_style:
        return f"Make this route visibly specific to {', '.join(intent.requested_visual_style).replace('_', ' ')} rather than a generic real-estate layout."
    return f"Avoid repetitive default real-estate layouts; create a distinct treatment around the {semantic} asset with a unique crop, layout device, typography rhythm, and mood."
