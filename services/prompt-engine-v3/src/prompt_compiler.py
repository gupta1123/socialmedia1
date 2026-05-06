from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from .context_builder import brand_name, project_name
from .creative_levers import describe_creative_direction
from .asset_analysis_normalizer import get_visual_analysis, metadata_for_asset


def compile_image_prompt(
    prompt: str,
    context: Dict[str, Any],
    asset: Dict[str, Any],
    copy: Dict[str, str],
    creative_direction: Dict[str, Any],
    include_logo: bool,
    include_rera_qr: bool,
    logo_asset_id: Optional[str] = None,
    rera_qr_asset_id: Optional[str] = None,
    contact_values: Optional[Dict[str, str]] = None,
    template: Optional[Dict[str, Any]] = None,
    allow_price_claims: bool = False,
    text_treatment: str = "render_text",
    *,
    intent: Any = None,
    strategy: Any = None,
    production: Any = None,
    asset_decision: Any = None,
    template_constraint: Any = None,
    concept: Any = None,
    copy_plan: Any = None,
) -> str:
    base = strip_internal_tokens(prompt or "")
    base = remove_unsafe_commercial_claims(base)
    base = repair_structural_change_requests(base)
    if not allow_price_claims:
        base = remove_price_claims(base)
    base = normalize_truth_language(base, asset)
    content_job_id = str((context.get("content_job") or {}).get("content_job_id") or "")
    if content_job_id == "construction_update" and not asset_supports_construction_progress(asset):
        base = normalize_unsupported_progress_visual_claims(base)
    if not base:
        base = fallback_prompt(context, asset, copy, creative_direction)
    if content_job_id == "construction_update":
        base = ensure_construction_update_visual_instruction(base, asset)
    return compile_final_provider_prompt(
        base,
        context,
        asset,
        copy,
        creative_direction,
        include_logo=include_logo and bool(logo_asset_id),
        include_rera_qr=include_rera_qr and bool(rera_qr_asset_id),
        contact_values=contact_values or {},
        template=template,
        allow_price_claims=allow_price_claims,
        text_treatment=text_treatment,
        intent=intent,
        strategy=strategy,
        production=production,
        asset_decision=asset_decision,
        template_constraint=template_constraint,
        concept=concept,
        copy_plan=copy_plan,
    )


