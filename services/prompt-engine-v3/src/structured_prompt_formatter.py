from __future__ import annotations

import re
from typing import Any, Dict, List

from .context_builder import brand_name, project_name
from .planning_schemas import AssetDecision, CopyPlan, CreativeIntent, CreativeStrategy, ProductionPlan, TemplateConstraint, VariantConcept
from .creative_routes import CreativeRoute, route_from_context


def compose_structured_provider_prompt(
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
    allow_price_claims: bool,
) -> str:
    subject = project_name(context) if context.get("project") else brand_name(context)
    output_format = str(context.get("format") or "4:5")
    route = route_from_context(context)
    if route.key == "editorial_grounded_post":
        sections = [
            _section("Creative objective", _creative_objective(subject, output_format, intent, strategy, concept, route)),
            _section("Asset truth", _asset_truth(asset_decision, intent, route)),
            _section("Brand palette", _palette_section(context, route)),
            _section("Canvas and layout", _layout_section(template, concept, route, asset_decision)),
            _section("Text reserve-space rule" if production.text_treatment == "reserve_space" else "Render only this exact visible text", _exact_text_section(copy_plan, production)),
            _section("Brand, compliance, and contact rules", _brand_rules(production)),
            _section("Creative flexibility", _creative_flexibility(concept, intent, route)),
            _section("Typography and hierarchy", _typography_section(strategy, production, route)),
            _section("Mood and negative constraints", _mood_and_negative_constraints(source_prompt, context, concept, asset_decision, production, allow_price_claims, route)),
        ]
    else:
        sections = [
            _section("Creative objective", _creative_objective(subject, output_format, intent, strategy, concept, route)),
            _section("Asset truth", _asset_truth(asset_decision, intent, route)),
            _section("Canvas and layout", _layout_section(template, concept, route, asset_decision)),
            _section("Creative flexibility", _creative_flexibility(concept, intent, route)),
            _section("Typography and hierarchy", _typography_section(strategy, production, route)),
            _section("Text reserve-space rule" if production.text_treatment == "reserve_space" else "Render only this exact visible text", _exact_text_section(copy_plan, production)),
            _section("Brand, compliance, and contact rules", _brand_rules(production)),
            _section("Brand palette", _palette_section(context, route)),
            _section("Mood and negative constraints", _mood_and_negative_constraints(source_prompt, context, concept, asset_decision, production, allow_price_claims, route)),
        ]
    return _clean("\n\n".join(section for section in sections if section.strip()))


def _section(title: str, body: str) -> str:
    body = _clean(body)
    return f"{title}:\n{body}" if body else ""


def _creative_objective(subject: str, output_format: str, intent: CreativeIntent, strategy: CreativeStrategy, concept: VariantConcept, route: CreativeRoute) -> str:
    job = intent.content_job_id.replace("_", " ")
    if route.key == "editorial_grounded_post":
        pieces = [
            f"Create a finished premium {output_format} real-estate social creative for {subject}.",
            f"Post type: {job}." if job else "",
            f"Audience: {intent.audience}." if intent.audience else "",
            strategy.primary_goal,
            f"Creative route: {concept.label}.",
            f"Copy angle: {concept.copy_strategy}" if concept.copy_strategy else "",
        ]
        return " ".join(piece for piece in pieces if piece)
    creative_kind = "brand festive greeting poster" if route.key == "festival_symbolic_brand_post" else "social media creative"
    pieces = [
        f"Create a finished premium {output_format} {creative_kind} for {subject}.",
        f"Post type: {job}." if job else "",
        f"Audience: {intent.audience}." if intent.audience else "",
        f"Creative family: {route.family}; grounding mode: {route.grounding_mode}; abstraction level: {route.abstraction_level}.",
        f"Mandatory creative mechanic: {route.mandatory_mechanic}.",
        route.prompt_directive,
        strategy.primary_goal,
        f"Variant route: {concept.label}.",
        f"Copy angle: {concept.copy_strategy}" if concept.copy_strategy else "",
    ]
    return " ".join(piece for piece in pieces if piece)


