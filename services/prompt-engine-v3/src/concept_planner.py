from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, List, Optional

from .creative_levers import VARIANT_LEVER_PROFILES, merge_variant_levers, sanitize_creative_direction
from .creative_routes import CreativeRoute, infer_creative_route, route_variant_label
from .planning_schemas import AssetDecision, CreativeIntent, CreativeStrategy, TemplateConstraint, VariantConcept
from .schemas import CompileRequest

FESTIVE_CONCEPT_BANK = [
    {
        "label": "Elegant Festival Symbol",
        "metaphor": "the festival greeting as a refined cultural symbol poster",
        "devices": ["festive centerpiece", "kolam-inspired linework", "warm gold accent", "wide negative space"],
        "layout": "centered symbolic festive art with clean greeting typography and small brand signature",
    },
    {
        "label": "Quiet Brand Greeting",
        "metaphor": "a premium brand greeting card built around restraint and occasion warmth",
        "devices": ["soft gradient", "thin frame", "minimal motif", "bottom signature"],
        "layout": "minimal greeting-card composition with large calm field and elegant type hierarchy",
    },
]

CONSTRUCTION_CONCEPT_BANK = [
    {
        "label": "Architecture In Formation",
        "metaphor": "the approved architecture taking shape through a clean mid-construction visualization",
        "devices": ["scaffold bands", "safety netting", "partial facade", "controlled site foreground"],
        "layout": "project architecture remains hero while construction-state cues frame the visual honestly",
    },
    {
        "label": "Progress Plate",
        "metaphor": "a premium progress plate showing the future building in formation",
        "devices": ["construction grid", "partial facade reveal", "thin progress marker", "editorial frame"],
        "layout": "architectural visualization with reserved update copy zones and careful truth notes",
    },
]

BUILDING_POSTER_CONCEPT_BANK = [
    {
        "label": "Architectural Type Collision",
        "metaphor": "the building as a truthful architectural object colliding with oversized campaign typography",
        "devices": ["oversized type", "type-image overlap", "building cutout", "masking", "scale contrast"],
        "layout": "poster-first composition where typography and the building interact; avoid building-plus-text blocks",
    },
    {
        "label": "Shape-Led Building World",
        "metaphor": "the building placed inside a designed abstract brand world",
        "devices": ["dominant abstract shape", "building extraction", "curved graphic field", "layered depth", "brand-color atmosphere"],
        "layout": "one strong graphic device visibly structures the building, text, and CTA",
    },
    {
        "label": "Cinematic Vertical Rise",
        "metaphor": "the building as an aspirational vertical presence in a cinematic poster atmosphere",
        "devices": ["dramatic crop", "vertical scale", "atmospheric gradient", "depth haze", "hero silhouette"],
        "layout": "building scale and atmosphere create the poster drama; text anchors into the vertical rhythm",
    },
    {
        "label": "Private Arrival Signal",
        "metaphor": "the building as the destination of a premium private-visit cue",
        "devices": ["arrival cue", "route-like line", "invitation surface", "destination marker", "CTA card"],
        "layout": "site-visit action is communicated through abstract arrival graphics around the building",
    },
    {
        "label": "Layered Campaign System",
        "metaphor": "the building integrated into a layered art-directed campaign world",
        "devices": ["texture layer", "translucent brand field", "masking", "foreground/background depth", "poster collage"],
        "layout": "art-directed layering makes the building feel part of a premium social campaign system",
    },
]

SITE_VISIT_LIFESTYLE_CONCEPT_BANK = [
    {
        "label": "Lifestyle Pathway Arrival",
        "metaphor": "warm leads arriving into the project experience through a lifestyle pathway moment",
        "devices": ["couple/family movement", "pathway perspective", "golden-hour light", "soft project context", "clear CTA"],
        "layout": "lifestyle scene leads; project context supports; CTA is clear but premium",
    },
    {
        "label": "Golden-Hour Township Invitation",
        "metaphor": "a premium approachable township visit invitation at golden hour",
        "devices": ["warm light", "lush environment", "human scale", "modern home context", "appointment cue"],
        "layout": "immersive lifestyle hero with a visit CTA integrated like an invitation",
    },
    {
        "label": "Family Experience Visit Cue",
        "metaphor": "the site visit as an experience a family can picture living in",
        "devices": ["family interaction", "green residential context", "premium warmth", "soft architecture backdrop", "CTA tab"],
        "layout": "human emotion and clear action lead; architecture remains contextual proof",
    },
]

SITE_VISIT_ABSTRACT_CONCEPT_BANK = [
    {
        "label": "Private Invitation Card",
        "metaphor": "the site visit as a premium private invitation",
        "devices": ["invitation-card layering", "appointment tab", "soft route line", "premium surface", "destination cue"],
        "layout": "abstract invite mechanics lead; CTA behaves like an appointment marker",
    },
    {
        "label": "Arrival Path Metaphor",
        "metaphor": "the viewer being guided toward the property experience",
        "devices": ["abstract path", "threshold frame", "directional linework", "arrival glow", "CTA marker"],
        "layout": "one route/arrival metaphor organizes the poster without literal maps or labels",
    },
    {
        "label": "Premium Appointment Signal",
        "metaphor": "a clear but elegant signal to book a private visit",
        "devices": ["appointment cue", "layered card", "quiet urgency", "premium CTA", "symbolic access mark"],
        "layout": "conversion clarity with abstract premium invitation styling",
    },
]

FESTIVAL_LIFESTYLE_CONCEPT_BANK = [
    {
        "label": "Family Festive Warmth",
        "metaphor": "festival emotion expressed through home, light, and togetherness",
        "devices": ["family moment", "festive glow", "home warmth", "symbolic decor", "premium brand signature"],
        "layout": "human festive warmth leads while project/brand context stays subtle and truthful",
    },
    {
        "label": "Community Celebration Mood",
        "metaphor": "the festival as a shared residential/community feeling",
        "devices": ["community warmth", "festive light", "cultural motif", "soft residential context", "greeting type"],
        "layout": "festive lifestyle scene with respectful motifs and no invented event claim",
    },
]

