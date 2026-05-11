from __future__ import annotations

from typing import Any, Dict, List

from .context_builder import brand_name, project_name
from .creative_levers import describe_creative_direction
from .planning_schemas import AssetDecision, CopyPlan, CreativeIntent, CreativeStrategy, ProductionPlan, TemplateConstraint, VariantConcept


def assemble_prompt_sections(
    *,
    source_prompt: str,
    context: Dict[str, Any],
    intent: CreativeIntent,
    strategy: CreativeStrategy,
    production: ProductionPlan,
    asset_decision: AssetDecision,
    template: TemplateConstraint,
    concept: VariantConcept,
    copy_plan: CopyPlan,
    creative_direction: Dict[str, Any],
    allow_price_claims: bool,
) -> List[str]:
    subject = project_name(context) if context.get("project") else brand_name(context)
    output_format = str(context.get("format") or "4:5")
    is_brand_only_festival = intent.content_job_id == "festive_greeting" and intent.festival_visual_scope == "brand_only"
    creative_kind = "brand festive greeting poster" if is_brand_only_festival else "real-estate social creative"
    sections = [
        f"Creative objective: Create a finished premium {output_format} {creative_kind} for {subject}. {strategy.primary_goal}",
        _variant_route_section(concept, strategy, asset_decision, intent),
        f"Creative mode and hierarchy: {strategy.creative_mode.replace('_', ' ')}. Message hierarchy: {', '.join(strategy.message_hierarchy)}.",
        _brand_palette_section(context),
        _asset_section(asset_decision, intent),
        _concept_section(concept, creative_direction, asset_decision, intent),
    ]
    if template.template_id or template.layout_logic:
        sections.append(_template_section(template))
    sections.append(_text_section(production, copy_plan))
    sections.append(_production_section(production))
    sections.append(_grounding_section(asset_decision, allow_price_claims, production))
    if source_prompt:
        sections.append(f"Additional creative brief to honor: {source_prompt.rstrip('.') }.")
    return [s for s in sections if s.strip()]


def _variant_route_section(concept: VariantConcept, strategy: CreativeStrategy, asset_decision: AssetDecision, intent: CreativeIntent) -> str:
    label = _asset_safe_variant_label(concept.label or concept.variant_id or "Creative route", asset_decision, intent)
    axis = concept.variation_axis or strategy.creative_mode or "visual route"
    pieces = [
        f"Variant route: {label} on the {axis.replace('_', ' ')} axis.",
        f"Keep this option visually distinct: {concept.why_distinct}" if concept.why_distinct else "",
        f"Copy angle: {concept.copy_strategy}" if concept.copy_strategy else "",
    ]
    return " ".join(piece for piece in pieces if piece)


def _asset_safe_variant_label(label: str, asset_decision: AssetDecision, intent: CreativeIntent) -> str:
    text = str(label or "").strip() or "Creative route"
    lowered = text.lower()
    if intent.content_job_id == "festive_greeting" and intent.festival_visual_scope == "brand_only":
        return "Brand festive route" if any(term in lowered for term in ["tower", "facade", "building", "project"]) else text
    if asset_decision.semantic_type in {"entrance", "lobby", "interior", "amenity"} and any(term in lowered for term in ["tower", "facade", "exterior", "building"]):
        return "Asset-faithful selected template route"
    return text