def _asset_truth(asset_decision: AssetDecision, intent: CreativeIntent, route: CreativeRoute) -> str:
    brief_plan = intent.brief_intent_plan
    if not asset_decision.selected_asset_id:
        if route.family == "festival":
            return "No project/building image is required unless supplied. Use festival symbolism, atmosphere, and brand presence; do not invent project architecture, amenities, offers, events, or factual claims."
        if route.key in {"site_visit_lifestyle_invite", "contextual_lifestyle_post"}:
            return "No project image is required for the lifestyle scene. Keep project context generic and grounded to the brief; do not invent exact project amenities, signage, or factual surroundings."
        return "No supplied project image is required for this concept-led visual. Do not invent project-specific architecture, exact locations, amenities, or factual claims. Abstract symbolic/graphic backgrounds are allowed when they do not imply facts."

    semantic = (asset_decision.semantic_type or "project visual").replace("_", " ")
    label = asset_decision.profile.label if asset_decision.profile and asset_decision.profile.label else "selected reference"
    if route.key == "festival_symbolic_brand_post":
        return f"The supplied {semantic} asset '{label}' may be used only as optional brand/project context, not as the hero. Festival symbolism, cultural motif, light, and brand presence must lead. Do not turn this into a building-led creative, do not invent project architecture, amenities, events, offers, or physical festive installations."
    if route.key in {"site_visit_lifestyle_invite", "contextual_lifestyle_post"} or (brief_plan.primary_visual_goal == "generated_lifestyle_scene" and asset_decision.reference_role == "context_grounding"):
        pieces = [
            f"Hero visual requirement: generate the requested lifestyle/experience scene, not a static recreation of the supplied reference. The hero should show {brief_plan.scene_subject or 'the audience experiencing the project context'}.",
            f"Use the supplied {semantic} asset '{label}' only as project/context grounding for identity, architectural/township character, material credibility, and factual constraints.",
            "Do not recreate the selected reference as a facade-only poster, tower cutout, or static architecture layout.",
        ]
        if brief_plan.environment_required:
            pieces.append("Required environment cues: " + ", ".join(brief_plan.environment_required[:6]) + ".")
        if brief_plan.must_include:
            pieces.append("Must include visually: " + ", ".join(brief_plan.must_include[:6]) + ".")
        if asset_decision.truth_constraints:
            pieces.append("Reference constraints: " + " ".join(asset_decision.truth_constraints))
        return " ".join(pieces)

    if route.key == "site_visit_abstract_invitation":
        pieces = [
            f"Use the supplied {semantic} asset '{label}' as a supporting project/context credibility anchor, not as a simple framed hero image.",
            "The invitation, route, threshold, access, or appointment metaphor must remain the main visual engine.",
        ]
        if asset_decision.semantic_type in {"lobby", "entrance", "interior"}:
            pieces.append("Preserve the room/arrival layout, spatial geometry, material finishes, lighting, furniture/reception structure, door/window positions, and visible signage already present. Do not treat it as a tower facade or full exterior.")
        elif asset_decision.semantic_type == "building_exterior":
            pieces.append("Preserve the actual tower form, facade identity, balcony/window rhythm, material language, podium/base, tower count, and proportions if the architecture appears.")
        else:
            pieces.append("Preserve the factual visual content of the selected asset if it appears.")
        pieces.append("Abstract poster backgrounds, symbolic shapes, atmospheric gradients, texture, and non-factual design devices may be creative as long as they do not imply unsupported project features.")
        if asset_decision.unsupported_details:
            pieces.append("Do not show or claim these unsupported asset details: " + "; ".join(asset_decision.unsupported_details) + ".")
        return " ".join(pieces)

    base = [f"Use the supplied {semantic} asset '{label}' as the factual truth source."]
    semantic_key = asset_decision.semantic_type or ""
    if route.key == "building_social_poster":
        base.append("Important: use the building as an architectural truth source, not necessarily as a rectangular photo. You may extract, crop, scale, mask, layer, or overlap the building with typography/abstract graphics, but the actual tower form, facade identity, balcony/window rhythm, material language, podium/base, tower count, and proportions must remain unchanged.")
    elif semantic_key in {"lobby", "entrance", "interior"}:
        base.append("Hero arrival/entrance image treatment: preserve the room/arrival layout, spatial geometry, material finishes, lighting, furniture/reception structure, door/window positions, and visible signage already present. Do not treat it as a tower facade or full exterior.")
    elif semantic_key == "amenity":
        base.append("Asset truth rule: preserve the amenity scene, perspective, built elements, material character, furniture/equipment positions, and visible surroundings. Do not invent extra amenities or change the scene type.")
    else:
        base.append("Architecture truth rule: preserve the tower form, facade identity, balcony/window rhythm, material language, podium treatment, tower count, and visual proportions shown in the source image.")

    if route.abstract_environment_allowed and route.key != "editorial_grounded_post":
        base.append("Grounding distinction: protected project facts and architecture must stay truthful; abstract poster backgrounds, symbolic shapes, atmospheric gradients, texture, and non-factual design devices may be creative as long as they do not imply unsupported project features.")
    if asset_decision.truth_constraints:
        base.append("Honor existing asset truth constraints; use crop, layout, typography, and abstract design treatment for variation, not factual changes.")
    if asset_decision.unsupported_details:
        base.append("Do not show or claim these unsupported asset details: " + "; ".join(asset_decision.unsupported_details) + ".")
    return " ".join(base)