def compile_final_provider_prompt(
    source_prompt: str,
    context: Dict[str, Any],
    asset: Dict[str, Any],
    copy: Dict[str, str],
    creative_direction: Dict[str, Any],
    *,
    include_logo: bool,
    include_rera_qr: bool,
    contact_values: Dict[str, str],
    template: Optional[Dict[str, Any]] = None,
    allow_price_claims: bool = False,
    text_treatment: str = "render_text",
    max_chars: int = 3200,
    intent: Any = None,
    strategy: Any = None,
    production: Any = None,
    asset_decision: Any = None,
    template_constraint: Any = None,
    concept: Any = None,
    copy_plan: Any = None,
) -> str:
    # New section-based compiler. The image model only sees this final text, so the
    # prompt must lead with brief intent, asset usage, concept, copy behavior, and
    # only then constraints. The old branch remains as fallback for direct calls.
    if intent is not None and strategy is not None and production is not None and asset_decision is not None and concept is not None and copy_plan is not None:
        from .prompt_sections import assemble_prompt_sections
        from .template_resolver import resolve_template_constraint

        tc = template_constraint or resolve_template_constraint(template, asset_decision)
        clean_source = sanitize_optional_layer_language(source_prompt, include_logo, include_rera_qr, bool(contact_values))
        clean_source = strip_internal_tokens(clean_source)
        sections = assemble_prompt_sections(
            source_prompt=clean_source,
            context=context,
            intent=intent,
            strategy=strategy,
            production=production,
            asset_decision=asset_decision,
            template=tc,
            concept=concept,
            copy_plan=copy_plan,
            creative_direction=creative_direction,
            allow_price_claims=allow_price_claims,
        )
        prompt = " ".join(sentence_dedupe(sections))
        prompt = semantic_prompt_repair(prompt, context, asset, intent=intent)
        prompt = remove_unsafe_commercial_claims(prompt)
        prompt = repair_structural_change_requests(prompt, _intent_text(intent))
        prompt = sanitize_optional_layer_language(prompt, include_logo, include_rera_qr, bool(contact_values))
        if not allow_price_claims:
            prompt = remove_price_claims(prompt)
        return truncate_on_sentence(prompt, max_chars)

    is_festive = context.get("content_job", {}).get("content_job_id") == "festive_greeting"
    subject_name = brand_name(context) if is_festive and not context.get("project") else project_name(context)
    output_format = str(context.get("format") or "4:5")
    visual = asset_visual_analysis(asset)
    parts: List[str] = [
        "Create a finished premium %s real estate social creative for %s." % (output_format, subject_name),
    ]
    try:
        from .prompt_sections import _brand_palette_section
        palette_instruction = _brand_palette_section(context)
        if palette_instruction:
            parts.append(palette_instruction)
    except Exception:
        parts.append("Brand color direction: use a restrained premium palette drawn from the brand identity. Do not recolor or modify the supplied logo.")
    if has_visual_asset(asset):
        parts.append(asset_truth_sentence(asset, visual))
    else:
        parts.append("Use a graphic-led composition; do not invent project-specific architecture or unsupported surroundings.")

    template_instruction = template_provider_instruction(template)
    if template_instruction:
        parts.append(template_instruction)
    parts.append("Creative levers: %s." % describe_creative_direction(creative_direction))
    composition = concrete_composition_instruction(creative_direction)
    if composition:
        parts.append(composition)
    if visual.get("prompt_adaptation_guidance"):
        parts.append("Adapt crop, composition, mood, and graphic treatment using this asset guidance: %s." % compact_join(visual.get("prompt_adaptation_guidance")))

    reserve_text_space = text_treatment == "reserve_space"
    if reserve_text_space:
        parts.append(
            "Do not render any poster text, captions, letters, numbers, CTA labels, headline, subheadline, placeholder words, lorem ipsum, gibberish typography, or text-like marks. "
            "Design this as a clean background/key visual with intentional empty negative space reserved for editable copy to be added later. "
            "Keep the reserved copy zone visually calm, uncluttered, and free of important subject details."
        )
    else:
        copy_parts = []
        for label, key in [("headline", "headline"), ("subheadline", "subheadline"), ("CTA", "cta")]:
            value = str(copy.get(key) or "").strip()
            if value:
                copy_parts.append("%s '%s'" % (label, value))
        if copy_parts:
            parts.append("Render exact readable poster typography: %s; keep text in clean layout zones, never as facade signage." % ", ".join(copy_parts))

    if include_logo:
        parts.append("Use the supplied logo asset exactly once as a clean brand layer; never redraw, recolor, duplicate, or place it on the building facade.")
    else:
        parts.append("Do not generate, imply, draw, or place any logo or brand mark.")
    if include_rera_qr:
        parts.append("Use the supplied RERA QR asset exactly once as a compact compliance layer; never invent or redraw a QR code.")
    else:
        parts.append("Do not generate or mention any QR code or RERA QR block.")
    if contact_values:
        if reserve_text_space:
            parts.append("Reserve a small clean contact area if needed, but do not render any contact text or values.")
        else:
            parts.append("Only use these grounded contact values if shown: %s." % ", ".join("%s %s" % (key, value) for key, value in contact_values.items()))
    else:
        parts.append("Do not generate phone numbers, email addresses, WhatsApp labels, websites, or contact details.")

    forbidden = [
        "Do not add facade signage, project or brand names on the building, fake logos, fake QR codes, invented phone/email/RERA/price claims, extra towers, ocean or water bodies, unsupported skyline, people, altered architecture, template names, asset IDs, or system labels.",
    ]
    if reserve_text_space:
        forbidden.append("Do not render any readable or pseudo-readable text anywhere in the image; leave typography zones blank for later editing.")
    unsupported = visual.get("not_visible_or_not_supported")
    if unsupported:
        forbidden.append("Do not show or claim these unsupported asset details: %s." % compact_join(unsupported))
    if not allow_price_claims:
        forbidden.append("Do not include price, EMI, offer, or booking amount claims.")
    parts.extend(forbidden)
    clean_source = sanitize_optional_layer_language(source_prompt, include_logo, include_rera_qr, bool(contact_values))
    clean_source = strip_internal_tokens(clean_source)
    if clean_source:
        parts.append("Creative concept: %s" % clean_source.rstrip("."))
    prompt = " ".join(sentence_dedupe(parts))
    prompt = sanitize_optional_layer_language(prompt, include_logo, include_rera_qr, bool(contact_values))
    if not allow_price_claims:
        prompt = remove_price_claims(prompt)
    return truncate_on_sentence(prompt, max_chars)

