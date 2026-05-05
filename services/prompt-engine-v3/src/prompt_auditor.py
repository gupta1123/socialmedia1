from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Tuple

from .planning_schemas import AssetDecision, CopyPlan, CreativeIntent, CreativeStrategy, ProductionPlan, TemplateConstraint, VariantConcept
from .prompt_compiler import remove_price_claims, strip_internal_tokens


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
    )
    model_result: Dict[str, Any] = {}
    if dspy_available() and not _option(request, "disable_prompt_auditor"):
        try:
            from .dspy_engine import DspyPromptProgram

            program = DspyPromptProgram()
            model_result = program.audit_and_repair_prompt(payload)
        except Exception as exc:
            model_result = {"status": "fallback", "issues_found": [{"severity": "warning", "type": "prompt_auditor_error", "message": f"AI prompt auditor failed: {type(exc).__name__}: {exc}"}]}
    repaired_prompt = str(model_result.get("repaired_provider_prompt") or provider_prompt or "")
    repaired_negative = str(model_result.get("repaired_negative_prompt") or negative_prompt or "")
    issues = _coerce_issues(model_result.get("issues_found"))
    changes = [str(item) for item in model_result.get("changes_made") or [] if str(item).strip()]
    prompt2, negative2, det_issues, det_changes = deterministic_repair(
        repaired_prompt,
        repaired_negative,
        context=context,
        intent=intent,
        production=production,
        asset_decision=asset_decision,
        copy_plan=copy_plan,
        allowed_facts=list(allowed_facts),
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
                "If a logo asset is provided, the image model should use the supplied logo reference exactly once as a flat brand mark and must not invent, alter, duplicate, recolor, or place it on architecture. If a RERA QR is composited after generation, ask the image model to leave a clean zone, not reproduce the QR.",
            ],
        },
        "content_job_id": intent.content_job_id,
        "festival_visual_scope": intent.festival_visual_scope,
        "construction_visual_mode": intent.construction_visual_mode,
        "construction_progress_percent": intent.construction_progress_percent,
        "project_id": (context.get("project") or {}).get("id") if isinstance(context.get("project"), dict) else None,
        "brand": context.get("brand"),
        "project": context.get("project"),
        "selected_asset": asset_decision.profile.model_dump() if asset_decision.profile else asset_decision.selection,
        "template": kwargs["template_constraint"].model_dump() if kwargs.get("template_constraint") else {},
        "strategy": kwargs["strategy"].model_dump() if kwargs.get("strategy") else {},
        "concept": kwargs["concept"].model_dump() if kwargs.get("concept") else {},
        "copy": copy_plan.as_contract(),
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
) -> Tuple[str, str, List[Dict[str, str]], List[str]]:
    issues: List[Dict[str, str]] = []
    changes: List[str] = []
    text = strip_internal_tokens(prompt or "")
    neg = strip_internal_tokens(negative_prompt or "")

    before_palette = text
    text = _ensure_brand_palette(text, context)
    if text != before_palette:
        changes.append("Inserted brand palette instruction into final provider prompt.")

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

    if production.text_treatment != "reserve_space":
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

    if production.include_logo:
        before = text
        text = _model_logo_instruction(text, production)
        if text != before:
            changes.append("Changed logo instruction to image-model logo reference behavior.")
    else:
        text = _remove_positive_logo_language(text)

    if production.secondary_logo.required:
        before = text
        text = _secondary_logo_instruction(text, production)
        if text != before:
            changes.append("Inserted secondary logo placement instruction.")

    if production.include_rera_qr:
        before = text
        text = _composited_rera_instruction(text, production)
        if text != before:
            changes.append("Changed RERA QR instruction to deterministic compositing / safe zone behavior.")

    if production.contact_plan.values:
        before = text
        text = _contact_position_instruction(text, production)
        if text != before:
            changes.append("Inserted contact placement instruction.")

    if production.location_plan.required:
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



def _ensure_brand_palette(text: str, context: Dict[str, Any]) -> str:
    if "brand color direction:" in str(text or "").lower():
        return text
    try:
        from .prompt_sections import _brand_palette_section
        palette = _brand_palette_section(context)
    except Exception:
        palette = "Brand color direction: use a restrained premium palette drawn from the brand identity, with warm neutrals, editorial contrast, and tasteful accent color. Do not recolor or modify the supplied logo."
    if not palette:
        return text
    return _clean((text or "").rstrip() + " " + palette)

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
    guard = "Brand-only festive rule: do not introduce a building, tower, facade, project render, construction scene, amenity, RERA, pricing, possession, or project-specific claim unless explicitly requested."
    if guard.lower() not in text.lower():
        text += " " + guard
    return text


def _repair_construction_visualization(text: str, intent: CreativeIntent) -> str:
    replacements = {
        r"\bactual current site photo(?:graph)?\b": "construction-stage visualization",
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
        f"Construction visualization rule: reinterpret the supplied approved project design as approximately {intent.construction_progress_percent}% under construction. "
        "Preserve the same architecture, tower count, massing, facade rhythm, balcony/window pattern, podium proportions, and perspective. "
        "This is a construction-stage visualization based on the approved design, not an actual current site photograph or verified latest progress report."
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
        r"Render only this exact visible text:[\s\S]*?(?=(?:Logo instruction:|Logo production rule:|RERA QR production rule:|Construction visualization rule:|Brand-only festive rule:|$))",
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
    values = [("Headline", copy.get("headline")), ("Subheadline", copy.get("subheadline")), ("CTA", copy.get("cta"))]
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
    lines = ["Render only this exact visible text:"] + [f'{label}: "{value}"' for label, value in non_empty] + [placement, "Do not render any other readable poster text. Do not translate or alter logo text, URL, phone, email, RERA number, or brand mark."]
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
        "Text reserve-space rule: do not render any headline, subheadline, CTA, contact footer, poster text, captions, letters, numbers, labels, "
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