def _layout_section(template: TemplateConstraint, concept: VariantConcept, route: CreativeRoute, asset_decision: AssetDecision) -> str:
    if route.key == "editorial_grounded_post":
        pieces = [concept.layout_plan or "Use a composed social creative with clear hierarchy."]
        if template.layout_logic:
            pieces.append(f"Selected template: {_safe_template_name(template, concept, asset_decision)}. Template guidance: {template.layout_logic}; asset truth overrides template assumptions.")
        return " ".join(pieces)
    route_fallbacks = {
        "building_social_poster": "Use a dynamic social-poster composition where the building becomes a truthful poster object, not a rectangular photo.",
        "site_visit_lifestyle_invite": "Use a lifestyle-led site-visit composition where human experience, environment, and CTA action lead.",
        "site_visit_abstract_invitation": "Use a private-invitation composition where route, threshold, appointment, or access metaphor drives the layout.",
        "grounded_abstract_post": "Use a symbolic/graphic campaign composition with one clear nonliteral idea.",
    }
    layout_plan = _route_safe_text(concept.layout_plan, route, route_fallbacks.get(route.key, "Use a composed social creative with clear hierarchy."))
    pieces = [layout_plan]
    if route.key == "building_social_poster":
        pieces.append("Mandatory poster rule: one visible creative device must drive the composition. Avoid a simple building + logo + text layout, rectangular photo frame, left-copy/right-building layout, brochure panel, or static flyer. Treat the building as a poster object with scale, crop, masking, type interaction, shape, atmosphere, or layered depth.")
    elif route.key == "site_visit_lifestyle_invite":
        pieces.append("Lifestyle experience leads the layout. Use human movement, environment, warmth, and a clear visit CTA; do not reduce the concept to a facade poster or information flyer.")
    elif route.key == "site_visit_abstract_invitation":
        pieces.append("Use one invitation/arrival/access metaphor as the layout engine. CTA should feel like a premium appointment cue, not a generic button.")
    elif route.family == "festival":
        pieces.append("Festival symbolism or festive lifestyle mood drives the composition. Avoid generic building-plus-sticker treatment unless explicitly architecture-led.")
    elif route.key == "grounded_abstract_post":
        pieces.append("Use one symbolic/graphic visual idea as the layout engine while preserving grounded facts.")
    else:
        pieces.append("Use clear hierarchy and premium composition; template is guidance only, not a layout cage.")
    if template.layout_logic and route.template_policy in {"loose_guidance", "proof_clarity_wins_template"}:
        pieces.append(f"Selected template: {_safe_template_name(template, concept, asset_decision)}. Template guidance: {template.layout_logic}; route and asset truth override template assumptions.")
    elif template.template_id:
        pieces.append("Selected template is loose hierarchy guidance only; the creative route and truth contract win over template geometry.")
    return " ".join(pieces)


