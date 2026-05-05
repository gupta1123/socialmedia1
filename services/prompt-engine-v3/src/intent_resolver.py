from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Tuple

from .planning_schemas import ContactIntent, CopyIntent, CreativeIntent
from .schemas import CompileRequest

SEMANTIC_KEYWORDS: List[Tuple[str, List[str]]] = [
    ("interior", ["interior", "inside", "sample flat", "sample apartment", "living room", "bedroom", "kitchen", "home interior", "apartment interior"]),
    ("amenity", ["amenity", "pool", "swimming", "clubhouse", "gym", "yoga", "kids play", "garden", "lounge", "theatre", "netflix room", "sports"]),
    ("location_map", ["map", "location map", "connectivity map", "nearby", "commute", "distance", "location advantage", "connected"]),
    ("construction", ["construction", "progress", "site update", "slab", "under construction", "work in progress"]),
    ("entrance", ["entrance", "gate", "arrival", "lobby arrival", "drop off", "drop-off"]),
    ("aerial", ["aerial", "bird's eye", "birds eye", "top view", "township overview"]),
    ("masterplan", ["masterplan", "site plan", "layout plan", "campus plan"]),
    ("floor_plan", ["floor plan", "unit plan", "layout of flat"]),
    ("building_exterior", ["exterior", "facade", "façade", "tower", "building", "elevation", "architecture hero"]),
]

STYLE_HINTS: List[Tuple[str, List[str]]] = [
    ("museum_editorial", ["museum", "gallery", "exhibition", "curated"]),
    ("luxury_editorial", ["luxury", "premium", "quiet luxury", "editorial", "magazine"]),
    ("bold_campaign", ["bold", "campaign", "loud", "impact", "dominant"]),
    ("minimal", ["minimal", "clean", "simple", "white space", "whitespace"]),
    ("festive", ["diwali", "eid", "navratri", "christmas", "festival", "festive"]),
    ("cinematic", ["cinematic", "dusk", "sunset", "dramatic", "moody"]),
    ("graphic", ["graphic", "abstract", "symbolic", "poster", "cutout", "cut-out"]),
]

NEGATIONS = [
    r"\bno\s+{term}\b",
    r"\bwithout\s+{term}\b",
    r"\bdo\s+not\s+(?:show|include|use|add)\s+{term}\b",
    r"\bdon't\s+(?:show|include|use|add)\s+{term}\b",
    r"\bavoid\s+{term}\b",
]


def resolve_creative_intent(request: CompileRequest, context: Dict[str, Any], content_job_id: str) -> CreativeIntent:
    brief = request.brief or ""
    lowered = brief.lower()
    requested_semantics, strength = _requested_semantics(lowered)
    festival_scope = _festival_visual_scope(request, content_job_id, lowered, requested_semantics)
    construction_mode, construction_percent = _construction_visual_mode(request, content_job_id)
    if content_job_id == "festive_greeting" and festival_scope == "brand_only":
        requested_semantics = []
        strength = "none"
    requested_visual_style = [name for name, terms in STYLE_HINTS if any(_positive(lowered, term) for term in terms)]
    requested_contacts, blocked_contacts = _contact_requests(lowered, request.contact_items)
    text_strategy = _text_strategy(request, lowered)
    creative_mode = _creative_mode(request, lowered, requested_semantics)
    copy_role = _copy_role(request, lowered, creative_mode)
    exact_copy = {key: value for key, value in request.copy_contract.model_dump().items() if isinstance(value, str) and value.strip()}
    tone = _tone_from_audience_and_brief(request.audience, lowered, requested_visual_style)
    creative_goal = _creative_goal(content_job_id, request.audience, requested_semantics, requested_visual_style, brief)
    negatives = _negative_requests(lowered)
    return CreativeIntent(
        content_job_id=content_job_id,
        job_locked=bool(request.content_job_id),
        brief_summary=_brief_summary(brief),
        festival_visual_scope=festival_scope,  # type: ignore[arg-type]
        construction_visual_mode=construction_mode,  # type: ignore[arg-type]
        construction_progress_percent=construction_percent,
        audience=request.audience,
        creative_goal=creative_goal,
        creative_mode=creative_mode,  # type: ignore[arg-type]
        requested_asset_semantics=requested_semantics,
        asset_intent_strength=strength,  # type: ignore[arg-type]
        requested_visual_style=requested_visual_style,
        copy_intent=CopyIntent(mode=request.copy_mode, tone=tone, role=copy_role, exact_fields=exact_copy),
        contact_intent=ContactIntent(requested_items=requested_contacts, blocked_items=blocked_contacts),
        text_strategy=text_strategy,  # type: ignore[arg-type]
        negative_requests=negatives,
    )



def _festival_visual_scope(request: CompileRequest, content_job_id: str, lowered: str, semantics: List[str]) -> str:
    if content_job_id != "festive_greeting":
        return "none"
    explicit = str(getattr(request, "festival_visual_scope", "auto") or "auto")
    if explicit != "auto":
        return explicit
    options = request.options if isinstance(request.options, dict) else {}
    option = str(options.get("festivalVisualScope") or options.get("festival_visual_scope") or "auto")
    if option != "auto":
        return option
    asks_building = bool(set(semantics) & {"building_exterior", "aerial", "entrance"}) or any(
        _positive(lowered, term) for term in ["show building", "use building", "use project image", "show tower", "project visual", "building led", "facade", "building"]
    )
    if request.selected_asset_ids:
        return "building_led"
    if not request.project_id:
        return "building_led" if asks_building else "brand_only"
    return "building_led" if asks_building else "project_supported"


def _construction_visual_mode(request: CompileRequest, content_job_id: str) -> Tuple[str, int]:
    if content_job_id != "construction_update":
        return "none", 50
    options = request.options if isinstance(request.options, dict) else {}
    raw_mode = str(getattr(request, "construction_visual_mode", "auto") or "auto")
    if raw_mode == "auto":
        raw_mode = str(options.get("constructionVisualMode") or options.get("construction_visual_mode") or "auto")
    raw = (
        getattr(request, "construction_progress_percent", None)
        or options.get("constructionProgressPercent")
        or options.get("construction_progress_percent")
        or options.get("progressPercent")
        or 50
    )
    try:
        percent = int(float(raw))
    except Exception:
        percent = 50
    percent = min(90, max(25, percent))
    if raw_mode == "actual_progress_reference":
        return "actual_progress_reference", percent
    return "visualized_progress_from_project_truth", percent


def _requested_semantics(lowered: str) -> Tuple[List[str], str]:
    out: List[str] = []
    hard = False
    for semantic, terms in SEMANTIC_KEYWORDS:
        if any(_positive(lowered, term) for term in terms):
            out.append(semantic)
            if any(re.search(r"\b(show|use|with|feature|make|create).*\b%s\b" % re.escape(term), lowered) for term in terms):
                hard = True
    return _dedupe(out), "hard" if hard else ("soft" if out else "none")


def _contact_requests(lowered: str, explicit: Iterable[str]) -> Tuple[List[str], List[str]]:
    requested = [str(item).lower().strip() for item in explicit if str(item).strip()]
    blocked: List[str] = []
    for item in ["phone", "whatsapp", "email", "website"]:
        if _negative(lowered, item):
            blocked.append(item)
            continue
        terms = [item]
        if item == "phone":
            terms.extend(["mobile", "call", "contact number", "sales number"])
        if item == "website":
            terms.extend(["url", "site link"])
        if any(_positive(lowered, term) for term in terms):
            requested.append(item)
    if _negative(lowered, "contact") or _negative(lowered, "contact details"):
        blocked.extend(["phone", "whatsapp", "email", "website"])
    return _dedupe(requested), _dedupe(blocked)


def _text_strategy(request: CompileRequest, lowered: str) -> str:
    explicit = str(getattr(request, "text_strategy", "auto") or "auto")
    if explicit != "auto":
        return explicit
    options = request.options if isinstance(request.options, dict) else {}
    option = str(
        options.get("text_strategy")
        or options.get("textStrategy")
        or options.get("text_treatment")
        or options.get("textTreatment")
        or ""
    ).strip()
    if option in {"reserve_space", "reserve", "reserve_editable_space"}:
        return "reserve_editable_space"
    if option in {"no_text", "no_text_visual_only"}:
        return "no_text_visual_only"
    if option in {"render_text", "render_exact_text"}:
        return "render_exact_text"
    if any(_positive(lowered, term) for term in ["no text", "without text", "textless", "visual only", "background only"]):
        return "no_text_visual_only"
    if any(_positive(lowered, term) for term in ["reserve space", "editable text", "add text later"]):
        return "reserve_editable_space"
    if any(_positive(lowered, term) for term in ["copy led", "typography led", "text led", "headline led"]):
        return "typography_dominant"
    if any(_positive(lowered, term) for term in ["minimal text", "less text", "tiny text", "keep text minimal"]):
        return "minimal_text"
    return "render_exact_text"