def fallback_prompt(context: Dict[str, Any], asset: Dict[str, Any], copy: Dict[str, str], creative_direction: Dict[str, Any]) -> str:
    is_festive = context.get("content_job", {}).get("content_job_id") == "festive_greeting"
    subject = brand_name(context) if is_festive and not context.get("project") else project_name(context)
    if not has_visual_asset(asset):
        kind = "brand festive greeting poster" if is_festive and not context.get("project") else "real-estate social creative"
        asset_note = "No project/building image is required; do not add buildings unless explicitly requested." if is_festive and not context.get("project") else "Use a concept-led visual without inventing unsupported project architecture."
        return (
            "Create a premium %s %s for %s. "
            "%s Creative direction: %s. "
            "Visible text: headline '%s', subheadline '%s', CTA '%s'."
        ) % (
            context.get("format") or "4:5",
            kind,
            subject,
            asset_note,
            describe_creative_direction(creative_direction),
            copy.get("headline", ""),
            copy.get("subheadline", ""),
            copy.get("cta", ""),
        )
    asset_label = asset.get("label") or "selected project reference"
    asset_description = asset.get("description") or "project-truth reference image"
    return (
        "Create a premium %s real-estate social creative for %s. "
        "Use the supplied asset '%s' as the factual visual anchor: %s. "
        "Creative direction: %s. "
        "Visible text: headline '%s', subheadline '%s', CTA '%s'."
    ) % (
        context.get("format") or "4:5",
        subject,
        asset_label,
        asset_description,
        describe_creative_direction(creative_direction),
        copy.get("headline", ""),
        copy.get("subheadline", ""),
        copy.get("cta", ""),
    )


def ensure_asset_truth_instruction(prompt: str, asset: Dict[str, Any]) -> str:
    if not has_visual_asset(asset):
        return prompt
    lowered = prompt.lower()
    if "supplied" in lowered and ("asset" in lowered or "reference image" in lowered):
        return prompt
    label = asset.get("label") or "selected project reference"
    description = asset.get("description") or "project-truth reference image"
    return (
        "Use the supplied project reference image as the primary visual truth anchor: %s - %s. "
        "Preserve the architecture, facade rhythm, materials, and render/photo truth, but create a fully designed social poster rather than a plain image edit. %s"
    ) % (label, description, prompt)


def ensure_design_transformation_instruction(prompt: str, creative_direction: Dict[str, Any], asset: Dict[str, Any]) -> str:
    if not has_visual_asset(asset):
        return prompt
    lowered = prompt.lower()
    direction_text = describe_creative_direction(creative_direction)
    composition_text = concrete_composition_instruction(creative_direction)
    if "design transformation:" in lowered and "unchanged full-bleed background" in lowered:
        return prompt
    return (
        "%s Design transformation: create a complete premium real-estate poster, not a direct reference image with text overlaid. "
        "Use the reference only as project-truth material. Apply the creative levers visibly: %s. "
        "%s "
        "The final image must show an intentional layout system, controlled whitespace, typography zones, and graphic treatment while keeping the building/amenity truthful. "
        "Do not use the supplied reference as an unchanged full-bleed background with plain text placed on top."
    ) % (prompt, direction_text, composition_text)


def ensure_construction_update_visual_instruction(prompt: str, asset: Dict[str, Any]) -> str:
    if asset_supports_construction_progress(asset):
        instruction = (
            "Construction-update visual requirement: make the selected site/progress reference read clearly as a credible active construction update, "
            "retaining real site conditions, unfinished structure, safety barriers, scaffolding, materials, and work-in-progress cues visible in the asset."
        )
    else:
        instruction = (
            "Construction-update visual requirement: transform the approved project architecture into a believable under-construction visualization. "
            "Preserve the tower massing, facade rhythm, proportions, and podium geometry from the supplied asset, but show tasteful work-in-progress cues such as partial facade completion, scaffold bands, safety netting, tower-crane silhouettes, temporary hoarding, and a controlled construction-site foreground. "
            "This should look like a premium construction milestone poster, not a completed launch render."
        )
    if "construction-update visual requirement" in prompt.lower():
        return prompt
    return f"{prompt} {instruction}"