def _creative_flexibility(concept: VariantConcept, intent: CreativeIntent, route: CreativeRoute) -> str:
    devices = ", ".join(concept.graphic_devices[:8]) if concept.graphic_devices else ""
    if route.key == "editorial_grounded_post":
        return " ".join(piece for piece in [
            "Allow variation in crop, framing, typography placement, and whitespace while preserving factual asset truth.",
            _limit_text(concept.asset_treatment, 170),
            _limit_text(concept.creative_big_idea, 170),
            f"Graphic devices: {devices}." if devices else "",
        ] if piece)
    treatments = ", ".join(route.allowed_treatments[:8]) if route.allowed_treatments else ""
    plan = intent.brief_intent_plan
    pieces: List[str] = []
    if route.key in {"site_visit_lifestyle_invite", "contextual_lifestyle_post"}:
        pieces.extend([
            "Create a believable generated lifestyle scene led by the brief, with people and environment treated as the main visual subject.",
            f"Scene subject: {plan.scene_subject or 'warm leads experiencing the project context'}.",
            f"Environment cues: {', '.join(plan.environment_required[:6])}." if plan.environment_required else "",
            "Use references for context/style grounding only; do not fall back to a facade-only poster.",
        ])
    else:
        pieces.append("Creative freedom is allowed in presentation, not in factual invention.")
    if route.abstract_environment_allowed:
        pieces.append("Allowed abstract treatments include non-factual graphic devices, atmospheric backgrounds, gradients, brand-color fields, symbolic shapes, texture, and depth when they support the route.")
    if treatments:
        pieces.append(f"Allowed creative treatments: {treatments}.")
    pieces.extend([
        _limit_text(_route_safe_text(concept.asset_treatment, route, ""), 260),
        _limit_text(_route_safe_text(concept.creative_big_idea, route, ""), 260),
        f"Graphic devices: {devices}." if devices else "",
    ])
    if route.key == "building_social_poster":
        pieces.append("Do not make all creative moves subtle; at least one poster device must be bold and memorable while remaining premium.")
    return " ".join(piece for piece in pieces if piece)


def _route_safe_text(value: str, route: CreativeRoute, fallback: str = "") -> str:
    text = _clean(value or "")
    if not text or route.key == "editorial_grounded_post":
        return text or fallback
    lowered = text.lower()
    bad = [
        "magazine spread", "mimicking a high-end editorial layout", "delicate border",
        "thin frame", "thin_frame", "paper depth", "paper_depth", "hero shot",
        "significant portion of the layout", "premium serif typeface", "framed within",
        "editorial aesthetic", "editorial catalog", "left-copy/right-hero",
    ]
    if route.key == "site_visit_lifestyle_invite":
        bad.extend(["facade-only", "tower cutout", "tower hero", "building as hero"])
    elif route.key == "site_visit_abstract_invitation":
        bad.extend(["facade crop", "tower cutout", "building poster"])
    elif route.key == "building_social_poster":
        bad.extend(["brochure", "basic flyer", "simple image window"])
    elif route.family == "festival":
        bad.extend(["proof orbit", "pricing", "offer-led", "rera block"])
    if any(term in lowered for term in bad):
        return fallback
    return text


