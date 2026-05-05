from __future__ import annotations

import re
from typing import Any, Dict, Iterable, Optional

from .contact_resolver import resolve_contact_plan
from .grounding import wants_rera_qr
from .planning_schemas import CreativeIntent, GroundedFactStore, ProductionPlan, ResolvedLocationPlan, SecondaryLogoPlan
from .presets import (
    preset_contact_items,
    preset_contact_position,
    preset_location_rules,
    preset_logo_position,
    preset_logo_rules,
    preset_rera_position,
    preset_rera_trigger_fact_types,
    preset_requires_logo,
    preset_requires_rera_qr,
    preset_requires_secondary_logo,
    preset_secondary_logo_position,
    preset_secondary_logo_rules,
    selected_preset,
)
from .schemas import CompileRequest


def resolve_production_plan(
    *,
    request: CompileRequest,
    context: Dict[str, Any],
    intent: CreativeIntent,
    fact_store: GroundedFactStore,
) -> ProductionPlan:
    preset = selected_preset(context, request.brand_preset_id)
    # A user-provided logo is an explicit flat brand mark asset, not a project truth anchor.
    # Honor it even for brand-only/festival flows; if no explicit logo is provided, fall back
    # to the best logo available in the current context.
    logo_asset_id = request.logo_asset_id or _find_asset_id(context, "logo", preferred_project_id=request.project_id)
    rera_qr_asset_id = request.rera_qr_asset_id or _find_asset_id(context, "rera_qr", preferred_project_id=request.project_id)
    secondary_logo_rules = preset_secondary_logo_rules(preset)
    secondary_logo_required = preset_requires_secondary_logo(preset)
    secondary_logo_asset_id = (
        _find_asset_id(
            context,
            "logo",
            rules=secondary_logo_rules,
            exclude_asset_ids={logo_asset_id} if logo_asset_id else set(),
        )
        if secondary_logo_required
        else None
    )
    rera_triggered_by_preset = _preset_triggers_rera_qr(preset, request, intent, fact_store)
    include_logo = bool(request.include_logo or request.logo_asset_id or preset_requires_logo(preset)) and "logo" not in intent.negative_requests
    include_rera = bool(request.include_rera_qr or wants_rera_qr(request) or preset_requires_rera_qr(preset) or rera_triggered_by_preset) and "qr" not in intent.negative_requests and "rera" not in intent.negative_requests
    contact_plan = resolve_contact_plan(
        intent=intent,
        fact_store=fact_store,
        explicit_items=request.contact_items,
        preset_items=preset_contact_items(preset),
        position=preset_contact_position(preset),
    )
    location_plan = _resolve_location_plan(preset, fact_store, has_contact=bool(contact_plan.values))
    text_strategy = intent.text_strategy if intent.text_strategy != "auto" else "render_exact_text"
    text_treatment = "reserve_space" if text_strategy in {"reserve_editable_space", "no_text_visual_only"} else "render_text"
    missing = []
    if include_logo and not logo_asset_id:
        missing.append("logo_asset_id")
    if secondary_logo_required and not secondary_logo_asset_id:
        missing.append("secondary_logo_asset_id")
    if include_rera and not rera_qr_asset_id:
        missing.append("rera_qr_asset_id")
    if location_plan.required and not location_plan.value:
        missing.append("location_value")
    return ProductionPlan(
        include_logo=include_logo,
        logo_asset_id=logo_asset_id if include_logo else None,
        logo_position=preset_logo_position(preset),
        logo_rules_extra=preset_logo_rules(preset),
        secondary_logo=SecondaryLogoPlan(
            required=secondary_logo_required,
            asset_id=secondary_logo_asset_id,
            position=preset_secondary_logo_position(preset),
            rules_extra=secondary_logo_rules,
            missing=secondary_logo_required and not bool(secondary_logo_asset_id),
        ),
        include_rera_qr=include_rera,
        rera_qr_asset_id=rera_qr_asset_id if include_rera else None,
        rera_position=preset_rera_position(preset),
        rera_triggered_by_preset=rera_triggered_by_preset,
        contact_plan=contact_plan,
        location_plan=location_plan,
        text_strategy=text_strategy,  # type: ignore[arg-type]
        text_treatment=text_treatment,  # type: ignore[arg-type]
        creative_mode=intent.creative_mode,
        missing_requirements=missing,
        preset_id=preset.get("preset_id") if isinstance(preset, dict) else None,
        preset_name=preset.get("name") if isinstance(preset, dict) else None,
    )


