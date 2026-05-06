from __future__ import annotations

import re
from typing import Dict, List, Optional

from .context_builder import brand_name, project_name
from .planning_schemas import CopyPlan, CreativeIntent, CreativeStrategy, GroundedFactStore, ProductionPlan, VariantConcept
from .schemas import CompileRequest, SessionFactOverride

CTA_BY_JOB = {
    "project_launch": "Explore The Project",
    "amenity_spotlight": "Explore The Amenity",
    "pricing_ad": "Enquire Now",
    "site_visit": "Book A Site Visit",
    "location_advantage": "Explore The Location",
    "construction_update": "View Update",
    "educational_buyer_guide": "Learn More",
    "festive_greeting": "Warm Wishes",
    "testimonial_story": "Hear Their Story",
}


def plan_copy(
    *,
    request: CompileRequest,
    context: Dict[str, object],
    intent: CreativeIntent,
    strategy: CreativeStrategy,
    production: ProductionPlan,
    fact_store: GroundedFactStore,
    concept: VariantConcept,
    session_facts: List[SessionFactOverride],
    raw_copy: Optional[Dict[str, str]] = None,
) -> CopyPlan:
    manual = request.copy_contract.model_dump()
    manual_has_copy = any(str(value or "").strip() for value in manual.values())
    # Treat manual mode with all-null/empty fields as "no manual copy supplied". This is
    # common from UI forms and should not create empty rendered text, especially for
    # festive greetings.
    if request.copy_mode == "manual" and manual_has_copy:
        return _manual_copy(manual, production, source="manual")
    if raw_copy:
        merged = _merge_copy(raw_copy, manual)
        if any(merged.values()) and not _is_weak_auto_copy(merged, context, intent, concept):
            return _manual_copy(merged, production, source="llm_or_partial")
    copy_role = intent.copy_intent.role or "supporting"
    subject = project_name(context) if context.get("project") else brand_name(context)
    audience = (intent.audience or "").lower()
    semantic = concept.asset_treatment.lower()
    headline = _headline(intent, strategy, concept, subject, audience)
    subheadline = _subheadline(intent, strategy, concept, semantic, fact_store)
    cta = _cta(request.content_job_id or intent.content_job_id, strategy, production, subject)
    if copy_role == "minimal":
        subheadline = _shorten(subheadline, 92)
    if strategy.creative_mode == "copy_led":
        headline = _stronger_headline(headline, concept)
    proof_points = _proof_points(intent, fact_store)
    return CopyPlan(
        copy_role=copy_role,
        headline=headline,
        subheadline=subheadline,
        cta=cta,
        support_copy=_support_copy(intent, strategy, fact_store, concept),
        proof_points=proof_points if _should_show_proof_points(strategy) else [],
        contact_line=_contact_line(production),
        forbidden_claims=_forbidden_claims(request, intent),
        source="auto_planned",
    )


def _manual_copy(copy: Dict[str, object], production: ProductionPlan, source: str) -> CopyPlan:
    headline = str(copy.get("headline") or "").strip()
    subheadline = str(copy.get("subheadline") or "").strip()
    cta = str(copy.get("cta") or "").strip()
    return CopyPlan(headline=headline, subheadline=subheadline, cta=cta, contact_line=_contact_line(production), source=source)


def _merge_copy(raw: Dict[str, str], manual: Dict[str, object]) -> Dict[str, str]:
    return {
        "headline": str(manual.get("headline") or raw.get("headline") or "").strip(),
        "subheadline": str(manual.get("subheadline") or raw.get("subheadline") or "").strip(),
        "cta": str(manual.get("cta") or raw.get("cta") or "").strip(),
    }


