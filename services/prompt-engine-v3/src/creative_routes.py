from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence

from .planning_schemas import AssetDecision, CreativeIntent
from .schemas import CompileRequest


@dataclass(frozen=True)
class CreativeRoute:
    """A single creative grammar for a post.

    Grounding stays deterministic through truth_contract fields; route fields describe
    how much expressive freedom the image prompt should have without inventing facts.
    """

    key: str
    family: str
    grounding_mode: str
    abstraction_level: float
    creative_priority: str
    architecture_role: str = "supporting_context"
    people_allowed: bool = False
    people_required: bool = False
    abstract_environment_allowed: bool = True
    template_policy: str = "loose_guidance"
    mandatory_mechanic: str = "one clear visual idea"
    allowed_treatments: List[str] = field(default_factory=list)
    forbidden_factual_edits: List[str] = field(default_factory=list)
    variant_routes: List[str] = field(default_factory=list)
    prompt_directive: str = ""
    palette_policy: str = "premium_restrained"

    def as_dict(self) -> Dict[str, Any]:
        return asdict(self)


BASE_FORBIDDEN_FACTUAL_EDITS = [
    "fake factual claims",
    "unsupported offers or pricing",
    "fake RERA/QR/contact details",
    "fake project signage",
    "unsupported amenities",
    "unverified location/configuration claims",
]

ARCHITECTURE_FORBIDDEN = [
    "extra floors or towers",
    "changed facade design",
    "changed balcony/window rhythm",
    "invented podium/base details",
    "fake physical wordmarks on the building",
]


def route_debug_payload(route: CreativeRoute) -> Dict[str, Any]:
    return route.as_dict()


def route_from_context(context: Dict[str, Any]) -> CreativeRoute:
    raw = context.get("creative_route") if isinstance(context, dict) else None
    if isinstance(raw, CreativeRoute):
        return raw
    if isinstance(raw, dict):
        data = dict(raw)
        allowed = {field.name for field in CreativeRoute.__dataclass_fields__.values()}  # type: ignore[attr-defined]
        clean = {key: value for key, value in data.items() if key in allowed}
        try:
            return CreativeRoute(**clean)
        except Exception:
            pass
    return default_route()


def default_route() -> CreativeRoute:
    return CreativeRoute(
        key="editorial_grounded_post",
        family="editorial_grounded",
        grounding_mode="asset_or_project_truth",
        abstraction_level=1.0,
        creative_priority="premium clarity with grounded visual truth",
        architecture_role="truth_anchor_if_selected",
        people_allowed=False,
        abstract_environment_allowed=True,
        template_policy="loose_guidance",
        mandatory_mechanic="clear premium composition with one visual focus",
        allowed_treatments=["crop", "layout", "premium typography", "subtle brand graphics"],
        forbidden_factual_edits=list(BASE_FORBIDDEN_FACTUAL_EDITS),
        variant_routes=["editorial image-led", "premium minimal", "graphic clarity"],
        prompt_directive="Create a grounded premium social creative; preserve facts and use layout/design for variation.",
        palette_policy="premium_restrained",
    )


