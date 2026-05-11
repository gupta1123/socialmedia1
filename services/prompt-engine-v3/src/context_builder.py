from __future__ import annotations

from typing import Any, Dict, List

from .creative_levers import CONTENT_JOBS, normalize_format, templates_for_job
from .schemas import CompileRequest


def build_context_pack(request: CompileRequest, content_job_id: str) -> Dict[str, Any]:
    context = request.context if isinstance(request.context, dict) else {}
    options = request.options if isinstance(request.options, dict) else {}
    brand = _dict(context.get("brand"))
    project = _dict(context.get("project"))
    post_type = _dict(context.get("post_type"))
    festival = _dict(context.get("festival"))
    assets = [_dict(asset) for asset in context.get("assets", []) if isinstance(asset, dict)]
    output_format = normalize_format(request.format)
    selected_color_palette = _dict(context.get("selected_color_palette"))
    # Frontend normally sends curated/custom palette choice under options.colorPalette.
    # Treat that as a first-class creative input rather than forcing every palette
    # through the brand profile. Context still wins if it already contains a
    # normalized selected_color_palette.
    if not selected_color_palette:
        selected_color_palette = _dict(options.get("colorPalette") or options.get("color_palette"))
    if selected_color_palette and "palette_name" not in selected_color_palette:
        if selected_color_palette.get("paletteName"):
            selected_color_palette = {**selected_color_palette, "palette_name": selected_color_palette.get("paletteName")}
        elif selected_color_palette.get("name"):
            selected_color_palette = {**selected_color_palette, "palette_name": selected_color_palette.get("name")}
    return {
        "brand": brand,
        "project": project,
        "post_type": post_type,
        "festival": festival,
        "assets": assets,
        "brand_presets": _list(context.get("brand_presets")),
        "selected_color_palette": selected_color_palette,
        "visual_templates": templates_for_job(content_job_id, output_format, context.get("visual_templates")),
        "rera_compliance_block": _dict(context.get("rera_compliance_block")),
        "content_job": CONTENT_JOBS.get(content_job_id, {}),
        "format": output_format,
        "source_brief": request.brief,
    }


def project_name(context: Dict[str, Any]) -> str:
    project = _dict(context.get("project"))
    return str(project.get("name") or project.get("project_name") or "the selected project")


def brand_name(context: Dict[str, Any]) -> str:
    brand = _dict(context.get("brand"))
    return str(brand.get("name") or "the brand")


def project_profile(context: Dict[str, Any]) -> Dict[str, Any]:
    project = _dict(context.get("project"))
    return _dict(project.get("profile"))


def brand_profile(context: Dict[str, Any]) -> Dict[str, Any]:
    brand = _dict(context.get("brand"))
    return _dict(brand.get("profile"))


def db_fact_strings(context: Dict[str, Any]) -> List[str]:
    facts: List[str] = []
    project = _dict(context.get("project"))
    profile = project_profile(context)
    rera_block = _dict(context.get("rera_compliance_block"))
    for value in [
        project.get("name"),
        project.get("city"),
        project.get("micro_location"),
        profile.get("tagline"),
        profile.get("reraNumber"),
        rera_block.get("registration_number"),
        rera_block.get("authority_label"),
        rera_block.get("website_url"),
        profile.get("startingPrice"),
        profile.get("latestUpdate"),
        profile.get("positioning"),
    ]:
        if isinstance(value, str) and value.strip():
            facts.append(value.strip())
    for key in ["approvedClaims", "configurations", "amenities", "travelTimes", "priceRangeByConfig", "credibilityFacts"]:
        value = profile.get(key)
        if isinstance(value, list):
            facts.extend(str(item).strip() for item in value if str(item).strip())
    return facts


def _dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []
