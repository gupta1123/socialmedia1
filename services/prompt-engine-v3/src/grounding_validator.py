from __future__ import annotations

import re
from typing import Iterable, List

from .planning_schemas import ProductionPlan
from .schemas import SessionFactOverride, ValidationResult, VariantOutput

INTERNAL_PROMPT_AUDIT_TYPES = {"prompt_auditor_error", "adapter_parse_error", "model_parse_error"}
INTERNAL_PROMPT_AUDIT_MARKERS = (
    "AdapterParseError",
    "JSONAdapter",
    "Traceback",
    "Expected to find output fields",
    "Actual output fields parsed",
    "DSPy",
)


def validate_full_variant(
    variant: VariantOutput,
    *,
    session_facts: List[SessionFactOverride],
    db_facts: Iterable[str],
    production: ProductionPlan | None = None,
) -> ValidationResult:
    errors: List[str] = []
    warnings: List[str] = []
    if not variant.compiled_prompt.strip():
        errors.append("compiled_prompt is required.")
    if not variant.render_package.project_asset_ids:
        warnings.append("No primary project asset selected; image generation may be concept-led.")
    if production:
        if production.include_logo and not production.logo_asset_id:
            errors.append("Logo is required but no logo asset is resolved.")
        if production.include_rera_qr and not production.rera_qr_asset_id:
            errors.append("RERA QR is required but no RERA QR asset is resolved.")
        logo_layers = production.additional_logos or ([production.secondary_logo] if production.secondary_logo.required else [])
        for index, logo_layer in enumerate(logo_layers):
            if logo_layer.required and not logo_layer.asset_id:
                label = "Secondary logo" if index == 0 else "Additional logo %s" % (index + 1)
                errors.append("%s is required but no logo asset is resolved." % label)
        if production.location_plan.required and not production.location_plan.value:
            errors.append("Location label is required but no project location value is resolved.")
        if production.contact_plan.missing:
            warnings.append("Requested contact values are missing and were omitted: %s" % ", ".join(production.contact_plan.missing))
        if production.contact_plan.requires_client_review:
            warnings.append("Contact values include low/medium-confidence public-web data; verify before compliance-heavy or paid ad use.")
    audit = _audit_text(variant)
    errors.extend(_unsupported_high_risk_claims(audit, session_facts, list(db_facts)))
    lowered = variant.compiled_prompt.lower()
    if "template_id" in lowered or "asset_id" in lowered:
        errors.append("compiled_prompt exposes internal pipeline identifiers.")
    if variant.text_policy.get("text_treatment") == "reserve_space":
        if variant.render_package.exact_text_layers:
            errors.append("reserve_space mode must not contain exact_text_layers.")
        if variant.visible_text_allowed:
            errors.append("reserve_space mode must not contain visible_text_allowed.")
    else:
        exact_layers = variant.render_package.exact_text_layers or {}
        if variant.text_policy.get("text_strategy") in {"render_exact_text", "minimal_text", "typography_dominant", "poster_copy_block", "proof_badges"}:
            if not any(str(value or "").strip() for value in exact_layers.values()):
                errors.append("render_text mode requires at least one non-empty exact_text_layer.")
            contact_rules = variant.render_package.contact_rules or {}
            if contact_rules.get("required") and contact_rules.get("values") and not str(exact_layers.get("contact_footer") or "").strip():
                errors.append("render_text mode with requested grounded contact values requires contact_footer in exact_text_layers.")
    # Brand-only festival greetings must not accidentally become project/building creatives.
    intent = variant.layout_contract.get("intent") if isinstance(variant.layout_contract, dict) else {}
    if isinstance(intent, dict) and intent.get("content_job_id") == "festive_greeting" and intent.get("festival_visual_scope") == "brand_only":
        lower_prompt = (variant.compiled_prompt or "").lower()
        forbidden_terms = ["building exterior", "tower facade", "project render", "construction scene", "facade rhythm", "supplied project visual", "architectural truth", "project reference image"]
        forbidden = [term for term in forbidden_terms if _contains_positive_term(lower_prompt, term)]
        if forbidden:
            errors.append("brand-only festive greeting must not include project/building visual language: %s" % ", ".join(forbidden))
    if isinstance(intent, dict) and intent.get("content_job_id") == "construction_update" and intent.get("construction_visual_mode") == "visualized_progress_from_project_truth":
        lower_prompt = (variant.compiled_prompt or "").lower()
        unsafe_terms = ["actual current site photo", "captured recently", "verified latest progress", "real construction photograph", "under construction photograph", "advancing rapidly", "actively being built", "now 50% complete", "50% complete", "50% पूर्ण हो चुका"]
        unsafe = [term for term in unsafe_terms if _contains_positive_term(lower_prompt, term)]
        if unsafe:
            errors.append("construction visualization must not claim actual/current verified progress: %s" % ", ".join(unsafe))
    prompt_audit = variant.layout_contract.get("prompt_audit") if isinstance(variant.layout_contract, dict) else None
    if isinstance(prompt_audit, dict):
        for issue in prompt_audit.get("issues_found") or []:
            if isinstance(issue, dict):
                message = str(issue.get("message") or issue).strip()
                if not message:
                    continue
                if _is_internal_prompt_audit_issue(issue, message):
                    continue
                if str(issue.get("severity") or "warning") == "error":
                    warnings.append("Prompt audit error repaired/flagged: %s" % message)
                else:
                    warnings.append("Prompt audit: %s" % message)
    warnings.extend(_quality_warnings(variant))
    return ValidationResult(passed=not errors, errors=_dedupe(errors), warnings=_dedupe(warnings))


