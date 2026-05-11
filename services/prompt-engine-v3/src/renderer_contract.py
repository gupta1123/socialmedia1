from __future__ import annotations

from typing import Any, Dict, List, Optional

from .schemas import AssetRoleEntry, AssetRolePlan, RenderPackage, SessionFactOverride
from .asset_analysis_normalizer import get_visual_analysis, metadata_for_asset


def build_asset_role_plan(
    asset: Dict[str, Any],
    include_logo: bool,
    logo_asset_id: Optional[str],
    secondary_logo_asset_id: Optional[str],
    include_rera_qr: bool,
    rera_qr_asset_id: Optional[str],
    additional_logo_asset_ids: Optional[List[str]] = None,
) -> AssetRolePlan:
    project_assets: List[AssetRoleEntry] = []
    if asset.get("asset_id"):
        project_assets.append(
            AssetRoleEntry(
                asset_id=asset.get("asset_id"),
                label=asset.get("label"),
                usage="primary_truth_anchor",
                grounding_note=asset_grounding_note(asset),
            )
        )
    return AssetRolePlan(
        project_assets=project_assets,
        logo_asset=AssetRoleEntry(asset_id=logo_asset_id, usage="exact_logo_layer") if include_logo and logo_asset_id else None,
        secondary_logo_asset=AssetRoleEntry(asset_id=secondary_logo_asset_id, usage="exact_secondary_logo_layer") if secondary_logo_asset_id else None,
        additional_logo_assets=[
            AssetRoleEntry(asset_id=asset_id, usage="exact_additional_logo_layer")
            for asset_id in additional_logo_ids_after_secondary(additional_logo_asset_ids or [], secondary_logo_asset_id)
        ],
        rera_qr_asset=AssetRoleEntry(asset_id=rera_qr_asset_id, usage="exact_rera_compliance_block") if include_rera_qr and rera_qr_asset_id else None,
        reference_images=[],
        fallback_visuals=[],
    )


def build_render_package(
    output_format: str,
    asset: Dict[str, Any],
    prompt: str,
    compiled_prompt: str,
    negative_prompt: str,
    copy: Dict[str, str],
    include_logo: bool,
    logo_asset_id: Optional[str],
    include_rera_qr: bool,
    rera_qr_asset_id: Optional[str],
    session_facts: List[SessionFactOverride],
    secondary_logo_asset_id: Optional[str] = None,
    secondary_logo_rules: Optional[Dict[str, Any]] = None,
    additional_logo_rules: Optional[List[Dict[str, Any]]] = None,
    logo_position: str = "top_left",
    logo_rules_extra: Optional[Dict[str, Any]] = None,
    rera_position: str = "top_right",
    contact_rules: Optional[Dict[str, Any]] = None,
    location_rules: Optional[Dict[str, Any]] = None,
    asset_selection: Optional[Dict[str, Any]] = None,
    template_contract: Optional[Dict[str, Any]] = None,
    text_treatment: str = "render_text",
    prompt_format: str = "legacy",
    style_reference_ids: Optional[List[str]] = None,
    creative_route: Optional[Dict[str, Any]] = None,
) -> RenderPackage:
    logo_rules = {
        "required": include_logo,
        "max_instances": 1,
        "source": "exact_asset_only",
        "position": logo_position,
        "allowed_positions": ["top_left", "top_right", "bottom_signature"],
    }
    if isinstance(logo_rules_extra, dict):
        logo_rules.update({key: value for key, value in logo_rules_extra.items() if value is not None})
        logo_rules["required"] = include_logo
        logo_rules["max_instances"] = 1
        logo_rules["source"] = "exact_asset_only"
        logo_rules["position"] = logo_position

    normalized_additional_logo_rules = normalize_additional_logo_rules(additional_logo_rules, secondary_logo_asset_id, secondary_logo_rules)
    additional_logo_asset_ids = [
        str(rule.get("asset_id"))
        for rule in normalized_additional_logo_rules
        if isinstance(rule.get("asset_id"), str) and str(rule.get("asset_id")).strip()
    ]

    provider_references = []
    if asset.get("asset_id"):
        provider_references.append({"asset_id": asset.get("asset_id"), "role": "primary_truth_anchor", "sent_to_model": True, "composited_after": False})
    if include_logo and logo_asset_id:
        provider_references.append({"asset_id": logo_asset_id, "role": "exact_logo_layer", "sent_to_model": True, "composited_after": False})
    if secondary_logo_asset_id:
        provider_references.append({"asset_id": secondary_logo_asset_id, "role": "exact_secondary_logo_layer", "sent_to_model": True, "composited_after": False})
    for asset_id in additional_logo_ids_after_secondary(additional_logo_asset_ids, secondary_logo_asset_id):
        provider_references.append({"asset_id": asset_id, "role": "exact_additional_logo_layer", "sent_to_model": True, "composited_after": False})
    if include_rera_qr and rera_qr_asset_id:
        provider_references.append({"asset_id": rera_qr_asset_id, "role": "exact_rera_qr_layer", "sent_to_model": False, "composited_after": True})
    excluded_reference_ids = {str(asset.get("asset_id") or ""), str(logo_asset_id or ""), str(secondary_logo_asset_id or ""), str(rera_qr_asset_id or "")}
    excluded_reference_ids.update(str(x) for x in additional_logo_asset_ids if x)
    for ref_id in style_reference_ids or []:
        ref_id = str(ref_id or "").strip()
        if not ref_id or ref_id in excluded_reference_ids:
            continue
        provider_references.append({"asset_id": ref_id, "role": "style_reference_only", "sent_to_model": True, "composited_after": False})

    creative_route = creative_route or {}
    people_allowed = bool(creative_route.get("people_allowed", False))
    abstract_env_allowed = bool(creative_route.get("abstract_environment_allowed", True))

    return RenderPackage(
        project_asset_ids=[asset.get("asset_id")] if asset.get("asset_id") else [],
        logo_asset_id=logo_asset_id if include_logo else None,
        secondary_logo_asset_id=secondary_logo_asset_id,
        additional_logo_asset_ids=additional_logo_asset_ids,
        rera_qr_asset_id=rera_qr_asset_id if include_rera_qr else None,
        reference_image_ids=[ref["asset_id"] for ref in provider_references if ref.get("sent_to_model") and ref.get("asset_id")],
        provider_references=provider_references,
        prompt_format=prompt_format,
        image_model_mode="asset_reference_generation" if asset.get("asset_id") else "text_to_image_generation",
        format=output_format,
        # `prompt` is what downstream image providers should use; keep the raw model
        # draft separately for debugging.
        prompt=compiled_prompt,
        draft_prompt=prompt,
        provider_prompt=compiled_prompt,
        compiled_prompt=compiled_prompt,
        negative_prompt=negative_prompt,
        exact_text_layers={} if text_treatment == "reserve_space" else copy,
        logo_rules=logo_rules,
        secondary_logo_rules=secondary_logo_rules or {"required": False},
        additional_logo_rules=normalized_additional_logo_rules,
        rera_qr_rules={
            "required": include_rera_qr,
            "max_instances": 1,
            "source": "exact_asset_only",
            "render_mode": "composite_rera_block",
            "position": rera_position,
            "size": "compact_badge",
            "height_match": "logo_height",
            "max_width_ratio": 0.25,
            "avoid_full_width_banner": True,
            "avoid_footer_placement": True,
            "never_generate_qr": True,
        },
        contact_rules=contact_rules or {"required": False, "position": "bottom_footer", "items": [], "values": {}},
        location_rules=location_rules or {"required": False, "position": "bottom_left", "value": None},
        truth_rules={
            "preserve_source_geometry": True,
            "no_facade_text_added": True,
            "no_unseen_factual_surroundings": True,
            "abstract_poster_environment_allowed": abstract_env_allowed,
            "people_allowed": people_allowed,
            "grounding_mode": creative_route.get("grounding_mode"),
            "creative_route": creative_route.get("key"),
            "no_generated_logo_or_qr": not (include_logo or bool(secondary_logo_asset_id) or bool(additional_logo_asset_ids)),
            "no_fake_logo": True,
            "no_generated_qr": True,
        },
        session_fact_overrides=session_facts,
        asset_visual_summary=asset_visual_summary(asset),
        asset_selection=asset_selection or asset.get("selection") or {},
        template_contract=template_contract or {},
        forbidden_ai_generation=[
            "fake_logo",
            "fake_qr",
            "fake_contact",
            "fake_price",
            "facade_signage",
            "unsupported_asset_details",
            *([] if people_allowed else ["random_people"]),
            *(
                ["rendered_text", "placeholder_text", "gibberish_typography"]
                if text_treatment == "reserve_space"
                else []
            ),
        ],
        renderer_policy="Provider prompt is final art direction; exact assets/data must stay grounded. Route-approved abstract, lifestyle, festival, or poster treatments may be used only when they do not imply unsupported factual project features.",
    )


