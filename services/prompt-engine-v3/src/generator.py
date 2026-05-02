from __future__ import annotations

import os
import re
from typing import Any, Dict, List

from .asset_selector import coerce_selected_asset, select_registry_asset, shortlist_assets
from .context_builder import build_context_pack, brand_name, db_fact_strings, project_name
from .copy_policy import build_copy_contract, price_allowed_for_request, visible_text_allowed
from .creative_levers import CONTENT_JOBS, describe_creative_direction, normalize_format
from .grounding import (
    block_response,
    deterministic_gate,
    extract_session_fact_overrides,
    requested_contact_items,
    wants_rera_qr,
)
from .prompt_compiler import compile_image_prompt, fallback_prompt, strip_internal_tokens
from .presets import (
    contact_values_from_context,
    preset_contact_items,
    preset_contact_position,
    preset_logo_position,
    preset_logo_rules,
    preset_rera_position,
    preset_requires_logo,
    preset_requires_rera_qr,
    selected_preset,
)
from .renderer_contract import build_asset_role_plan, build_render_package
from .schemas import CompileRequest, CompileResponse, FactAudit, ValidationResult, VariantOutput
from .validators import enforce_ready_invariant, validate_variant
from .variant_planner import coerce_variant_plan, registry_variant_plan


def compile_prompt(request: CompileRequest) -> CompileResponse:
    if dspy_available() and not request.options.get("disable_dspy"):
        try:
            return compile_prompt_with_dspy(request)
        except Exception as exc:
            response = compile_prompt_with_registry_planner(request)
            response.debug["dspy_error"] = "%s: %s" % (type(exc).__name__, exc)
            response.debug["engine_fallback_reason"] = "dspy_parse_or_runtime_error"
            return response
    return compile_prompt_with_registry_planner(request)


def compile_prompt_with_dspy(request: CompileRequest) -> CompileResponse:
    from .dspy_engine import DspyPromptProgram, coerce_content_job

    content_job_id = infer_content_job_id(request)
    context = build_context_pack(request, content_job_id)
    gate = deterministic_gate(request, context)
    if not gate.passed:
        return CompileResponse(**block_response(request, normalize_format(request.format), gate.errors, gate.warnings))

    session_facts = extract_session_fact_overrides(request, context)
    context["session_fact_overrides"] = [fact.model_dump() for fact in session_facts]
    program = DspyPromptProgram()
    if request.content_job_id:
        intent = {
            "resolved_content_job_id": content_job_id,
            "confidence": 1.0,
            "brief_summary": request.brief,
            "job_lock_note": "Explicit content_job_id was kept; DSPy intent resolution was skipped.",
        }
    else:
        intent = program.resolve(request, context)

    resolved_job_id = coerce_content_job(intent.get("resolved_content_job_id"), content_job_id)
    if resolved_job_id != content_job_id:
        content_job_id = resolved_job_id
        context = build_context_pack(request, content_job_id)
        context["session_fact_overrides"] = [fact.model_dump() for fact in session_facts]

    output_format = normalize_format(request.format)
    templates = context.get("visual_templates") if isinstance(context.get("visual_templates"), list) else []
    candidates = shortlist_assets(request, context, content_job_id)
    fallback_asset = select_registry_asset(request, context, content_job_id)
    asset_selection = program.select_hero_asset(request, content_job_id, candidates) if candidates else {}
    selected_asset = coerce_selected_asset(asset_selection, candidates, fallback_asset)
    variant_plan = program.make_variant_plan(request, content_job_id, selected_asset, templates)
    variant_specs = coerce_variant_plan(variant_plan, request, content_job_id, templates)

    variants: List[VariantOutput] = []
    warnings = list(gate.warnings)
    errors: List[str] = []
    selected_assets_by_variant: List[str] = []
    for index, spec in enumerate(variant_specs):
        variant_asset = asset_for_variant(request, candidates, selected_asset, index)
        raw_output = program.generate_variant_output(request, context, variant_asset, spec)
        variant = build_variant_output(
            request=request,
            context=context,
            content_job_id=content_job_id,
            output_format=output_format,
            asset=variant_asset,
            spec=spec,
            raw_output=raw_output,
            session_facts=session_facts,
        )
        semantic_validation = program.validate_output(request, variant.model_dump(by_alias=True))
        variant.validation = merge_validation(
            variant.validation,
            validation_from_dict(semantic_validation),
        )
        deterministic_validation = validate_variant(variant, session_facts, db_fact_strings(context))
        variant.validation = merge_validation(variant.validation, deterministic_validation)

        if not variant.validation.passed:
            repaired_raw = program.repair_variant_output(
                request,
                variant.model_dump(by_alias=True),
                variant.validation.model_dump(),
            )
            repaired = build_variant_output(
                request=request,
                context=context,
                content_job_id=content_job_id,
                output_format=output_format,
                asset=variant_asset,
                spec=spec,
                raw_output=repaired_raw,
                session_facts=session_facts,
            )
            repaired_validation = merge_validation(
                validation_from_dict(program.validate_output(request, repaired.model_dump(by_alias=True))),
                validate_variant(repaired, session_facts, db_fact_strings(context)),
            )
            repaired.validation = repaired_validation
            variant = repaired

        variants.append(variant)
        selected_assets_by_variant.append(str(variant_asset.get("asset_id") or ""))
        errors.extend(variant.validation.errors)
        warnings.extend(variant.validation.warnings)

    validation = ValidationResult(passed=not errors and bool(variants), errors=errors, warnings=dedupe(warnings))
    status = enforce_ready_invariant("ready", validation)
    return CompileResponse(
        status=status,  # type: ignore[arg-type]
        capability=request.capability,
        content_job_id=content_job_id,
        format=output_format,
        variant_count=len(variants),
        variation_strategy=request.variation_strategy,
        variants=variants if status == "ready" else [],
        validation=validation,
        debug={
            "engine": "prompt-engine-v3-dspy",
            "intent": intent,
            "asset_selection": asset_selection,
            "variant_plan": variant_plan,
            "selected_asset_id": selected_asset.get("asset_id"),
            "selected_asset_ids_by_variant": selected_assets_by_variant,
        },
    )