def _palette_section(context: Dict[str, Any], route: CreativeRoute) -> str:
    selected = context.get("selected_color_palette") if isinstance(context.get("selected_color_palette"), dict) else {}
    colors = _extract_colors(selected.get("colors"))
    name = str(selected.get("palette_name") or selected.get("source") or "selected palette").strip()
    strength = str(selected.get("strength") or "soft").lower()
    selected_has_colors = bool(colors)
    if not colors:
        brand = context.get("brand") if isinstance(context.get("brand"), dict) else {}
        profile = brand.get("profile") if isinstance(brand.get("profile"), dict) else {}
        colors = _extract_colors(profile.get("palette") or profile.get("colorPalette") or profile.get("colors") or brand.get("palette") or brand.get("colorPalette") or brand.get("colors"))
        name = "brand palette" if colors else "brand identity"
    if colors:
        if selected_has_colors:
            intro = "Color palette lock: use only these colors for non-photographic design surfaces" if strength == "hard" else "Color palette direction: use these colors as the main design direction"
        else:
            intro = "Brand color direction: use these colors as the visual color system"
        if route.palette_policy in {"poster_device_fields_allowed", "festival_symbolic", "festival_warm_lifestyle", "warm_premium_lifestyle"}:
            return (
                f"{intro} from the {name} — {', '.join(colors[:8])}. "
                "Use the palette for bold or subtle creative devices: large abstract fields, atmospheric gradients, typography, CTA surfaces, masking layers, texture, depth, and premium accents. "
                "Keep taste restrained and premium; avoid cheap saturation, not strong composition. Do not recolor supplied logos; do not oversaturate or recolor the supplied logo, people, buildings, or photos."
            )
        return (
            f"{intro} from the {name} — {', '.join(colors[:8])}. "
            "Use for editorial surfaces, brand graphics, dividers, type/CTA accents, and controlled design fields. "
            "Keep the hero image realistic and dominant. Do not recolor supplied logos; do not oversaturate or recolor the supplied logo, people, buildings, or photos."
        )
    if route.palette_policy in {"poster_device_fields_allowed", "festival_symbolic", "festival_warm_lifestyle", "warm_premium_lifestyle"}:
        return "Brand color direction: use brand-safe premium colors for strong poster devices, atmospheric gradients, typography, CTA surfaces, and subtle depth. Avoid cheap saturation; do not oversaturate or recolor the supplied logo, people, buildings, or photos."
    return "Brand color direction: use the brand palette as the visual color system with warm neutrals, editorial contrast, and tasteful accents. Apply it to backgrounds, graphic shapes, dividers, fine rules, typography accents, and design surfaces; do not oversaturate or recolor the supplied logo, people, buildings, or photos."

def _safe_template_name(template: TemplateConstraint, concept: VariantConcept, asset_decision: AssetDecision) -> str:
    name = str(template.name or template.template_id or "selected template").strip()
    lowered = name.lower()
    semantic = asset_decision.semantic_type or ""
    unsafe_terms = ["tower", "facade", "exterior", "building", "cutout"]
    if semantic in {"entrance", "lobby", "interior", "amenity"} and any(term in lowered for term in unsafe_terms):
        return concept.label or "Asset-faithful selected template route"
    return name