def infer_creative_route(
    request: CompileRequest,
    intent: CreativeIntent,
    asset_decision: AssetDecision,
    context: Optional[Dict[str, Any]] = None,
) -> CreativeRoute:
    """Route creative generation by post type, brief, references, and selected truth asset.

    This is intentionally semantic and permissive: it distinguishes factual grounding
    from expressive poster/lifestyle/festival treatment.
    """
    context = context or {}
    explicit = _first_nonempty(
        getattr(request, "creative_output_mode", None),
        _option(request, "creative_output_mode", "creativeOutputMode", "route", "creative_route"),
    )
    explicit_key = _normalise_key(explicit)

    brief = _brief_text(request, intent)
    semantic = str(asset_decision.semantic_type or "").lower()
    job = intent.content_job_id
    visual_styles = " ".join(intent.requested_visual_style or []).lower()
    brief_plan = intent.brief_intent_plan

    if explicit_key:
        explicit_route = _route_for_explicit_key(explicit_key, request, intent, asset_decision)
        if explicit_route:
            return _with_request_overrides(explicit_route, request)

    if job == "festive_greeting" or _has_festival_signal(request, brief):
        if _has_any(brief, ["family", "families", "people", "community", "celebrat", "gather", "home together", "lifestyle"]):
            return _with_request_overrides(_festival_lifestyle_route(intent), request)
        asks_no_building = _has_any(brief, ["not building-led", "not building led", "no building", "without building", "no tower", "not architecture-led", "symbolic", "brand only"])
        asks_building = _has_any(brief, ["show building", "use building", "building-led", "building led", "tower", "facade", "architecture-led", "architecture led"])
        if not asks_no_building and (asks_building or intent.festival_visual_scope == "building_led"):
            return _with_request_overrides(_festival_architecture_route(intent), request)
        return _with_request_overrides(_festival_symbolic_route(intent), request)

    if job == "site_visit":
        if _wants_lifestyle_scene(brief, brief_plan):
            return _with_request_overrides(_site_visit_lifestyle_route(intent), request)
        if _wants_building_poster(brief, visual_styles, semantic, request):
            return _with_request_overrides(_building_social_poster_route(intent), request)
        if _has_any(brief, ["invite", "invitation", "appointment", "private visit", "book", "cta", "site visit", "this weekend", "route", "arrival"]):
            return _with_request_overrides(_site_visit_abstract_invitation_route(intent), request)
        return _with_request_overrides(_site_visit_lifestyle_route(intent), request)

    if job in {"project_launch", "lifestyle_post"} and _wants_lifestyle_scene(brief, brief_plan):
        return _with_request_overrides(_contextual_lifestyle_route(intent), request)

    if _wants_building_poster(brief, visual_styles, semantic, request):
        return _with_request_overrides(_building_social_poster_route(intent), request)

    if _has_any(brief, ["abstract", "symbolic", "metaphor", "concept", "not literal", "visual idea", "campaign world"]):
        return _with_request_overrides(_grounded_abstract_route(intent), request)

    if job in {"pricing_ad", "location_highlight", "construction_update"} or intent.creative_mode in {"proof_led", "offer_led"}:
        return _with_request_overrides(_proof_or_update_route(intent), request)

    return _with_request_overrides(default_route(), request)


def style_reference_ids(request: CompileRequest, context: Dict[str, Any], primary_asset_id: Optional[str] = None) -> List[str]:
    """Return assets that should be treated as style references, never truth anchors."""
    ids: List[str] = []
    for attr in ("style_reference_asset_ids", "reference_asset_ids"):
        value = getattr(request, attr, None)
        if isinstance(value, list):
            ids.extend(str(item) for item in value if item)
    options = request.options if isinstance(request.options, dict) else {}
    for key in ("style_reference_asset_ids", "styleReferenceAssetIds", "reference_asset_ids", "referenceAssetIds"):
        value = options.get(key)
        if isinstance(value, list):
            ids.extend(str(item) for item in value if item)
        elif isinstance(value, str) and value.strip():
            ids.extend([part.strip() for part in value.split(",") if part.strip()])

    for asset in _context_assets(context):
        if not isinstance(asset, dict):
            continue
        asset_id = str(asset.get("asset_id") or "").strip()
        if not asset_id:
            continue
        role_blob = " ".join(
            str(asset.get(key) or "")
            for key in ["role", "visual_use", "scene_type", "truth_status", "label", "description"]
        ).lower()
        meta = asset.get("metadata") if isinstance(asset.get("metadata"), dict) else {}
        role_blob += " " + " ".join(str(meta.get(key) or "") for key in ["role", "assetClass", "usageIntent", "subjectType", "referenceType"]).lower()
        if _has_any(role_blob, ["style reference", "style_reference", "moodboard", "inspiration", "instagram", "canva", "reference_only", "visual reference"]):
            ids.append(asset_id)

    excluded = {str(primary_asset_id or "")}
    excluded.add(str(getattr(request, "logo_asset_id", "") or ""))
    excluded.add(str(getattr(request, "rera_qr_asset_id", "") or ""))
    excluded.update(str(x) for x in getattr(request, "additional_logo_asset_ids", []) or [])
    out: List[str] = []
    seen = set(excluded)
    for asset_id in ids:
        if not asset_id or asset_id in seen:
            continue
        out.append(asset_id)
        seen.add(asset_id)
        if len(out) >= 8:
            break
    return out


