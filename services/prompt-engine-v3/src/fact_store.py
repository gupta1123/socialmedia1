from __future__ import annotations

from typing import Any, Dict, Iterable, List

from .context_builder import brand_profile, project_profile
from .planning_schemas import FactValue, GroundedFactStore
from .schemas import SessionFactOverride

FIELD_ALIASES = {
    "project_name": ["name", "project_name"],
    "city": ["city"],
    "micro_location": ["micro_location", "microLocation", "location"],
    "phone": ["phone", "salesPhone", "contactPhone", "mobile", "sales_phone", "contact_number", "alternatePhone", "alternate_phone"],
    "whatsapp": ["whatsapp", "whatsappPhone", "whatsapp_number"],
    "email": ["email", "salesEmail", "contactEmail"],
    "website": ["website", "websiteUrl", "url", "site"],
    "configuration": ["configuration", "configurations", "unitConfiguration", "unit_configurations", "typology", "unitTypology"],
    "price": ["startingPrice", "price", "priceRange", "priceRangeByConfig"],
    "emi": ["emi", "currentOffers", "offers"],
    "rera": ["reraNumber", "rera", "rera_no"],
    "possession": ["possession", "latestUpdate", "constructionStatus"],
    "tagline": ["tagline", "positioning"],
}

RISK = {"phone": "high", "price": "high", "emi": "high", "rera": "high", "possession": "high", "email": "medium", "website": "medium", "whatsapp": "high"}


def build_fact_store(context: Dict[str, Any], session_facts: List[SessionFactOverride]) -> GroundedFactStore:
    values: List[FactValue] = []
    project = context.get("project") if isinstance(context.get("project"), dict) else {}
    brand = context.get("brand") if isinstance(context.get("brand"), dict) else {}
    project_prof = project_profile(context)
    brand_prof = brand_profile(context)

    # Session facts come first so they override DB values for this run.
    for fact in session_facts:
        field = _normalize_field(fact.field)
        if field in {"copy_headline", "copy_subheadline", "copy_cta"}:
            continue
        values.append(FactValue(field=field, value=fact.value, source="brief_override", risk_level=fact.risk_level, requires_client_review=fact.requires_client_review))

    _add_direct(values, "project_name", project.get("name") or project.get("project_name"), "project.name")
    _add_direct(values, "brand_name", brand.get("name"), "brand.name")
    _add_direct(values, "city", project.get("city") or project_prof.get("city"), "project.city")
    _add_direct(values, "micro_location", project.get("micro_location") or project_prof.get("micro_location") or project_prof.get("location"), "project.micro_location")

    for source_name, profile in [("project.profile", project_prof), ("brand.profile", brand_prof)]:
        if not isinstance(profile, dict):
            continue
        for field, aliases in FIELD_ALIASES.items():
            review = _profile_requires_review(profile, field)
            for key in aliases:
                _add_values(values, field, profile.get(key), f"{source_name}.{key}", requires_review=review)
        contact = profile.get("contact") if isinstance(profile.get("contact"), dict) else {}
        if contact:
            contact_aliases = {
                "phone": ["phone", "salesPhone", "contactPhone", "mobile", "sales_phone", "contact_number", "alternatePhone", "alternate_phone"],
                "whatsapp": ["whatsapp", "whatsappPhone", "whatsapp_number"],
                "email": ["email", "salesEmail", "contactEmail"],
                "website": ["website", "websiteUrl", "url", "site"],
            }
            for field, aliases in contact_aliases.items():
                review = _profile_requires_review(profile, field)
                for key in aliases:
                    _add_values(values, field, contact.get(key), f"{source_name}.contact.{key}", requires_review=review)
        for key in ["approvedClaims", "configurations", "amenities", "travelTimes", "credibilityFacts", "legalNotes"]:
            for item in _flatten(profile.get(key)):
                _add_direct(values, "approved_claim", item, f"{source_name}.{key}")
                # Also make contact-like facts discoverable when they appear in free-form approved/credibility strings.
                _extract_embedded_contact(values, item, f"{source_name}.{key}")
    return _dedupe_store(GroundedFactStore(values=values))


def fact_strings_for_validation(store: GroundedFactStore, context_db_facts: Iterable[str] = ()) -> List[str]:
    out = list(context_db_facts) + store.allowed_strings()
    return _dedupe_text(out)


def _normalize_field(field: str) -> str:
    field = str(field or "").strip()
    if field.startswith("copy_"):
        return field
    return {"rera_qr": "rera", "url": "website", "mobile": "phone"}.get(field, field)


def _add_values(values: List[FactValue], field: str, raw: Any, source: str, *, requires_review: bool = False) -> None:
    for item in _flatten(raw):
        _add_direct(values, field, item, source, requires_review=requires_review)


def _add_direct(values: List[FactValue], field: str, raw: Any, source: str, *, requires_review: bool = False) -> None:
    text = str(raw or "").strip()
    if not text:
        return
    risk = RISK.get(field, "low")
    values.append(FactValue(field=field, value=text, source=source, risk_level=risk, requires_client_review=requires_review))


def _profile_requires_review(profile: Dict[str, Any], field: str) -> bool:
    if field not in {"phone", "email", "website", "whatsapp"}:
        return False
    contact_conf = profile.get("contactConfidence") if isinstance(profile.get("contactConfidence"), dict) else {}
    contact = profile.get("contact") if isinstance(profile.get("contact"), dict) else {}
    candidates = [
        contact_conf.get(field),
        contact_conf.get("alternatePhone") if field == "phone" else None,
        contact.get("confidence"),
        profile.get("contactConfidence"),
    ]
    blob = " ".join(str(v or "") for v in candidates).lower()
    return any(term in blob for term in ["low", "medium", "review", "verify", "unverified"])


def _flatten(value: Any) -> List[str]:
    if isinstance(value, list):
        out: List[str] = []
        for item in value:
            out.extend(_flatten(item))
        return out
    if isinstance(value, dict):
        return [str(v) for v in value.values() if str(v).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _extract_embedded_contact(values: List[FactValue], text: str, source: str) -> None:
    import re

    for match in re.finditer(r"(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}", text):
        _add_direct(values, "phone", match.group(0), source)
    for match in re.finditer(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", text):
        _add_direct(values, "email", match.group(0), source)
    for match in re.finditer(r"https?://[^\s]+|www\.[^\s]+", text):
        _add_direct(values, "website", match.group(0).rstrip(".,)"), source)


def _dedupe_store(store: GroundedFactStore) -> GroundedFactStore:
    seen = set()
    out: List[FactValue] = []
    for item in store.values:
        key = (item.field, item.value.lower())
        if key not in seen:
            out.append(item)
            seen.add(key)
    return GroundedFactStore(values=out)


def _dedupe_text(items: Iterable[str]) -> List[str]:
    seen = set()
    out = []
    for item in items:
        text = str(item or "").strip()
        key = text.lower()
        if text and key not in seen:
            out.append(text)
            seen.add(key)
    return out