def _find_asset_id(
    context: Dict[str, Any],
    role: str,
    preferred_project_id: Optional[str] = None,
    rules: Optional[Dict[str, Any]] = None,
    exclude_asset_ids: Optional[set[str]] = None,
) -> Optional[str]:
    assets = context.get("assets") if isinstance(context.get("assets"), list) else []
    wanted = role.lower()
    matches = []
    excluded = exclude_asset_ids or set()
    for asset in assets:
        if not isinstance(asset, dict):
            continue
        asset_id = str(asset.get("asset_id") or "")
        if asset_id and asset_id in excluded:
            continue
        asset_role = str(asset.get("role") or "").lower()
        metadata = asset.get("metadata") if isinstance(asset.get("metadata"), dict) else {}
        asset_class = str(metadata.get("assetClass") or "").lower()
        if wanted == "logo" and (asset_role == "logo" or asset_class in {"brand_logo", "project_logo"}):
            matches.append(asset)
        if wanted == "rera_qr" and (asset_role == "rera_qr" or asset_class == "rera_qr"):
            matches.append(asset)
    if rules:
        matched_by_rules = [asset for asset in matches if _asset_matches_logo_rules(asset, rules)]
        if matched_by_rules:
            matches = matched_by_rules
    if preferred_project_id:
        for asset in matches:
            if asset.get("project_id") == preferred_project_id:
                return asset.get("asset_id")
    for asset in matches:
        if not asset.get("project_id"):
            return asset.get("asset_id")
    return matches[0].get("asset_id") if matches else None


def _asset_matches_logo_rules(asset: Dict[str, Any], rules: Dict[str, Any]) -> bool:
    brand_mark = str(rules.get("brand_mark") or rules.get("brandMark") or "").strip().lower()
    if not brand_mark:
        return True
    metadata = asset.get("metadata") if isinstance(asset.get("metadata"), dict) else {}
    haystack = " ".join(
        str(value or "")
        for value in [
            asset.get("label"),
            asset.get("description"),
            metadata.get("brandMark"),
            metadata.get("brand_mark"),
            metadata.get("logoMark"),
            metadata.get("logo_mark"),
            metadata.get("assetClass"),
        ]
    ).lower()
    tokens = {brand_mark, brand_mark.replace("_", " "), brand_mark.replace("_logo", "").replace("_", " ")}
    return any(token and token in haystack for token in tokens)


def _resolve_location_plan(preset: Dict[str, Any], fact_store: GroundedFactStore, *, has_contact: bool) -> ResolvedLocationPlan:
    rules = preset_location_rules(preset)
    required = bool(rules.get("required"))
    if not rules and not required:
        return ResolvedLocationPlan()
    facts = fact_store.values_for("micro_location") or fact_store.values_for("city")
    fact = facts[0] if facts else None
    position = str(rules.get("position") or "bottom_left")
    fallback = str(rules.get("fallback_position_without_contact") or "bottom_center")
    if not has_contact and fallback:
        position = fallback
    return ResolvedLocationPlan(
        required=required,
        value=fact.value if fact else None,
        source=fact.source if fact else None,
        position=position,
        fallback_position_without_contact=fallback,
        include_pin_icon=bool(rules.get("include_pin_icon")),
        missing=required and fact is None,
        rules_extra=rules,
    )


def _preset_triggers_rera_qr(
    preset: Dict[str, Any],
    request: CompileRequest,
    intent: CreativeIntent,
    fact_store: GroundedFactStore,
) -> bool:
    triggers = set(preset_rera_trigger_fact_types(preset))
    if not triggers:
        return False
    if "project" in triggers and _mentions_project(request, intent, fact_store):
        return True
    if "typology" in triggers and _mentions_typology(request, fact_store):
        return True
    if "pricing" in triggers and _mentions_pricing(request, intent, fact_store):
        return True
    return False


def _mentions_project(request: CompileRequest, intent: CreativeIntent, fact_store: GroundedFactStore) -> bool:
    if request.project_id and not (intent.content_job_id == "festive_greeting" and intent.festival_visual_scope == "brand_only"):
        return True
    project_name = fact_store.first_value("project_name")
    return bool(project_name and project_name.lower() in (request.brief or "").lower())


def _mentions_typology(request: CompileRequest, fact_store: GroundedFactStore) -> bool:
    if fact_store.values_for("configuration"):
        return True
    return bool(re.search(r"\b(?:[1-9]\s*(?:bhk|bed)|typology|configuration|apartment|flat|residence|villa)\b", request.brief or "", flags=re.I))


def _mentions_pricing(request: CompileRequest, intent: CreativeIntent, fact_store: GroundedFactStore) -> bool:
    if intent.content_job_id == "pricing_ad":
        return True
    if fact_store.values_for("price") or fact_store.values_for("emi"):
        return True
    return bool(re.search(r"(?:₹|rs\.?|inr|price|pricing|emi|offer|starting at|starting from|lakh|lac|crore|cr\b)", request.brief or "", flags=re.I))