def route_variant_label(route: CreativeRoute, index: int) -> str:
    if route.variant_routes:
        return route.variant_routes[index % len(route.variant_routes)]
    return f"{route.key.replace('_', ' ').title()} {index + 1}"


# ---- route builders -----------------------------------------------------


def _building_social_poster_route(intent: CreativeIntent) -> CreativeRoute:
    return CreativeRoute(
        key="building_social_poster",
        family="building_social_poster",
        grounding_mode="architectural_strict_with_abstract_poster_world",
        abstraction_level=2.2,
        creative_priority="poster-device-led architecture campaign",
        architecture_role="truthful_architectural_hero_object",
        people_allowed=False,
        abstract_environment_allowed=True,
        template_policy="poster_device_wins",
        mandatory_mechanic="one dominant poster device must drive the composition; the building must not remain a simple rectangular photo with text",
        allowed_treatments=[
            "building cutout/extraction",
            "dramatic crop and scale shift",
            "partial off-frame placement",
            "masking and layered depth",
            "type-image interaction",
            "abstract brand-color shapes",
            "atmospheric gradients and texture",
        ],
        forbidden_factual_edits=ARCHITECTURE_FORBIDDEN + BASE_FORBIDDEN_FACTUAL_EDITS + ["random people unless specifically requested"],
        variant_routes=["type-image collision", "shape-led building world", "cinematic vertical rise", "private arrival signal", "layered campaign system"],
        prompt_directive="Use the supplied building as an architectural truth source and poster object; preserve architecture while creating a social-first campaign world around it.",
        palette_policy="poster_device_fields_allowed",
    )


def _site_visit_lifestyle_route(intent: CreativeIntent) -> CreativeRoute:
    return CreativeRoute(
        key="site_visit_lifestyle_invite",
        family="site_visit",
        grounding_mode="contextual_project_grounding",
        abstraction_level=1.7,
        creative_priority="lifestyle-led visit conversion",
        architecture_role="supporting_project_context",
        people_allowed=True,
        people_required=True,
        abstract_environment_allowed=True,
        template_policy="brief_visual_direction_wins",
        mandatory_mechanic="the lifestyle experience and clear site-visit action must lead; do not fall back to a facade-only poster",
        allowed_treatments=[
            "illustrative couple/family lifestyle scene",
            "arrival/pathway movement",
            "golden-hour atmosphere",
            "premium township ambience",
            "soft project architecture context",
            "clear visit CTA treatment",
        ],
        forbidden_factual_edits=BASE_FORBIDDEN_FACTUAL_EDITS + ["actual customer/testimonial implication", "unsupported exact amenities", "fake event crowd"],
        variant_routes=["lifestyle pathway arrival", "golden-hour township invitation", "family experience visit cue"],
        prompt_directive="Create a premium lifestyle-led site visit invitation; show the experience of visiting the project, not just the structure.",
        palette_policy="warm_premium_lifestyle",
    )


def _site_visit_abstract_invitation_route(intent: CreativeIntent) -> CreativeRoute:
    return CreativeRoute(
        key="site_visit_abstract_invitation",
        family="site_visit",
        grounding_mode="grounded_abstract_invitation",
        abstraction_level=2.4,
        creative_priority="private invitation/action cue",
        architecture_role="destination_context_if_selected",
        people_allowed=False,
        abstract_environment_allowed=True,
        template_policy="route_metaphor_wins",
        mandatory_mechanic="use a private-arrival, invitation, appointment, route, threshold, or access metaphor as the main visual idea",
        allowed_treatments=[
            "invitation-card layering",
            "abstract route/path lines",
            "threshold or doorway-like framing",
            "appointment-card CTA",
            "premium envelope-like surfaces",
            "destination marker as abstract graphic",
        ],
        forbidden_factual_edits=BASE_FORBIDDEN_FACTUAL_EDITS + ["literal map labels", "fake event venue details", "unverified directions"],
        variant_routes=["private invitation card", "arrival path metaphor", "premium appointment signal"],
        prompt_directive="Create a grounded but abstract site visit invite where visual metaphor communicates private arrival and action.",
        palette_policy="poster_device_fields_allowed",
    )