def concrete_composition_instruction(creative_direction: Dict[str, Any]) -> str:
    layout = str(creative_direction.get("layout_geometry") or "")
    hero = str(creative_direction.get("hero_presentation") or "")
    style = str(creative_direction.get("style_family") or "")
    visual_mode = str(creative_direction.get("visual_mode") or "")
    layers = creative_direction.get("graphic_layer") or []
    if isinstance(layers, str):
        layers = [layers]

    instructions = []

    if layout == "left_copy_right_hero":
        instructions.append(
            "Use a clear split editorial composition: copy and brand hierarchy on the left, the project image cropped or cut out as the dominant right-side hero, with visible separation and alignment."
        )
    elif layout == "right_copy_left_hero":
        instructions.append(
            "Use a clear split editorial composition: the project image as the dominant left-side hero, copy and brand hierarchy on the right, with visible separation and alignment."
        )
    elif layout == "centered_symmetry":
        instructions.append(
            "Use centered poster architecture: place the hero image inside a deliberate frame, mask, or elevated central composition with top/bottom text zones, not as a raw screenshot."
        )
    elif layout == "magazine_spread":
        instructions.append(
            "Use magazine-spread styling: generous margins, refined editorial title block, measured spacing, and a curated image crop or plate."
        )
    elif layout == "blob_cutout":
        instructions.append(
            "Use a graphic cutout poster: isolate the building or amenity truthfully and place it over an abstract brand-colored shape field with clean negative space."
        )
    elif layout == "swiss_grid":
        instructions.append(
            "Use a Swiss grid: strict alignment, clean modules, rule lines, and disciplined hierarchy with the image treated as one grid element."
        )
    elif layout == "architectural_plate":
        instructions.append(
            "Use an architectural presentation plate: image, caption rules, measurement-like lines, and structured annotations without inventing facts."
        )
    elif layout == "poster_stack":
        instructions.append(
            "Use a poster-stack composition: stacked text/image blocks with a strong title hierarchy and designed spacing."
        )

    if hero in {"cutout_hero", "facade_mask", "facade_crop"}:
        instructions.append(
            "Transform the asset at poster level through faithful crop, mask, or cutout; preserve the facade and massing but change the surrounding layout treatment."
        )
    elif hero == "subtle_architecture_presence":
        instructions.append(
            "Let architecture support the message with a restrained crop or framed image area, leaving strong whitespace for copy."
        )
    elif hero == "amenity_scene":
        instructions.append(
            "Keep the amenity scene recognizable while designing a lifestyle editorial poster around it."
        )

    if "divider_lines" in layers or "editorial_rules" in layers:
        instructions.append("Add fine editorial rule lines or dividers as visible layout devices.")
    if "thin_frame" in layers:
        instructions.append("Add a thin premium frame or inset border to make the poster feel deliberately composed.")
    if "soft_gradient_field" in layers or "warm_gradient_field" in layers:
        instructions.append("Use a subtle brand-aligned gradient field as a graphic background layer, without inventing scenery.")
    if "blob_shapes" in layers or "large_abstract_shape" in layers:
        instructions.append("Use abstract shapes as design containers or mood fields, not factual scenery.")

    if style in {"quiet_luxury", "editorial_catalog", "swiss_grid_premium", "art_poster_premium", "premium_cutout_gallery"}:
        instructions.append("Make the design feel like a finished premium campaign poster, with refined hierarchy rather than flyer clutter.")

    if visual_mode == "asset_faithful":
        instructions.append("Asset-faithful does not mean unedited: preserve truth, but still crop, frame, mask, and compose it into a designed post.")

    return " ".join(instructions).strip()


def has_visual_asset(asset: Dict[str, Any]) -> bool:
    return bool(asset.get("asset_id") or asset.get("storage_path") or asset.get("url") or asset.get("label"))


def asset_visual_analysis(asset: Dict[str, Any]) -> Dict[str, Any]:
    visual = get_visual_analysis(asset)
    if visual:
        # Backward-compatible aliases expected by the compiler.
        out = dict(visual)
        out.setdefault("summary", visual.get("dominant_subject") or visual.get("composition"))
        out.setdefault("prompt_adaptation_guidance", visual.get("prompt_guidance"))
        out.setdefault("not_visible_or_not_supported", visual.get("forbidden_transformations"))
        return out
    return {}

