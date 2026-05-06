from __future__ import annotations

from typing import Any, Dict, List
import re

from .context_builder import project_name, project_profile
from .schemas import CompileRequest, SessionFactOverride


DEFAULT_COPY_BY_JOB = {
    "project_launch": {
        "headline": "A New Address Takes Shape",
        "subheadline": "Premium urban living with a composed architectural presence.",
        "cta": "Register Interest",
    },
    "amenity_spotlight": {
        "headline": "Everyday Living, Elevated",
        "subheadline": "Thoughtful amenities shape a calmer rhythm at home.",
        "cta": "Explore The Lifestyle",
    },
    "site_visit": {
        "headline": "Visit This Weekend",
        "subheadline": "Experience the address, setting, and arrival in person.",
        "cta": "Book Your Visit",
    },
    "location_advantage": {
        "headline": "Connected To What Matters",
        "subheadline": "A composed address with everyday access close at hand.",
        "cta": "Explore The Location",
    },
    "pricing_ad": {
        "headline": "A Considered Homebuying Opportunity",
        "subheadline": "Use only verified or client-supplied pricing in final copy.",
        "cta": "Enquire Now",
    },
    "festive_greeting": {
        "headline": "Warm Wishes",
        "subheadline": "A thoughtful greeting from the brand.",
        "cta": "",
    },
    "construction_update": {
        "headline": "Progress, Built With Care",
        "subheadline": "A grounded update from the site, shared with clarity and confidence.",
        "cta": "View Progress",
    },
    "educational_buyer_guide": {
        "headline": "A Smarter Way To Evaluate Your Next Home",
        "subheadline": "Clear, useful guidance for confident homebuying decisions.",
        "cta": "Learn More",
    },
    "testimonial_story": {
        "headline": "Trust, Told Simply",
        "subheadline": "A grounded customer story without invented names or quotes.",
        "cta": "Explore The Story",
    },
}


def build_copy_contract(
    request: CompileRequest,
    context: Dict[str, Any],
    content_job_id: str,
    session_facts: List[SessionFactOverride],
    raw_copy: Any = None,
) -> Dict[str, str]:
    manual = {
        "headline": request.copy_contract.headline or "",
        "subheadline": request.copy_contract.subheadline or "",
        "cta": request.copy_contract.cta or "",
    }
    if request.copy_mode == "manual":
        return manual
    generated = raw_copy if isinstance(raw_copy, dict) else {}
    fallback = _job_fallback_copy(content_job_id, context, session_facts)
    copy = {
        "headline": _clean_copy(generated.get("headline") or manual["headline"] or fallback["headline"]),
        "subheadline": _clean_copy(generated.get("subheadline") or manual["subheadline"] or fallback["subheadline"]),
        "cta": _clean_copy(generated.get("cta") or manual["cta"] or fallback["cta"]),
    }
    if not price_allowed_for_request(request.brief, content_job_id):
        for key, value in list(copy.items()):
            if contains_price_claim(value):
                copy[key] = fallback.get(key, "") or DEFAULT_COPY_BY_JOB["project_launch"].get(key, "")
    return copy


def visible_text_allowed(copy: Dict[str, str], session_facts: List[SessionFactOverride]) -> List[str]:
    values = [
        copy.get("headline"),
        copy.get("subheadline"),
        copy.get("support_copy"),
        copy.get("proof_point_1"),
        copy.get("proof_point_2"),
        copy.get("proof_point_3"),
        copy.get("cta"),
    ]
    values.extend(fact.value for fact in session_facts if fact.field in {"price", "emi", "phone", "email", "website", "rera"})
    return [str(value).strip() for value in values if str(value or "").strip()]


def _job_fallback_copy(content_job_id: str, context: Dict[str, Any], session_facts: List[SessionFactOverride]) -> Dict[str, str]:
    copy = dict(DEFAULT_COPY_BY_JOB.get(content_job_id, DEFAULT_COPY_BY_JOB["project_launch"]))
    profile = project_profile(context)
    if content_job_id == "project_launch":
        tagline = profile.get("tagline")
        if isinstance(tagline, str) and tagline.strip():
            copy["subheadline"] = tagline.strip()
    if content_job_id == "amenity_spotlight":
        amenity = _infer_amenity_name(context)
        if amenity:
            copy["headline"] = "%s, Designed For Daily Ease" % amenity
    if content_job_id == "pricing_ad":
        price = next((fact.value for fact in session_facts if fact.field in {"price", "emi"}), None)
        if not price:
            price = profile.get("startingPrice") if isinstance(profile.get("startingPrice"), str) else None
        if price:
            copy["headline"] = str(price)
            copy["subheadline"] = "%s | %s" % (project_name(context), profile.get("tagline") or "Premium homes")
    if content_job_id == "festive_greeting":
        festival = context.get("festival") if isinstance(context.get("festival"), dict) else {}
        festival_name = str(festival.get("name") or "").strip()
        if festival_name:
            copy["headline"] = "%s Wishes" % festival_name
            meaning = str(festival.get("meaning") or "").strip()
            copy["subheadline"] = meaning or "A thoughtful greeting from the brand."
            copy["cta"] = ""
    return copy


def _infer_amenity_name(context: Dict[str, Any]) -> str:
    for asset in context.get("assets", []):
        if not isinstance(asset, dict):
            continue
        metadata = asset.get("metadata") if isinstance(asset.get("metadata"), dict) else {}
        amenity = metadata.get("amenityName")
        if isinstance(amenity, str) and amenity.strip():
            return amenity.strip()
    profile = project_profile(context)
    amenities = profile.get("heroAmenities") or profile.get("amenities")
    if isinstance(amenities, list) and amenities:
        return str(amenities[0]).strip()
    return ""


def _clean_copy(value: Any) -> str:
    if isinstance(value, dict):
        text = value.get("text") or value.get("value") or value.get("label")
        if text is not None:
            return _clean_copy(text)
        return ""
    if isinstance(value, list):
        return " ".join(_clean_copy(item) for item in value if _clean_copy(item)).strip()
    return " ".join(str(value or "").replace("\n", " ").split()).strip()


def price_allowed_for_request(brief: str, content_job_id: str) -> bool:
    # Price rendering is allowed only when the current brief explicitly supplies a
    # commercial number. Pricing-ad intent alone is not permission to use DB prices
    # that may be marked verify-before-ad-use. The commercial guard in generator.py
    # handles approved/override modes.
    text = brief or ""
    return bool(re.search(r"(?:₹|rs\.?|inr)\s?[0-9]|[0-9][0-9,.]*\s?(?:lakh|lac|cr|crore)\b", text, flags=re.I))


def contains_price_claim(value: Any) -> bool:
    text = str(value or "")
    return bool(re.search(r"(?:₹|rs\.?|inr)\s?[0-9]|[0-9][0-9,.]*\s?(?:lakh|lac|cr|crore)\b", text, flags=re.I))