def _brand_palette_section(context: Dict[str, Any]) -> str:
    selected_palette = context.get("selected_color_palette") if isinstance(context.get("selected_color_palette"), dict) else {}
    selected_mode = str(selected_palette.get("mode") or "auto").lower()
    selected_strength = str(selected_palette.get("strength") or "soft").lower()
    selected_colors = _extract_palette_colors(selected_palette.get("colors"))
    if selected_mode in {"custom", "brand", "preset", "curated"}:
        source_label = {
            "custom": "selected custom palette",
            "brand": "brand palette",
            "preset": "selected preset palette",
            "curated": str(selected_palette.get("palette_name") or "selected curated palette"),
        }.get(selected_mode, "selected palette")
        if selected_colors:
            prefix = "Color palette lock" if selected_strength == "hard" else "Color palette direction"
            action = "use only these colors for non-photographic design surfaces" if selected_strength == "hard" else "use these colors as the main design direction"
            return (
                f"{prefix}: {action} from the {source_label} — "
                + ", ".join(selected_colors[:8])
                + ". Apply the palette to backgrounds, graphic shapes, dividers, fine rules, typography accents, and editorial surfaces. Do not recolor supplied logos, people, realistic buildings, or reference photos."
            )
        if selected_mode == "preset":
            return (
                "Color palette direction: follow the selected preset's color rules where available; otherwise fall back to the brand palette. "
                "Apply color only to design surfaces and typography accents. Do not recolor supplied logos, people, realistic buildings, or reference photos."
            )
        if selected_mode == "brand":
            return (
                "Color palette direction: use the brand profile colors as the visual color system. "
                "Apply color only to design surfaces and typography accents. Do not recolor supplied logos, people, realistic buildings, or reference photos."
            )

    brand = context.get("brand") if isinstance(context.get("brand"), dict) else {}
    profile = brand.get("profile") if isinstance(brand.get("profile"), dict) else {}
    candidates = [
        profile.get("palette"),
        profile.get("colorPalette"),
        profile.get("colors"),
        brand.get("palette"),
        brand.get("colorPalette"),
        brand.get("colors"),
    ]
    palette = next((item for item in candidates if isinstance(item, dict) and item), None)
    if not palette:
        return "Brand color direction: use a restrained premium palette drawn from the brand identity, with warm neutrals, editorial contrast, and tasteful accent color. Do not recolor or modify the supplied logo."

    labels = {
        "primary": "Primary",
        "secondary": "Secondary",
        "accent": "Accent",
        "neutral": "Neutral",
        "neutrals": "Neutrals",
        "background": "Background",
        "foreground": "Foreground",
        "charcoal": "Charcoal",
        "cream": "Cream",
    }
    parts: List[str] = []
    for key, value in palette.items():
        if value is None:
            continue
        label = labels.get(str(key), str(key).replace("_", " ").title())
        if isinstance(value, list):
            clean = ", ".join(str(v).strip() for v in value if str(v).strip())
        elif isinstance(value, dict):
            clean = ", ".join(f"{str(k).replace('_', ' ').title()} {v}" for k, v in value.items() if str(v).strip())
        else:
            clean = str(value).strip()
        if clean:
            parts.append(f"{label}: {clean}")
    if not parts:
        return "Brand color direction: use a restrained premium palette drawn from the brand identity, with warm neutrals, editorial contrast, and tasteful accent color. Do not recolor or modify the supplied logo."
    return (
        "Brand color direction: use the brand palette as the visual color system — "
        + "; ".join(parts[:8])
        + ". Apply it to background fields, graphic shapes, dividers, fine rules, accents, and editorial surfaces. Keep the palette restrained and premium; do not oversaturate or recolor the supplied logo."
    )

def _extract_palette_colors(value: Any) -> List[str]:
    if isinstance(value, str):
        clean = value.strip()
        return [clean] if clean.startswith("#") and len(clean) in {4, 7} else []
    if isinstance(value, list):
        colors: List[str] = []
        for item in value:
            colors.extend(_extract_palette_colors(item))
        return list(dict.fromkeys(colors))
    if isinstance(value, dict):
        colors = []
        for item in value.values():
            colors.extend(_extract_palette_colors(item))
        return list(dict.fromkeys(colors))
    return []

def _asset_section(asset_decision: AssetDecision, intent: CreativeIntent) -> str:
    brief_plan = intent.brief_intent_plan
    if not asset_decision.selected_asset_id:
        if intent.content_job_id == "festive_greeting" and intent.festival_visual_scope == "brand_only":
            return (
                "No project or building image is required. Create a brand/occasion-led festive poster using symbolic, culturally respectful festival motifs, "
                "brand palette, refined composition, and clean greeting typography. Do not include towers, facades, construction, amenities, RERA, pricing, or project-specific claims unless explicitly requested."
            )
        return "No supplied project image is required for this concept-led visual. Do not invent project-specific architecture, locations, amenities, or factual claims."
    semantic = (asset_decision.semantic_type or "project visual").replace("_", " ")
    if brief_plan.primary_visual_goal == "generated_lifestyle_scene" and asset_decision.reference_role == "context_grounding":
        environment = ", ".join(brief_plan.environment_required[:5])
        include = ", ".join(brief_plan.must_include[:6])
        base = (
            f"Generate the requested lifestyle scene as the hero visual: {brief_plan.scene_subject}. "
            f"Use the supplied {semantic} asset only as project/context grounding for identity, visual credibility, township/architecture character, and factual constraints. "
            "Do not recreate the selected reference as the main image, facade crop, tower cutout, or static architecture poster."
        )
        if environment:
            base += f" Required environment cues: {environment}."
        if include:
            base += f" Must include visually: {include}."
        constraints = " ".join(asset_decision.truth_constraints)
        if constraints:
            base += f" Reference constraints: {constraints}"
        return base
    if intent.content_job_id == "construction_update" and intent.construction_visual_mode == "visualized_progress_from_project_truth" and not _supports_actual_construction(asset_decision):
        base = (
            f"Use the supplied {semantic} asset as the approved architectural truth source, then visualize the same design at approximately {intent.construction_progress_percent}% construction progress. "
            "This is a construction-stage visualization based on approved design, not an actual current site photo or verified latest progress report. "
            f"{asset_decision.asset_use_plan}"
        )
    else:
        base = f"Use the supplied {semantic} asset as the factual visual anchor. {asset_decision.asset_use_plan}"
    constraints = " ".join(asset_decision.truth_constraints)
    unsupported = "; ".join(asset_decision.unsupported_details)
    if constraints:
        base += f" Truth constraints: {constraints}"
    if unsupported:
        base += f" Do not show or claim these unsupported asset details: {unsupported}."
    return base