def asset_truth_sentence(asset: Dict[str, Any], visual: Dict[str, Any]) -> str:
    label = str(asset.get("label") or "selected project reference").strip()
    description = str(visual.get("summary") or visual.get("dominant_subject") or visual.get("composition") or asset.get("description") or "project-truth reference image").strip().rstrip(".")
    truth = str(asset.get("truth_status") or "").strip()
    sentence = (
        "Use the supplied project reference image '%s' as the primary visual truth anchor: %s. "
        "Preserve architecture, facade rhythm, massing, materials, perspective, and %s truth while allowing poster-level crop, cutout, scale, masking, framing, whitespace, and graphic composition."
    ) % (label, description, truth or "image")
    return sentence


def template_provider_instruction(template: Optional[Dict[str, Any]]) -> str:
    if not isinstance(template, dict) or not template:
        return ""
    template_json = template.get("template_json") if isinstance(template.get("template_json"), dict) else {}
    pieces = [
        template.get("name"),
        template_json.get("visual_notes"),
        template_json.get("shape_selection_rule"),
        template_json.get("reality_policy"),
    ]
    best_for = template_json.get("best_for")
    if isinstance(best_for, list) and best_for:
        pieces.append("Best use: %s" % ", ".join(str(item) for item in best_for[:3]))
    text = compact_join([piece for piece in pieces if piece])
    return "Follow the selected visual template as composition and hierarchy guidance: %s." % text if text else ""


def compact_join(value: Any) -> str:
    if isinstance(value, list):
        return "; ".join(str(item).strip() for item in value if str(item).strip())
    if isinstance(value, dict):
        return "; ".join("%s: %s" % (key, val) for key, val in value.items() if str(val).strip())
    return str(value or "").strip()


def sanitize_optional_layer_language(text: str, include_logo: bool, include_rera_qr: bool, has_contact: bool) -> str:
    if not text:
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    out: List[str] = []
    for sentence in sentences:
        lowered = sentence.lower()
        if not include_logo and re.search(r"\b(logos?|brand marks?)\b", lowered) and not re.search(r"\b(no|not|never|do not|don't|without)\b", lowered):
            continue
        if not include_rera_qr and re.search(r"\b(qr|rera qr)\b", lowered) and not re.search(r"\b(no|not|never|do not|don't|without)\b", lowered):
            continue
        if not has_contact and re.search(r"\b(phone|email|whatsapp|contact details?|website)\b", lowered) and not re.search(r"\b(no|not|never|do not|don't|without)\b", lowered):
            continue
        out.append(sentence)
    result = " ".join(out)
    if not include_logo:
        result = re.sub(r"\b(?:the\s+)?[A-Z][A-Za-z0-9& ]{1,40}\s+logo\b", "brand mark", result)
    if not include_rera_qr:
        result = re.sub(r"\b(?:RERA\s*)?QR(?:\s*code|\s*block)?\b", "compliance block", result, flags=re.I)
    if not has_contact:
        result = re.sub(r"(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}", "", result)
        result = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "", result)
    return re.sub(r"\s+", " ", result).strip()


def sentence_dedupe(parts: List[str]) -> List[str]:
    seen = set()
    out = []
    for part in parts:
        text = re.sub(r"\s+", " ", str(part or "")).strip()
        key = re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()
        if text and key not in seen:
            out.append(text)
            seen.add(key)
    return out


def ensure_visible_copy_instruction(prompt: str, copy: Dict[str, str]) -> str:
    values = [copy.get("headline"), copy.get("subheadline"), copy.get("cta")]
    values = [str(value).strip() for value in values if str(value or "").strip()]
    if not values:
        return prompt
    lowered = prompt.lower()
    if all(value.lower() in lowered for value in values[:1]) and ("visible text" in lowered or "headline" in lowered):
        return prompt
    return (
        "%s Render readable on-image poster typography with exact copy: headline '%s', subheadline '%s', CTA '%s'. "
        "Keep it in clean layout zones, not as physical signage."
    ) % (prompt, copy.get("headline", ""), copy.get("subheadline", ""), copy.get("cta", ""))