def _is_internal_prompt_audit_issue(issue: dict, message: str) -> bool:
    issue_type = str(issue.get("type") or "").strip()
    if issue_type in INTERNAL_PROMPT_AUDIT_TYPES:
        return True
    return any(marker.lower() in message.lower() for marker in INTERNAL_PROMPT_AUDIT_MARKERS)


def _audit_text(variant: VariantOutput) -> str:
    pieces = [
        variant.compiled_prompt,
        variant.prompt,
        str(variant.copy_contract),
        str(variant.visible_text_allowed),
        str(variant.render_package.exact_text_layers),
        str(variant.render_package.contact_rules),
        str(variant.layout_contract.get("contact_layer", {})),
    ]
    return "\n".join(str(piece) for piece in pieces if piece)


def _unsupported_high_risk_claims(text: str, session_facts: List[SessionFactOverride], db_facts: List[str]) -> List[str]:
    errors: List[str] = []
    allowed_values = [fact.value for fact in session_facts] + list(db_facts)
    allowed_blob = "\n".join(str(item or "") for item in allowed_values).lower()
    allowed_normalized = {
        label: {_normalize_claim_value(label, value) for value in allowed_values if _normalize_claim_value(label, value)}
        for label in ["phone", "email", "website", "price", "rera"]
    }
    for label, pattern in [
        ("phone", r"(?:\+?91[\s-]?)?(?:[6-9]\d{4}[\s-]?\d{5}|\d{2,4}[\s-]?\d{6,8})"),
        ("email", r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}"),
        ("website", r"https?://[^\s'\"}\]\),;]+|www\.[^\s'\"}\]\),;]+"),
        ("price", r"(?:₹|rs\.?|inr)\s?[0-9][0-9,]*(?:\s?(?:lakh|lac|cr|crore|k))?|[0-9][0-9,.]*\s?(?:lakh|lac|cr|crore)\b"),
        ("rera", r"\b(?:maha)?rera\b[^.?!,;]*?[A-Z]?\d{6,}"),
    ]:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            raw = match.group(0).strip()
            value = _normalize_claim_value(label, raw)
            if not value:
                continue
            if value in allowed_normalized.get(label, set()):
                continue
            # Backstop for longer DB facts containing the detected claim. This helps when
            # allowed facts are stored as sentences rather than exact fields.
            if value in _normalize_claim_value(label, allowed_blob):
                continue
            errors.append("Unsupported %s claim in final variant contract: %s" % (label, raw))
    return errors