def _headline(intent: CreativeIntent, strategy: CreativeStrategy, concept: VariantConcept, subject: str, audience: str) -> str:
    asset_language = (concept.asset_treatment + " " + concept.visual_metaphor).lower()
    if intent.content_job_id == "festive_greeting":
        festival = _festival_name_from_goal(intent)
        return f"Happy {festival}" if festival else "Warm Festive Wishes"
    if intent.content_job_id == "pricing_ad":
        return "A Smarter Way To Move Up"
    if intent.content_job_id == "location_advantage":
        return "Connected To What Matters"
    if intent.content_job_id == "construction_update":
        return "Progress, Visualized With Care"
    if intent.content_job_id == "amenity_spotlight":
        return "Designed Around Everyday Ease"
    if "entrance" in asset_language or "arrival" in asset_language or "lobby" in asset_language:
        return "A Calmer Arrival Begins Here"
    if "family" in audience:
        return "A Home Story Begins Here"
    if strategy.creative_mode == "lifestyle_led":
        return "Step Into The Life Ahead"
    if strategy.creative_mode == "copy_led":
        return "Not Just Launched. Composed."
    if "gallery" in concept.label.lower() or "gallery" in concept.visual_metaphor.lower():
        return "An Address, Curated"
    return _project_specific_intro(subject)


def _subheadline(intent: CreativeIntent, strategy: CreativeStrategy, concept: VariantConcept, semantic: str, fact_store: GroundedFactStore) -> str:
    if intent.content_job_id == "festive_greeting":
        return "Celebrating gratitude, abundance, and new beginnings."
    if intent.content_job_id == "construction_update":
        return f"A construction-stage visualization based on the approved project design, shown at approximately {intent.construction_progress_percent}% progress."
    location = fact_store.first_value("micro_location") or fact_store.first_value("city")
    config = fact_store.first_value("configuration") or fact_store.first_value("configurations")
    asset_language = (concept.asset_treatment + " " + semantic).lower()
    if "entrance" in asset_language or "arrival" in asset_language or "lobby" in asset_language:
        place = f" in {location}" if location else ""
        return f"A composed first impression{place}, shaped with premium arrival, light, and urban confidence."
    if strategy.creative_mode == "lifestyle_led":
        return "A warm, composed glimpse of everyday living, shaped into a premium project story."
    if strategy.creative_mode == "proof_led" and location:
        return f"A grounded project communication built around verified context near {location}."
    if strategy.creative_mode == "offer_led":
        return "A clear proposition-led creative with only grounded offer and contact details."
    if "interior" in semantic:
        return "Interior-led warmth, calm hierarchy, and a project story that feels ready to live in."
    if location and config:
        return f"A refined {config} project introduction at {location}, framed with truthful visuals and campaign-grade restraint."
    if location:
        return f"A refined project introduction at {location}, framed with truthful visuals and a distinct campaign mood."
    return "A refined project introduction with clear hierarchy, truthful visuals, and a distinct campaign mood."


def _support_copy(intent: CreativeIntent, strategy: CreativeStrategy, fact_store: GroundedFactStore, concept: VariantConcept) -> str:
    if strategy.creative_mode not in {"copy_led", "proof_led", "offer_led"}:
        return ""
    location = fact_store.first_value("micro_location") or fact_store.first_value("city")
    config = fact_store.first_value("configuration")
    tagline = fact_store.first_value("tagline")
    approved_claim = fact_store.first_value("approved_claim")
    price = fact_store.first_value("price") if intent.content_job_id == "pricing_ad" or strategy.creative_mode == "offer_led" else ""
    if strategy.creative_mode == "offer_led":
        pieces = [piece for piece in [price, config, location] if piece]
        if pieces:
            return "A clear proposition anchored in %s." % ", ".join(pieces[:3])
        return "A focused enquiry-led message with only verified project details."
    if strategy.creative_mode == "proof_led":
        pieces = [piece for piece in [location, config, approved_claim] if piece]
        if pieces:
            return "Grounded in verified project context: %s." % ", ".join(pieces[:3])
        return "A fact-first project message using only verified details."
    if tagline:
        return tagline
    if config and location:
        return f"{config} homes planned around everyday comfort at {location}."
    if location:
        return f"A composed project story shaped around the address at {location}."
    if approved_claim:
        return approved_claim
    if concept.copy_strategy:
        return _shorten(concept.copy_strategy, 120)
    return "A composed project story with clear reasons to explore."