FESTIVAL_ARCHITECTURE_CONCEPT_BANK = [
    {
        "label": "Architecture With Symbolic Light",
        "metaphor": "project presence framed by festival symbolism and light",
        "devices": ["symbolic light", "motif overlay", "architecture context", "warm gradient", "brand signature"],
        "layout": "festival motif and truthful project context coexist without fake physical decorations",
    },
    {
        "label": "Project-Context Festive Greeting",
        "metaphor": "a festive greeting supported by the project identity",
        "devices": ["festive frame", "project context", "cultural pattern", "glow", "greeting typography"],
        "layout": "building/context supports the festival message; motifs remain symbolic unless supplied",
    },
]

GROUNDED_ABSTRACT_CONCEPT_BANK = [
    {
        "label": "Symbolic Graphic Campaign",
        "metaphor": "the message expressed through one symbolic graphic idea",
        "devices": ["abstract shape", "symbolic field", "layered typography", "texture", "premium gradient"],
        "layout": "one symbolic device leads while all facts/copy remain grounded",
    },
    {
        "label": "Atmospheric Metaphor Poster",
        "metaphor": "the project message communicated through atmosphere and visual metaphor",
        "devices": ["atmospheric gradient", "soft depth", "symbolic light", "negative space", "brand-color field"],
        "layout": "a nonliteral campaign world communicates the idea without factual invention",
    },
]

CONCEPT_BANK = [
    {
        "label": "Gallery Plate",
        "metaphor": "architecture or space as a curated gallery exhibit",
        "devices": ["wide margins", "fine rule", "museum label", "paper depth"],
        "layout": "large curated image plate with quiet surrounding typography zones",
    },
    {
        "label": "Campaign Seal",
        "metaphor": "a premium launch announcement anchored by one restrained campaign device",
        "devices": ["single seal", "thin frame", "caption strip", "negative space"],
        "layout": "hero visual balanced by one decisive headline and compact footer",
    },
    {
        "label": "Architectural Index",
        "metaphor": "a precise design index of the project, like a premium architecture catalogue",
        "devices": ["grid modules", "micro captions", "divider lines", "small proof blocks"],
        "layout": "structured grid with the asset as proof and copy as editorial labels",
    },
    {
        "label": "Quiet Monolith",
        "metaphor": "the project as a calm premium object with strong silence around it",
        "devices": ["centered object", "soft shadow", "ivory field", "minimal headline"],
        "layout": "center-weighted visual with very sparse supporting text",
    },
    {
        "label": "Lifestyle Window",
        "metaphor": "a warm glimpse into the lived experience of the project",
        "devices": ["image window", "soft gradient", "warm caption", "small CTA"],
        "layout": "image-led lifestyle composition with minimal premium copy",
    },
    {
        "label": "Proof Orbit",
        "metaphor": "verified advantages orbit around a calm central visual",
        "devices": ["orbit lines", "micro badges", "map-like marks", "thin frame"],
        "layout": "graphic proof-led composition with verified text zones",
    },
]


# Route-specific concept banks should be much larger than the legacy editorial
# bank. Variants are capped at three, but larger banks let generation_run_id /
# variant offsets produce genuinely different mechanics across runs without
# falling back to the same magazine/editorial pattern.
BUILDING_POSTER_CONCEPT_BANK.extend([
    {
        "label": "Object Poster Monolith",
        "metaphor": "the truthful building treated as a premium object poster with dramatic negative space",
        "devices": ["architectural_poster_object", "high_negative_space_poster", "building_shadow_depth", "large_type_mask"],
        "layout": "building becomes a bold object with type/shape depth; avoid rectangular photo placement",
    },
    {
        "label": "Typographic Skyline Slice",
        "metaphor": "the building sliced through oversized typography like a social campaign cover",
        "devices": ["typographic_mask", "type_cut_through", "dynamic_asymmetry", "scale contrast"],
        "layout": "large type and architecture share the same visual plane, creating poster tension",
    },
    {
        "label": "Curved Brand Field",
        "metaphor": "the building anchored by a curved brand-color field that creates a nonliteral premium world",
        "devices": ["curved_brand_field", "soft_shadow", "atmospheric_haze", "cta tab"],
        "layout": "one curved field organizes building, headline, and CTA without a boxed flyer structure",
    },
    {
        "label": "Architectural Shadow Play",
        "metaphor": "building presence emphasized through depth, shadow, and poster-scale contrast",
        "devices": ["building_shadow_depth", "glow_field", "foreground/background depth", "vertical rhythm"],
        "layout": "use cinematic depth and off-frame crop to make architecture feel iconic",
    },
    {
        "label": "Luxury Billboard Crop",
        "metaphor": "a bold outdoor-campaign style crop translated to a 4:5 social poster",
        "devices": ["dramatic crop", "minimal_luxury_caps", "diagonal_motion_band", "clear CTA"],
        "layout": "large crop and confident type deliver campaign impact with minimal clutter",
    },
    {
        "label": "Destination Signal Tower",
        "metaphor": "the building as a destination signal inside a refined social campaign world",
        "devices": ["destination_marker", "route_lines", "abstract_horizon", "poster_headline_first"],
        "layout": "destination/arrival cue frames the architecture without becoming a literal map",
    },
    {
        "label": "Monogram Shape Architecture",
        "metaphor": "a brand-like monogram form frames the building as a premium property icon",
        "devices": ["monogram_field", "masked_architecture_object", "radial_focus", "premium accents"],
        "layout": "a monogram-like shape system creates identity and depth around the truthful building",
    },
])

SITE_VISIT_LIFESTYLE_CONCEPT_BANK.extend([
    {
        "label": "Human-Scale Arrival Walk",
        "metaphor": "the site visit as a warm walk into a place the audience can imagine living in",
        "devices": ["human_arrival_scene", "township_path_cue", "golden-hour light", "cta_as_appointment_tab"],
        "layout": "human movement leads; project context and CTA support conversion",
    },
    {
        "label": "Peaceful Investment Weekend",
        "metaphor": "a calm weekend visit for warm leads weighing home and investment value",
        "devices": ["couple/family movement", "soft green lifestyle", "warm_human_arrival", "clear CTA"],
        "layout": "premium but approachable lifestyle scene with a clear action cue",
    },
    {
        "label": "Modern Township Stroll",
        "metaphor": "a modern township lifestyle shown through path, greenery, and human scale",
        "devices": ["lush environment", "pathway perspective", "human_scale_shadow", "soft architecture context"],
        "layout": "environment and people lead; architecture stays contextual and grounded",
    },
    {
        "label": "Golden Hour Visit Story",
        "metaphor": "a site visit becoming a small aspirational story at golden hour",
        "devices": ["cinematic_lifestyle_gold", "bokeh_depth", "arrival cue", "visit CTA tab"],
        "layout": "story-like lifestyle hero with copy integrated as an invitation",
    },
    {
        "label": "Family Future Moment",
        "metaphor": "a family picturing everyday peace during a private site visit",
        "devices": ["family moment", "soft residential context", "botanical_overlay", "appointment marker"],
        "layout": "human warmth and calm residential mood lead the composition",
    },
    {
        "label": "Premium Lifestyle Gateway",
        "metaphor": "the visit CTA as a gateway into a grounded lifestyle experience",
        "devices": ["threshold frame", "lifestyle_scene_hero", "soft_arrival_glow", "clear visit CTA"],
        "layout": "threshold/gateway metaphor supports a believable lifestyle scene",
    },
])

SITE_VISIT_ABSTRACT_CONCEPT_BANK.extend([
    {
        "label": "Threshold Invite",
        "metaphor": "a premium threshold or doorway-like invitation into the site experience",
        "devices": ["threshold_frame", "soft_arrival_glow", "appointment_marker", "matte_card_layers"],
        "layout": "threshold metaphor is dominant; asset, if used, acts as supporting credibility",
    },
    {
        "label": "Route Signal Invite",
        "metaphor": "an abstract route signal guiding the viewer toward a private site visit",
        "devices": ["route_lines", "destination_marker", "floating_cta_tab", "luxury_gradient_mesh"],
        "layout": "route/arrival linework organizes the poster without becoming a literal map",
    },
    {
        "label": "Appointment Card System",
        "metaphor": "the CTA treated as a refined appointment card inside a premium invite system",
        "devices": ["appointment_marker", "invitation_tabs", "matte_card_layers", "calm_private_invitation"],
        "layout": "CTA and invitation layering drive the composition; photo proof stays secondary if present",
    },
    {
        "label": "Envelope Reveal",
        "metaphor": "the project experience revealed through premium envelope-like layers",
        "devices": ["premium envelope-like surfaces", "diagonal_poster_flow", "soft_shadow", "CTA tab"],
        "layout": "layered reveal mechanic makes the invite feel personal and curated",
    },
    {
        "label": "Access Marker Poster",
        "metaphor": "a private-access marker suggests limited, personal site visit action",
        "devices": ["destination_marker", "symbolic_light_trail", "floating_cta_tab", "radial_focus"],
        "layout": "access marker is the main visual device, not a generic footer button",
    },
    {
        "label": "Invitation Flow",
        "metaphor": "the viewer's eye moves from headline to route cue to CTA like a designed invitation flow",
        "devices": ["editorial_invitation_flow", "route_cta_last", "invitation-card layering", "soft gradient"],
        "layout": "flow and CTA guide the composition; avoid magazine-spread image framing",
    },
    {
        "label": "Private Visit Signal",
        "metaphor": "a single polished signal for private visit action",
        "devices": ["appointment cue", "glow_field", "type_as_visual_object", "destination cue"],
        "layout": "one signal-like device holds headline and CTA together",
    },
])

FESTIVE_CONCEPT_BANK.extend([
    {
        "label": "Light and Pattern Greeting",
        "metaphor": "festival warmth expressed through symbolic light and cultural pattern",
        "devices": ["diya_light", "rangoli_linework", "festival_glow_premium", "brand signature"],
        "layout": "symbolic motif and greeting lead with uncluttered premium spacing",
    },
    {
        "label": "Premium Festive Glow Field",
        "metaphor": "a refined brand-color field warmed by festival light",
        "devices": ["glow_field", "festival_motif", "soft gradient", "minimal_greeting_only"],
        "layout": "festival light/motif creates atmosphere without implying a physical event",
    },
    {
        "label": "Cultural Geometry Poster",
        "metaphor": "respectful festival geometry as a modern brand greeting",
        "devices": ["kolam_linework", "rangoli_linework", "radial_focus", "wide negative space"],
        "layout": "geometric motif dominates; brand and copy remain clean and exact",
    },
    {
        "label": "Symbolic Lamp Stage",
        "metaphor": "a single symbolic lamp/light source as the occasion centerpiece",
        "devices": ["diya_light", "symbolic_light_campaign", "matte_card_layers", "warm gold accent"],
        "layout": "one festival symbol is staged as a premium poster centerpiece",
    },
    {
        "label": "Modern Festive Minimal",
        "metaphor": "a minimal contemporary festival greeting with refined motif restraint",
        "devices": ["minimal_ivory_campaign", "festival_motif", "fine_rule", "brand signature"],
        "layout": "quiet modern festival design with strong whitespace and no generic sticker look",
    },
    {
        "label": "Celebration Light Trail",
        "metaphor": "a soft trail of festive light leading through the greeting",
        "devices": ["symbolic_light_trail", "bokeh_depth", "warm gradient", "greeting type"],
        "layout": "light trail guides the eye while staying symbolic and non-factual",
    },
    {
        "label": "Patterned Occasion Card",
        "metaphor": "a premium occasion card using cultural pattern as a border/frame system",
        "devices": ["patterned_festival_border", "matte_card_layers", "festive_refined_serif", "brand signature"],
        "layout": "occasion-card structure with tasteful cultural detailing",
    },
])

FESTIVAL_LIFESTYLE_CONCEPT_BANK.extend([
    {
        "label": "Home Festival Moment",
        "metaphor": "a festival greeting expressed through warmth at home",
        "devices": ["family moment", "festive_home_warmth", "symbolic decor", "soft residential context"],
        "layout": "human warmth leads; no event, offer, or customer testimonial is implied",
    },
    {
        "label": "Neighbourhood Light Mood",
        "metaphor": "festival warmth as a community/residential light mood",
        "devices": ["community warmth", "lantern_glow", "festive light", "brand signature"],
        "layout": "community feeling leads without claiming a project-hosted celebration",
    },
    {
        "label": "Family Greeting Portrait",
        "metaphor": "a family-facing festive greeting for homebuyers",
        "devices": ["family interaction", "festival_motif", "warm home atmosphere", "greeting type"],
        "layout": "people and greeting share the main visual space with premium restraint",
    },
    {
        "label": "Festive Arrival Home",
        "metaphor": "coming home during the festival as an emotional residential cue",
        "devices": ["arrival cue", "festive glow", "home warmth", "cta_as_appointment_tab"],
        "layout": "arrival/home feeling leads without inventing an actual event or decor installation",
    },
])

FESTIVAL_ARCHITECTURE_CONCEPT_BANK.extend([
    {
        "label": "Symbolic Light Architecture",
        "metaphor": "truthful project context supported by nonliteral festive light",
        "devices": ["symbolic_light_trail", "architecture context", "warm gradient", "motif overlay"],
        "layout": "project image remains truthful; festive elements read as graphic symbolism only",
    },
    {
        "label": "Festival Frame Context",
        "metaphor": "the project framed by an occasion motif without physical decoration claims",
        "devices": ["patterned_festival_border", "project context", "festival_motif", "brand signature"],
        "layout": "motif frame supports project context; no fake facade lighting or event claim",
    },
    {
        "label": "Architecture Greeting Card",
        "metaphor": "project presence translated into a premium festive greeting card",
        "devices": ["matte_card_layers", "architecture context", "symbolic light", "greeting type"],
        "layout": "architecture is a truthful proof layer within an occasion-card system",
    },
    {
        "label": "Premium Glow Context",
        "metaphor": "a warm festive glow around project context while preserving visual truth",
        "devices": ["glow_field", "soft gradient", "architecture as context", "minimal motif"],
        "layout": "glow and motif stay abstract; project image is not physically altered",
    },
])

GROUNDED_ABSTRACT_CONCEPT_BANK.extend([
    {
        "label": "Destination Signal",
        "metaphor": "the message expressed as a refined destination signal",
        "devices": ["destination_marker", "route_lines", "abstract_horizon", "premium gradient"],
        "layout": "one signal/destination device leads while facts remain exact",
    },
    {
        "label": "Symbolic Light Campaign",
        "metaphor": "the campaign idea expressed through light, depth, and symbolic atmosphere",
        "devices": ["symbolic_light_campaign", "glow_field", "luxury_gradient_mesh", "negative space"],
        "layout": "symbolic light creates meaning without factual additions",
    },
    {
        "label": "Layered Brand World",
        "metaphor": "approved facts placed inside a layered premium brand world",
        "devices": ["matte_card_layers", "abstract_shape", "texture", "brand-color field"],
        "layout": "layering and graphic depth drive the composition",
    },
    {
        "label": "Type-Led Symbolic Poster",
        "metaphor": "copy and typography become the main symbolic visual object",
        "devices": ["type_as_visual_object", "big_word_focus", "typographic_mask", "soft shadow"],
        "layout": "headline/copy leads as visual design, not as a plain caption",
    },
    {
        "label": "Abstract Horizon",
        "metaphor": "a calm abstract horizon suggests aspiration without claiming a view",
        "devices": ["abstract_horizon", "soft gradient", "radial_focus", "minimal type"],
        "layout": "nonliteral horizon and depth create aspiration while avoiding false view claims",
    },
    {
        "label": "Metaphoric Object Poster",
        "metaphor": "a symbolic object/shape carries the message like a premium ad poster",
        "devices": ["object_poster_luxury", "curved_brand_field", "shadow_lift", "headline_image_interlock"],
        "layout": "one object-like graphic device structures the creative",
    },
])

CONCEPT_BANK.extend([
    {
        "label": "Social Campaign Object",
        "metaphor": "one social-poster device carrying a grounded project message",
        "devices": ["large abstract shape", "strong type", "CTA tab", "premium depth"],
        "layout": "non-boxy poster device leads while project facts remain exact",
    },
    {
        "label": "Minimal Brand World",
        "metaphor": "a quiet premium brand world built with one symbolic visual field",
        "devices": ["wide negative space", "soft gradient", "floating card", "brand signature"],
        "layout": "minimal but concept-led composition with no generic flyer blocks",
    },
])


def plan_variant_concepts(
    *,
    request: CompileRequest,
    intent: CreativeIntent,
    strategy: CreativeStrategy,
    asset_decision: AssetDecision,
    template_constraint: Optional[TemplateConstraint],
    variant_specs: List[Dict[str, Any]],
) -> List[VariantConcept]:
    route = infer_creative_route(request, intent, asset_decision)
    out: List[VariantConcept] = []
    count = max(1, min(request.variant_count, len(variant_specs) or request.variant_count))
    offset = _run_offset(request)
    for index in range(count):
        spec = variant_specs[index] if index < len(variant_specs) else {}
        bank_list = _concept_bank_for_route(route, intent)
        bank = bank_list[(index + offset) % len(bank_list)]

        # Legacy proof/copy overrides only apply to editorial mode. In poster/lifestyle/festival
        # routes, copy/proof becomes a mechanism inside the chosen route rather than replacing it.
        if route.family == "editorial_grounded":
            if intent.brief_intent_plan.primary_visual_goal == "generated_lifestyle_scene":
                bank = next(item for item in CONCEPT_BANK if item["label"] == "Lifestyle Window")
            if asset_decision.semantic_type in {"interior", "lobby", "entrance"} and index == 0:
                bank = next(item for item in CONCEPT_BANK if item["label"] == "Lifestyle Window")
            if strategy.creative_mode == "proof_led" and intent.content_job_id != "construction_update":
                bank = next(item for item in CONCEPT_BANK if item["label"] in {"Proof Orbit", "Architectural Index"})
            if strategy.creative_mode == "copy_led":
                bank = next(item for item in CONCEPT_BANK if item["label"] == "Campaign Seal")

        direction = spec.get("creative_direction") if isinstance(spec.get("creative_direction"), dict) else {}
        if not direction and template_constraint and route.template_policy in {"loose_guidance", "proof_clarity_wins_template"}:
            direction = deepcopy(template_constraint.lever_signature)
        profile = VARIANT_LEVER_PROFILES[(index + offset) % len(VARIANT_LEVER_PROFILES)]
        structured = sanitize_creative_direction({**merge_variant_levers(direction, profile), **direction}, direction)
        if route.key != "editorial_grounded_post":
            structured.update(_route_lever_overrides(route, index))
        structured["creative_route"] = route.key
        structured["grounding_mode"] = route.grounding_mode
        structured["abstraction_level"] = route.abstraction_level
        structured["mandatory_mechanic"] = route.mandatory_mechanic
        structured["allowed_treatments"] = list(route.allowed_treatments)

        semantic = (asset_decision.semantic_type or "visual asset").replace("_", " ")
        route_label = route_variant_label(route, index)
        raw_label = str(spec.get("label") or "").strip()
        safe_label = _route_safe_spec_text(raw_label, route, asset_decision.semantic_type, "label") if raw_label else None
        label = _asset_safe_variant_label(str(safe_label or f"{bank['label']} — {route_label}"), asset_decision, intent)
        big_idea = _route_safe_spec_text(spec.get("creative_big_idea"), route, asset_decision.semantic_type, "creative_big_idea") or _route_big_idea(route, bank, semantic, intent, strategy)
        asset_treatment = _route_safe_spec_text(spec.get("asset_treatment"), route, asset_decision.semantic_type, "asset_treatment") or _route_asset_treatment(route, asset_decision, bank)
        visual_metaphor = _route_safe_spec_text(spec.get("visual_metaphor"), route, asset_decision.semantic_type, "visual_metaphor") or bank["metaphor"]
        graphic_devices = spec.get("graphic_devices") if isinstance(spec.get("graphic_devices"), list) and spec.get("graphic_devices") else list(bank["devices"])
        graphic_devices = _filter_devices_for_route(graphic_devices, route, intent, asset_decision.semantic_type)
        selected_template_id = None
        if route.template_policy in {"loose_guidance", "proof_clarity_wins_template"}:
            selected_template_id = spec.get("selected_template_id") or (template_constraint.template_id if template_constraint else None)
        out.append(
            VariantConcept(
                variant_id=str(spec.get("variant_id") or f"variant_{index + 1}"),
                label=label,
                variation_axis=str(spec.get("variation_axis") or request.variation_strategy or "creative_route"),
                selected_template_id=selected_template_id,
                creative_big_idea=big_idea,
                why_distinct=str(spec.get("why_distinct") or f"This concept commits to the {bank['metaphor']} route; {route.mandatory_mechanic}"),
                visual_metaphor=visual_metaphor,
                asset_treatment=asset_treatment,
                layout_plan=str(_route_safe_spec_text(spec.get("layout_plan"), route, asset_decision.semantic_type, "layout_plan") or _route_layout_plan(route, bank)),
                graphic_devices=list(graphic_devices),
                copy_strategy=str(spec.get("copy_strategy") or strategy.copy_strategy),
                structured_levers=structured,
                preferred_asset_id=spec.get("preferred_asset_id") or asset_decision.selected_asset_id,
            )
        )
    return out


def _asset_safe_variant_label(label: str, asset_decision: AssetDecision, intent: CreativeIntent) -> str:
    text = str(label or "").strip() or "Creative route"
    lowered = text.lower()
    if intent.content_job_id == "festive_greeting" and intent.festival_visual_scope == "brand_only":
        return "Brand festive route" if any(term in lowered for term in ["tower", "facade", "building", "project"]) else text
    if asset_decision.semantic_type in {"entrance", "lobby", "interior", "amenity"} and any(term in lowered for term in ["tower", "facade", "exterior", "building", "cutout"]):
        return "Asset-faithful selected template route"
    return text


def _concept_bank_for_route(route: CreativeRoute, intent: CreativeIntent) -> List[Dict[str, Any]]:
    if route.key == "building_social_poster":
        return BUILDING_POSTER_CONCEPT_BANK
    if route.key == "site_visit_lifestyle_invite":
        return SITE_VISIT_LIFESTYLE_CONCEPT_BANK
    if route.key == "site_visit_abstract_invitation":
        return SITE_VISIT_ABSTRACT_CONCEPT_BANK
    if route.key == "festival_symbolic_brand_post":
        return FESTIVE_CONCEPT_BANK
    if route.key == "festival_lifestyle_community_post":
        return FESTIVAL_LIFESTYLE_CONCEPT_BANK
    if route.key == "festival_architecture_context_post":
        return FESTIVAL_ARCHITECTURE_CONCEPT_BANK
    if route.key == "grounded_abstract_post":
        return GROUNDED_ABSTRACT_CONCEPT_BANK
    if intent.content_job_id == "construction_update" and intent.construction_visual_mode == "visualized_progress_from_project_truth":
        return CONSTRUCTION_CONCEPT_BANK
    return CONCEPT_BANK


def _filter_devices_for_route(devices: List[Any], route: CreativeRoute, intent: CreativeIntent, semantic: Optional[str]) -> List[str]:
    cleaned = [str(item).strip() for item in devices if str(item).strip()]
    banned = set()
    if route.key == "building_social_poster":
        banned.update({"museum label", "thin frame", "paper depth", "standard footer", "simple image window"})
        cleaned = [item for item in cleaned if item.lower() not in banned]
        return cleaned or ["dominant poster device", "building cutout", "type-image interaction", "layered depth"]
    if route.key == "site_visit_lifestyle_invite":
        banned.update({"facade crop", "tower cutout", "museum label", "orbit lines"})
        out = [item for item in cleaned if item.lower() not in banned]
        if not any("cta" in item.lower() or "appointment" in item.lower() for item in out):
            out.append("clear visit CTA")
        return out
    if route.key == "site_visit_abstract_invitation":
        banned.update({"museum label", "thin frame", "paper depth", "magazine spread", "simple image window", "facade crop", "tower cutout"})
        out = [item for item in cleaned if item.lower() not in banned]
        if not any(any(term in item.lower() for term in ["appointment", "invite", "route", "arrival", "threshold", "cta"]) for item in out):
            out.append("appointment cue")
        return out or ["invitation-card layering", "abstract route/path lines", "appointment-card CTA"]
    if route.family == "festival":
        banned.update({"micro badges", "proof blocks", "map-like marks", "orbit lines", "facade crop"})
        out = [item for item in cleaned if item.lower() not in banned]
        return out or ["festival symbolism", "warm light", "cultural motif", "brand signature"]
    return _filter_devices_for_job(cleaned, intent, semantic)


def _filter_devices_for_job(devices: List[Any], intent: CreativeIntent, semantic: Optional[str]) -> List[str]:
    cleaned = [str(item).strip() for item in devices if str(item).strip()]
    if intent.content_job_id == "festive_greeting" and intent.festival_visual_scope == "brand_only":
        banned = {"micro badges", "proof blocks", "map-like marks", "orbit lines", "facade crop", "tower cutout", "grid modules"}
        fallback = ["festive centerpiece", "kolam-inspired linework", "warm gold accent", "wide negative space"]
        out = [item for item in cleaned if item.lower() not in banned]
        return out or fallback
    if intent.content_job_id == "site_visit":
        banned = {"museum label", "map-like marks", "orbit lines"}
        out = [item for item in cleaned if item.lower() not in banned]
        return out + ["appointment cue"] if "appointment cue" not in [x.lower() for x in out] else out
    if intent.content_job_id == "construction_update":
        banned = {"museum label", "map-like marks", "micro badges"}
        out = [item for item in cleaned if item.lower() not in banned]
        return out or ["scaffold bands", "partial facade", "editorial progress frame"]
    return cleaned


def _route_lever_overrides(route: CreativeRoute, index: int) -> Dict[str, Any]:
    """Force route-compatible levers so old editorial/magazine profiles cannot leak back in."""
    if route.key == "building_social_poster":
        options = [
            {"style_family": "architectural_type_collision", "hero_presentation": "architectural_poster_object", "layout_geometry": "type_collision_stack", "graphic_layer": ["typographic_mask", "type_cut_through", "building_shadow_depth"], "type_voice": "high_impact_editorial", "text_architecture": "type_as_visual_object", "mood_mode": "social_campaign_energy", "visual_mode": "poster_device_led"},
            {"style_family": "shape_led_campaign", "hero_presentation": "masked_architecture_object", "layout_geometry": "shape_world", "graphic_layer": ["curved_brand_field", "soft_shadow", "luxury_gradient_mesh"], "type_voice": "condensed_campaign_sans", "text_architecture": "headline_image_interlock", "mood_mode": "deep_navy_gold_poster", "visual_mode": "poster_device_led"},
            {"style_family": "cinematic_rise", "hero_presentation": "architectural_poster_object", "layout_geometry": "cinematic_vertical_rise", "graphic_layer": ["atmospheric_haze", "glow_field", "abstract_horizon"], "type_voice": "large_luxury_serif", "text_architecture": "poster_headline_first", "mood_mode": "cinematic_vertical_atmosphere", "visual_mode": "poster_device_led"},
        ]
    elif route.key == "site_visit_lifestyle_invite":
        options = [
            {"style_family": "lifestyle_invite_warm", "hero_presentation": "human_arrival_scene", "layout_geometry": "lifestyle_pathway_scene", "graphic_layer": ["township_path_cue", "soft_arrival_glow", "floating_cta_tab"], "type_voice": "warm_lifestyle_sans", "text_architecture": "lifestyle_hook_first", "mood_mode": "golden_hour_approachable", "visual_mode": "lifestyle_generated_context"},
            {"style_family": "township_lifestyle", "hero_presentation": "contextual_township_scene", "layout_geometry": "story_scene_with_cta", "graphic_layer": ["botanical_overlay", "bokeh_depth", "appointment_marker"], "type_voice": "soft_humanist_sans", "text_architecture": "human_message_first", "mood_mode": "lush_modern_residential", "visual_mode": "human_experience_led"},
            {"style_family": "cinematic_lifestyle_gold", "hero_presentation": "lifestyle_scene_hero", "layout_geometry": "human_scale_panorama", "graphic_layer": ["lifestyle_depth_blur", "soft_arrival_glow", "cta_as_appointment_tab"], "type_voice": "storytelling_serif", "text_architecture": "route_cta_last", "mood_mode": "warm_human_arrival", "visual_mode": "lifestyle_generated_context"},
        ]
    elif route.key == "site_visit_abstract_invitation":
        options = [
            {"style_family": "abstract_invitation", "hero_presentation": "invitation_card_hero", "layout_geometry": "invitation_card_layers", "graphic_layer": ["invitation_tabs", "appointment_marker", "matte_card_layers"], "type_voice": "invitation_serif_sans", "text_architecture": "cta_as_appointment_tab", "mood_mode": "calm_private_invitation", "visual_mode": "invitation_metaphor"},
            {"style_family": "arrival_invitation", "hero_presentation": "abstract_destination_marker", "layout_geometry": "arrival_path_composition", "graphic_layer": ["route_lines", "destination_marker", "floating_cta_tab"], "type_voice": "legible_cta_sans", "text_architecture": "route_cta_last", "mood_mode": "minimal_ivory_campaign", "visual_mode": "invitation_metaphor"},
            {"style_family": "appointment_card_premium", "hero_presentation": "appointment_cue_hero", "layout_geometry": "threshold_frame", "graphic_layer": ["threshold_frame", "soft_arrival_glow", "appointment_marker"], "type_voice": "large_luxury_serif", "text_architecture": "invitation_note_first", "mood_mode": "calm_private_invitation", "visual_mode": "grounded_abstract"},
        ]
    elif route.key == "festival_symbolic_brand_post":
        options = [
            {"style_family": "festival_symbolic_luxury", "hero_presentation": "symbolic_festival_centerpiece", "layout_geometry": "festival_symbolic_center", "graphic_layer": ["diya_light", "rangoli_linework", "glow_field"], "type_voice": "festive_refined_serif", "text_architecture": "festival_greeting_first", "mood_mode": "festival_glow_premium", "visual_mode": "festival_symbolic"},
            {"style_family": "cultural_pattern_premium", "hero_presentation": "symbolic_festival_centerpiece", "layout_geometry": "symbolic_center_stage", "graphic_layer": ["kolam_linework", "radial_focus", "patterned_festival_border"], "type_voice": "minimal_luxury_caps", "text_architecture": "minimal_greeting_only", "mood_mode": "symbolic_luxury_light", "visual_mode": "festival_symbolic"},
        ]
    elif route.key == "festival_lifestyle_community_post":
        options = [
            {"style_family": "festival_lifestyle_warmth", "hero_presentation": "lifestyle_scene_hero", "layout_geometry": "community_moment_frame", "graphic_layer": ["lantern_glow", "festival_motif", "bokeh_depth"], "type_voice": "warm_lifestyle_sans", "text_architecture": "festival_greeting_first", "mood_mode": "festive_home_warmth", "visual_mode": "festival_lifestyle"},
        ]
    elif route.key == "festival_architecture_context_post":
        options = [
            {"style_family": "premium_festival_glow", "hero_presentation": "festival_lighting_context", "layout_geometry": "festival_symbolic_center", "graphic_layer": ["symbolic_light_trail", "festival_motif", "glow_field"], "type_voice": "festive_refined_serif", "text_architecture": "festival_greeting_first", "mood_mode": "festival_glow_premium", "visual_mode": "festival_symbolic"},
        ]
    elif route.key == "grounded_abstract_post":
        options = [
            {"style_family": "grounded_symbolic", "hero_presentation": "symbolic_centerpiece", "layout_geometry": "abstract_collage_field", "graphic_layer": ["luxury_gradient_mesh", "symbolic_light_trail", "matte_card_layers"], "type_voice": "poster_display_type", "text_architecture": "visual_metaphor_first", "mood_mode": "symbolic_luxury_light", "visual_mode": "grounded_abstract"},
        ]
    else:
        return {}
    choice = options[index % len(options)]
    return {**choice, "density": "visual_first", "brand_visibility": "elegant_signature"}


def _route_safe_spec_text(value: Any, route: CreativeRoute, semantic: Optional[str], field: str) -> Optional[str]:
    text = _safe_spec_text(value, semantic)
    if not text:
        return None
    if route.key == "editorial_grounded_post":
        return text
    lowered = text.lower()
    if any(term in lowered for term in _route_incompatible_terms(route.key, field)):
        return None
    # Non-editorial route labels should not preserve vague DSPy concepts like
    # "Editorial Site Visit" because they drag the final prompt back to boxy
    # magazine/flyer layouts.
    if field == "label" and route.key != "editorial_grounded_post" and any(term in lowered for term in ["editorial", "magazine", "brochure", "flyer", "template", "swiss", "grid", "planner", "catalog"]):
        return None
    return text


def _route_incompatible_terms(key: str, field: str) -> List[str]:
    common_editorial = [
        "magazine spread", "mimicking a high-end editorial layout", "delicate border", "thin frame", "thin_frame", "paper depth", "paper_depth",
        "hero shot", "significant portion of the layout", "premium serif typeface", "framed within", "editorial aesthetic", "editorial catalog",
    ]
    if key == "building_social_poster":
        return common_editorial + ["brochure", "basic flyer", "image window", "left copy right hero", "left-copy/right-hero"]
    if key == "site_visit_lifestyle_invite":
        return common_editorial + ["facade-only", "facade only", "tower cutout", "tower hero", "ground-up", "building as hero", "architecture-led hero"]
    if key == "site_visit_abstract_invitation":
        return common_editorial + ["facade crop", "tower cutout", "tower hero", "building poster", "photo occupies a significant", "swiss grid", "visit planner", "planner grid"]
    if key.startswith("festival_"):
        return ["proof orbit", "site visit", "price", "pricing", "offer", "rera", "construction update", "facade crop"]
    if key == "grounded_abstract_post":
        return ["proof orbit", "brochure", "basic flyer"]
    return []


def concept_to_spec(concept: VariantConcept) -> Dict[str, Any]:
    return {
        "variant_id": concept.variant_id,
        "label": concept.label,
        "variation_axis": concept.variation_axis,
        "selected_template_id": concept.selected_template_id,
        "creative_direction": concept.structured_levers,
        "copy_angle": concept.copy_strategy,
        "preferred_asset_id": concept.preferred_asset_id,
        "why_distinct": concept.why_distinct,
        "creative_big_idea": concept.creative_big_idea,
        "visual_metaphor": concept.visual_metaphor,
        "asset_treatment": concept.asset_treatment,
        "layout_plan": concept.layout_plan,
        "graphic_devices": concept.graphic_devices,
        "copy_strategy": concept.copy_strategy,
    }


def _route_big_idea(route: CreativeRoute, bank: Dict[str, Any], semantic: str, intent: CreativeIntent, strategy: CreativeStrategy) -> str:
    audience = f" for {intent.audience}" if intent.audience else ""
    plan = intent.brief_intent_plan
    if route.key == "site_visit_lifestyle_invite":
        facts = f" grounded in {', '.join(plan.grounded_facts[:3])}" if plan.grounded_facts else ""
        return f"Create a lifestyle-led site visit invite{audience}{facts}: show the experience of visiting the project, not just the structure."
    if route.key == "building_social_poster":
        return f"Create a social-first architectural poster{audience}: use the supplied {semantic} as a truthful poster object and make one visible creative device drive the composition."
    if route.key == "site_visit_abstract_invitation":
        return f"Create a premium site visit invitation{audience}: express arrival, access, appointment, or private visit through one abstract visual metaphor."
    if route.family == "festival":
        return f"Create a culturally respectful festive creative{audience}: let festival symbolism and mood lead without inventing project events, offers, or physical decorations."
    if route.key == "grounded_abstract_post":
        return f"Create a grounded abstract campaign poster{audience}: make one symbolic visual idea lead while protected facts stay exact."
    return _big_idea(bank, semantic, intent, strategy)


