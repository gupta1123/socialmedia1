from __future__ import annotations

from typing import Iterable, List, Optional

from .planning_schemas import CreativeIntent, GroundedFactStore, ResolvedContactPlan

VALID_CONTACT_ITEMS = {"phone", "whatsapp", "email", "website"}


def resolve_contact_plan(
    *,
    intent: CreativeIntent,
    fact_store: GroundedFactStore,
    explicit_items: Iterable[str] = (),
    preset_items: Iterable[str] = (),
    position: str = "bottom_footer",
) -> ResolvedContactPlan:
    requested = _dedupe([*intent.contact_intent.requested_items, *explicit_items, *preset_items])
    requested = [item for item in requested if item in VALID_CONTACT_ITEMS]
    blocked = [item for item in intent.contact_intent.blocked_items if item in VALID_CONTACT_ITEMS]
    items = [item for item in requested if item not in blocked]
    values = {}
    sources = {}
    missing: List[str] = []
    requires_review = False
    for item in items:
        value, source, review = _value_for(item, fact_store)
        if value:
            values[item] = value
            sources[item] = source or "fact_store"
            requires_review = requires_review or review
        else:
            missing.append(item)
    return ResolvedContactPlan(
        requested_items=requested,
        blocked_items=blocked,
        items=items,
        values=values,
        sources=sources,
        missing=missing,
        requires_client_review=requires_review,
        position=position,
    )


def _value_for(item: str, fact_store: GroundedFactStore) -> tuple[Optional[str], Optional[str], bool]:
    fields = [item]
    if item == "whatsapp":
        fields = ["whatsapp", "phone"]
    for field in fields:
        facts = fact_store.values_for(field)
        if facts:
            fact = facts[0]
            return fact.value, fact.source, fact.requires_client_review
    return None, None, False


def _dedupe(items: Iterable[str]) -> List[str]:
    seen = set()
    out: List[str] = []
    for item in items:
        key = str(item or "").strip().lower()
        if key and key not in seen:
            out.append(key)
            seen.add(key)
    return out