def _creative_mode(request: CompileRequest, lowered: str, semantics: List[str]) -> str:
    explicit = str(getattr(request, "creative_mode", "auto") or "auto")
    if explicit != "auto":
        return explicit
    options = request.options if isinstance(request.options, dict) else {}
    option = str(options.get("creative_mode") or options.get("creativeMode") or "auto")
    if option != "auto":
        return option
    if any(_positive(lowered, term) for term in ["copy led", "typography led", "headline led", "text led"]):
        return "copy_led"
    if any(_positive(lowered, term) for term in ["image led", "visual led", "hero image", "asset led"]):
        return "image_led"
    if any(_positive(lowered, term) for term in ["offer", "emi", "price", "pricing"]):
        return "offer_led"
    if any(_positive(lowered, term) for term in ["proof", "verified", "trust", "connectivity", "location"]):
        return "proof_led"
    if "interior" in semantics or "amenity" in semantics:
        return "lifestyle_led"
    if any(_positive(lowered, term) for term in ["graphic", "abstract", "symbolic"]):
        return "graphic_led"
    return "auto"


def _copy_role(request: CompileRequest, lowered: str, creative_mode: str) -> str:
    if request.copy_mode == "manual":
        return "exact"
    if creative_mode == "copy_led":
        return "dominant"
    if creative_mode == "image_led":
        return "minimal"
    if creative_mode in {"proof_led", "offer_led"}:
        return "proof_heavy"
    if any(_positive(lowered, term) for term in ["minimal copy", "short copy", "minimal text"]):
        return "minimal"
    return "supporting"


def _tone_from_audience_and_brief(audience: Any, lowered: str, style: List[str]) -> str:
    aud = str(audience or "").lower()
    if "family" in aud or "famil" in lowered:
        return "warm premium family-focused"
    if "invest" in aud:
        return "trust-led premium investor-focused"
    if "nri" in aud:
        return "credible premium NRI-focused"
    if "luxury" in style or "luxury" in lowered or "premium" in lowered:
        return "quiet premium editorial"
    return "premium, clear, brand-safe"


def _creative_goal(content_job_id: str, audience: Any, semantics: List[str], styles: List[str], brief: str) -> str:
    audience_text = f" for {audience}" if audience else ""
    if semantics:
        subject = ", ".join(semantics[:2]).replace("_", " ")
        return f"Create a {content_job_id.replace('_', ' ')} creative{audience_text} using {subject} as the visual route, while preserving project truth."
    if styles:
        return f"Create a {content_job_id.replace('_', ' ')} creative{audience_text} with a {', '.join(styles[:2]).replace('_', ' ')} route."
    return f"Create a {content_job_id.replace('_', ' ')} creative{audience_text} that turns the brief into a premium, grounded social post."


def _brief_summary(brief: str) -> str:
    text = re.sub(r"\s+", " ", brief or "").strip()
    return text[:280]


def _negative_requests(lowered: str) -> List[str]:
    out = []
    for item in ["phone", "website", "email", "whatsapp", "qr", "rera", "logo", "text", "people", "price"]:
        if _negative(lowered, item):
            out.append(item)
    return out


def _positive(text: str, term: str) -> bool:
    escaped = re.escape(term.lower())
    if _negative(text, term):
        return False
    return bool(re.search(r"\b%s\b" % escaped, text, flags=re.I))


def _negative(text: str, term: str) -> bool:
    escaped = re.escape(term.lower())
    return any(re.search(pattern.format(term=escaped), text, flags=re.I) for pattern in NEGATIONS)


def _dedupe(items: Iterable[str]) -> List[str]:
    seen = set()
    out = []
    for item in items:
        key = str(item).lower().strip()
        if key and key not in seen:
            out.append(key)
            seen.add(key)
    return out