def _route_asset_treatment(route: CreativeRoute, asset_decision: AssetDecision, bank: Dict[str, Any]) -> str:
    semantic = (asset_decision.semantic_type or "visual asset").replace("_", " ")
    if route.key == "building_social_poster" and asset_decision.selected_asset_id:
        return "Use the supplied building as the architecture truth source, not necessarily as a rectangular photo. You may extract, crop, scale, mask, layer, or overlap it with typography/graphics while preserving its actual architecture."
    if route.key == "site_visit_lifestyle_invite":
        return "Generate the lifestyle scene requested by the brief as the main visual. Use selected project/reference assets for grounded context only; do not fall back to facade-only composition."
    if route.key == "site_visit_abstract_invitation":
        return "Use supplied project assets, if any, as destination/context anchors; the main treatment may be abstract invitation, arrival, path, threshold, or appointment-card mechanics."
    if route.family == "festival" and not asset_decision.selected_asset_id:
        return "Use symbolic festive design only; do not invent a project building, event, offer, or factual site decoration."
    if route.key == "grounded_abstract_post":
        return "Use abstract symbolic elements to express the message; any supplied asset remains a truth/context anchor and must not be misrepresented."
    return _asset_treatment(asset_decision, bank)


def _route_layout_plan(route: CreativeRoute, bank: Dict[str, Any]) -> str:
    if route.key == "building_social_poster":
        return f"{bank['layout']} Avoid standard rectangular flyer blocks, left-copy/right-building composition, and plain full-building render layouts."
    if route.key == "site_visit_lifestyle_invite":
        return f"{bank['layout']} Keep the CTA clear and action-oriented without turning the design into a broker flyer."
    if route.key == "site_visit_abstract_invitation":
        return f"{bank['layout']} Use abstract cues only, not literal maps, fake labels, or unsupported directions."
    if route.family == "festival":
        return f"{bank['layout']} Avoid generic building-plus-festival-sticker treatment unless the brief explicitly asks for architecture-led festival context."
    return bank["layout"]


def _big_idea(bank: Dict[str, Any], semantic: str, intent: CreativeIntent, strategy: CreativeStrategy) -> str:
    audience = f" for {intent.audience}" if intent.audience else ""
    plan = intent.brief_intent_plan
    if plan.primary_visual_goal == "generated_lifestyle_scene":
        facts = f" grounded in {', '.join(plan.grounded_facts[:3])}" if plan.grounded_facts else ""
        return f"Create a lifestyle-led {intent.content_job_id.replace('_', ' ')}{audience}{facts}: the hero visual must show {plan.scene_subject}, not a facade-only or static architecture poster."
    if intent.content_job_id == "festive_greeting" and intent.festival_visual_scope == "brand_only":
        return f"Create an occasion-led festive greeting{audience}: treat the poster as {bank['metaphor']} with no project building unless explicitly requested."
    if intent.content_job_id == "construction_update" and intent.construction_visual_mode == "visualized_progress_from_project_truth":
        return f"Create a construction-stage visualization{audience}: treat the approved project architecture as {bank['metaphor']} at approximately {intent.construction_progress_percent}% progress, without claiming verified current progress."
    route = semantic
    if semantic in {"entrance", "lobby"}:
        route = "arrival/lobby moment"
    elif semantic == "building exterior":
        route = "architecture"
    return f"Create a {strategy.creative_mode.replace('_', '-')} {intent.content_job_id.replace('_', ' ')}{audience}: treat the supplied {route} as {bank['metaphor']}, not as a generic real-estate flyer."


def _asset_treatment(asset_decision: AssetDecision, bank: Dict[str, Any]) -> str:
    semantic = (asset_decision.semantic_type or "visual asset").replace("_", " ")
    if not asset_decision.selected_asset_id:
        return f"Use symbolic visual elements only; compose the poster with {', '.join(bank['devices'][:3])}. Do not introduce a building, facade, tower, project render, or real-estate claim unless explicitly requested."
    if asset_decision.reference_role == "context_grounding":
        return (
            f"Generate the lifestyle scene requested by the brief as the main visual. Use the supplied {semantic} only as context grounding for project identity, "
            "not as the hero image; avoid facade-only composition, tower cutout, and static asset recreation."
        )
    if asset_decision.semantic_type in {"entrance", "lobby"}:
        return f"Use the supplied arrival/lobby visual as the truthful anchor; preserve glass doors, frontage, lighting, entry geometry, and material palette while composing it with {', '.join(bank['devices'][:3])}."
    if asset_decision.semantic_type == "interior":
        return f"Use the supplied interior as the truthful lifestyle anchor; preserve room layout, furniture placement, window geometry, materials, and lighting while composing it with {', '.join(bank['devices'][:3])}."
    return f"Use the supplied {semantic} as the truthful visual anchor; preserve its real visual content while composing it with {', '.join(bank['devices'][:3])}."


def _run_offset(request: CompileRequest) -> int:
    options = request.options if isinstance(request.options, dict) else {}
    seed = str(options.get("generation_run_id") or options.get("generationRunId") or options.get("run_seed") or "").strip()
    if not seed:
        return 0
    return sum((index + 1) * ord(char) for index, char in enumerate(seed)) % max(1, len(CONCEPT_BANK))


def _safe_spec_text(value: Any, semantic: Optional[str]) -> Optional[str]:
    text = str(value or "").strip()
    if not text:
        return None
    lower = text.lower()
    if semantic in {"entrance", "lobby"} and any(term in lower for term in ["tower cutout", "facade crop", "full building exterior", "tower hero"]):
        return None
    if semantic == "interior" and any(term in lower for term in ["tower cutout", "facade crop", "building exterior", "tower hero"]):
        return None
    if semantic == "amenity" and any(term in lower for term in ["tower cutout", "facade crop", "building exterior"]):
        return None
    return text