def strip_internal_tokens(text: str) -> str:
    text = re.sub(r"\b(?:template_id|asset_id|pipeline label|debug label)\b\s*[:=]?\s*[A-Za-z0-9_.-]+", "", text, flags=re.I)
    text = re.sub(r"\b[a-f0-9]{8}-[a-f0-9-]{27,}\b", "supplied reference", text, flags=re.I)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def remove_price_claims(text: str) -> str:
    text = re.sub(r"\b(?:starting\s+(?:at|from)|priced?\s+(?:at|from)|prices?\s+from)\s*(?:₹|rs\.?|inr)\s?[0-9][0-9,]*(?:\s?(?:lakh|lac|cr|crore|k))?", "", text, flags=re.I)
    text = re.sub(r"(?:₹|rs\.?|inr)\s?[0-9][0-9,]*(?:\s?(?:lakh|lac|cr|crore|k))?", "", text, flags=re.I)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def remove_unsafe_commercial_claims(text: str) -> str:
    out = str(text or "")
    replacements = [
        (r"\b(?:with\s+)?guaranteed\s+returns?\b", "with verified project details"),
        (r"\b(?:with\s+)?assured\s+(?:returns?|roi|appreciation|profits?)\b", "with verified project details"),
        (r"\b(?:guaranteed|assured)\s+(?:roi|appreciation|profits?)\b", "verified project details"),
    ]
    for pattern, repl in replacements:
        out = re.sub(pattern, repl, out, flags=re.I)
    return re.sub(r"\s+", " ", out).strip()


def repair_structural_change_requests(text: str, trigger_text: str = "") -> str:
    out = str(text or "")
    haystack = " ".join([out, trigger_text or ""]).lower()
    risky = bool(
        re.search(
            r"\b(change|alter|redesign|modify|transform|enhance|make|turn)\b[^.]{0,120}\b(elevation|facade|façade|massing|tower design|architecture|building design|building taller|glass-heavy|more glass|reflective glass)\b",
            haystack,
            flags=re.I,
        )
        or re.search(r"\bglass[- ]heavy\s+facade\b|\bmore\s+glass\b|\bmore\s+reflective\s+glass\b", haystack, flags=re.I)
    )
    if not risky:
        return re.sub(r"\s+", " ", out).strip()

    replacements = [
        (r"\b(?:change|alter|redesign|modify|transform)\s+(?:the\s+)?(?:elevation|facade|façade|massing|tower design|architecture|building design)\b[^.]*\.?", "Preserve the original building elevation, facade rhythm, material character, and architectural design. "),
        (r"\b(?:make|turn)\s+(?:the\s+)?(?:building|tower)\s+[^.]*?\b(?:taller|grander|glass[- ]heavy|more glass|more reflective)\b[^.]*\.?", "Use crop, scale impression, lighting, and graphics for drama without changing the building. "),
        (r"\b(?:with\s+a\s+)?(?:significantly\s+)?glass[- ]heavy\s+facade\b", "with the original facade material character"),
        (r"\bmore\s+glass[- ]heavy\s+facade\b", "original facade material character"),
        (r"\benhance(?:d)?\s+(?:the\s+)?glass\b[^.]*\.?", "Keep the existing glazing and material balance unchanged. "),
        (r"\bglass\s+facade\s+is\s+enhanced\b[^.]*\.?", "Preserve the existing facade material character. "),
    ]
    for pattern, repl in replacements:
        out = re.sub(pattern, repl, out, flags=re.I)

    guard = (
        "Architecture truth rule: do not change building elevation, tower height, massing, facade rhythm, "
        "material character, balcony/window pattern, podium proportions, or tower count; use lighting, crop, "
        "background graphics, and typography for visual variety only."
    )
    if "architecture truth rule:" not in out.lower():
        out = out.rstrip() + " " + guard
    return re.sub(r"\s+", " ", out).strip()


def normalize_truth_language(text: str, asset: Dict[str, Any]) -> str:
    truth_status = str(asset.get("truth_status") or asset.get("truthStatus") or "").lower()
    if truth_status != "render":
        return text
    text = re.sub(r"\barchitectural photograph\b", "architectural render", text, flags=re.I)
    text = re.sub(r"\bphotograph of\b", "render of", text, flags=re.I)
    text = re.sub(r"\bphoto of\b", "render of", text, flags=re.I)
    text = re.sub(r"\bphotorealistic photograph\b", "photorealistic render", text, flags=re.I)
    return text