def _concept_section(concept: VariantConcept, creative_direction: Dict[str, Any], asset_decision: AssetDecision, intent: CreativeIntent) -> str:
    lever_text = _asset_safe_lever_text(describe_creative_direction(creative_direction), asset_decision.semantic_type, intent) if creative_direction else ""
    pieces = [
        f"Unique visual concept: {concept.creative_big_idea}",
        f"Asset treatment: {concept.asset_treatment}",
        f"Layout plan: {concept.layout_plan}",
        f"Graphic devices: {', '.join(concept.graphic_devices)}" if concept.graphic_devices else "",
        f"Structured levers translated visually for this asset: {lever_text}" if lever_text else "",
        f"Novelty requirement: {concept.why_distinct}",
    ]
    return " ".join(part for part in pieces if part)


def _asset_safe_lever_text(text: str, semantic: str | None, intent: CreativeIntent | None = None) -> str:
    semantic = semantic or ""
    if intent and intent.content_job_id == "festive_greeting" and intent.festival_visual_scope == "brand_only":
        replacements = {
            "hero building cutout treatment": "symbolic festive centerpiece treatment",
            "architectural facade crop": "festive motif crop",
            "truthful cutout treatment using the supplied project visual": "symbolic greeting treatment without project imagery",
            "facade": "festival motif",
            "tower": "festival centerpiece",
            "building exterior": "brand festive visual",
        }
        for old, new in replacements.items():
            text = text.replace(old, new)
        return text
    if semantic in {"entrance", "lobby"}:
        replacements = {
            "hero building cutout treatment": "hero arrival/entrance image treatment",
            "architectural facade crop": "arrival frontage crop",
            "truthful cutout treatment using the supplied project visual": "truthful arrival/lobby treatment using the supplied project visual",
            "facade": "frontage",
            "tower": "arrival visual",
        }
    elif semantic == "interior":
        replacements = {
            "hero building cutout treatment": "hero interior/lifestyle image treatment",
            "architectural facade crop": "interior crop",
            "truthful cutout treatment using the supplied project visual": "truthful interior treatment using the supplied project visual",
            "facade": "interior scene",
            "tower": "interior visual",
        }
    elif semantic == "amenity":
        replacements = {
            "hero building cutout treatment": "hero amenity scene treatment",
            "architectural facade crop": "amenity crop",
            "facade": "amenity scene",
            "tower": "amenity visual",
        }
    else:
        replacements = {}
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text


def _template_section(template: TemplateConstraint) -> str:
    name = template.name or "selected template"
    joined = " ".join([name, " ".join(template.asset_assumptions)]).lower()
    if any(term in joined for term in ["tower", "facade", "exterior"]) and "actual" in template.adaptation_rule.lower():
        name = "selected template"
    return (
        f"Template guidance: Use '{name}' as composition and hierarchy guidance only. "
        f"Layout logic: {template.layout_logic}. Graphic rules: {', '.join(template.graphic_rules[:5])}. "
        f"Adaptation rule: {template.adaptation_rule}"
    )


def _text_section(production: ProductionPlan, copy_plan: CopyPlan) -> str:
    if production.text_treatment == "reserve_space" or production.text_strategy in {"reserve_editable_space", "no_text_visual_only"}:
        return (
            "Text strategy: no text and no typography. Do not render any poster text, captions, letters, numbers, CTA labels, placeholder words, or text-like marks. "
            "Create a clean key visual with intentional empty zones for editable text to be added later."
        )
    parts = []
    if copy_plan.headline:
        parts.append(f"headline '{copy_plan.headline}'")
    if production.text_strategy not in {"minimal_text"} and copy_plan.subheadline:
        parts.append(f"subheadline '{copy_plan.subheadline}'")
    if production.text_strategy in {"poster_copy_block", "proof_badges", "typography_dominant"} and copy_plan.support_copy:
        parts.append(f"support copy '{copy_plan.support_copy}'")
    if production.text_strategy in {"poster_copy_block", "proof_badges"}:
        for point in copy_plan.proof_points[:3]:
            if point:
                parts.append(f"proof point '{point}'")
    if copy_plan.cta:
        parts.append(f"CTA '{copy_plan.cta}'")
    if not parts:
        return "Text strategy: Keep typography minimal and do not invent extra copy."
    return "Text strategy: Render exact readable poster typography with %s. Keep all text in clean graphic layout zones, never as physical facade signage." % ", ".join(parts)