def _should_show_proof_points(strategy: CreativeStrategy) -> bool:
    return strategy.creative_mode in {"copy_led", "proof_led", "offer_led"}


def _cta(content_job_id: str, strategy: CreativeStrategy, production: ProductionPlan, subject: str = "") -> str:
    if content_job_id == "festive_greeting":
        clean = subject.strip() or "the brand"
        return f"Warm wishes from {clean}"
    if production.contact_plan.values and strategy.creative_mode in {"offer_led", "proof_led"}:
        return "Enquire Now"
    return CTA_BY_JOB.get(content_job_id, "Discover More")


def _stronger_headline(headline: str, concept: VariantConcept) -> str:
    if "gallery" in concept.visual_metaphor.lower():
        return "An Address Worth Framing"
    return headline


def _proof_points(intent: CreativeIntent, fact_store: GroundedFactStore) -> List[str]:
    points = []
    for field in ["micro_location", "city", "rera", "price"]:
        value = fact_store.first_value(field)
        if value:
            points.append(value)
    return points[:3]


def _contact_line(production: ProductionPlan) -> Optional[str]:
    if not production.contact_plan.values:
        return None
    parts = []
    for key, value in production.contact_plan.values.items():
        label = "WhatsApp" if key == "whatsapp" else key.title()
        parts.append(f"{label}: {value}")
    return " | ".join(parts)


def _forbidden_claims(request: CompileRequest, intent: CreativeIntent) -> List[str]:
    text = (request.brief or "").lower()
    blocked = []
    if not re.search(r"\b(price|pricing|emi|offer|₹|rs\.?|inr)\b", text) and intent.content_job_id != "pricing_ad":
        blocked.append("price_or_emi")
    return blocked


def _shorten(text: str, max_len: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= max_len:
        return text
    return text[:max_len].rsplit(" ", 1)[0].rstrip(" ,;:." ) + "."


def _project_specific_intro(subject: str) -> str:
    clean = subject.strip()
    if clean:
        return f"A Composed Introduction To {clean}"
    return "A Composed Project Introduction"



def _festival_name_from_goal(intent: CreativeIntent) -> str:
    text = " ".join([intent.brief_summary or "", intent.creative_goal or ""]).lower()
    known = ["pongal", "diwali", "eid", "navratri", "christmas", "new year", "holi", "ganesh chaturthi", "onam", "raksha bandhan"]
    for item in known:
        if item in text:
            return item.title()
    return ""


def _is_weak_auto_copy(copy: Dict[str, str], context: Dict[str, object], intent: CreativeIntent, concept: VariantConcept) -> bool:
    subject = project_name(context) if context.get("project") else brand_name(context)
    headline = str(copy.get("headline") or "").strip()
    subheadline = str(copy.get("subheadline") or "").strip().lower()
    cta = str(copy.get("cta") or "").strip().lower()
    generic_subs = {
        "elevated urban living",
        "premium urban living",
        "discover modern living",
        "luxury living",
        "experience luxury",
        "a landmark address",
    }
    generic_ctas = {"discover more", "learn more", "explore more"}
    if headline and subject and headline.lower() == str(subject).strip().lower() and subheadline in generic_subs:
        return True
    if subheadline in generic_subs and cta in generic_ctas:
        return True
    if intent.audience and intent.audience.lower() not in (headline + " " + subheadline).lower() and subheadline in generic_subs:
        return True
    if any(word in (concept.asset_treatment + " " + concept.visual_metaphor).lower() for word in ["entrance", "arrival", "lobby", "interior", "amenity"]) and subheadline in generic_subs:
        return True
    return False