def _brand_rules(production: ProductionPlan) -> str:
    parts: List[str] = []
    if production.include_logo and production.logo_asset_id:
        parts.append(f"Logo instruction: use the supplied primary logo reference exactly once as a separate flat brand mark at {_format_position(production.logo_position)}. {_size_and_margin_text(production.logo_rules_extra)} Keep it compact, sharp, fully visible, and separate from the image. Do not redraw, recolor, crop, warp, stylize, merge, replace, or place it on architecture.")
    elif production.include_logo:
        parts.append(f"Logo instruction: reserve clean space at {_format_position(production.logo_position)} for the missing required primary logo; do not invent, fake, redraw, or approximate that logo.")
    else:
        parts.append("Do not generate, imply, draw, or place any unsupplied logo or brand mark.")

    logo_layers = production.additional_logos or ([production.secondary_logo] if production.secondary_logo.required else [])
    for index, logo_layer in enumerate(logo_layers):
        is_secondary = getattr(logo_layer, "role", "") == "secondary_logo" or (production.secondary_logo.asset_id and logo_layer.asset_id == production.secondary_logo.asset_id)
        name = "Secondary logo" if is_secondary else "Additional logo"
        if logo_layer.asset_id:
            parts.append(f"{name} instruction: use the supplied {name.lower()} reference exactly once as a separate flat brand mark at {_format_position(logo_layer.position)}. {_size_and_margin_text(logo_layer.rules_extra)} Keep it visually subordinate and clearly spaced from headline, contact, and compliance areas. Do not redraw, recolor, crop, merge, stylize, or place it on architecture.")
        elif logo_layer.required:
            parts.append(f"{name} instruction: reserve clean space at {_format_position(logo_layer.position)} for the missing required logo; do not invent, fake, redraw, or approximate that logo.")

    if production.include_rera_qr and production.rera_qr_asset_id:
        parts.append(f"RERA QR production rule: leave a compact clean compliance-safe zone at {_format_position(production.rera_position)}; the exact RERA block is composited after generation. Never invent, redraw, or stylize a QR code.")
    elif production.include_rera_qr:
        parts.append(f"RERA QR production rule: reserve a compact clean compliance-safe zone at {_format_position(production.rera_position)}; do not invent, redraw, or stylize a QR code.")

    if production.contact_plan.values:
        values = ", ".join(f"{key}: {value}" for key, value in production.contact_plan.values.items())
        if production.text_treatment == "reserve_space":
            parts.append("Contact placement instruction: contact values stay in the layout contract for later editing; do not render contact text in the image.")
        else:
            parts.append(f"Contact placement instruction: if contact text is rendered, place only these grounded values at {_format_position(production.contact_plan.position)}: {values}. Do not invent or add extra phone, WhatsApp, email, or website text.")
    elif production.contact_plan.items:
        parts.append("Contact placement instruction: requested contact values are missing, so do not invent contact details or render contact text.")

    if production.location_plan.required and production.location_plan.value:
        if production.text_treatment == "reserve_space":
            parts.append("Location placement instruction: location value stays in the layout contract for later editing; do not render location text in the image.")
        else:
            icon = " with a simple location pin icon" if production.location_plan.include_pin_icon else ""
            parts.append(f"Location placement instruction: render the exact location label '{production.location_plan.value}' at {_format_position(production.location_plan.position)}{icon}; do not invent any other location.")
    elif production.location_plan.required:
        parts.append("Location placement instruction: required location value is missing, so do not invent or render any location label.")
    return " ".join(part for part in parts if part)


def _typography_section(strategy: CreativeStrategy, production: ProductionPlan, route: CreativeRoute) -> str:
    if production.text_treatment == "reserve_space":
        return "No visible typography should be rendered. Reserve clean editable zones for later text overlays."
    hierarchy = ", ".join(strategy.message_hierarchy) if strategy.message_hierarchy else "main visual idea, headline, subheadline, CTA"
    if route.key == "building_social_poster":
        return f"Typography should be a visual part of the poster, not a caption block. The headline may be oversized, split, masked, layered, partially behind/in front of the building, or aligned to the tower rhythm while staying exact and readable. Maintain hierarchy: {hierarchy}. Never render text as physical facade signage."
    if route.key in {"site_visit_lifestyle_invite", "contextual_lifestyle_post"}:
        return f"Typography should support the lifestyle scene and clear visit action. Keep headline warm and legible, subheadline concise, and CTA clearly discoverable. Maintain hierarchy: {hierarchy}. Never imply testimonial text or physical signage."
    if route.key == "site_visit_abstract_invitation":
        return f"Typography should feel like part of the invitation/appointment system. CTA may appear as a premium tab/card/marker. Maintain hierarchy: {hierarchy}. Never add extra map labels or physical signage."
    if route.family == "festival":
        return f"Typography should feel festive, respectful, and premium. Greeting/copy remains exact; no extra slogans or event claims. Maintain hierarchy: {hierarchy}."
    return f"Use premium typography with refined hierarchy. Maintain this hierarchy: {hierarchy}. Keep text legible, purposeful, and never as physical signage."