def compile_prompt_with_registry_planner(request: CompileRequest) -> CompileResponse:
    content_job_id = infer_content_job_id(request)
    context = build_context_pack(request, content_job_id)
    gate = deterministic_gate(request, context)
    if not gate.passed:
        return CompileResponse(**block_response(request, normalize_format(request.format), gate.errors, gate.warnings))

    output_format = normalize_format(request.format)
    session_facts = extract_session_fact_overrides(request, context)
    context["session_fact_overrides"] = [fact.model_dump() for fact in session_facts]
    asset = select_registry_asset(request, context, content_job_id)
    candidates = shortlist_assets(request, context, content_job_id, limit=20)
    specs = registry_variant_plan(request, content_job_id, context.get("visual_templates", []))
    variants: List[VariantOutput] = []
    errors: List[str] = []
    warnings = list(gate.warnings)
    selected_assets_by_variant: List[str] = []
    for index, spec in enumerate(specs):
        variant_asset = asset_for_variant(request, candidates, asset, index)
        copy = build_copy_contract(request, context, content_job_id, session_facts)
        creative_direction = spec.get("creative_direction") if isinstance(spec.get("creative_direction"), dict) else {}
        prompt = fallback_prompt(context, variant_asset, copy, creative_direction)
        raw = {
            "prompt": prompt,
            "negative_prompt": default_negative_prompt(),
            "copy": copy,
            "creative_direction": creative_direction,
        }
        variant = build_variant_output(
            request=request,
            context=context,
            content_job_id=content_job_id,
            output_format=output_format,
            asset=variant_asset,
            spec=spec,
            raw_output=raw,
            session_facts=session_facts,
        )
        variant.validation = validate_variant(variant, session_facts, db_fact_strings(context))
        variants.append(variant)
        selected_assets_by_variant.append(str(variant_asset.get("asset_id") or ""))
        errors.extend(variant.validation.errors)
        warnings.extend(variant.validation.warnings)

    validation = ValidationResult(passed=not errors and bool(variants), errors=errors, warnings=dedupe(warnings))
    status = enforce_ready_invariant("ready", validation)
    return CompileResponse(
        status=status,  # type: ignore[arg-type]
        capability=request.capability,
        content_job_id=content_job_id,
        format=output_format,
        variant_count=len(variants),
        variation_strategy=request.variation_strategy,
        variants=variants if status == "ready" else [],
        validation=validation,
        debug={
            "engine": "prompt-engine-v3-registry-planner",
            "selected_asset_id": asset.get("asset_id"),
            "selected_asset_ids_by_variant": selected_assets_by_variant,
        },
    )


