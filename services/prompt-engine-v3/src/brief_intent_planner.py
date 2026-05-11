from __future__ import annotations

import re
from typing import Any, Dict, List

from .planning_schemas import BriefIntentPlan, CreativeIntent
from .schemas import CompileRequest


PEOPLE_TERMS = [
    "family",
    "families",
    "couple",
    "people",
    "person",
    "parents",
    "kids",
    "children",
    "homebuyers",
    "residents",
]

LIFESTYLE_ACTION_TERMS = [
    "walking",
    "walk",
    "strolling",
    "playing",
    "living",
    "lifestyle",
    "aspirational lifestyle",
    "show the lifestyle",
    "not just the structure",
    "human moment",
]

ENVIRONMENT_TERMS = [
    "township",
    "lush",
    "landscape",
    "landscaped",
    "garden",
    "greenery",
    "mountain",
    "mountains",
    "sahyadri",
    "golden hour",
    "sunset",
    "warm lighting",
    "peaceful",
    "modern home",
]


def plan_brief_intent(request: CompileRequest, context: Dict[str, Any], intent: CreativeIntent) -> BriefIntentPlan:
    """Resolve the user's creative ask into a visual intent contract.

    This sits above asset/template planning. It intentionally does not replace
    compliance and fact guardrails; it decides whether selected refs are the hero
    or merely project grounding for a generated scene.
    """

    options = request.options if isinstance(request.options, dict) else {}
    model_plan = options.get("brief_intent_plan") or options.get("briefIntentPlan")
    if isinstance(model_plan, dict):
        return coerce_brief_intent_plan(model_plan, source="request_option")

    # Future AI planner output can be injected here. The deterministic fallback is
    # deliberately conservative, but it detects the expensive failure mode where
    # a lifestyle-scene brief is collapsed into a selected-asset facade poster.
    return _heuristic_plan(request, context, intent)


def apply_brief_intent_plan(intent: CreativeIntent, plan: BriefIntentPlan) -> CreativeIntent:
    intent.brief_intent_plan = plan
    if plan.primary_visual_goal == "generated_lifestyle_scene":
        intent.creative_mode = "lifestyle_led"
        if "lifestyle_scene" not in intent.requested_asset_semantics:
            intent.requested_asset_semantics.append("lifestyle_scene")
        intent.asset_intent_strength = "hard"
    return intent


def _heuristic_plan(request: CompileRequest, context: Dict[str, Any], intent: CreativeIntent) -> BriefIntentPlan:
    brief = _clean(request.brief)
    lowered = brief.lower()
    people_hits = _hits(lowered, PEOPLE_TERMS)
    lifestyle_hits = _hits(lowered, LIFESTYLE_ACTION_TERMS)
    environment_hits = _hits(lowered, ENVIRONMENT_TERMS)
    asks_lifestyle_scene = bool(people_hits and (lifestyle_hits or environment_hits))
    explicitly_asset_hero = bool(
        re.search(r"\b(use|keep|make|place|show)\s+(?:this|selected|supplied|reference)\s+(?:image|asset|photo|render)\s+as\s+(?:the\s+)?(?:hero|main|primary)", lowered)
        or re.search(r"\b(use|show)\s+(?:the\s+)?(?:building|tower|facade|exterior)\s+as\s+(?:the\s+)?(?:hero|main|primary)", lowered)
    )

    facts = _grounded_facts(request, context, brief)
    if asks_lifestyle_scene and not explicitly_asset_hero:
        subject = _lifestyle_subject(brief, people_hits, environment_hits)
        return BriefIntentPlan(
            primary_visual_goal="generated_lifestyle_scene",
            reference_role="context_grounding" if request.selected_asset_ids else "supporting_reference",
            visual_priority="lifestyle_over_architecture",
            scene_subject=subject,
            people_required=True,
            environment_required=environment_hits[:6],
            must_include=_dedupe(people_hits[:3] + environment_hits[:5] + ["site visit CTA"]),
            must_avoid=["facade-only poster", "static architecture crop", "selected reference as hero"],
            grounded_facts=facts,
            copy_goal="site_visit_conversion" if intent.content_job_id == "site_visit" else "brief_aligned_conversion",
            confidence=0.86,
            source="deterministic_lifestyle_scene_detector",
        )

    return BriefIntentPlan(
        primary_visual_goal="selected_asset_hero" if request.selected_asset_ids else "generated_concept_scene",
        reference_role="hero_truth_anchor" if request.selected_asset_ids else "none",
        visual_priority="asset_truth_first" if request.selected_asset_ids else "concept_first",
        scene_subject="",
        people_required=False,
        environment_required=[],
        must_include=[],
        must_avoid=[],
        grounded_facts=facts,
        copy_goal="",
        confidence=0.62,
        source="deterministic_default",
    )


def coerce_brief_intent_plan(value: Dict[str, Any], source: str) -> BriefIntentPlan:
    data = dict(value)
    data["source"] = source
    try:
        return BriefIntentPlan(**data)
    except Exception:
        return BriefIntentPlan(source=f"{source}_invalid", confidence=0.0)


def _lifestyle_subject(brief: str, people_hits: List[str], environment_hits: List[str]) -> str:
    if re.search(r"happy\s+(?:couple|family|families)", brief, flags=re.I):
        match = re.search(r"happy\s+(?:couple|family|families)[^.]*", brief, flags=re.I)
        if match:
            return _clean(match.group(0))[:220]
    people = "couple or family" if any(hit in {"couple", "family", "families"} for hit in people_hits) else "people"
    env = ", ".join(environment_hits[:4]) if environment_hits else "project lifestyle environment"
    return f"{people} in a {env} setting"


def _grounded_facts(request: CompileRequest, context: Dict[str, Any], brief: str) -> List[str]:
    facts: List[str] = []
    project = context.get("project") if isinstance(context.get("project"), dict) else {}
    brand = context.get("brand") if isinstance(context.get("brand"), dict) else {}
    for value in [brand.get("name"), project.get("name"), project.get("location"), project.get("city")]:
        if value:
            facts.append(str(value))
    for pattern in [r"\bMiami Phase\b", r"\bCharholi,\s*Pune\b", r"\bPride World City\b", r"\bPrescon Midtown Bay\b"]:
        for match in re.finditer(pattern, brief, flags=re.I):
            facts.append(match.group(0))
    return _dedupe(facts)


def _hits(text: str, terms: List[str]) -> List[str]:
    out = []
    for term in terms:
        if re.search(r"\b%s\b" % re.escape(term), text, flags=re.I):
            out.append(term)
    return _dedupe(out)


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _dedupe(items: List[str]) -> List[str]:
    seen = set()
    out = []
    for item in items:
        text = str(item or "").strip()
        key = text.lower()
        if text and key not in seen:
            out.append(text)
            seen.add(key)
    return out