def _exact_text_section(copy_plan: CopyPlan, production: ProductionPlan) -> str:
    if production.text_treatment == "reserve_space":
        return "Do not render any poster text. Do not render any headline, subheadline, CTA, footer, contact text, location label, captions, letters, numbers, placeholder words, lorem ipsum, gibberish typography, or text-like marks."
    values = []
    copy = copy_plan.as_contract()
    for label, key in [
        ("Headline", "headline"),
        ("Subheadline", "subheadline"),
        ("Support copy", "support_copy"),
        ("Proof point", "proof_point_1"),
        ("Proof point", "proof_point_2"),
        ("Proof point", "proof_point_3"),
        ("CTA", "cta"),
    ]:
        value = str(copy.get(key) or "").strip()
        if value:
            values.append(f'{label}: "{value}"')
    footer = _contact_footer(production)
    if footer:
        values.append(f'Footer: "{footer}"')
    if production.location_plan.value:
        values.append(f'Location: "{production.location_plan.value}"')
    if not values:
        return "Do not invent or render extra readable poster text."
    protected = "Do not alter supplied text, contact text, or logo text."
    if production.include_rera_qr:
        protected = "Do not alter supplied text, contact text, RERA number, QR-safe-zone instructions, or logo text."
    return " ".join(values + ["Do not render any other readable poster text.", protected])


def _mood_and_negative_constraints(source_prompt: str, context: Dict[str, Any], concept: VariantConcept, asset_decision: AssetDecision, production: ProductionPlan, allow_price_claims: bool, route: CreativeRoute) -> str:
    forbidden = "fake logos/contact, physical wordmarks, unsupported factual extras, template names, asset IDs, or system labels"
    if route.architecture_role in {"truthful_architectural_hero_object", "truth_anchor_if_selected", "truthful_context_or_hero_if_asset_selected"}:
        forbidden += ", altered architecture, extra floors/towers, fake facade signage"
    if production.include_rera_qr:
        forbidden += ", or fake QR codes"
    brief = _brief_to_honor(context, source_prompt)
    if route.key == "editorial_grounded_post":
        brief = _brief_to_honor(context, source_prompt)
        pieces = [
            "Mood: premium, polished, grounded, and visually clear.",
            f"User brief: {brief.rstrip('.') }." if brief else "",
            f"Novelty requirement: {_useful_novelty(concept.why_distinct)}" if _useful_novelty(concept.why_distinct) else "",
            "Do not add fake logos/contact, physical wordmarks, altered architecture, unsupported factual extras, template names, asset IDs, or system labels.",
        ]
        if not allow_price_claims:
            pieces.append("Do not include price, EMI, discount, offer, or booking amount claims.")
        if asset_decision.unsupported_details:
            pieces.append("Do not show or claim these unsupported asset details: " + "; ".join(asset_decision.unsupported_details) + ".")
        return " ".join(piece for piece in pieces if piece)
    if route.key == "building_social_poster":
        mood = "Mood: social-first luxury campaign energy, strong poster mechanism, architectural confidence, premium atmosphere, and clear action."
    elif route.key == "site_visit_lifestyle_invite":
        mood = "Mood: premium yet approachable, warm, human, aspirational, golden-hour lifestyle, and action-oriented site visit invitation."
    elif route.key == "site_visit_abstract_invitation":
        mood = "Mood: private invitation, curated arrival, premium appointment cue, calm exclusivity, and clear CTA."
    elif route.family == "festival":
        mood = "Mood: culturally respectful festive warmth, premium brand presence, symbolic light/color, and uncluttered celebration."
    elif route.key == "grounded_abstract_post":
        mood = "Mood: symbolic, polished, campaign-led, premium, and grounded in approved facts."
    else:
        mood = "Mood: premium, polished, grounded, and visually clear."
    pieces = [
        mood,
        f"User brief: {brief.rstrip('.') }." if brief else "",
        f"Novelty requirement: {_useful_novelty(concept.why_distinct)}" if _useful_novelty(concept.why_distinct) else "",
        f"Do not add {forbidden}.",
    ]
    if route.abstract_environment_allowed:
        pieces.append("Abstract/symbolic environments, gradients, shapes, texture, and atmospheric treatments are allowed only as expressive design devices; they must not read as factual project features, amenities, verified views, or physical modifications.")
    if not route.people_allowed:
        pieces.append("Do not add people unless they already exist in the supplied asset or the brief explicitly requires them.")
    elif route.people_allowed:
        pieces.append("Any people are illustrative lifestyle figures only; do not imply actual customers, residents, testimonials, or event attendees.")
    if context.get("style_reference_asset_ids"):
        pieces.append("Use style/reference images only for composition energy, visual mechanics, mood, hierarchy, and social-media impact. Do not copy their text, logos, buildings, claims, contacts, colors, or factual content.")
    if not allow_price_claims:
        pieces.append("Do not include price, EMI, discount, offer, or booking amount claims.")
    if production.text_treatment == "reserve_space":
        pieces.append("Do not render readable or pseudo-readable text anywhere in the image.")
    if asset_decision.unsupported_details:
        pieces.append("Do not show or claim these unsupported asset details: " + "; ".join(asset_decision.unsupported_details) + ".")
    return " ".join(piece for piece in pieces if piece)


