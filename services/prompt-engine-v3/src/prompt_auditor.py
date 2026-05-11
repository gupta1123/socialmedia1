from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Tuple

from .planning_schemas import AssetDecision, CopyPlan, CreativeIntent, CreativeStrategy, ProductionPlan, TemplateConstraint, VariantConcept
from .prompt_compiler import remove_price_claims, remove_unsafe_commercial_claims, repair_structural_change_requests, strip_internal_tokens


def dspy_available() -> bool:
    import os
    return bool(os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY"))


class PromptAuditResult(Dict[str, Any]):
    pass


def audit_and_repair_prompt(
    *,
    request: Any,
    context: Dict[str, Any],
    intent: CreativeIntent,
    production: ProductionPlan,
    asset_decision: AssetDecision,
    template_constraint: TemplateConstraint,
    strategy: CreativeStrategy,
    concept: VariantConcept,
    copy_plan: CopyPlan,
    provider_prompt: str,
    negative_prompt: str,
    allowed_facts: Iterable[str] = (),
    prompt_format: str = "legacy",
) -> Dict[str, Any]:
    payload = build_audit_payload(
        request=request,
        context=context,
        intent=intent,
        production=production,
        asset_decision=asset_decision,
        template_constraint=template_constraint,
        strategy=strategy,
        concept=concept,
        copy_plan=copy_plan,
        provider_prompt=provider_prompt,
        negative_prompt=negative_prompt,
        allowed_facts=list(allowed_facts),
        prompt_format=prompt_format,
    )
    model_result: Dict[str, Any] = {}
    if dspy_available() and not _option(request, "disable_prompt_auditor"):
        try:
            from .dspy_engine import DspyPromptProgram

            program = DspyPromptProgram()
            model_result = program.audit_and_repair_prompt(payload)
        except Exception as exc:
            model_result = {
                "status": "fallback",
                "issues_found": [],
                "internal_warnings": [f"AI prompt auditor failed: {type(exc).__name__}: {exc}"],
            }
    issues = _coerce_issues(model_result.get("issues_found"))
    changes = [str(item) for item in model_result.get("changes_made") or [] if str(item).strip()]
    repaired_prompt = str(model_result.get("repaired_provider_prompt") or provider_prompt or "")
    if prompt_format == "structured_v2" and not _looks_like_structured_prompt(repaired_prompt):
        repaired_prompt = provider_prompt or ""
        changes.append("Ignored non-structured AI prompt-auditor rewrite for structured_v2 prompt.")
    repaired_negative = str(model_result.get("repaired_negative_prompt") or negative_prompt or "")
    prompt2, negative2, det_issues, det_changes = deterministic_repair(
        repaired_prompt,
        repaired_negative,
        context=context,
        intent=intent,
        production=production,
        asset_decision=asset_decision,
        copy_plan=copy_plan,
        allowed_facts=list(allowed_facts),
        prompt_format=prompt_format,
    )
    issues.extend(det_issues)
    changes.extend(det_changes)
    status = "repaired" if changes else "clean"
    if any(item.get("severity") == "error" for item in issues):
        status = "repaired"  # final deterministic validator will decide if still blocking
    return {
        "status": status,
        "repaired_provider_prompt": prompt2,
        "repaired_negative_prompt": negative2,
        "issues_found": issues,
        "changes_made": _dedupe(changes),
        "remaining_risks": [str(item) for item in model_result.get("remaining_risks") or [] if str(item).strip()],
        "facts_used_in_prompt": _facts_present(list(allowed_facts), prompt2),
        "facts_used_in_visible_copy": _facts_present(list(allowed_facts), " ".join(copy_plan.as_contract().values())),
        "model_auditor_used": bool(model_result) and "fallback" not in str(model_result.get("status", "")),
        "raw_model_result": model_result,
    }


def build_audit_payload(**kwargs: Any) -> Dict[str, Any]:
    intent: CreativeIntent = kwargs["intent"]
    production: ProductionPlan = kwargs["production"]
    asset_decision: AssetDecision = kwargs["asset_decision"]
    copy_plan: CopyPlan = kwargs["copy_plan"]
    context: Dict[str, Any] = kwargs["context"]
    return {
        "instructions": {
            "role": "Final prompt auditor and repairer for a real-estate social creative engine.",
            "goal": "Preserve the creative idea while removing contradictions, unsafe claims, wrong post-type assumptions, and asset/template leakage. Return JSON only.",
            "hard_rules": [
                "Do not invent price, RERA, phone, website, possession, offers, milestones, or project facts.",
                "If festive_greeting and festival_visual_scope is brand_only, remove building/project/facade/tower/amenity/construction language unless explicitly requested.",
                "If construction visual mode is visualized_progress_from_project_truth, describe it as a construction-stage visualization, not an actual/current site photo.",
                "If no selected asset exists, do not mention a supplied project reference image.",
                "If text is rendered, include canonical exact_text_layers only; never rewrite, translate, append, or reintroduce stale visible copy. If contact is requested and grounded, include it as a canonical footer line.",
                "If a selected/custom/curated palette is present in context, preserve that palette as the creative color direction; do not replace it with the brand profile palette. Logo colors remain protected.",
                "If a logo asset is provided, the image model should use the supplied logo reference exactly once as a flat brand mark and must not invent, alter, duplicate, recolor, or place it on architecture. If a RERA QR is composited after generation, ask the image model to leave a clean zone, not reproduce the QR.",
            ],
        },
        "content_job_id": intent.content_job_id,
        "festival_visual_scope": intent.festival_visual_scope,
        "construction_visual_mode": intent.construction_visual_mode,
        "construction_progress_percent": intent.construction_progress_percent,
        "brief_intent_plan": intent.brief_intent_plan.model_dump(),
        "project_id": (context.get("project") or {}).get("id") if isinstance(context.get("project"), dict) else None,
        "brand": context.get("brand"),
        "project": context.get("project"),
        "selected_asset": asset_decision.profile.model_dump() if asset_decision.profile else asset_decision.selection,
        "template": kwargs["template_constraint"].model_dump() if kwargs.get("template_constraint") else {},
        "strategy": kwargs["strategy"].model_dump() if kwargs.get("strategy") else {},
        "concept": kwargs["concept"].model_dump() if kwargs.get("concept") else {},
        "creative_route": context.get("creative_route") if isinstance(context, dict) else {},
        "copy": copy_plan.as_contract(),
        "prompt_format": kwargs.get("prompt_format") or "legacy",
        "text_strategy": production.text_strategy,
        "text_treatment": production.text_treatment,
        "logo": {"include": production.include_logo, "asset_id": production.logo_asset_id, "sent_to_model": True, "composited_after": False},
        "rera_qr": {"include": production.include_rera_qr, "asset_id": production.rera_qr_asset_id, "composited_after": True},
        "contact": production.contact_plan.model_dump(),
        "allowed_facts": kwargs.get("allowed_facts") or [],
        "draft_provider_prompt": kwargs["provider_prompt"],
        "draft_negative_prompt": kwargs["negative_prompt"],
    }


def deterministic_repair(
    prompt: str,
    negative_prompt: str,
    *,
    context: Dict[str, Any],
    intent: CreativeIntent,
    production: ProductionPlan,
    asset_decision: AssetDecision,
    copy_plan: CopyPlan,
    allowed_facts: List[str],
    prompt_format: str = "legacy",
) -> Tuple[str, str, List[Dict[str, str]], List[str]]:
    issues: List[Dict[str, str]] = []
    changes: List[str] = []
    text = strip_internal_tokens(prompt or "")
    neg = strip_internal_tokens(negative_prompt or "")
    text = remove_unsafe_commercial_claims(text)
    text = repair_structural_change_requests(text, getattr(intent, "brief_summary", ""))
    is_structured = prompt_format == "structured_v2"

    if not is_structured:
        before_palette = text
        text = _ensure_brand_palette(text, context)
        if text != before_palette:
            changes.append("Inserted brand palette instruction into final provider prompt.")
    else:
        before_palette = text
        text = _enforce_selected_palette_for_structured(text, context)
        if text != before_palette:
            changes.append("Restored selected color palette instruction after prompt audit.")

    before = text
    text = remove_price_claims(text)
    if text != before:
        changes.append("Removed price/offer amount claims from provider prompt.")
        issues.append(_issue("warning", "price_claim_removed", "Removed price-like language because price claims were not explicitly allowed."))

    if intent.content_job_id == "festive_greeting" and intent.festival_visual_scope == "brand_only":
        before = text
        text = _repair_brand_only_festival(text, copy_plan, production)
        neg = _append_negative(neg, ["no building", "no tower", "no facade", "no project render", "no construction scene", "no amenities", "no RERA", "no pricing"])
        if text != before:
            changes.append("Repaired brand-only festival prompt to remove project/building assumptions.")
            issues.append(_issue("warning", "festival_building_language_repaired", "Brand-only festive prompt contained project/building language and was repaired."))

    if intent.content_job_id == "construction_update" and intent.construction_visual_mode == "visualized_progress_from_project_truth":
        before = text
        text = _repair_construction_visualization(text, intent)
        neg = _append_negative(neg, ["actual current site photo", "captured recently", "verified latest progress", "possession soon", "changed tower design", "extra towers"])
        if text != before:
            changes.append("Repaired construction prompt to safe visualization language.")
            issues.append(_issue("warning", "construction_visualization_language_repaired", "Construction prompt was repaired to avoid claiming actual current progress."))

    if intent.brief_intent_plan.primary_visual_goal == "generated_lifestyle_scene":
        before = text
        text = _repair_generated_lifestyle_scene(text, intent, asset_decision)
        neg = _remove_negative_items(neg, _requested_lifestyle_negative_removals(intent))
        neg = _append_negative(neg, ["facade-only poster", "static tower crop", "selected reference as hero", "tower cutout as main visual"])
        if text != before:
            changes.append("Repaired prompt to prioritize the requested generated lifestyle scene over the selected reference asset.")
            issues.append(_issue("warning", "lifestyle_scene_priority_repaired", "Brief requested a lifestyle scene; prompt was repaired so selected references are context grounding, not the hero visual."))

    before_route_text, before_route_neg = text, neg
    text, neg = _repair_creative_route_prompt(text, neg, context)
    if text != before_route_text or neg != before_route_neg:
        changes.append("Applied creative-route guardrails for grounded creative freedom.")
        issues.append(_issue("warning", "creative_route_guardrails_applied", "Prompt was adjusted to preserve the selected creative route while keeping factual grounding."))

    if is_structured:
        if production.text_treatment == "reserve_space":
            neg = _append_negative(neg, ["no text", "no typography", "no letters", "no numbers", "no labels", "no placeholder text"])
        else:
            before = text
            text = _ensure_exact_text(text, copy_plan, production)
            if text != before:
                changes.append("Re-applied canonical exact visible text instructions for structured prompt.")
    elif production.text_treatment != "reserve_space":
        before = text
        text = _ensure_exact_text(text, copy_plan, production)
        if text != before:
            changes.append("Inserted explicit exact visible text instructions.")
    else:
        before = text
        text = _ensure_no_text_mode(text)
        neg = _append_negative(neg, ["no text", "no typography", "no letters", "no numbers", "no labels", "no placeholder text"])
        if text != before:
            changes.append("Repaired reserve-space text instruction.")

    if is_structured:
        pass
    elif production.include_logo:
        before = text
        text = _model_logo_instruction(text, production)
        if text != before:
            changes.append("Changed logo instruction to image-model logo reference behavior.")
    else:
        text = _remove_positive_logo_language(text)

    if not is_structured and production.secondary_logo.required:
        before = text
        text = _secondary_logo_instruction(text, production)
        if text != before:
            changes.append("Inserted secondary logo placement instruction.")

    if not is_structured and len(production.additional_logos) > 1:
        before = text
        text = _additional_logo_instruction(text, production)
        if text != before:
            changes.append("Inserted additional logo placement instructions.")

    if not is_structured and production.include_rera_qr:
        before = text
        text = _composited_rera_instruction(text, production)
        if text != before:
            changes.append("Changed RERA QR instruction to deterministic compositing / safe zone behavior.")

    if not is_structured and production.contact_plan.values:
        before = text
        text = _contact_position_instruction(text, production)
        if text != before:
            changes.append("Inserted contact placement instruction.")

    if not is_structured and production.location_plan.required:
        before = text
        text = _location_instruction(text, production)
        if text != before:
            changes.append("Inserted location placement instruction.")

    if not asset_decision.selected_asset_id and "supplied project" in text.lower():
        before = text
        text = re.sub(r"Use the supplied project[^.]*\.\s*", "No supplied project visual asset is required for this concept. ", text, flags=re.I)
        if text != before:
            changes.append("Removed supplied-project-reference language because no primary asset was selected.")

    return _clean(text), _clean(neg), issues, changes


def _repair_generated_lifestyle_scene(text: str, intent: CreativeIntent, asset_decision: AssetDecision) -> str:
    plan = intent.brief_intent_plan
    if not plan.scene_subject:
        return text
    guard = (
        f"Lifestyle scene priority: the main hero visual must show {plan.scene_subject}. "
        "Use any supplied project/reference asset only as project/context grounding for identity and style; "
        "do not recreate the selected reference as the main hero, facade crop, tower cutout, static architecture poster, or asset-only composition."
    )
    if plan.environment_required:
        guard += " Include the requested setting cues: %s." % ", ".join(plan.environment_required[:6])
    if plan.people_required:
        guard += " People/family/couple presence is required when requested by the brief."
    repaired = text
    repaired = re.sub(
        r"Do not generate (?:a |an )?(?:generated )?(?:lifestyle scene|scene)[^.]*\.\s*",
        "",
        repaired,
        flags=re.I,
    )
    for item in _requested_lifestyle_negative_removals(intent):
        if item.startswith("no "):
            continue
        if item.lower() in {"generated lifestyle scene", "lifestyle scene", "township", "sahyadri mountains", "golden hour", "peaceful"}:
            repaired = re.sub(rf"\bdo not (?:show|include|use|create|generate)[^.]*{re.escape(item)}[^.]*\.\s*", "", repaired, flags=re.I)
    for pattern in [
        r"Use the supplied [^.]* asset as the factual (?:visual )?anchor\.\s*",
        r"Use the supplied [^.]* asset as the factual hero visual\.\s*",
        r"Use the supplied [^.]* as the truthful visual anchor[^.]*\.\s*",
    ]:
        repaired = re.sub(pattern, guard + " ", repaired, flags=re.I)
    if "lifestyle scene priority:" not in repaired.lower():
        repaired = f"{guard} {repaired}".strip()
    if asset_decision.reference_role == "context_grounding" and "context grounding" not in repaired.lower():
        repaired += " Selected references are context grounding only, not the final composition target."
    return repaired


def _requested_lifestyle_negative_removals(intent: CreativeIntent) -> List[str]:
    plan = intent.brief_intent_plan
    removals = ["no invented surroundings", "no invented factual project surroundings", "no random people", "generated lifestyle scene", "lifestyle scene"]
    removals.extend(plan.environment_required)
    removals.extend(plan.must_include)
    if plan.scene_subject:
        removals.extend(["family", "families", "couple", "people", "township", "mountains", "sahyadri mountains", "golden hour", "peaceful"])
    return _dedupe([str(item) for item in removals if str(item).strip()])


def _repair_creative_route_prompt(text: str, negative_prompt: str, context: Dict[str, Any]) -> Tuple[str, str]:
    route = context.get("creative_route") if isinstance(context, dict) else {}
    if not isinstance(route, dict) or not route.get("key"):
        return text, negative_prompt
    key = str(route.get("key") or "")
    if key == "editorial_grounded_post":
        return text, negative_prompt
    mandatory = str(route.get("mandatory_mechanic") or "").strip()
    abstract_allowed = bool(route.get("abstract_environment_allowed", False))
    people_allowed = bool(route.get("people_allowed", False))
    guard = ""
    if key == "building_social_poster":
        guard = (
            "Creative route safety: one dominant poster device must visibly drive the composition; "
            "use the building as a truthful poster object with cutout/crop/masking/layering/type interaction as appropriate, "
            "not a simple building + logo + text layout."
        )
    elif key == "site_visit_lifestyle_invite":
        guard = "Creative route safety: lifestyle experience and site-visit action must lead; project assets are grounding/context only, not a facade-only hero."
    elif key == "site_visit_abstract_invitation":
        guard = "Creative route safety: use a private-arrival, invitation, appointment, route, threshold, or access metaphor as the main visual idea."
    elif key.startswith("festival_"):
        guard = "Creative route safety: festival symbolism, respectful cultural mood, or festive lifestyle must lead; do not invent project events, offers, or physical decorations."
    elif key == "grounded_abstract_post":
        guard = "Creative route safety: one symbolic, graphic, or atmospheric idea must lead while approved facts remain exact."

    out = text
    out = _strip_route_incompatible_sentences(out, key)
    if guard and guard.lower() not in out.lower():
        out = f"{guard} {out}".strip()
    if mandatory and mandatory.lower() not in out.lower():
        out = f"{out.rstrip()} Mandatory creative mechanic: {mandatory}."

    neg = negative_prompt
    if abstract_allowed:
        neg = _remove_negative_items(neg, ["no invented surroundings", "no abstract background", "no gradients", "no symbolic shapes", "no texture"])
        neg = _append_negative(neg, ["no invented factual project surroundings", "no unsupported factual amenities", "no fake factual claims"])
    if not people_allowed:
        neg = _append_negative(neg, ["no random people"])
    return out, neg


def _strip_route_incompatible_sentences(text: str, key: str) -> str:
    if not text or key == "editorial_grounded_post":
        return text
    bad_terms = {
        "building_social_poster": ["magazine spread", "brochure", "basic flyer", "simple image window", "paper depth", "thin frame"],
        "site_visit_lifestyle_invite": ["facade-only", "facade only", "tower cutout", "tower hero", "building as hero", "architecture-led hero", "magazine spread", "paper depth", "thin frame"],
        "site_visit_abstract_invitation": ["magazine spread", "mimicking a high-end editorial layout", "delicate border", "thin frame", "thin_frame", "paper depth", "paper_depth", "hero shot", "significant portion of the layout", "premium serif typeface", "editorial aesthetic", "editorial site visit", "facade crop", "tower cutout"],
        "grounded_abstract_post": ["proof orbit", "basic flyer"],
    }
    if key.startswith("festival_"):
        bad = ["proof orbit", "pricing", "offer-led", "site visit", "rera block", "construction update"]
    else:
        bad = bad_terms.get(key, [])
    if not bad:
        return text
    chunks = re.split(r"(?<=[.!?])\s+", text)
    kept: List[str] = []
    for chunk in chunks:
        lowered = chunk.lower()
        if any(term in lowered for term in bad) and not re.search(r"\b(avoid|do not|not |never|no )", lowered):
            continue
        kept.append(chunk)
    return _clean(" ".join(kept))


def _enforce_selected_palette_for_structured(text: str, context: Dict[str, Any]) -> str:
    instruction = _selected_palette_instruction(context)
    if not instruction:
        return text
    # Replace any existing Brand palette / Color palette section introduced by
    # the AI auditor, including incorrect repairs from curated palettes to Brand
    # Profile. If there is no section, append the canonical selected palette.
    patterns = [
        r"Brand palette:\s*[\s\S]*?(?=\s(?:Mood and negative constraints:|Render only this exact visible text:|Text reserve-space rule:|Brand, compliance, and contact rules:|$))",
        r"Color palette (?:direction|lock):[^.]*\.[ ]*",
        r"Brand color direction:[^.]*\.[ ]*",
    ]
    out = text
    replaced = False
    for pattern in patterns:
        next_out, count = re.subn(pattern, "Brand palette:\n" + instruction + " ", out, flags=re.I)
        if count:
            out = next_out
            replaced = True
            break
    if not replaced:
        out = out.rstrip() + " Brand palette:\n" + instruction
    return _clean(out)


def _selected_palette_instruction(context: Dict[str, Any]) -> str:
    selected = context.get("selected_color_palette") if isinstance(context.get("selected_color_palette"), dict) else {}
    colors = _extract_palette_colors(selected.get("colors"))
    if not colors:
        return ""
    mode = str(selected.get("mode") or "selected").lower()
    strength = str(selected.get("strength") or "soft").lower()
    name = str(selected.get("palette_name") or selected.get("paletteName") or selected.get("name") or selected.get("source") or "selected palette").strip()
    prefix = "Color palette lock" if strength == "hard" else "Color palette direction"
    source = "selected curated palette" if mode == "curated" else ("selected custom palette" if mode == "custom" else "selected palette")
    return (
        f"{prefix}: use these colors from the {name or source} as the main creative color direction — {', '.join(colors[:8])}. "
        "Apply them to backgrounds, abstract graphic shapes, gradients, CTA surfaces, typography accents, and premium design layers. "
        "Do not recolor supplied logos; preserve supplied logo colors and keep realistic people/buildings/photos truthful; do not overwrite this selected palette with the brand profile palette."
    )


def _extract_palette_colors(value: Any) -> List[str]:
    if isinstance(value, str):
        match = re.match(r"^#?[0-9a-fA-F]{6}$", value.strip())
        return [("#" + value.strip().lstrip("#")).upper()] if match else []
    if isinstance(value, list):
        colors: List[str] = []
        for item in value:
            colors.extend(_extract_palette_colors(item))
        return list(dict.fromkeys(colors))
    if isinstance(value, dict):
        colors: List[str] = []
        for item in value.values():
            colors.extend(_extract_palette_colors(item))
        return list(dict.fromkeys(colors))
    return []


def _ensure_brand_palette(text: str, context: Dict[str, Any]) -> str:
    lowered = str(text or "").lower()
    if any(marker in lowered for marker in ["brand color direction:", "color palette direction:", "color palette lock:", "brand palette:"]):
        return text
    try:
        from .prompt_sections import _brand_palette_section
        palette = _brand_palette_section(context)
    except Exception:
        palette = "Brand color direction: use a restrained premium palette drawn from the brand identity, with warm neutrals, editorial contrast, and tasteful accent color. Do not recolor or modify the supplied logo."
    if not palette:
        return text
    return _clean((text or "").rstrip() + " " + palette)


def _looks_like_structured_prompt(text: str) -> bool:
    lowered = str(text or "").lower()
    required = [
        "creative objective:",
        "asset truth:",
        "brand, compliance, and contact rules:",
    ]
    has_text_section = "render only this exact visible text:" in lowered or "text rendering rule:" in lowered
    return all(marker in lowered for marker in required) and has_text_section

def _repair_brand_only_festival(text: str, copy_plan: CopyPlan, production: ProductionPlan) -> str:
    replacements = [
        (r"Use the supplied project visual asset[^.]*\.", "No project or building image is required; create a brand-led festive poster using symbolic occasion motifs."),
        (r"Use the supplied .*? as (?:the )?(?:factual|architectural|project) visual anchor[^.]*\.", "Create a brand-led festive poster using symbolic occasion motifs."),
        (r"Use .*? as architectural truth[^.]*\.", "Use refined festive symbolism as the visual foundation."),
        (r"Preserve (?:the )?(?:tower|building|facade|façade|massing)[^.]*\.", ""),
        (r"\b(?:tower|building|facade|façade|project render|construction scene|amenity render)\b", "festive motif"),
    ]
    for pattern, repl in replacements:
        text = re.sub(pattern, repl, text, flags=re.I)
    intro = "No project or building image is required."
    if intro.lower() not in text.lower():
        text = intro + " " + text
    guard = "Brand-only festive rule: do not introduce a building, tower, facade, project render, construction scene, amenity, pricing, possession, or project-specific claim unless explicitly requested."
    if guard.lower() not in text.lower():
        text += " " + guard
    return text


def _repair_construction_visualization(text: str, intent: CreativeIntent) -> str:
    replacements = {
        r"\bactual current site photo(?:graph)?\b": "construction-stage visualization",
        r"\bactual current site progress\b": "visualized construction stage",
        r"\bcurrent construction progress\b": "visualized construction stage",
        r"\bverified latest progress\b": "visualized construction stage",
        r"\blatest progress\b": "visualized construction stage",
        r"\bcaptured recently\b": "visualized from approved project design",
        r"\bunder construction photograph\b": "under-construction visualization",
        r"\breal construction photograph\b": "construction-stage visualization",
        r"\badvancing rapidly\b": "taking shape",
        r"\bactively being built\b": "visualized in a believable mid-construction stage",
        r"\bfuture reality that is actively being built\b": "approved architecture shown in a carefully visualized construction stage",
        r"\bnow\s+50%\s+(?:complete|completed)\b": "visualized at approximately 50% construction progress",
        r"\b50%\s+(?:complete|completed)\b": "visualized at approximately 50% construction progress",
        r"50%\s*पूर्ण\s*(?:हो चुका है|है|हो चुकी है)?": "लगभग 50% निर्माण-चरण में विज़ुअलाइज़ किया गया है",
    }
    for pattern, repl in replacements.items():
        text = re.sub(pattern, repl, text, flags=re.I)
    text = re.sub(
        r"This is a construction-stage visualization based on approved design, not an? construction-stage visualization or verified visualized progress concept report\.?",
        "This is a construction-stage visualization based on the approved design, not an actual current site photograph or verified latest progress report.",
        text,
        flags=re.I,
    )
    guard = (
        f"Construction visualization rule: show approximately {intent.construction_progress_percent}% construction progress as a visualization from approved design; "
        "preserve tower count, massing, facade rhythm, balcony/window pattern, podium proportions, and perspective. "
        "This is not an actual current site photograph or verified latest progress report."
    )
    if "construction visualization rule" not in text.lower():
        text += " " + guard
    return text



def _strip_exact_text_blocks(text: str) -> str:
    # Remove every previously generated visible-copy instruction. The canonical
    # copy_plan plus grounded contact footer is the only source of visible text.
    if not text:
        return ""
    # Remove exact-text blocks even when another section follows them.
    text = re.sub(
        r"Render only this exact visible text:[\s\S]*?(?=(?:Brand, compliance, and contact rules:|Brand palette:|Mood and negative constraints:|Logo instruction:|Logo production rule:|RERA QR production rule:|Construction visualization rule:|Brand-only festive rule:|$))",
        "",
        text,
        flags=re.I,
    )
    # Remove common free-form visible-text summaries from model/fallback prompts.
    text = re.sub(r"Visible text:\s*headline\s*'[^']*'\s*,\s*subheadline\s*'[^']*'\s*,\s*CTA\s*'[^']*'\.?", "", text, flags=re.I)
    text = re.sub(r"Render exact readable poster typography:[^.]*\.\s*", "", text, flags=re.I)
    text = re.sub(r"\bHeadline\s*:\s*\"[^\"]*\"\s*", "", text, flags=re.I)
    text = re.sub(r"\bSubheadline\s*:\s*\"[^\"]*\"\s*", "", text, flags=re.I)
    text = re.sub(r"\bCTA(?:/signature)?\s*:\s*\"[^\"]*\"\s*", "", text, flags=re.I)
    text = re.sub(r"\bFooter\s*:\s*\"[^\"]*\"\s*", "", text, flags=re.I)
    text = re.sub(r"Do not (?:add|render) any other readable[^.]*\.\s*", "", text, flags=re.I)
    text = re.sub(r"Visible on-poster copy must be in [^.]*\.\s*", "", text, flags=re.I)
    return _clean(text)


def _contact_footer(production: ProductionPlan) -> str:
    values = production.contact_plan.values or {}
    if not values or not production.contact_plan.items:
        return ""
    ordered = []
    for key in production.contact_plan.items:
        value = str(values.get(key) or "").strip()
        if value:
            ordered.append(value)
    return " | ".join(ordered)


def _location_label(production: ProductionPlan) -> str:
    return str(production.location_plan.value or "").strip()


def _ensure_exact_text(text: str, copy_plan: CopyPlan, production: ProductionPlan) -> str:
    copy = copy_plan.as_contract()
    values = [
        ("Headline", copy.get("headline")),
        ("Subheadline", copy.get("subheadline")),
        ("Support copy", copy.get("support_copy")),
        ("Proof point", copy.get("proof_point_1")),
        ("Proof point", copy.get("proof_point_2")),
        ("Proof point", copy.get("proof_point_3")),
        ("CTA", copy.get("cta")),
    ]
    footer = _contact_footer(production)
    if footer:
        values.append(("Footer", footer))
    location = _location_label(production)
    if location:
        values.append(("Location", location))
    non_empty = [(label, str(value).strip()) for label, value in values if str(value or "").strip()]
    if not non_empty:
        return text
    text = _strip_exact_text_blocks(text)
    placement = _visible_text_placement_instruction(production)
    protected = "Do not translate or alter logo text, URL, phone, email, or brand mark."
    if production.include_rera_qr:
        protected = "Do not translate or alter logo text, URL, phone, email, RERA number, or brand mark."
    lines = ["Render only this exact visible text:"] + [f'{label}: "{value}"' for label, value in non_empty] + [placement, "Do not render any other readable poster text.", protected]
    return text.rstrip() + " " + " ".join(lines)


def _ensure_no_text_mode(text: str) -> str:
    # Reserve-space means the image model must create the visual/layout zones only.
    # Strip any stale exact-copy or visible-text instructions from the draft/model auditor
    # before adding the no-text guard. This prevents the image provider from seeing
    # conflicting instructions like "Render only this exact visible text" while
    # text_treatment=reserve_space.
    text = _strip_exact_text_blocks(text)
    text = re.sub(r"Text elements?\s*\([^)]*\)\s*will be[^.]*\.", "Reserve clean editable text zones without rendering text.", text, flags=re.I)
    text = re.sub(r"Text elements? will be[^.]*\.", "Reserve clean editable text zones without rendering text.", text, flags=re.I)
    text = re.sub(r"Branding will be visible but integrated[^.]*\.", "Use the supplied logo reference as the only visible brand mark; reserve all marketing copy for editable overlays.", text, flags=re.I)
    guard = (
        "Text reserve-space rule: no text / no typography; do not render any headline, subheadline, CTA, contact footer, poster text, captions, letters, numbers, labels, "
        "placeholder words, lorem ipsum, gibberish typography, or text-like marks. Leave clean editable text-safe zones for later overlay of headline, subheadline, CTA, and contact footer if requested."
    )
    if "text reserve-space rule:" not in text.lower():
        text += " " + guard
    return _clean(text)


def _model_logo_instruction(text: str, production: ProductionPlan) -> str:
    # The app currently relies on the image model to place the selected logo from a
    # supplied logo reference. Remove older post-composite/safe-zone wording so the
    # provider prompt has one consistent logo mode.
    text = re.sub(r"Logo production rule:[^.]*\.[ ]*", "", text, flags=re.I)
    text = re.sub(r"Leave a clean [^.]*?logo-safe zone[^.]*\.[ ]*", "", text, flags=re.I)
    text = re.sub(r"the exact supplied logo will be composited after generation by the renderer[^.]*\.[ ]*", "", text, flags=re.I)
    text = re.sub(r"do not render or redraw the logo[^.]*\.[ ]*", "", text, flags=re.I)
    guard = (
        f"Logo instruction: use the supplied logo reference exactly once as a separate flat brand mark at {production.logo_position}. "
        "Preserve the supplied logo's proportions, colors, sharpness, and identity; keep it fully visible, compact, and separate from the building image. "
        "Never place the logo on the building facade, podium, windows, balcony rails, or as physical signage."
    )
    if "logo instruction:" not in text.lower():
        text += " " + guard
    return text


def _secondary_logo_instruction(text: str, production: ProductionPlan) -> str:
    if not production.secondary_logo.asset_id:
        guard = "Secondary logo instruction: reserve a clean brand-safe area for the missing required secondary logo; do not invent or fake that logo."
    else:
        guard = (
            f"Secondary logo instruction: use the supplied secondary logo reference exactly once at {_format_position(production.secondary_logo.position)}. "
            "Keep it as a separate, smaller flat brand mark; do not merge, redraw, recolor, crop, or place it on architecture."
        )
    if "secondary logo instruction:" not in text.lower():
        text += " " + guard
    return text


def _additional_logo_instruction(text: str, production: ProductionPlan) -> str:
    details = []
    for index, logo_layer in enumerate(production.additional_logos[1:], start=2):
        name = logo_layer.label or f"logo {index}"
        if logo_layer.asset_id:
            details.append(f"{name}: use the supplied reference exactly once at {_format_position(logo_layer.position)}")
        elif logo_layer.required:
            details.append(f"{name}: reserve clean space at {_format_position(logo_layer.position)} and do not invent the missing mark")
    if not details:
        return text
    guard = (
        "Additional logo instruction: "
        + "; ".join(details)
        + ". Keep every logo as a separate flat brand mark; do not merge, redraw, recolor, crop, distort, or place logos on architecture."
    )
    if "additional logo instruction:" not in text.lower():
        text += " " + guard
    return text


def _composited_rera_instruction(text: str, production: ProductionPlan) -> str:
    text = re.sub(r"Use the supplied RERA QR[^.]*\.", "Leave a compact RERA QR-safe zone; the exact QR will be composited after generation by the renderer.", text, flags=re.I)
    guard = f"RERA QR production rule: do not render, redraw, invent, or stylize a QR code; leave a compact {production.rera_position} QR-safe zone if required."
    if "rera qr production rule" not in text.lower():
        text += " " + guard
    return text


def _contact_position_instruction(text: str, production: ProductionPlan) -> str:
    guard = f"Contact placement instruction: if contact text is rendered, place it at {_format_position(production.contact_plan.position)} and use only the exact grounded contact footer."
    if "contact placement instruction:" not in text.lower():
        text += " " + guard
    return text


def _location_instruction(text: str, production: ProductionPlan) -> str:
    if production.location_plan.value:
        icon = " with a simple location pin icon" if production.location_plan.include_pin_icon else ""
        guard = f"Location placement instruction: render the exact location label '{production.location_plan.value}' at {_format_position(production.location_plan.position)}{icon}; do not invent or add other locations."
    else:
        guard = "Location placement instruction: required location value is missing, so do not invent or render any location label."
    if "location placement instruction:" not in text.lower():
        text += " " + guard
    return text


def _visible_text_placement_instruction(production: ProductionPlan) -> str:
    pieces = []
    if production.contact_plan.values:
        pieces.append(f"Footer/contact must sit at {_format_position(production.contact_plan.position)}.")
    if production.location_plan.value:
        pieces.append(f"Location must sit at {_format_position(production.location_plan.position)}.")
    return " ".join(pieces) if pieces else "Keep text in clean planned layout zones."


def _format_position(position: str) -> str:
    return str(position or "").replace("_", " ").replace("-", " ").strip() or "the requested position"


def _remove_positive_logo_language(text: str) -> str:
    return re.sub(r"(?<!not )(?:Use|Place|Add|Render) (?:the )?(?:supplied )?(?:brand )?logo[^.]*\.\s*", "", text, flags=re.I)


def _append_negative(negative: str, items: List[str]) -> str:
    existing = negative or ""
    lower = existing.lower()
    additions = [item for item in items if item.lower() not in lower]
    return _clean(", ".join([existing, *additions]) if existing else ", ".join(additions))


def _remove_negative_items(negative: str, items: List[str]) -> str:
    if not negative:
        return ""
    banned = {item.strip().lower() for item in items if item.strip()}
    kept = []
    for part in re.split(r",|;", negative):
        clean = part.strip()
        lowered = clean.lower()
        if not clean:
            continue
        if lowered in banned:
            continue
        if any(banned_item and (banned_item in lowered or lowered in banned_item) for banned_item in banned):
            continue
        kept.append(clean)
    return _clean(", ".join(kept))


def _facts_present(facts: List[str], text: str) -> List[str]:
    lowered = str(text or "").lower()
    out: List[str] = []
    for fact in facts:
        f = str(fact or "").strip()
        if f and f.lower() in lowered:
            out.append(f)
    return out


def _coerce_issues(value: Any) -> List[Dict[str, str]]:
    if not isinstance(value, list):
        return []
    out: List[Dict[str, str]] = []
    for item in value:
        if isinstance(item, dict):
            out.append({
                "severity": str(item.get("severity") or "warning"),
                "type": str(item.get("type") or "prompt_audit"),
                "message": str(item.get("message") or item),
            })
        elif str(item).strip():
            out.append(_issue("warning", "prompt_audit", str(item).strip()))
    return out


def _issue(severity: str, typ: str, message: str) -> Dict[str, str]:
    return {"severity": severity, "type": typ, "message": message}


def _dedupe(items: Iterable[str]) -> List[str]:
    seen = set()
    out: List[str] = []
    for item in items:
        key = str(item).strip()
        if key and key not in seen:
            out.append(key)
            seen.add(key)
    return out


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _option(request: Any, key: str) -> bool:
    options = getattr(request, "options", {}) if isinstance(getattr(request, "options", {}), dict) else {}
    value = options.get(key) or options.get(key.replace("_", ""))
    return bool(value)