def _contextual_lifestyle_route(intent: CreativeIntent) -> CreativeRoute:
    return CreativeRoute(
        key="contextual_lifestyle_post",
        family="lifestyle",
        grounding_mode="contextual_project_grounding",
        abstraction_level=1.6,
        creative_priority="human lifestyle experience",
        architecture_role="contextual backdrop or proof",
        people_allowed=True,
        people_required=bool(intent.brief_intent_plan.people_required),
        abstract_environment_allowed=True,
        template_policy="brief_visual_direction_wins",
        mandatory_mechanic="the lived experience must lead while project facts remain protected",
        allowed_treatments=["illustrative lifestyle people", "premium environment mood", "soft architecture context", "warm light", "spatial storytelling"],
        forbidden_factual_edits=BASE_FORBIDDEN_FACTUAL_EDITS + ["actual resident/testimonial implication", "unsupported exact amenities"],
        variant_routes=["human moment", "environment experience", "premium lifestyle atmosphere"],
        prompt_directive="Create a credible aspirational lifestyle visual grounded in the project context without inventing factual claims.",
        palette_policy="warm_premium_lifestyle",
    )


def _festival_symbolic_route(intent: CreativeIntent) -> CreativeRoute:
    return CreativeRoute(
        key="festival_symbolic_brand_post",
        family="festival",
        grounding_mode="festival_brand_grounding",
        abstraction_level=2.8,
        creative_priority="symbolic cultural greeting",
        architecture_role="none_or_subtle_brand_context",
        people_allowed=False,
        abstract_environment_allowed=True,
        template_policy="festival_symbol_wins",
        mandatory_mechanic="festival symbolism must lead through respectful motifs, light, color, and cultural atmosphere",
        allowed_treatments=["festival motifs", "symbolic light", "rangoli/kolam-inspired geometry", "festive glow", "premium brand field", "cultural color atmosphere"],
        forbidden_factual_edits=BASE_FORBIDDEN_FACTUAL_EDITS + ["fake festival event", "unsupported offer", "wrong or mixed cultural symbols"],
        variant_routes=["symbolic premium greeting", "minimal festive brand field", "light-and-pattern occasion poster"],
        prompt_directive="Create a premium festival greeting led by symbolic festive design, not by default building placement.",
        palette_policy="festival_symbolic",
    )


def _festival_lifestyle_route(intent: CreativeIntent) -> CreativeRoute:
    return CreativeRoute(
        key="festival_lifestyle_community_post",
        family="festival",
        grounding_mode="festival_contextual_lifestyle",
        abstraction_level=1.9,
        creative_priority="festival warmth and community/lifestyle emotion",
        architecture_role="supporting_residential_context",
        people_allowed=True,
        people_required=True,
        abstract_environment_allowed=True,
        template_policy="festival_lifestyle_wins",
        mandatory_mechanic="festive human warmth or community feeling must lead, with respectful cultural context",
        allowed_treatments=["family/community moment", "festive lights/decor", "warm home atmosphere", "residential context", "symbolic motifs"],
        forbidden_factual_edits=BASE_FORBIDDEN_FACTUAL_EDITS + ["fake project event", "actual customer implication", "unsupported offer"],
        variant_routes=["family festive warmth", "community celebration mood", "home-and-light festive moment"],
        prompt_directive="Create a grounded festive lifestyle post with community warmth; do not invent project events or offers.",
        palette_policy="festival_warm_lifestyle",
    )


def _festival_architecture_route(intent: CreativeIntent) -> CreativeRoute:
    return CreativeRoute(
        key="festival_architecture_context_post",
        family="festival",
        grounding_mode="festival_architecture_context",
        abstraction_level=2.0,
        creative_priority="festival expression with project/architecture presence",
        architecture_role="truthful_context_or_hero_if_asset_selected",
        people_allowed=False,
        abstract_environment_allowed=True,
        template_policy="festival_context_wins",
        mandatory_mechanic="connect festival symbolism with project presence without implying physical festive installations unless supplied",
        allowed_treatments=["symbolic festive overlay", "light atmosphere", "respectful motif framing", "brand-color festive field", "architecture as context"],
        forbidden_factual_edits=ARCHITECTURE_FORBIDDEN + BASE_FORBIDDEN_FACTUAL_EDITS + ["fake physical decoration on actual facade unless requested as symbolic overlay"],
        variant_routes=["architecture with symbolic light", "project-context festive greeting", "premium festive poster world"],
        prompt_directive="Create a festival post where project presence and cultural symbolism coexist without false physical claims.",
        palette_policy="festival_symbolic",
    )


def _grounded_abstract_route(intent: CreativeIntent) -> CreativeRoute:
    return CreativeRoute(
        key="grounded_abstract_post",
        family="grounded_abstract",
        grounding_mode="symbolic_without_false_claims",
        abstraction_level=3.0,
        creative_priority="symbolic/graphic visual idea",
        architecture_role="optional_truth_context",
        people_allowed=False,
        abstract_environment_allowed=True,
        template_policy="abstract_route_wins",
        mandatory_mechanic="one symbolic, graphic, or atmospheric visual idea must lead",
        allowed_treatments=["abstract forms", "symbolic metaphor", "layered graphics", "texture", "premium gradient", "type-image relationship"],
        forbidden_factual_edits=BASE_FORBIDDEN_FACTUAL_EDITS + ["factual-looking unverified project features"],
        variant_routes=["symbolic graphic", "atmospheric metaphor", "minimal abstract campaign"],
        prompt_directive="Create a grounded abstract creative; make the message visual and symbolic without adding factual claims.",
        palette_policy="poster_device_fields_allowed",
    )


def _proof_or_update_route(intent: CreativeIntent) -> CreativeRoute:
    return CreativeRoute(
        key="proof_or_update_post",
        family="proof_or_update",
        grounding_mode="proof_claim_grounding",
        abstraction_level=0.8,
        creative_priority="clarity, verification, and truthful proof",
        architecture_role="truth_anchor_if_selected",
        people_allowed=False,
        abstract_environment_allowed=False,
        template_policy="proof_clarity_wins_template",
        mandatory_mechanic="verified information must remain clear; visual creativity supports proof, not unsupported claims",
        allowed_treatments=["structured hierarchy", "clear proof zones", "restrained graphics", "verified asset crop"],
        forbidden_factual_edits=BASE_FORBIDDEN_FACTUAL_EDITS + ARCHITECTURE_FORBIDDEN + ["unverified numbers", "unverified financial claims"],
        variant_routes=["proof clarity", "verified update", "structured information"],
        prompt_directive="Create a proof-safe grounded post with clear hierarchy and no unsupported claims.",
        palette_policy="premium_restrained",
    )


# ---- helpers ------------------------------------------------------------


def _with_request_overrides(route: CreativeRoute, request: CompileRequest) -> CreativeRoute:
    grounding = _first_nonempty(getattr(request, "grounding_mode", None), _option(request, "grounding_mode", "groundingMode"))
    abstraction = getattr(request, "abstraction_level", None)
    if abstraction is None:
        raw = _option(request, "abstraction_level", "abstractionLevel")
        try:
            abstraction = float(raw) if raw is not None else None
        except Exception:
            abstraction = None
    if grounding is None and abstraction is None:
        return route
    data = route.as_dict()
    if grounding:
        data["grounding_mode"] = str(grounding)
    if abstraction is not None:
        data["abstraction_level"] = max(0.0, min(4.0, float(abstraction)))
    return CreativeRoute(**data)


def _route_for_explicit_key(key: str, request: CompileRequest, intent: CreativeIntent, asset_decision: AssetDecision) -> Optional[CreativeRoute]:
    if key in {"building_social_poster", "poster_device", "social_poster", "building_poster"}:
        return _building_social_poster_route(intent)
    if key in {"site_visit_lifestyle", "lifestyle_invite", "site_visit_lifestyle_invite"}:
        return _site_visit_lifestyle_route(intent)
    if key in {"site_visit_abstract", "abstract_invitation", "site_visit_abstract_invitation"}:
        return _site_visit_abstract_invitation_route(intent)
    if key in {"festival_symbolic", "festival_symbolic_brand_post"}:
        return _festival_symbolic_route(intent)
    if key in {"festival_lifestyle", "festival_lifestyle_community_post"}:
        return _festival_lifestyle_route(intent)
    if key in {"festival_architecture", "festival_architecture_context_post"}:
        return _festival_architecture_route(intent)
    if key in {"grounded_abstract", "abstract_grounded", "symbolic_grounded"}:
        return _grounded_abstract_route(intent)
    if key in {"proof", "proof_or_update", "offer"}:
        return _proof_or_update_route(intent)
    return None


def _wants_building_poster(brief: str, visual_styles: str, semantic: str, request: CompileRequest) -> bool:
    explicit = _normalise_key(_first_nonempty(getattr(request, "creative_output_mode", None), _option(request, "creative_output_mode", "creativeOutputMode")))
    if explicit in {"building_social_poster", "poster_device", "building_poster", "social_poster"}:
        return True
    has_building_asset = semantic in {"building", "facade", "exterior", "tower", "aerial", "architecture", "building_exterior", "project_exterior"}
    poster_language = _has_any(brief + " " + visual_styles, [
        "poster", "instagram", "social media", "social-first", "scroll-stopping", "scroll stopping", "not boxy", "not brochure",
        "not flyer", "canva", "campaign", "cutout", "cut-out", "type interaction", "typography", "masking", "shape-led", "shape led",
    ])
    return has_building_asset and poster_language


def _wants_lifestyle_scene(brief: str, plan: Any) -> bool:
    if getattr(plan, "primary_visual_goal", "") == "generated_lifestyle_scene":
        return True
    return _has_any(brief, [
        "lifestyle", "show the lifestyle", "not just the structure", "family", "couple", "people", "walking", "happy", "lush", "township",
        "garden", "greenery", "mountain", "sahyadri", "peaceful", "modern home", "golden hour",
    ])


def _has_festival_signal(request: CompileRequest, brief: str) -> bool:
    if getattr(request, "festival_id", None):
        return True
    return _has_whole_phrase(brief, [
        "diwali", "deepavali", "holi", "eid", "ramadan", "navratri", "dussehra", "dusshera", "christmas", "ganesh", "ganesh chaturthi",
        "onam", "pongal", "makar sankranti", "sankranti", "akshaya tritiya", "gudi padwa", "raksha bandhan", "rakhi", "festival", "festive greeting", "wishes",
    ])


def _has_whole_phrase(text: str, terms: Sequence[str]) -> bool:
    blob = str(text or "").lower()
    for term in terms:
        words = [re.escape(part) for part in str(term).lower().split()]
        if not words:
            continue
        pattern = r"\b" + r"\s+".join(words) + r"\b"
        if re.search(pattern, blob):
            return True
    return False


def _brief_text(request: CompileRequest, intent: CreativeIntent) -> str:
    return " ".join(str(part or "") for part in [request.brief, intent.brief_summary, intent.creative_goal, intent.audience, request.audience]).lower()


def _first_nonempty(*values: Any) -> Optional[str]:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _option(request: CompileRequest, *keys: str) -> Optional[Any]:
    options = request.options if isinstance(request.options, dict) else {}
    for key in keys:
        if key in options and options[key] not in {None, ""}:
            return options[key]
    return None


def _normalise_key(value: Optional[str]) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(value or "").lower()).strip("_")


def _has_any(text: str, terms: Sequence[str]) -> bool:
    blob = str(text or "").lower()
    for term in terms:
        pattern = re.escape(str(term).lower()).replace("\\ ", r"\s+")
        if re.search(pattern, blob):
            return True
    return False


def _context_assets(context: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    pools = []
    for key in ("assets", "project_assets", "reference_assets", "uploaded_assets"):
        value = context.get(key)
        if isinstance(value, list):
            pools.extend(value)
    project = context.get("project") if isinstance(context.get("project"), dict) else {}
    for key in ("assets", "media", "projectAssets"):
        value = project.get(key)
        if isinstance(value, list):
            pools.extend(value)
    return [item for item in pools if isinstance(item, dict)]