def _contact_footer(production: ProductionPlan) -> str:
    values = production.contact_plan.values or {}
    ordered = []
    for key in production.contact_plan.items:
        value = str(values.get(key) or "").strip()
        if value:
            ordered.append(value)
    return " | ".join(ordered)


def _brief_to_honor(context: Dict[str, Any], source_prompt: str) -> str:
    raw = str(context.get("source_brief") or "").strip() or str(source_prompt or "").strip()
    if not raw:
        return ""
    if raw.lower().startswith("create a premium 4:5 real-estate social creative for"):
        return ""
    return _limit_text(raw, 220).rstrip(".")


def _useful_novelty(value: str) -> str:
    text = _clean(value or "")
    lowered = text.lower()
    if not text or lowered.startswith("registry-planned") or "variant for this generation run" in lowered:
        return ""
    return _limit_text(text, 180)


def _limit_text(value: str, limit: int) -> str:
    text = _clean(value or "")
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(" ,;:")
    return cut + "."


def _size_and_margin_text(rules: Dict[str, Any]) -> str:
    if not isinstance(rules, dict):
        return ""
    parts = []
    height = rules.get("height_ratio")
    if isinstance(height, (int, float)) and height > 0:
        parts.append(f"Visual height about {round(height * 100)}% of canvas height.")
    margins = []
    for label, key in [("left", "margin_left_ratio"), ("right", "margin_right_ratio"), ("top", "margin_top_ratio"), ("bottom", "margin_bottom_ratio")]:
        value = rules.get(key)
        if isinstance(value, (int, float)) and value > 0:
            margins.append(f"{round(value * 100)}% {label}")
    if margins:
        parts.append("Keep margins around " + ", ".join(margins) + ".")
    return " ".join(parts)


def _extract_colors(value: Any) -> List[str]:
    if isinstance(value, str):
        match = re.match(r"^#?[0-9a-fA-F]{6}$", value.strip())
        return [("#" + value.strip().lstrip("#")).upper()] if match else []
    if isinstance(value, list):
        colors: List[str] = []
        for item in value:
            colors.extend(_extract_colors(item))
        return list(dict.fromkeys(colors))
    if isinstance(value, dict):
        colors = []
        for item in value.values():
            colors.extend(_extract_colors(item))
        return list(dict.fromkeys(colors))
    return []


def _format_position(position: str) -> str:
    return str(position or "").replace("_", " ").replace("-", " ").strip() or "the requested position"


def _clean(text: str) -> str:
    return re.sub(r"[ \t]+", " ", re.sub(r"\n{3,}", "\n\n", str(text or ""))).strip()