def _production_section(production: ProductionPlan) -> str:
    parts = []
    if production.include_logo and production.logo_asset_id:
        parts.append(f"Use the supplied logo asset exactly once as a separate flat brand mark layer at {_format_position(production.logo_position)}; never redraw, recolor, duplicate, distort, or place it on a building facade.")
    else:
        parts.append("Do not generate, imply, draw, or place any unsupplied logo or brand mark.")
    logo_layers = production.additional_logos or ([production.secondary_logo] if production.secondary_logo.required else [])
    for index, logo_layer in enumerate(logo_layers):
        name = "secondary logo" if index == 0 else f"additional logo {index + 1}"
        label = f" ({logo_layer.label})" if logo_layer.label else ""
        if logo_layer.asset_id:
            parts.append(f"Use the supplied {name}{label} asset exactly once as a separate flat brand mark at {_format_position(logo_layer.position)}; keep it visually subordinate and do not merge it with the primary logo.")
        elif logo_layer.required:
            parts.append(f"Reserve clean space for the required {name}{label}; do not invent, redraw, or fake the missing brand mark.")
    if production.include_rera_qr and production.rera_qr_asset_id:
        parts.append(f"Leave a compact RERA compliance zone at {_format_position(production.rera_position)}; the exact QR/compliance block must be used once and never invented or redrawn.")
    else:
        parts.append("Do not generate, mention, or draw any QR code or RERA QR block.")
    if production.contact_plan.values:
        if production.text_treatment == "reserve_space":
            parts.append(f"Reserve a small clean contact area at {_format_position(production.contact_plan.position)} if needed, but do not render contact text or values.")
        else:
            items = ", ".join(f"{k}: {v}" for k, v in production.contact_plan.values.items())
            parts.append(f"Place only these grounded contact values at {_format_position(production.contact_plan.position)} if shown: {items}.")
    else:
        parts.append("Do not generate phone numbers, WhatsApp labels, email addresses, websites, or contact details.")
    if production.location_plan.required and production.location_plan.value:
        icon = " with a simple location pin icon" if production.location_plan.include_pin_icon else ""
        if production.text_treatment == "reserve_space":
            parts.append(f"Reserve a location label area at {_format_position(production.location_plan.position)}{icon}, but do not render the location text.")
        else:
            parts.append(f"Place the location label '{production.location_plan.value}' at {_format_position(production.location_plan.position)}{icon}; do not invent any other location.")
    elif production.location_plan.required:
        parts.append("Do not invent a location label because the required project location value is missing.")
    return " ".join(parts)


def _grounding_section(asset_decision: AssetDecision, allow_price_claims: bool, production: ProductionPlan) -> str:
    allow_people = asset_decision.reference_role == "context_grounding"
    constraints = [
        "Do not add facade signage, project or brand names physically installed on the building, fake logos, fake QR codes, fake contact details, extra towers, altered architecture, unsupported amenities, unsupported surroundings, ocean/water bodies, template names, asset IDs, or system labels.",
        "Abstract, graphic, studio, paper, gradient, symbolic, cutout, typographic, and editorial treatments are allowed if they do not imply false physical surroundings or alter project truth.",
    ]
    if not allow_people:
        constraints[0] = constraints[0].replace("template names", "random people, template names")
    if not allow_price_claims:
        constraints.append("Do not include price, EMI, discount, offer, or booking amount claims.")
    if production.text_treatment == "reserve_space":
        constraints.append("Do not render readable or pseudo-readable text anywhere in the image.")
    return "Grounding limits: " + " ".join(constraints)


def _supports_actual_construction(asset_decision: AssetDecision) -> bool:
    text = " ".join([
        asset_decision.semantic_type or "",
        asset_decision.asset_use_plan or "",
        " ".join(asset_decision.truth_constraints or []),
        " ".join(asset_decision.unsupported_details or []),
    ]).lower()
    return any(term in text for term in ["construction", "site progress", "progress photo", "work in progress", "actual site"])


def _format_position(position: str) -> str:
    return str(position or "").replace("_", " ").replace("-", " ").strip() or "the requested position"
