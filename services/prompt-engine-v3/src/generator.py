from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Optional

from .asset_selector import (
    build_asset_decision,
    build_asset_selection_context,
    select_registry_asset,
    shortlist_assets,
    validate_ai_asset_selection,
)
from .concept_planner import concept_to_spec, plan_variant_concepts
from .context_builder import build_context_pack, db_fact_strings, project_profile
from .copy_planner import plan_copy
from .copy_policy import price_allowed_for_request, visible_text_allowed
from .creative_levers import CONTENT_JOBS, normalize_format
from .creative_strategy import plan_creative_strategy
from .fact_store import build_fact_store, fact_strings_for_validation
from .grounding import block_response, deterministic_gate, extract_session_fact_overrides
from .grounding_validator import validate_full_variant
from .intent_resolver import resolve_creative_intent
from .planning_schemas import AssetDecision, CopyPlan, CreativeIntent, CreativeStrategy, GroundedFactStore, ProductionPlan, TemplateConstraint, VariantConcept
from .production_resolver import resolve_production_plan
from .prompt_compiler import compile_image_prompt, fallback_prompt, strip_internal_tokens
from .prompt_auditor import audit_and_repair_prompt
from .renderer_contract import build_asset_role_plan, build_render_package
from .schemas import CompileRequest, CompileResponse, FactAudit, ValidationResult, VariantOutput
from .template_resolver import resolve_template_constraint, template_contract
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
            response.validation.warnings.append("DSPy generation failed; registry planner fallback was used.")
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
    fact_store = build_fact_store(context, session_facts)
    intent = resolve_creative_intent(request, context, content_job_id)
    commercial_errors, commercial_warnings = commercial_pricing_guard(request, context, content_job_id, session_facts)
    if commercial_errors:
        return CompileResponse(
            status="needs_input",
            capability=request.capability,
            content_job_id=content_job_id,
            format=normalize_format(request.format),
            variant_count=0,
            variation_strategy=request.variation_strategy,
            variants=[],
            validation=ValidationResult(passed=False, errors=commercial_errors, warnings=commercial_warnings),
            debug={"engine": "prompt-engine-v4-commercial-guard", "intent": intent.model_dump()},
        )
    program = DspyPromptProgram()
    if request.content_job_id:
        dspy_intent = {
            "resolved_content_job_id": content_job_id,
            "confidence": 1.0,
            "brief_summary": request.brief,
            "job_lock_note": "Explicit content_job_id was kept; DSPy intent resolution was skipped.",
        }
    else:
        dspy_intent = program.resolve(request, context)
        resolved_job_id = coerce_content_job(dspy_intent.get("resolved_content_job_id"), content_job_id)
        if resolved_job_id != content_job_id:
            content_job_id = resolved_job_id
            context = build_context_pack(request, content_job_id)
            context["session_fact_overrides"] = [fact.model_dump() for fact in session_facts]
            fact_store = build_fact_store(context, session_facts)
            intent = resolve_creative_intent(request, context, content_job_id)

    production = resolve_production_plan(request=request, context=context, intent=intent, fact_store=fact_store)
    candidates = shortlist_assets(request, context, content_job_id, intent=intent, limit=20)
    fallback_asset = select_registry_asset(request, context, content_job_id, intent=intent)
    asset_selection_context = build_asset_selection_context(request, content_job_id, candidates, intent=intent)
    raw_asset_selection = program.select_hero_asset(request, content_job_id, candidates, asset_selection_context) if candidates else {}
    selected_asset, asset_selection = validate_ai_asset_selection(raw_asset_selection, request, candidates, fallback_asset)
    asset_decision = build_asset_decision(selected_asset, asset_selection)
    templates = context.get("visual_templates") if isinstance(context.get("visual_templates"), list) else []
    variant_plan = program.make_variant_plan(request, content_job_id, selected_asset, templates)
    variant_specs = coerce_variant_plan(variant_plan, request, content_job_id, templates)
    variant_specs = attach_preferred_assets(variant_specs, request, candidates, selected_asset)
    first_template = template_by_id(templates, variant_specs[0].get("selected_template_id") if variant_specs else None)
    template_constraint = resolve_template_constraint(first_template, asset_decision)
    strategy = plan_creative_strategy(intent=intent, production=production, asset_decision=asset_decision, template=template_constraint)
    concepts = plan_variant_concepts(request=request, intent=intent, strategy=strategy, asset_decision=asset_decision, template_constraint=template_constraint, variant_specs=variant_specs)

    variants: List[VariantOutput] = []
    warnings = list(gate.warnings)
    errors: List[str] = []
    selected_assets_by_variant: List[str] = []
    db_facts = fact_strings_for_validation(fact_store, db_fact_strings(context))
    actual_concepts: List[VariantConcept] = []
    for index, planned_concept in enumerate(concepts):
        planned_spec = concept_to_spec(planned_concept)
        variant_asset = asset_for_spec(request, candidates, selected_asset, planned_spec, index)
        variant_asset_decision = build_asset_decision(variant_asset, variant_asset.get("selection") or asset_selection)
        variant_template = resolve_template_constraint(template_by_id(templates, planned_spec.get("selected_template_id")), variant_asset_decision)
        variant_strategy = plan_creative_strategy(intent=intent, production=production, asset_decision=variant_asset_decision, template=variant_template)
        variant_concept = plan_variant_concepts(
            request=request,
            intent=intent,
            strategy=variant_strategy,
            asset_decision=variant_asset_decision,
            template_constraint=variant_template,
            variant_specs=[planned_spec],
        )[0]
        actual_concepts.append(variant_concept)
        spec = concept_to_spec(variant_concept)
        raw_output = program.generate_variant_output(request, context, variant_asset, spec)
        variant = build_variant_output(
            request=request,
            context=context,
            content_job_id=content_job_id,
            output_format=normalize_format(request.format),
            asset=variant_asset,
            spec=spec,
            raw_output=raw_output,
            session_facts=session_facts,
            asset_selection=variant_asset.get("selection") or asset_selection,
            intent=intent,
            fact_store=fact_store,
            production=production,
            asset_decision=variant_asset_decision,
            template_constraint=variant_template,
            strategy=variant_strategy,
            concept=variant_concept,
        )
        semantic_validation = validation_from_dict(program.validate_output(request, variant.model_dump(by_alias=True)))
        deterministic_validation = validate_full_variant(variant, session_facts=session_facts, db_facts=db_facts, production=production)
        variant.validation = merge_validation(semantic_validation, deterministic_validation)
        variants.append(variant)
        selected_assets_by_variant.append(str(variant_asset.get("asset_id") or ""))
        errors.extend(variant.validation.errors)
        warnings.extend(variant.validation.warnings)

    validation = ValidationResult(passed=not errors and bool(variants), errors=errors, warnings=dedupe(warnings))
    status = enforce_ready_invariant("ready_with_warnings" if validation.warnings else "ready", validation)
    return CompileResponse(
        status=status,  # type: ignore[arg-type]
        capability=request.capability,
        content_job_id=content_job_id,
        format=normalize_format(request.format),
        variant_count=len(variants),
        variation_strategy=request.variation_strategy,
        variants=variants if status in {"ready", "ready_with_warnings", "ready_with_fallback"} else [],
        validation=validation,
        debug={
            "engine": "prompt-engine-v4-dspy-planned",
            "intent": intent.model_dump(),
            "dspy_intent": dspy_intent,
            "production_plan": production.model_dump(),
            "asset_selection": asset_selection,
            "asset_selection_context": asset_selection_context,
            "selected_asset_id": selected_asset.get("asset_id"),
            "selected_asset_ids_by_variant": selected_assets_by_variant,
            "planned_concepts": [concept.model_dump() for concept in concepts],
            "concepts": [concept.model_dump() for concept in actual_concepts],
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
    fact_store = build_fact_store(context, session_facts)
    intent = resolve_creative_intent(request, context, content_job_id)
    commercial_errors, commercial_warnings = commercial_pricing_guard(request, context, content_job_id, session_facts)
    if commercial_errors:
        return CompileResponse(
            status="needs_input",
            capability=request.capability,
            content_job_id=content_job_id,
            format=output_format,
            variant_count=0,
            variation_strategy=request.variation_strategy,
            variants=[],
            validation=ValidationResult(passed=False, errors=commercial_errors, warnings=commercial_warnings),
            debug={"engine": "prompt-engine-v4-commercial-guard", "intent": intent.model_dump()},
        )
    production = resolve_production_plan(request=request, context=context, intent=intent, fact_store=fact_store)
    candidates = shortlist_assets(request, context, content_job_id, limit=20, intent=intent)
    asset = select_registry_asset(request, context, content_job_id, intent=intent)
    asset_decision = build_asset_decision(asset, asset.get("selection") or {})
    specs = registry_variant_plan(request, content_job_id, context.get("visual_templates", []))
    specs = attach_preferred_assets(specs, request, candidates, asset)
    first_template = template_by_id(context.get("visual_templates", []), specs[0].get("selected_template_id") if specs else None)
    template_constraint = resolve_template_constraint(first_template, asset_decision)
    strategy = plan_creative_strategy(intent=intent, production=production, asset_decision=asset_decision, template=template_constraint)
    concepts = plan_variant_concepts(request=request, intent=intent, strategy=strategy, asset_decision=asset_decision, template_constraint=template_constraint, variant_specs=specs)
    variants: List[VariantOutput] = []
    errors: List[str] = []
    warnings = list(gate.warnings)
    if production.missing_requirements:
        errors.extend("Missing required production asset/value: %s" % item for item in production.missing_requirements)
    selected_assets_by_variant: List[str] = []
    db_facts = fact_strings_for_validation(fact_store, db_fact_strings(context))
    actual_concepts: List[VariantConcept] = []
    for index, planned_concept in enumerate(concepts):
        planned_spec = concept_to_spec(planned_concept)
        variant_asset = asset_for_spec(request, candidates, asset, planned_spec, index)
        variant_asset_decision = build_asset_decision(variant_asset, variant_asset.get("selection") or asset.get("selection") or {})
        variant_template = resolve_template_constraint(template_by_id(context.get("visual_templates", []), planned_spec.get("selected_template_id")), variant_asset_decision)
        variant_strategy = plan_creative_strategy(intent=intent, production=production, asset_decision=variant_asset_decision, template=variant_template)
        variant_concept = plan_variant_concepts(
            request=request,
            intent=intent,
            strategy=variant_strategy,
            asset_decision=variant_asset_decision,
            template_constraint=variant_template,
            variant_specs=[planned_spec],
        )[0]
        actual_concepts.append(variant_concept)
        spec = concept_to_spec(variant_concept)
        copy_plan = plan_copy(
            request=request,
            context=context,
            intent=intent,
            strategy=variant_strategy,
            production=production,
            fact_store=fact_store,
            concept=variant_concept,
            session_facts=session_facts,
        )
        creative_direction = spec.get("creative_direction") if isinstance(spec.get("creative_direction"), dict) else {}
        prompt = fallback_prompt(context, variant_asset, copy_plan.as_contract(), creative_direction)
        raw = {
            "prompt": prompt,
            "negative_prompt": default_negative_prompt(),
            "copy": copy_plan.as_contract(),
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
            asset_selection=variant_asset.get("selection") or asset.get("selection") or {},
            intent=intent,
            fact_store=fact_store,
            production=production,
            asset_decision=variant_asset_decision,
            template_constraint=variant_template,
            strategy=variant_strategy,
            concept=variant_concept,
            copy_plan=copy_plan,
        )
        variant.validation = validate_full_variant(variant, session_facts=session_facts, db_facts=db_facts, production=production)
        variants.append(variant)
        selected_assets_by_variant.append(str(variant_asset.get("asset_id") or ""))
        errors.extend(variant.validation.errors)
        warnings.extend(variant.validation.warnings)

    validation = ValidationResult(passed=not errors and bool(variants), errors=dedupe(errors), warnings=dedupe(warnings))
    status = enforce_ready_invariant("ready_with_warnings" if validation.warnings else "ready", validation)
    return CompileResponse(
        status=status,  # type: ignore[arg-type]
        capability=request.capability,
        content_job_id=content_job_id,
        format=output_format,
        variant_count=len(variants),
        variation_strategy=request.variation_strategy,
        variants=variants if status in {"ready", "ready_with_warnings", "ready_with_fallback"} else [],
        validation=validation,
        debug={
            "engine": "prompt-engine-v4-registry-planner",
            "intent": intent.model_dump(),
            "production_plan": production.model_dump(),
            "selected_asset_id": asset.get("asset_id"),
            "selected_asset_ids_by_variant": selected_assets_by_variant,
            "planned_concepts": [concept.model_dump() for concept in concepts],
            "concepts": [concept.model_dump() for concept in actual_concepts],
        },
    )


def asset_for_variant(request: CompileRequest, candidates: List[Dict[str, Any]], default_asset: Dict[str, Any], index: int) -> Dict[str, Any]:
    if request.selected_asset_ids or not request.asset_variation or request.variant_count <= 1:
        return default_asset
    pool = asset_variation_pool(candidates, request)
    if not pool:
        return default_asset
    offset = generation_run_offset(request) % len(pool)
    return pool[(index + offset) % len(pool)]


def attach_preferred_assets(specs: List[Dict[str, Any]], request: CompileRequest, candidates: List[Dict[str, Any]], default_asset: Dict[str, Any]) -> List[Dict[str, Any]]:
    if request.selected_asset_ids or not request.asset_variation or request.variant_count <= 1:
        preferred_id = default_asset.get("asset_id")
        return [{**spec, "preferred_asset_id": spec.get("preferred_asset_id") or preferred_id} for spec in specs]
    pool = asset_variation_pool(candidates, request)
    if not pool:
        preferred_id = default_asset.get("asset_id")
        return [{**spec, "preferred_asset_id": spec.get("preferred_asset_id") or preferred_id} for spec in specs]
    out = []
    offset = generation_run_offset(request) % len(pool)
    for index, spec in enumerate(specs):
        preferred = pool[(index + offset) % len(pool)]
        out.append({**spec, "preferred_asset_id": spec.get("preferred_asset_id") or preferred.get("asset_id")})
    return out


def asset_variation_pool(candidates: List[Dict[str, Any]], request: CompileRequest) -> List[Dict[str, Any]]:
    if not candidates:
        return []
    top_score = float((candidates[0].get("selection") or {}).get("score") or candidates[0].get("_score") or 0)
    max_size = max(2, min(len(candidates), request.variant_count + 2, 5))
    pool = []
    for asset in candidates[:max_size]:
        score = float((asset.get("selection") or {}).get("score") or asset.get("_score") or 0)
        rank = int((asset.get("selection") or {}).get("rank") or 999)
        if rank <= 5 and (top_score == 0 or score >= top_score - 45):
            pool.append(asset)
    return pool or candidates[:1]


def asset_for_spec(request: CompileRequest, candidates: List[Dict[str, Any]], default_asset: Dict[str, Any], spec: Dict[str, Any], index: int) -> Dict[str, Any]:
    preferred_id = spec.get("preferred_asset_id")
    if preferred_id:
        for asset in candidates:
            if asset.get("asset_id") == preferred_id:
                return asset
    return asset_for_variant(request, candidates, default_asset, index)


def generation_run_offset(request: CompileRequest) -> int:
    options = request.options if isinstance(request.options, dict) else {}
    seed = str(options.get("generation_run_id") or options.get("generationRunId") or options.get("run_seed") or "").strip()
    if not seed:
        return 0
    return sum((index + 1) * ord(char) for index, char in enumerate(seed)) % 997


def append_variant_distinction(prompt: str, spec: Dict[str, Any]) -> str:
    label = str(spec.get("label") or spec.get("variation_label") or "").strip()
    axis = str(spec.get("variation_axis") or "").strip()
    why = str(spec.get("why_distinct") or "").strip()
    big = str(spec.get("creative_big_idea") or "").strip()
    treatment = str(spec.get("asset_treatment") or "").strip()
    layout = str(spec.get("layout_plan") or "").strip()
    devices = spec.get("graphic_devices") if isinstance(spec.get("graphic_devices"), list) else []
    additions = []
    if label or axis or why:
        additions.append(
            f"Variant distinction requirement: this option is '{label or axis or 'distinct creative route'}'"
            f"{' on the ' + axis + ' axis' if axis else ''}. {why}"
        )
    if big:
        additions.append(f"Creative big idea: {big}")
    if treatment:
        additions.append(f"Asset treatment: {treatment}")
    if layout:
        additions.append(f"Layout plan: {layout}")
    if devices:
        additions.append("Graphic devices: %s" % ", ".join(str(item) for item in devices[:5]))
    if not additions:
        return prompt
    return f"{prompt.rstrip()} {' '.join(additions)}".strip()


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
    asset_selection: Optional[Dict[str, Any]] = None,
    intent: Optional[CreativeIntent] = None,
    fact_store: Optional[GroundedFactStore] = None,
    production: Optional[ProductionPlan] = None,
    asset_decision: Optional[AssetDecision] = None,
    template_constraint: Optional[TemplateConstraint] = None,
    strategy: Optional[CreativeStrategy] = None,
    concept: Optional[VariantConcept] = None,
    copy_plan: Optional[CopyPlan] = None,
) -> VariantOutput:
    runtime_context = context if isinstance(context.get("content_job"), dict) else build_context_pack(request, content_job_id)
    if "session_fact_overrides" not in runtime_context:
        runtime_context["session_fact_overrides"] = [fact.model_dump() if hasattr(fact, "model_dump") else fact for fact in session_facts]
    if intent is None:
        intent = resolve_creative_intent(request, runtime_context, content_job_id)
    if fact_store is None:
        fact_store = build_fact_store(runtime_context, session_facts)  # type: ignore[arg-type]
    if production is None:
        production = resolve_production_plan(request=request, context=runtime_context, intent=intent, fact_store=fact_store)
    if asset_decision is None:
        asset_decision = build_asset_decision(asset, asset_selection or asset.get("selection") or {})
    template = template_by_id(runtime_context.get("visual_templates", []), spec.get("selected_template_id"))
    if not template and not isinstance(runtime_context.get("content_job"), dict):
        template = template_by_id(context.get("visual_templates", []), spec.get("selected_template_id"))
    if template_constraint is None:
        template_constraint = resolve_template_constraint(template, asset_decision)
    if strategy is None:
        strategy = plan_creative_strategy(intent=intent, production=production, asset_decision=asset_decision, template=template_constraint)
    raw_direction = raw_output.get("creative_direction") if isinstance(raw_output.get("creative_direction"), dict) else {}
    creative_direction = locked_template_direction(request, template, spec, raw_direction)
    if concept is None:
        concept = VariantConcept(
            variant_id=str(spec.get("variant_id") or "variant_1"),
            label=str(spec.get("label") or spec.get("variation_label") or "Creative Option"),
            variation_axis=str(spec.get("variation_axis") or request.variation_strategy or "auto"),
            selected_template_id=spec.get("selected_template_id"),
            creative_big_idea=str(spec.get("creative_big_idea") or "Create a distinct grounded creative route."),
            why_distinct=str(spec.get("why_distinct") or "Distinct visual treatment."),
            asset_treatment=str(spec.get("asset_treatment") or asset_decision.asset_use_plan),
            layout_plan=str(spec.get("layout_plan") or "premium composed poster layout"),
            graphic_devices=spec.get("graphic_devices") if isinstance(spec.get("graphic_devices"), list) else [],
            copy_strategy=str(spec.get("copy_strategy") or strategy.copy_strategy),
            structured_levers=creative_direction,
            preferred_asset_id=asset.get("asset_id"),
        )
    raw_copy = raw_output.get("copy") if isinstance(raw_output, dict) else None
    if copy_plan is None:
        copy_plan = plan_copy(
            request=request,
            context=runtime_context,
            intent=intent,
            strategy=strategy,
            production=production,
            fact_store=fact_store,
            concept=concept,
            session_facts=session_facts,  # type: ignore[arg-type]
            raw_copy=raw_copy if isinstance(raw_copy, dict) else None,
        )
    copy_plan = sanitize_copy_plan_for_policy(copy_plan, intent)
    copy = copy_plan.as_contract()
    raw_prompt = strip_internal_tokens(str(raw_output.get("prompt") or "")) if isinstance(raw_output, dict) else ""
    if not raw_prompt:
        raw_prompt = fallback_prompt(runtime_context, asset, copy, creative_direction)
    raw_prompt = append_variant_distinction(raw_prompt, spec)
    compiled_prompt = compile_image_prompt(
        raw_prompt,
        runtime_context,
        asset,
        copy,
        creative_direction,
        include_logo=production.include_logo,
        include_rera_qr=production.include_rera_qr,
        logo_asset_id=production.logo_asset_id,
        rera_qr_asset_id=production.rera_qr_asset_id,
        contact_values=production.contact_plan.values,
        template=template,
        allow_price_claims=price_allowed_for_request(request.brief, content_job_id),
        text_treatment=production.text_treatment,
        intent=intent,
        strategy=strategy,
        production=production,
        asset_decision=asset_decision,
        template_constraint=template_constraint,
        concept=concept,
        copy_plan=copy_plan,
    )
    negative_prompt = clean_negative_prompt(str(raw_output.get("negative_prompt") or default_negative_prompt()), content_job_id)
    if production.text_treatment == "reserve_space":
        negative_prompt = append_negative_prompt_items(
            negative_prompt,
            ["no text", "no typography", "no letters", "no numbers", "no words", "no captions", "no labels", "no placeholder text", "no gibberish text"],
        )
    allowed_facts_for_audit = fact_strings_for_validation(fact_store, db_fact_strings(runtime_context))[:32]
    prompt_audit = audit_and_repair_prompt(
        request=request,
        context=runtime_context,
        intent=intent,
        production=production,
        asset_decision=asset_decision,
        template_constraint=template_constraint,
        strategy=strategy,
        concept=concept,
        copy_plan=copy_plan,
        provider_prompt=compiled_prompt,
        negative_prompt=negative_prompt,
        allowed_facts=allowed_facts_for_audit,
    )
    compiled_prompt = str(prompt_audit.get("repaired_provider_prompt") or compiled_prompt)
    negative_prompt = str(prompt_audit.get("repaired_negative_prompt") or negative_prompt)
    asset_role_plan = build_asset_role_plan(
        asset,
        production.include_logo,
        production.logo_asset_id,
        production.secondary_logo.asset_id,
        production.include_rera_qr,
        production.rera_qr_asset_id,
    )
    contact_rules = {
        "required": bool(production.contact_plan.items),
        "position": production.contact_plan.position,
        "items": production.contact_plan.items,
        "values": production.contact_plan.values,
        "sources": production.contact_plan.sources,
        "missing": production.contact_plan.missing,
        "include_if_grounded": True,
    }
    location_rules = production.location_plan.model_dump()
    render_package = build_render_package(
        output_format,
        asset,
        raw_prompt,
        compiled_prompt,
        negative_prompt,
        copy,
        production.include_logo,
        production.logo_asset_id,
        production.include_rera_qr,
        production.rera_qr_asset_id,
        session_facts,  # type: ignore[arg-type]
        secondary_logo_asset_id=production.secondary_logo.asset_id,
        secondary_logo_rules={
            **production.secondary_logo.rules_extra,
            "required": production.secondary_logo.required,
            "asset_id": production.secondary_logo.asset_id,
            "position": production.secondary_logo.position,
            "source": "exact_asset_only",
            "max_instances": 1,
        },
        logo_position=production.logo_position,
        logo_rules_extra=production.logo_rules_extra,
        rera_position=production.rera_position,
        contact_rules=contact_rules,
        location_rules=location_rules,
        asset_selection=asset_selection or asset.get("selection") or {},
        template_contract=template_constraint.model_dump(),
        text_treatment=production.text_treatment,
    )
    if production.text_treatment != "reserve_space":
        footer = contact_footer_text(production)
        if footer:
            render_package.exact_text_layers["contact_footer"] = footer
        if production.location_plan.value:
            render_package.exact_text_layers["location_label"] = production.location_plan.value
    selected_assets = [
        {"asset_id": entry.asset_id, "label": entry.label, "usage": entry.usage, "grounding_note": entry.grounding_note}
        for entry in asset_role_plan.project_assets
    ]
    available_facts = fact_strings_for_validation(fact_store, db_fact_strings(runtime_context))[:24]
    facts_used_in_prompt = list(prompt_audit.get("facts_used_in_prompt") or facts_present_in_text(available_facts, compiled_prompt))
    visible_copy_text = " ".join(str(v) for v in copy.values())
    facts_used_in_visible_copy = list(prompt_audit.get("facts_used_in_visible_copy") or facts_present_in_text(available_facts, visible_copy_text))
    facts_used_in_visible_copy = dedupe(facts_used_in_visible_copy + price_claims_present_in_text(visible_copy_text))
    commercial_review = commercial_review_required(runtime_context, visible_copy_text, session_facts)
    actually_used = dedupe(facts_used_in_prompt + facts_used_in_visible_copy)
    fact_audit = FactAudit(
        available_project_facts=available_facts,
        facts_used_in_prompt=facts_used_in_prompt,
        facts_used_in_visible_copy=facts_used_in_visible_copy,
        facts_used_as_constraints=[fact for fact in actually_used if fact not in facts_used_in_visible_copy][:8],
        project_db_facts_used=actually_used,
        brief_declared_facts_used=session_facts,  # type: ignore[arg-type]
        llm_inferred_claims=[],
        requires_client_review=any(getattr(fact, "requires_client_review", False) for fact in session_facts) or production.contact_plan.requires_client_review or commercial_review,
    )
    return VariantOutput(
        variant_id=str(spec.get("variant_id") or concept.variant_id or "variant_1"),
        variation_label=str(spec.get("label") or spec.get("variation_label") or concept.label or "Creative Option"),
        variation_axis=str(spec.get("variation_axis") or request.variation_strategy or "auto"),
        selected_template_id=spec.get("selected_template_id"),
        creative_direction=creative_direction,
        selected_assets=selected_assets,
        asset_role_plan=asset_role_plan,
        copy_contract=copy,
        visible_text_allowed=[] if production.text_treatment == "reserve_space" else visible_text_allowed(copy, session_facts),  # type: ignore[arg-type]
        prompt=raw_prompt,
        compiled_prompt=compiled_prompt,
        negative_prompt=negative_prompt,
        text_policy={
            "copy_mode": request.copy_mode,
            "text_strategy": production.text_strategy,
            "text_treatment": production.text_treatment,
            "editable_layers": True,
            "preview_text_visible": production.text_treatment != "reserve_space",
            "reserved_space_for_later_copy": production.text_treatment == "reserve_space",
        },
        layout_contract={
            "mode": "single_post",
            "renderer_policy": "Provider prompt is final art direction; exact assets/data must stay grounded and must not be invented.",
            "preset_key": production.preset_id,
            "preset_name": production.preset_name,
            "intent": intent.model_dump(),
            "creative_strategy": strategy.model_dump(),
            "variant_concept": concept.model_dump(),
            "prompt_audit": {key: value for key, value in prompt_audit.items() if key != "raw_model_result"},
            "asset_visual_summary": render_package.asset_visual_summary,
            "asset_selection": render_package.asset_selection,
            "template_contract": render_package.template_contract,
            "forbidden_ai_generation": render_package.forbidden_ai_generation,
            "logo_layer": {
                **production.logo_rules_extra,
                "required": production.include_logo,
                "asset_id": production.logo_asset_id if production.include_logo else None,
                "max_instances": 1,
                "source": "exact_asset_only",
                "position": production.logo_position,
            },
            "secondary_logo_layer": {
                **production.secondary_logo.rules_extra,
                "required": production.secondary_logo.required,
                "asset_id": production.secondary_logo.asset_id,
                "max_instances": 1,
                "source": "exact_asset_only",
                "position": production.secondary_logo.position,
                "missing": production.secondary_logo.missing,
            },
            "rera_qr_layer": {
                "required": production.include_rera_qr,
                "asset_id": production.rera_qr_asset_id if production.include_rera_qr else None,
                "max_instances": 1,
                "source": "exact_asset_only",
                "render_mode": "composite_rera_block",
                "position": production.rera_position,
                "size": "compact_badge",
                "height_match": "logo_height",
                "max_width_ratio": 0.25,
                "avoid_full_width_banner": True,
                "avoid_footer_placement": True,
                "never_generate_qr": True,
                "triggered_by_preset": production.rera_triggered_by_preset,
            },
            "contact_layer": contact_rules,
            "location_layer": location_rules,
        },
        render_package=render_package,
        fact_audit=fact_audit,
        validation=ValidationResult(passed=True),
    )


def template_by_id(templates: Any, template_id: Any) -> Dict[str, Any]:
    if not isinstance(templates, list) or not template_id:
        return {}
    for template in templates:
        if isinstance(template, dict) and template.get("template_id") == template_id:
            return template
    return {}


def locked_template_direction(request: CompileRequest, template: Dict[str, Any], spec: Dict[str, Any], raw_direction: Dict[str, Any]) -> Dict[str, Any]:
    locked_template_ids = {str(value) for value in [request.visual_template_id, *request.visual_template_ids] if value}
    selected_template_id = str(spec.get("selected_template_id") or "")
    template_signature = template.get("lever_signature") if isinstance(template.get("lever_signature"), dict) else {}
    spec_direction = spec.get("creative_direction") if isinstance(spec.get("creative_direction"), dict) else {}
    if selected_template_id and selected_template_id in locked_template_ids:
        return dict(template_signature or spec_direction)
    creative_direction = dict(spec_direction)
    creative_direction.update(raw_direction)
    return creative_direction



def commercial_pricing_guard(request: CompileRequest, context: Dict[str, Any], content_job_id: str, session_facts: List[Any]) -> tuple[List[str], List[str]]:
    if content_job_id != "pricing_ad":
        return [], []
    options = request.options if isinstance(request.options, dict) else {}
    if options.get("allowUnverifiedPricing") or options.get("allow_unverified_pricing") or options.get("clientApprovedPricing") or options.get("client_approved_pricing"):
        return [], ["Commercial pricing was allowed by explicit request option and should be client-reviewed before publishing."]
    has_client_price = any(getattr(fact, "field", "") in {"price", "emi"} and getattr(fact, "value", "") for fact in session_facts)
    if has_client_price:
        return [], ["Pricing/offer value was supplied in the current brief and requires client review before publishing."]
    profile = project_profile(context)
    commercial_text = " ".join(str(x) for x in [
        profile.get("commercialDataConfidence"),
        profile.get("commercialClaimsToVerify"),
        profile.get("legalNotes"),
        profile.get("priceRangeByConfig"),
        profile.get("startingPrice"),
        profile.get("paymentPlanSummary"),
    ])
    has_pricing_data = bool(re.search(r"(?:₹|rs\.?|inr|price|pricing|payment|offer|emi|cr|crore|lakh|lac)", commercial_text, flags=re.I))
    verify_required = bool(re.search(r"verify|client confirms|do not use pricing|before ad use|needs verification", commercial_text, flags=re.I))
    brief_requires_verified = bool(re.search(r"verified|client[- ]provided|client provided|approved|confirmed", request.brief or "", flags=re.I))
    if has_pricing_data and verify_required:
        reason = "Pricing details are available in the project profile but are marked verify-before-ad-use/client-confirmation required. Provide approved pricing in the brief or set allowUnverifiedPricing/clientApprovedPricing after review."
        return [reason], ["Pricing ad requires verified or client-provided commercial details before generation."]
    if brief_requires_verified and not has_client_price:
        return ["The brief requested verified/client-provided pricing, but no verified price or offer was supplied in the brief."], []
    return [], []


def sanitize_copy_plan_for_policy(copy_plan: CopyPlan, intent: CreativeIntent) -> CopyPlan:
    if intent.content_job_id == "construction_update" and intent.construction_visual_mode == "visualized_progress_from_project_truth":
        copy_plan.headline = _sanitize_construction_copy(copy_plan.headline, intent)
        copy_plan.subheadline = _sanitize_construction_copy(copy_plan.subheadline, intent)
        copy_plan.cta = _sanitize_construction_copy(copy_plan.cta, intent)
    return copy_plan


def _sanitize_construction_copy(text: str, intent: CreativeIntent) -> str:
    out = str(text or "")
    replacements = {
        r"\bnow\s+50%\s+(?:complete|completed)\b": "visualized at approximately 50% construction progress",
        r"\b50%\s+(?:complete|completed)\b": "visualized at approximately 50% construction progress",
        r"50%\s*पूर्ण\s*(?:हो चुका है|है|हो चुकी है)?": "लगभग 50% निर्माण-चरण में विज़ुअलाइज़ किया गया है",
        r"\bactual current site photo(?:graph)?\b": "construction-stage visualization",
        r"\bverified latest progress\b": "visualized construction stage",
        r"\bcaptured recently\b": "visualized from approved project design",
        r"\bactively being built\b": "visualized in a believable mid-construction stage",
    }
    for pattern, repl in replacements.items():
        out = re.sub(pattern, repl, out, flags=re.I)
    return re.sub(r"\s+", " ", out).strip()


def contact_footer_text(production: ProductionPlan) -> str:
    values = production.contact_plan.values or {}
    if not values or not production.contact_plan.items:
        return ""
    parts: List[str] = []
    for key in production.contact_plan.items:
        value = str(values.get(key) or "").strip()
        if value:
            parts.append(value)
    return " | ".join(parts)


def commercial_review_required(context: Dict[str, Any], visible_text: str, session_facts: List[Any]) -> bool:
    if not price_claims_present_in_text(visible_text):
        return False
    if any(getattr(fact, "field", "") in {"price", "emi"} and getattr(fact, "requires_client_review", False) for fact in session_facts):
        return True
    profile = project_profile(context)
    commercial_text = " ".join(str(x) for x in [profile.get("commercialDataConfidence"), profile.get("commercialClaimsToVerify"), profile.get("legalNotes"), profile.get("priceRangeByConfig"), profile.get("startingPrice")])
    return bool(re.search(r"verify|client confirms|before ad use|needs verification", commercial_text, flags=re.I))


def price_claims_present_in_text(text: str) -> List[str]:
    out: List[str] = []
    patterns = [
        r"₹\s?[0-9][0-9,.]*(?:\s?(?:lakh|lac|cr|crore|k))?",
        r"[0-9][0-9,.]*\s?(?:lakh|lac|cr|crore)\b",
        r"[0-9][0-9,.]*\s?करोड़",
        r"[0-9][0-9,.]*\s?लाख",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, text or "", flags=re.I):
            value = match.group(0).strip()
            if value and value not in out:
                out.append(value)
    return out


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
    if any(term in text for term in ["construction", "progress", "site update"]):
        return "construction_update"
    return "project_launch"


def validation_from_dict(value: Dict[str, Any]) -> ValidationResult:
    if not isinstance(value, dict):
        return ValidationResult(passed=True)
    errors = value.get("errors") if isinstance(value.get("errors"), list) else []
    warnings = value.get("warnings") if isinstance(value.get("warnings"), list) else []
    return ValidationResult(passed=bool(value.get("passed", not errors)), errors=[str(error) for error in errors if str(error).strip()], warnings=[str(warning) for warning in warnings if str(warning).strip()])


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
    return "No facade signage, no distorted architecture, no invented surroundings, no duplicate brand marks, no fake compliance marks, no unsupported facts."


def clean_negative_prompt(value: str, content_job_id: str = "") -> str:
    text = strip_internal_tokens(value)
    chunks = re.split(r"[,;\n]+", text)
    seen = set()
    cleaned: List[str] = []
    blocked_for_job = set()
    additions: List[str] = []
    if content_job_id == "construction_update":
        # Construction-update generations intentionally may visualize construction cues.
        # Block only unsafe factual/claim language, not scaffolding/cranes themselves.
        blocked_for_job.update({"actual latest progress", "captured recently", "verified current progress", "possession soon", "ready to move"})
        additions.extend(["no completed-building launch render", "no fake current progress claims", "no verified latest-site-photo claim unless supplied"])
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


def append_negative_prompt_items(value: str, items: List[str]) -> str:
    chunks = [chunk.strip() for chunk in re.split(r"[,;\n]+", value) if chunk.strip()]
    seen = {chunk.lower() for chunk in chunks}
    for item in items:
        key = item.lower()
        if key not in seen:
            chunks.append(item)
            seen.add(key)
    return ", ".join(chunks)[:900].rstrip(" ,;")


def dspy_available() -> bool:
    return bool(os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY"))


def facts_present_in_text(facts: List[str], text: str) -> List[str]:
    lowered = (text or "").lower()
    out: List[str] = []
    for fact in facts:
        value = str(fact or "").strip()
        if value and value.lower() in lowered and value not in out:
            out.append(value)
    return out