def normalize_additional_logo_rules(
    additional_logo_rules: Optional[List[Dict[str, Any]]],
    secondary_logo_asset_id: Optional[str],
    secondary_logo_rules: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    del secondary_logo_rules
    return [
        dict(rule)
        for rule in additional_logo_rules or []
        if isinstance(rule, dict) and rule.get("asset_id") != secondary_logo_asset_id
    ]


def additional_logo_ids_after_secondary(additional_logo_asset_ids: List[str], secondary_logo_asset_id: Optional[str]) -> List[str]:
    ids: List[str] = []
    seen = {secondary_logo_asset_id} if secondary_logo_asset_id else set()
    for asset_id in additional_logo_asset_ids:
        if not asset_id or asset_id in seen:
            continue
        ids.append(asset_id)
        seen.add(asset_id)
    return ids


def asset_visual_summary(asset: Dict[str, Any]) -> Dict[str, Any]:
    metadata = metadata_for_asset(asset)
    visual = get_visual_analysis(asset)
    return {
        "asset_id": asset.get("asset_id"),
        "label": asset.get("label"),
        "scene_type": visual.get("semantic_type") or visual.get("scene_type") or asset.get("scene_type"),
        "visual_use": asset.get("visual_use"),
        "truth_status": asset.get("truth_status"),
        "summary": visual.get("dominant_subject") or visual.get("composition") or asset.get("description"),
        "visual_traits": visual.get("identity_features"),
        "prompt_adaptation_guidance": visual.get("prompt_guidance"),
        "text_safe_zones": visual.get("text_safe_zones"),
        "must_preserve": visual.get("must_preserve"),
        "best_use_cases": visual.get("best_use_cases"),
        "not_visible_or_not_supported": visual.get("forbidden_transformations") or metadata.get("doNotClaim"),
        "safe_claims": asset.get("safe_claims") or metadata.get("safeClaims") or [],
        "do_not_claim": asset.get("do_not_claim") or metadata.get("doNotClaim") or [],
    }

def asset_grounding_note(asset: Dict[str, Any]) -> Optional[str]:
    summary = asset_visual_summary(asset).get("summary")
    guidance = asset_visual_summary(asset).get("prompt_adaptation_guidance")
    if summary and guidance:
        return "%s Adaptation guidance: %s" % (summary, guidance)
    return summary or asset.get("visual_use")