def _normalize_claim_value(label: str, value: object) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    # Provider prompts and Python dict strings often wrap values as "https://x'},".
    # Strip only surrounding/trailing syntax, not meaningful URL/path characters.
    text = text.strip().strip("`")
    text = text.rstrip(".,;:!?)'\"}]}")
    text = text.lstrip("([{ ' \"")
    if label == "website":
        candidate = text.lower().rstrip("/")
        match = re.search(r"https?://[^\s'\"}\]\),;]+|www\.[^\s'\"}\]\),;]+", candidate, flags=re.IGNORECASE)
        if match:
            candidate = match.group(0).rstrip("/").rstrip(".,;:!?)'\"}]}")
            return candidate
        return ""
    if label == "email":
        match = re.search(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", text, flags=re.IGNORECASE)
        return match.group(0).lower() if match else ""
    if label == "phone":
        digits = re.sub(r"\D+", "", text)
        # Normalize India country code so +91-22-... and 022-... can be compared sanely.
        return digits[2:] if digits.startswith("91") and len(digits) > 10 else digits
    if label == "rera":
        match = re.search(r"\b[A-Z]?\d{6,}\b", text, flags=re.IGNORECASE)
        return match.group(0).lower() if match else ""
    return re.sub(r"\s+", " ", text.lower())


def _dedupe(items: Iterable[str]) -> List[str]:
    seen = set()
    out: List[str] = []
    for item in items:
        if item not in seen:
            out.append(item)
            seen.add(item)
    return out


def _quality_warnings(variant: VariantOutput) -> List[str]:
    warnings: List[str] = []
    selection = variant.render_package.asset_selection or {}
    try:
        rank = int(selection.get("rank") or 0)
    except Exception:
        rank = 0
    if rank and rank > 5:
        warnings.append(f"Selected asset rank is {rank}; consider using a stronger top-ranked asset or explaining user-selected override.")
    semantic = str((variant.render_package.asset_visual_summary or {}).get("scene_type") or selection.get("semantic_type") or "").lower()
    compiled = (variant.compiled_prompt or "").lower()
    if semantic in {"entrance", "lobby"}:
        bad_terms = [term for term in ["tower cutout", "tower hero", "facade crop", "full building exterior"] if _contains_positive_term(compiled, term)]
        if bad_terms:
            warnings.append("Prompt may still force tower/facade language onto an entrance/lobby asset: %s" % ", ".join(bad_terms))
    if semantic == "interior":
        bad_terms = [term for term in ["tower cutout", "facade crop", "building exterior hero"] if _contains_positive_term(compiled, term)]
        if bad_terms:
            warnings.append("Prompt may still force exterior language onto an interior asset: %s" % ", ".join(bad_terms))
    template = variant.render_package.template_contract or {}
    assumptions = template.get("asset_assumptions") if isinstance(template, dict) else []
    if isinstance(assumptions, list) and semantic and assumptions and semantic not in [str(x).lower() for x in assumptions]:
        warnings.append("Selected template assumptions do not directly match selected asset semantic; ensure concept is adapted to the asset.")
    intent = variant.layout_contract.get("intent") if isinstance(variant.layout_contract, dict) else {}
    if isinstance(intent, dict):
        requested_semantics = [str(item).lower() for item in intent.get("requested_asset_semantics") or []]
        if "building_exterior" in requested_semantics and semantic not in {"exterior", "project_exterior", "building_exterior"}:
            warnings.append("Selected asset semantic does not match the requested building exterior route; adapt the concept or choose an exterior asset.")
        if intent.get("content_job_id") == "amenity_spotlight" and semantic and semantic not in {"amenity", "pool", "clubhouse", "garden", "landscape", "interior"}:
            warnings.append("Amenity spotlight is using a non-amenity selected asset; adapt the concept to the selected asset or choose an amenity asset.")
    copy = variant.copy_contract or {}
    headline = str(copy.get("headline") or "").strip().lower()
    subheadline = str(copy.get("subheadline") or "").strip().lower()
    generic_subs = {"elevated urban living", "premium urban living", "discover modern living", "luxury living", "experience luxury"}
    if subheadline in generic_subs:
        warnings.append("Auto copy appears generic; rewrite with audience, asset, or project-specific context.")
    project_name = str((variant.layout_contract.get("asset_visual_summary", {}) or {}).get("label") or "").lower()
    if headline and headline in project_name and subheadline in generic_subs:
        warnings.append("Headline/subheadline combination is too generic for campaign-quality output.")
    return warnings


def _contains_positive_term(text: str, term: str) -> bool:
    start = 0
    while True:
        idx = text.find(term, start)
        if idx < 0:
            return False
        window = text[max(0, idx - 180):idx]
        if not any(marker in window for marker in ["do not", "don't", "never", "avoid", "without", "not "]):
            return True
        start = idx + len(term)
