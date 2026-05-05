from __future__ import annotations

from typing import Any, Dict, List, Optional

from .planning_schemas import AssetDecision, TemplateConstraint


def resolve_template_constraint(template: Optional[Dict[str, Any]], asset_decision: Optional[AssetDecision] = None) -> TemplateConstraint:
    if not isinstance(template, dict) or not template:
        return TemplateConstraint()
    tj = template.get("template_json") if isinstance(template.get("template_json"), dict) else {}
    lever = template.get("lever_signature") if isinstance(template.get("lever_signature"), dict) else {}
    best_for = tj.get("best_for") if isinstance(tj.get("best_for"), list) else []
    asset_assumptions = _asset_assumptions(lever, tj, best_for)
    semantic = asset_decision.semantic_type if asset_decision else None
    adaptation = _adaptation_rule(semantic, asset_assumptions)
    return TemplateConstraint(
        template_id=template.get("template_id"),
        name=template.get("name"),
        layout_logic=_layout_logic(lever, tj),
        hierarchy=_hierarchy(lever),
        graphic_rules=_graphic_rules(lever, tj, semantic, asset_assumptions),
        asset_assumptions=asset_assumptions,
        adaptation_rule=adaptation,
        lever_signature=lever,
        raw=template,
    )


def template_contract(template: Optional[Dict[str, Any]], asset_decision: Optional[AssetDecision] = None) -> Dict[str, Any]:
    return resolve_template_constraint(template, asset_decision).model_dump()


def _layout_logic(lever: Dict[str, Any], tj: Dict[str, Any]) -> str:
    layout = str(lever.get("layout_geometry") or "").replace("_", " ")
    notes = str(tj.get("visual_notes") or "").strip()
    return "; ".join(part for part in [layout, notes] if part)


def _hierarchy(lever: Dict[str, Any]) -> List[str]:
    arch = str(lever.get("text_architecture") or "").lower()
    if "proof" in arch:
        return ["headline", "verified proof", "support copy", "CTA", "footer"]
    if "hook" in arch:
        return ["headline/hook", "offer/proposition", "CTA", "footer"]
    if "one_statement" in arch:
        return ["one strong statement", "small CTA"]
    return ["headline", "subheadline", "CTA", "footer"]


def _graphic_rules(lever: Dict[str, Any], tj: Dict[str, Any], semantic: Optional[str], assumptions: List[str]) -> List[str]:
    layers = lever.get("graphic_layer") or []
    if isinstance(layers, str):
        layers = [layers]
    out = [str(item).replace("_", " ") for item in layers]
    if tj.get("shape_selection_rule"):
        out.append(str(tj.get("shape_selection_rule")))
    reality = str(tj.get("reality_policy") or "").strip()
    if reality:
        if semantic and assumptions and semantic not in assumptions:
            out.append(_adapt_reality_policy_for_asset(reality, semantic))
        else:
            out.append(reality)
    return out


def _adapt_reality_policy_for_asset(reality: str, semantic: str) -> str:
    if semantic in {"entrance", "lobby"}:
        return "Use the selected entrance/lobby visual as a faithful arrival image. Preserve frontage, glass, lighting, entry geometry, materials, and visible reality. Do not force tower, facade, or full-exterior assumptions from the template."
    if semantic == "interior":
        return "Use the selected interior as faithful room/lifestyle truth. Preserve layout, furniture, materials, windows, and lighting. Do not force tower, facade, or exterior assumptions from the template."
    if semantic == "amenity":
        return "Use the selected amenity scene faithfully. Preserve amenity geometry, furniture/equipment, materials, and spatial layout. Do not force tower or facade assumptions from the template."
    return reality


def _asset_assumptions(lever: Dict[str, Any], tj: Dict[str, Any], best_for: List[Any]) -> List[str]:
    text = " ".join([str(lever), str(tj), " ".join(str(x) for x in best_for)]).lower()
    out = []
    if any(term in text for term in ["tower", "facade", "exterior"]):
        out.append("building_exterior")
    if "interior" in text:
        out.append("interior")
    if "amenity" in text:
        out.append("amenity")
    if "map" in text or "location" in text:
        out.append("location_map")
    return out


def _adaptation_rule(semantic: Optional[str], assumptions: List[str]) -> str:
    if semantic and assumptions and semantic not in assumptions:
        return f"Preserve the selected template's layout hierarchy and graphic rules, but adapt all subject language and hero treatment to the actual {semantic.replace('_', ' ')} asset. Do not force the template's assumed subject."
    return "Use the selected template as composition, hierarchy, and graphic guidance; asset truth overrides template assumptions."
