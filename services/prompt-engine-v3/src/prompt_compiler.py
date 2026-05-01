from __future__ import annotations

import re
from typing import Any, Dict

from .context_builder import brand_name, project_name
from .creative_levers import describe_creative_direction


def compile_image_prompt(
    prompt: str,
    context: Dict[str, Any],
    asset: Dict[str, Any],
    copy: Dict[str, str],
    creative_direction: Dict[str, Any],
    include_logo: bool,
    include_rera_qr: bool,
    allow_price_claims: bool = False,
) -> str:
    base = strip_internal_tokens(prompt or "")
    if not allow_price_claims:
        base = remove_price_claims(base)
    base = normalize_truth_language(base, asset)
    content_job_id = str((context.get("content_job") or {}).get("content_job_id") or "")
    if content_job_id == "construction_update" and not asset_supports_construction_progress(asset):
        base = normalize_unsupported_progress_visual_claims(base)
    if not base:
        base = fallback_prompt(context, asset, copy, creative_direction)
    base = ensure_asset_truth_instruction(base, asset)
    base = ensure_design_transformation_instruction(base, creative_direction, asset)
    if content_job_id == "construction_update":
        base = ensure_construction_update_visual_instruction(base, asset)
    base = ensure_visible_copy_instruction(base, copy)
    is_festive = context.get("content_job", {}).get("content_job_id") == "festive_greeting"
    has_asset = has_visual_asset(asset)
    subject_name = brand_name(context) if is_festive and not context.get("project") else project_name(context)
    constraints = ["Hard constraints for %s:" % subject_name]
    if has_asset:
        constraints.extend([
            "preserve the supplied project asset geometry, facade rhythm, material character, and render/photo truth while allowing poster-level crop, cutout, scale, background, framing, and graphic composition;",
            "do not invent ocean, skyline, extra towers, roads, signage, legal claims, prices, contact details, or surroundings;",
            "do not place text, logo, or QR on the building facade;",
        ])
        if content_job_id == "construction_update" and not asset_supports_construction_progress(asset):
            constraints.append(
                "show the project as an under-construction visualization based on the supplied building geometry, with tasteful scaffolding/construction-wrap/crane cues only as illustrative progress styling; do not claim this is a verified current site photograph or exact live progress status."
            )
        elif content_job_id == "construction_update":
            constraints.append(
                "show the real construction/progress condition from the supplied asset clearly and credibly; do not over-polish it into a completed building render."
            )
    else:
        constraints.extend([
            "do not invent project-specific architecture, pricing, legal claims, contact details, or unsupported surroundings;",
            "keep any brand/project references as clean poster typography, not physical signage;",
        ])
    constraints.append("render the headline, subheadline, and CTA as clean social-poster typography for preview;")
    if is_festive:
        festival = context.get("festival") if isinstance(context.get("festival"), dict) else {}
        festival_name = str(festival.get("name") or "the selected occasion").strip()
        constraints.extend([
            "make this an occasion-led festive greeting for %s, not a project launch or sales announcement;" % festival_name,
            "use tasteful festive cues, warm restraint, and %s brand presence without pricing, offers, visit CTAs, or launch language;" % brand_name(context),
        ])
    if include_logo:
        constraints.append("reserve one exact-logo layer zone only; never redraw or duplicate the logo;")
    if include_rera_qr:
        constraints.append(
            "reserve one compact exact RERA compliance lockup at the top-right only; "
            "keep it about the same visual height as the logo, no wider than roughly one-quarter of the canvas, "
            "never stretch it into a full-width banner or footer, and never generate a fake QR;"
        )
    return trim_prompt("%s\n\n%s" % (base.strip(), " ".join(constraints)), 3000)


def fallback_prompt(context: Dict[str, Any], asset: Dict[str, Any], copy: Dict[str, str], creative_direction: Dict[str, Any]) -> str:
    is_festive = context.get("content_job", {}).get("content_job_id") == "festive_greeting"
    subject = brand_name(context) if is_festive and not context.get("project") else project_name(context)
    if not has_visual_asset(asset):
        return (
            "Create a premium %s real-estate social creative for %s. "
            "Creative direction: %s. "
            "Visible text: headline '%s', subheadline '%s', CTA '%s'."
        ) % (
            context.get("format") or "4:5",
            subject,
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
        r"\bshowcas(?:e|ing|es)?\s+(?:the\s+)?(?:current\s+)?construction\s+progress\b": "show an under-construction project visualization",
        r"\bshowcas(?:e|ing|es)?\s+progress\b": "show an under-construction project visualization",
        r"\bcurrent\s+construction\s+progress\b": "construction milestone visualization",
        r"\bconstruction\s+progress\b": "construction milestone visualization",
        r"\bfactual\s+progress\s+report\b": "credible construction update",
        r"\bcurrent\s+construction\s+phase\b": "construction milestone stage",
        r"\bsite\s+progress\b": "construction milestone visualization",
    }
    for pattern, replacement in replacements.items():
        text = re.sub(pattern, replacement, text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip()


def trim_prompt(text: str, max_chars: int) -> str:
    text = text.strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1].rstrip() + "…"