def asset_for_variant(
    request: CompileRequest,
    candidates: List[Dict[str, Any]],
    default_asset: Dict[str, Any],
    index: int,
) -> Dict[str, Any]:
    """Pick the per-variant truth asset without overriding user locks.

    User-selected asset IDs mean the same truth anchor is intentionally locked.
    When asset_variation is explicitly enabled and no asset is locked, distribute
    variants across the deterministic shortlist so creative options can explore
    genuinely different visual inputs.
    """

    if request.selected_asset_ids:
        return default_asset
    if not request.asset_variation:
        return default_asset
    if not candidates:
        return default_asset
    return candidates[index % len(candidates)]


def build_variant_output(
    *,
    request: CompileRequest,
    context: Dict[str, Any],
    content_job_id: str,
    output_format: str,
    asset: Dict[str, Any],
    spec: Dict[str, Any],
    raw_output: Dict[str, Any],
    session_facts: List[Any],
) -> VariantOutput:
    raw_copy = raw_output.get("copy") if isinstance(raw_output, dict) else None
    preset = selected_preset(context, request.brand_preset_id)
    include_logo = request.include_logo or preset_requires_logo(preset)
    include_rera = request.include_rera_qr or wants_rera_qr(request) or preset_requires_rera_qr(preset)
    preset_contact = preset_contact_items(preset)
    contact_items = sorted(set(requested_contact_items(request) + preset_contact))
    contact_values = contact_values_from_context(context, contact_items)
    logo_position = preset_logo_position(preset)
    logo_rules_extra = preset_logo_rules(preset)
    rera_position = preset_rera_position(preset)
    contact_position = preset_contact_position(preset)
    copy = build_copy_contract(request, context, content_job_id, session_facts, raw_copy)
    raw_direction = raw_output.get("creative_direction") if isinstance(raw_output.get("creative_direction"), dict) else {}
    creative_direction = dict(spec.get("creative_direction") if isinstance(spec.get("creative_direction"), dict) else {})
    creative_direction.update(raw_direction)
    creative_direction["brand"] = brand_name(context)
    raw_prompt = strip_internal_tokens(str(raw_output.get("prompt") or "")) if isinstance(raw_output, dict) else ""
    if not raw_prompt:
        raw_prompt = fallback_prompt(context, asset, copy, creative_direction)
    compiled_prompt = compile_image_prompt(
        raw_prompt,
        context,
        asset,
        copy,
        creative_direction,
        include_logo=include_logo,
        include_rera_qr=include_rera,
        allow_price_claims=price_allowed_for_request(request.brief, content_job_id),
    )
    negative_prompt = clean_negative_prompt(str(raw_output.get("negative_prompt") or default_negative_prompt()), content_job_id)
    asset_role_plan = build_asset_role_plan(asset, include_logo, request.logo_asset_id, include_rera, request.rera_qr_asset_id)
    contact_rules = {
        "required": bool(contact_values),
        "position": contact_position,
        "items": contact_items,
        "values": contact_values,
        "include_if_grounded": True,
    }
    render_package = build_render_package(
        output_format,
        asset,
        raw_prompt,
        compiled_prompt,
        negative_prompt,
        copy,
        include_logo,
        request.logo_asset_id,
        include_rera,
        request.rera_qr_asset_id,
        session_facts,
        logo_position=logo_position,
        logo_rules_extra=logo_rules_extra,
        rera_position=rera_position,
        contact_rules=contact_rules,
    )
    selected_assets = [
        {
            "asset_id": entry.asset_id,
            "label": entry.label,
            "usage": entry.usage,
            "grounding_note": entry.grounding_note,
        }
        for entry in asset_role_plan.project_assets
    ]
    fact_audit = FactAudit(
        project_db_facts_used=db_fact_strings(context)[:12],
        brief_declared_facts_used=session_facts,
        llm_inferred_claims=[],
        requires_client_review=any(fact.requires_client_review for fact in session_facts),
    )
    return VariantOutput(
        variant_id=str(spec.get("variant_id") or "variant_1"),
        variation_label=str(spec.get("label") or spec.get("variation_label") or "Creative Option"),
        variation_axis=str(spec.get("variation_axis") or request.variation_strategy or "auto"),
        selected_template_id=spec.get("selected_template_id"),
        creative_direction=creative_direction,
        selected_assets=selected_assets,
        asset_role_plan=asset_role_plan,
        copy_contract=copy,
        visible_text_allowed=visible_text_allowed(copy, session_facts),
        prompt=raw_prompt,
        compiled_prompt=compiled_prompt,
        negative_prompt=negative_prompt,
        text_policy={"copy_mode": request.copy_mode, "editable_layers": True, "preview_text_visible": True},
        layout_contract={
            "mode": "single_post",
            "logo_layer": {
                **logo_rules_extra,
                "required": include_logo,
                "asset_id": request.logo_asset_id if include_logo else None,
                "max_instances": 1,
                "source": "exact_asset_only",
                "position": logo_position,
            },
            "rera_qr_layer": {
                "required": include_rera,
                "asset_id": request.rera_qr_asset_id if include_rera else None,
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
            "contact_layer": contact_rules,
        },
        render_package=render_package,
        fact_audit=fact_audit,
        validation=ValidationResult(passed=True),
    )


def infer_content_job_id(request: CompileRequest) -> str:
    if request.content_job_id:
        return request.content_job_id
    text = (request.brief or "").lower()
    if any(term in text for term in ["amenity", "pool", "gym", "clubhouse", "lounge", "garden", "terrace", "kids play", "basketball"]):
        return "amenity_spotlight"
    if any(term in text for term in ["site visit", "visit this weekend", "book a visit", "schedule visit"]):
        return "site_visit"
    if any(term in text for term in ["location", "nearby", "connectivity", "distance", "map"]):
        return "location_advantage"
    if any(term in text for term in ["price", "offer", "emi", "starting at", "starting from", "booking amount"]):
        return "pricing_ad"
    return "project_launch"


def validation_from_dict(value: Dict[str, Any]) -> ValidationResult:
    if not isinstance(value, dict):
        return ValidationResult(passed=True)
    errors = value.get("errors") if isinstance(value.get("errors"), list) else []
    warnings = value.get("warnings") if isinstance(value.get("warnings"), list) else []
    return ValidationResult(
        passed=bool(value.get("passed", not errors)),
        errors=[str(error) for error in errors if str(error).strip()],
        warnings=[str(warning) for warning in warnings if str(warning).strip()],
    )


def merge_validation(*items: ValidationResult) -> ValidationResult:
    errors: List[str] = []
    warnings: List[str] = []
    for item in items:
        errors.extend(item.errors)
        warnings.extend(item.warnings)
    return ValidationResult(passed=not errors and all(item.passed for item in items), errors=dedupe(errors), warnings=dedupe(warnings))


def dedupe(values: List[str]) -> List[str]:
    seen = set()
    out: List[str] = []
    for value in values:
        text = str(value).strip()
        if text and text not in seen:
            out.append(text)
            seen.add(text)
    return out


def default_negative_prompt() -> str:
    return "No facade signage, no distorted architecture, no invented surroundings, no duplicate logos, no fake QR codes, no unsupported facts."


def clean_negative_prompt(value: str, content_job_id: str = "") -> str:
    text = strip_internal_tokens(value)
    chunks = re.split(r"[,;\n]+", text)
    seen = set()
    cleaned: List[str] = []
    blocked_for_job = set()
    additions: List[str] = []
    if content_job_id == "construction_update":
        blocked_for_job.update({"unfinished", "construction", "scaffolding", "cranes", "workers", "site", "progress"})
        additions.extend(["no completed-building launch render", "no fake current progress claims"])
    for chunk in chunks:
        item = " ".join(chunk.strip().split())
        if not item:
            continue
        key = item.lower()
        if content_job_id == "construction_update" and any(term in key for term in blocked_for_job):
            continue
        if key in seen:
            continue
        if len(item) > 80:
            continue
        seen.add(key)
        cleaned.append(item)
        if len(cleaned) >= 28:
            break
    for item in additions:
        key = item.lower()
        if key not in seen:
            cleaned.append(item)
            seen.add(key)
    if not cleaned:
        return default_negative_prompt()
    result = ", ".join(cleaned)
    return result[:700].rstrip(" ,;")


def dspy_available() -> bool:
    return bool(os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY"))