def asset_supports_construction_progress(asset: Dict[str, Any]) -> bool:
    metadata = asset.get("metadata") if isinstance(asset.get("metadata"), dict) else {}
    haystack = " ".join(
        str(value)
        for value in [
            asset.get("label"),
            asset.get("description"),
            asset.get("scene_type"),
            asset.get("visual_use"),
            asset.get("truth_status"),
            metadata.get("assetClass"),
            metadata.get("subjectType"),
            metadata.get("usageIntent"),
            metadata.get("viewType"),
            metadata.get("notes"),
            *(metadata.get("tags") if isinstance(metadata.get("tags"), list) else []),
        ]
        if value
    ).lower()
    return any(term in haystack for term in ["construction", "site progress", "progress photo", "site photo", "slab", "work in progress", "actual site"])


def normalize_unsupported_progress_visual_claims(text: str) -> str:
    replacements = {
        r"\bshowcas(?:e|ing|es)?\s+(?:the\s+)?(?:current\s+)?construction\s+progress\b": "show a construction-stage visualization based on approved project design",
        r"\bshowcas(?:e|ing|es)?\s+progress\b": "show a construction-stage visualization",
        r"\bcurrent\s+construction\s+progress\b": "visualized construction stage",
        r"\bfactual\s+progress\s+report\b": "construction-stage visualization",
        r"\bcurrent\s+construction\s+phase\b": "visualized construction stage",
        r"\bunder\s+construction\s+photograph\b": "under-construction visualization",
        r"\bcaptured\s+recently\b": "visualized from approved design",
        r"\blatest\s+progress\b": "visualized progress concept",
        r"\bactual\s+current\s+progress\b": "visualized construction state",
        r"\badvancing\s+rapidly\b": "taking shape",
    }
    for pattern, replacement in replacements.items():
        text = re.sub(pattern, replacement, text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip()



def semantic_prompt_repair(text: str, context: Dict[str, Any], asset: Dict[str, Any], *, intent: Any = None) -> str:
    content_job_id = str((context.get("content_job") or {}).get("content_job_id") or getattr(intent, "content_job_id", "") or "")
    if content_job_id == "festive_greeting" and getattr(intent, "festival_visual_scope", "") == "brand_only":
        # Brand-only festival posts must not inherit project/building wording.
        replacements = {
            r"Use the supplied project visual asset as the factual visual anchor\.?": "No project or building image is required.",
            r"Use the supplied .*? asset as the factual visual anchor\.?": "No project or building image is required.",
            r"Use .*? as architectural truth\.?": "Use symbolic festive motifs as the visual foundation.",
            r"Preserve (?:the )?(?:tower|building|facade|massing)[^.]*\.": "",
        }
        for pattern, repl in replacements.items():
            text = re.sub(pattern, repl, text, flags=re.I)
        guard = "Brand-only festive rule: do not include any building, tower, facade, project render, construction scene, RERA, pricing, amenity, or real-estate claim unless explicitly requested."
        if guard.lower() not in text.lower():
            text += " " + guard
    if content_job_id == "construction_update" and not asset_supports_construction_progress(asset):
        text = normalize_unsupported_progress_visual_claims(text)
        guard = "Construction visualization truth note: this is an under-construction visualization from approved project design, not an actual current site photo or verified latest progress report."
        if guard.lower() not in text.lower():
            text += " " + guard
    text = repair_structural_change_requests(text, _intent_text(intent))
    return re.sub(r"\s+", " ", text).strip()


def _intent_text(intent: Any) -> str:
    if intent is None:
        return ""
    pieces = [
        getattr(intent, "brief_summary", ""),
        getattr(intent, "creative_goal", ""),
        " ".join(getattr(intent, "explicit_user_requests", []) or []),
    ]
    return " ".join(str(piece or "") for piece in pieces)


def trim_prompt(text: str, max_chars: int) -> str:
    text = text.strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1].rstrip() + "…"


def truncate_on_sentence(text: str, max_chars: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars].rsplit(". ", 1)[0].strip()
    if len(cut) < max_chars * 0.65:
        cut = text[:max_chars].rsplit(" ", 1)[0].strip()
    return cut.rstrip(" ,;:.") + "."
