from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from .contact_resolver import resolve_contact_plan
from .grounding import wants_rera_qr
from .planning_schemas import CreativeIntent, GroundedFactStore, LogoLayerPlan, ProductionPlan, ResolvedLocationPlan, SecondaryLogoPlan
from .presets import (
    preset_additional_logo_rules,
    preset_contact_items,
    preset_contact_position,
    preset_location_rules,
    preset_logo_position,
    preset_logo_rules,
    preset_rera_position,
    preset_rera_trigger_fact_types,
    preset_requires_logo,
    preset_requires_rera_qr,
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
    include_logo = bool(request.include_logo or request.logo_asset_id or preset_requires_logo(preset)) and "logo" not in intent.negative_requests
    logo_asset_id = (request.logo_asset_id or _find_asset_id(context, "logo", preferred_project_id=request.project_id)) if include_logo else None
    rera_qr_asset_id = request.rera_qr_asset_id or _find_asset_id(context, "rera_qr", preferred_project_id=request.project_id)
    logo_position = preset_logo_position(preset)
    additional_logos = _resolve_additional_logo_layers(
        context,
        _dedupe_logo_rules([
            *preset_additional_logo_rules(preset),
            *_manual_additional_logo_rules(request.additional_logo_asset_ids, logo_position=logo_position),
        ]),
        used_asset_ids={logo_asset_id} if include_logo and logo_asset_id else set(),
    )
    secondary_logo_plan = _secondary_logo_from_additional(additional_logos)
    rera_triggered_by_preset = _preset_triggers_rera_qr(preset, request, intent, fact_store)
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
    for index, logo_layer in enumerate(additional_logos):
        if logo_layer.required and not logo_layer.asset_id:
            missing.append("secondary_logo_asset_id" if index == 0 else "additional_logo_asset_id_%s" % (index + 1))
    if include_rera and not rera_qr_asset_id:
        missing.append("rera_qr_asset_id")
    if location_plan.required and not location_plan.value:
        missing.append("location_value")
    return ProductionPlan(
        include_logo=include_logo,
        logo_asset_id=logo_asset_id if include_logo else None,
        logo_position=logo_position,
        logo_rules_extra=preset_logo_rules(preset),
        secondary_logo=secondary_logo_plan,
        additional_logos=additional_logos,
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


def _resolve_additional_logo_layers(
    context: Dict[str, Any],
    rules_list: List[Dict[str, Any]],
    *,
    used_asset_ids: set[str],
) -> List[LogoLayerPlan]:
    layers: List[LogoLayerPlan] = []
    used = {asset_id for asset_id in used_asset_ids if asset_id}
    for index, rules in enumerate(rules_list):
        required = bool(rules.get("required"))
        include_if_available = bool(rules.get("include_if_available") or rules.get("optional"))
        explicit_asset_id = str(rules.get("asset_id") or "").strip() or None
        if explicit_asset_id and explicit_asset_id in used:
            continue
        asset_id = explicit_asset_id if explicit_asset_id and explicit_asset_id not in used else None
        if not asset_id and (required or include_if_available):
            asset_id = _find_asset_id(context, "logo", rules=rules, exclude_asset_ids=used)
        if asset_id:
            used.add(asset_id)
        if not (required or include_if_available or asset_id):
            continue
        layers.append(
            LogoLayerPlan(
                required=required,
                asset_id=asset_id,
                position=str(rules.get("position") or "top_left"),
                rules_extra=rules,
                missing=required and not bool(asset_id),
                role=str(rules.get("role") or ("secondary_logo" if index == 0 else "additional_logo_%s" % (index + 1))),
                label=str(rules.get("label") or rules.get("name") or "") or None,
            )
        )
    return layers


def _manual_additional_logo_rules(asset_ids: List[str], *, logo_position: str) -> List[Dict[str, Any]]:
    positions = _manual_additional_logo_positions(logo_position)
    rules: List[Dict[str, Any]] = []
    seen = set()
    for index, asset_id in enumerate(asset_ids):
        clean_asset_id = str(asset_id or "").strip()
        if not clean_asset_id or clean_asset_id in seen:
            continue
        rules.append(
            {
                "required": True,
                "asset_id": clean_asset_id,
                "position": positions[min(index, len(positions) - 1)],
                "source": "exact_asset_only",
                "role": "manual_additional_logo_%s" % (index + 1),
            }
        )
        seen.add(clean_asset_id)
    return rules


def _manual_additional_logo_positions(logo_position: str) -> List[str]:
    if logo_position == "top_left":
        return ["top_right", "bottom_left", "bottom_right", "top_center"]
    if logo_position == "top_right":
        return ["top_left", "bottom_right", "bottom_left", "top_center"]
    return ["top_right", "top_left", "bottom_left", "bottom_right"]


def _dedupe_logo_rules(rules: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    deduped: List[Dict[str, Any]] = []
    seen = set()
    for rule in rules:
        fingerprint = (
            str(rule.get("asset_id") or "").strip().lower(),
            str(rule.get("brand_mark") or rule.get("brandMark") or "").strip().lower(),
            str(rule.get("position") or "").strip().lower(),
            str(rule.get("role") or rule.get("label") or "").strip().lower(),
        )
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        deduped.append(rule)
    return deduped


def _secondary_logo_from_additional(layers: List[LogoLayerPlan]) -> SecondaryLogoPlan:
    if not layers:
        return SecondaryLogoPlan()
    first = layers[0]
    return SecondaryLogoPlan(
        required=first.required,
        asset_id=first.asset_id,
        position=first.position,
        rules_extra=first.rules_extra,
        missing=first.missing,
        label=first.label,
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
