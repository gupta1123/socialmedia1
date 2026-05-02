from __future__ import annotations

from typing import Any, Dict, List, Optional

from .schemas import AssetRoleEntry, AssetRolePlan, RenderPackage, SessionFactOverride


def build_asset_role_plan(
    asset: Dict[str, Any],
    include_logo: bool,
    logo_asset_id: Optional[str],
    include_rera_qr: bool,
    rera_qr_asset_id: Optional[str],
) -> AssetRolePlan:
    project_assets: List[AssetRoleEntry] = []
    if asset.get("asset_id"):
        project_assets.append(
            AssetRoleEntry(
                asset_id=asset.get("asset_id"),
                label=asset.get("label"),
                usage="primary_truth_anchor",
                grounding_note=asset.get("description") or asset.get("visual_use"),
            )
        )
    return AssetRolePlan(
        project_assets=project_assets,
        logo_asset=AssetRoleEntry(asset_id=logo_asset_id, usage="exact_logo_layer") if include_logo and logo_asset_id else None,
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
    logo_position: str = "top_left",
    logo_rules_extra: Optional[Dict[str, Any]] = None,
    rera_position: str = "top_right",
    contact_rules: Optional[Dict[str, Any]] = None,
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

    return RenderPackage(
        project_asset_ids=[asset.get("asset_id")] if asset.get("asset_id") else [],
        logo_asset_id=logo_asset_id if include_logo else None,
        rera_qr_asset_id=rera_qr_asset_id if include_rera_qr else None,
        reference_image_ids=[],
        image_model_mode="asset_reference_generation" if asset.get("asset_id") else "text_to_image_generation",
        format=output_format,
        prompt=prompt,
        compiled_prompt=compiled_prompt,
        negative_prompt=negative_prompt,
        exact_text_layers=copy,
        logo_rules=logo_rules,
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
        truth_rules={
            "preserve_source_geometry": True,
            "no_facade_text_added": True,
            "no_unseen_surroundings": True,
            "no_generated_logo_or_qr": True,
        },
        session_fact_overrides=session_facts,
    )
