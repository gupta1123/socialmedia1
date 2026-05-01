from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Tuple

from .creative_levers import CONTENT_JOBS
from .schemas import CompileRequest, SessionFactOverride, ValidationResult


HIGH_RISK_PATTERNS: List[Tuple[str, str, str]] = [
    ("phone", r"(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}", "high"),
    ("email", r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "medium"),
    ("website", r"https?://[^\s]+|www\.[^\s]+", "medium"),
    ("price", r"(?:₹|rs\.?|inr)\s?[0-9][0-9,]*(?:\s?(?:lakh|lac|cr|crore|k))?|[0-9][0-9,.]*\s?(?:lakh|lac|cr|crore)\b", "high"),
    ("emi", r"\bemi\b[^.?!,;]*?(?:₹|rs\.?|inr)\s?[0-9][0-9,]*", "high"),
    ("rera", r"\b(?:maha)?rera\b[^.?!,;]*?[A-Z]?\d{6,}", "high"),
    ("possession", r"\bpossession\b[^.?!]*(?:20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", "high"),
]

NEGATION_PATTERNS = [
    r"\bno\s+{term}\b",
    r"\bwithout\s+{term}\b",
    r"\bdo\s+not\s+include\s+{term}\b",
    r"\bdon't\s+include\s+{term}\b",
    r"\bavoid\s+{term}\b",
]


def deterministic_gate(request: CompileRequest, context: Dict[str, Any]) -> ValidationResult:
    errors: List[str] = []
    warnings: List[str] = []
    if request.capability != "image_prompt_generation":
        errors.append("Only image_prompt_generation is supported by Prompt Engine V3 single-post flow.")
    content_job_id = request.content_job_id
    if content_job_id and content_job_id not in CONTENT_JOBS:
        errors.append("Unsupported content_job_id: %s" % content_job_id)
    if request.project_id and not context.get("project"):
        errors.append("Project data is required before generating grounded creative output.")
    assets = context.get("assets") if isinstance(context.get("assets"), list) else []
    asset_ids = {str(asset.get("asset_id")) for asset in assets if isinstance(asset, dict) and asset.get("asset_id")}
    missing_assets = [asset_id for asset_id in request.selected_asset_ids if asset_id not in asset_ids]
    if missing_assets:
        errors.append("Requested asset IDs were not found: %s" % ", ".join(missing_assets))
    if request.include_logo and request.logo_asset_id and request.logo_asset_id not in asset_ids:
        errors.append("Requested logo_asset_id was not found: %s" % request.logo_asset_id)
    if request.include_rera_qr and request.rera_qr_asset_id and request.rera_qr_asset_id not in asset_ids:
        errors.append("Requested rera_qr_asset_id was not found: %s" % request.rera_qr_asset_id)
    template_ids = {str(template.get("template_id")) for template in context.get("visual_templates", []) if isinstance(template, dict)}
    requested_templates = [template_id for template_id in [request.visual_template_id, *request.visual_template_ids] if template_id]
    missing_templates = [template_id for template_id in requested_templates if template_id not in template_ids]
    if missing_templates:
        errors.append("Requested template IDs are not eligible for this job/format: %s" % ", ".join(missing_templates))
    if has_positive_mention(request.brief, ["facade text", "on the building", "building facade", "tower facade", "put logo on building"]):
        warnings.append("Facade text/signage request will be converted into safe poster-layout text only.")
    return ValidationResult(passed=not errors, errors=errors, warnings=warnings)


def extract_session_fact_overrides(request: CompileRequest, context: Dict[str, Any]) -> List[SessionFactOverride]:
    facts: List[SessionFactOverride] = []
    brief = request.brief or ""
    db_values = _known_db_values(context)
    for field, pattern, risk in HIGH_RISK_PATTERNS:
        for match in re.finditer(pattern, brief, flags=re.IGNORECASE):
            value = match.group(0).strip(" .,;")
            if not value:
                continue
            override_target = _find_override_target(value, db_values.get(field, []))
            facts.append(
                SessionFactOverride(
                    field=field,
                    value=value,
                    overrides=override_target,
                    confidence=0.9,
                    rationale="Explicitly supplied in the current creative brief.",
                    risk_level=risk,  # type: ignore[arg-type]
                    requires_client_review=risk == "high",
                )
            )
    manual_copy = request.copy_contract.model_dump()
    for field, value in manual_copy.items():
        if isinstance(value, str) and value.strip():
            facts.append(
                SessionFactOverride(
                    field="copy_%s" % field,
                    value=value.strip(),
                    confidence=1.0,
                    rationale="Manual copy supplied by user.",
                    risk_level="low",
                    requires_client_review=False,
                )
            )
    return _dedupe_facts(facts)


def requested_contact_items(request: CompileRequest) -> List[str]:
    explicit = list(request.contact_items or [])
    brief_items = []
    for item in ["phone", "whatsapp", "email", "website"]:
        if has_positive_mention(request.brief, [item]):
            brief_items.append(item)
    return sorted(set(explicit + brief_items))


def wants_rera_qr(request: CompileRequest) -> bool:
    if request.include_rera_qr:
        return True
    return has_positive_mention(request.brief, ["rera", "qr", "qr code"])


def has_positive_mention(text: str, terms: Iterable[str]) -> bool:
    lowered = text.lower()
    for term in terms:
        escaped = re.escape(term.lower())
        if any(re.search(pattern.format(term=escaped), lowered, flags=re.IGNORECASE) for pattern in NEGATION_PATTERNS):
            continue
        if re.search(r"\b%s\b" % escaped, lowered, flags=re.IGNORECASE):
            return True
    return False


def block_response(request: CompileRequest, output_format: str, errors: List[str], warnings: List[str]) -> Dict[str, Any]:
    return {
        "status": "blocked",
        "capability": request.capability,
        "content_job_id": request.content_job_id,
        "format": output_format,
        "variant_count": 0,
        "variation_strategy": request.variation_strategy,
        "variants": [],
        "validation": {"passed": False, "errors": errors, "warnings": warnings},
        "debug": {"engine": "prompt-engine-v3-guardrail"},
    }


def _known_db_values(context: Dict[str, Any]) -> Dict[str, List[str]]:
    project = context.get("project") if isinstance(context.get("project"), dict) else {}
    profile = project.get("profile") if isinstance(project.get("profile"), dict) else {}
    return {
        "phone": _strings(profile.get("credibilityFacts")) + _strings(profile.get("legalNotes")),
        "email": _strings(profile.get("credibilityFacts")) + _strings(profile.get("legalNotes")),
        "website": _strings(profile.get("credibilityFacts")) + _strings(profile.get("legalNotes")),
        "price": _strings(profile.get("startingPrice")) + _strings(profile.get("priceRangeByConfig")),
        "emi": _strings(profile.get("currentOffers")),
        "rera": _strings(profile.get("reraNumber")) + _strings(profile.get("legalNotes")),
        "possession": _strings(profile.get("latestUpdate")) + _strings(profile.get("constructionStatus")),
    }


def _strings(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value]
    return []


def _find_override_target(value: str, candidates: List[str]) -> str:
    normalized = value.lower()
    for candidate in candidates:
        candidate_text = str(candidate)
        if normalized in candidate_text.lower():
            return ""
        if any(token in candidate_text.lower() for token in re.findall(r"\d+", normalized)):
            return candidate_text[:160]
    return ""


def _dedupe_facts(facts: List[SessionFactOverride]) -> List[SessionFactOverride]:
    seen = set()
    out: List[SessionFactOverride] = []
    for fact in facts:
        key = (fact.field, fact.value.lower())
        if key not in seen:
            out.append(fact)
            seen.add(key)
    return out
